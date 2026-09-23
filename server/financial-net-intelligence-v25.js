import { db } from "./db.js";
import { tenantContext } from './tenant-guard.js';



const n = value => {
 const x = Number(value);
 return Number.isFinite(x) ? x : 0;
};

const round = value =>
 Math.round(
  (n(value) + Number.EPSILON) * 100
 ) / 100;

function tableExists(name){
 return !!db.prepare(`
  SELECT 1
  FROM sqlite_master
  WHERE type='table'
   AND name=?
 `).get(name);
}

function columns(name){
 if(!tableExists(name)){
  return [];
 }

 return db.prepare(
  `PRAGMA table_info("${name}")`
 ).all().map(x => x.name);
}

function detectReturnLedger(){

 const candidates = [
  "sale_return_items",
  "return_items",
  "sales_return_items"
 ];

 for(const table of candidates){

  if(!tableExists(table)){
   continue;
  }

  const c = columns(table);

  const saleItemCol =
   c.includes("sale_item_id")
    ? "sale_item_id"
    : null;

  const qtyCol =
   c.includes("qty")
    ? "qty"
    : c.includes("quantity")
     ? "quantity"
     : c.includes("returned_qty")
      ? "returned_qty"
      : null;

  if(saleItemCol && qtyCol){
   return {
    table,
    saleItemCol,
    qtyCol
   };
  }
 }

 return null;
}

function returnQtySql(alias = "si"){

 const ledger = detectReturnLedger();

 if(!ledger){
  return "0";
 }

 return `
  COALESCE(
   (
    SELECT SUM(ri.${ledger.qtyCol})
    FROM ${ledger.table} ri
    WHERE ri.${ledger.saleItemCol}=${alias}.id
   ),
   0
  )
 `;
}

function itemQtyColumn(){

 const c = columns("sale_items");

 if(c.includes("qty")){
  return "qty";
 }

 if(c.includes("quantity")){
  return "quantity";
 }

 throw new Error(
  "SALE_ITEM_QUANTITY_COLUMN_NOT_FOUND"
 );
}

function itemPriceExpr(){

 const c = columns("sale_items");

 if(c.includes("unit_price")){
  return "COALESCE(si.unit_price,0)";
 }

 if(c.includes("price")){
  return "COALESCE(si.price,0)";
 }

 if(c.includes("total")){

  const qty = itemQtyColumn();

  return `
   CASE
    WHEN COALESCE(si.${qty},0)>0
    THEN COALESCE(si.total,0)/si.${qty}
    ELSE 0
   END
  `;
 }

 throw new Error(
  "SALE_ITEM_PRICE_COLUMN_NOT_FOUND"
 );
}

function productCostExpr(){

 const c = columns("products");

 for(
  const candidate of [
   "cost",
   "cost_price",
   "unit_cost"
  ]
 ){
  if(c.includes(candidate)){
   return `COALESCE(p.${candidate},0)`;
  }
 }

 return "0";
}

function periodNet(days, offsetDays = 0){

 if(
  !tableExists("sales") ||
  !tableExists("sale_items") ||
  !tableExists("products")
 ){
  return {
   revenue:0,
   cmv:0,
   gross_profit:0,
   margin_percent:0,
   sales:0,
   average_ticket:0,
   returned_revenue:0
  };
 }

 const qtyCol = itemQtyColumn();
 const returnQty = returnQtySql("si");
 const price = itemPriceExpr();
 const cost = productCostExpr();

 const d = Math.max(
  1,
  Number(days) || 30
 );

 const offset = Math.max(
  0,
  Number(offsetDays) || 0
 );

 const lower = `-${d + offset} days`;

 const upper =
  offset === 0
   ? "+1 day"
   : `-${offset} days`;

 const row = db.prepare(`
  SELECT

   COUNT(
    DISTINCT CASE
     WHEN
      MAX(
       0,
       COALESCE(si.${qtyCol},0) -
       (${returnQty})
      ) > 0
     THEN s.id
    END
   ) sales,

   COALESCE(
    SUM(
     MAX(
      0,
      COALESCE(si.${qtyCol},0) -
      (${returnQty})
     ) * (${price})
    ),
    0
   ) revenue,

   COALESCE(
    SUM(
     MIN(
      COALESCE(si.${qtyCol},0),
      (${returnQty})
     ) * (${price})
    ),
    0
   ) returned_revenue,

   COALESCE(
    SUM(
     MAX(
      0,
      COALESCE(si.${qtyCol},0) -
      (${returnQty})
     ) * (${cost})
    ),
    0
   ) cmv

  FROM sale_items si

  JOIN sales s
   ON s.id=si.sale_id

  JOIN products p
   ON p.id=si.product_id

  WHERE s.status='PAID'

   AND datetime(s.created_at) >=
       datetime(
        'now',
        'localtime',
        ?
       )

   AND datetime(s.created_at) <
       datetime(
        'now',
        'localtime',
        ?
       )
 `).get(
  lower,
  upper
 );

 const revenue = round(row?.revenue);
 const cmv = round(row?.cmv);
 const grossProfit = round(
  revenue - cmv
 );
 const sales = n(row?.sales);

 return {
  revenue,
  cmv,
  gross_profit:grossProfit,

  margin_percent:
   revenue > 0
    ? round(
      grossProfit / revenue * 100
     )
    : 0,

  sales,

  average_ticket:
   sales > 0
    ? round(revenue / sales)
    : 0,

  returned_revenue:
   round(row?.returned_revenue)
 };
}

function productNet(){

 if(
  !tableExists("sales") ||
  !tableExists("sale_items") ||
  !tableExists("products")
 ){
  return [];
 }

 const qtyCol = itemQtyColumn();
 const returnQty = returnQtySql("si");
 const price = itemPriceExpr();
 const cost = productCostExpr();

 const rows = db.prepare(`
  SELECT
   p.id product_id,
   p.name,
   COALESCE(
    p.category,
    'Sem categoria'
   ) category,

   SUM(
    COALESCE(si.${qtyCol},0)
   ) sold_qty,

   SUM(
    MIN(
     COALESCE(si.${qtyCol},0),
     (${returnQty})
    )
   ) returned_qty,

   SUM(
    MAX(
     0,
     COALESCE(si.${qtyCol},0) -
     (${returnQty})
    )
   ) effective_qty,

   SUM(
    MAX(
     0,
     COALESCE(si.${qtyCol},0) -
     (${returnQty})
    ) * (${price})
   ) net_revenue,

   SUM(
    MAX(
     0,
     COALESCE(si.${qtyCol},0) -
     (${returnQty})
    ) * (${cost})
   ) net_cmv

  FROM sale_items si

  JOIN sales s
   ON s.id=si.sale_id

  JOIN products p
   ON p.id=si.product_id

  WHERE s.status='PAID'

   AND datetime(s.created_at) >=
       datetime(
        'now',
        'localtime',
        '-30 days'
       )

  GROUP BY
   p.id,
   p.name,
   p.category

  ORDER BY net_revenue DESC
 `).all();

 return rows.map(x => {

  const revenue =
   round(x.net_revenue);

  const cmv =
   round(x.net_cmv);

  const profit =
   round(revenue - cmv);

  return {
   product_id:x.product_id,
   name:x.name,
   category:x.category,

   sold_qty:
    round(x.sold_qty),

   returned_qty:
    round(x.returned_qty),

   effective_qty:
    round(x.effective_qty),

   net_revenue:
    revenue,

   net_cmv:
    cmv,

   net_gross_profit:
    profit,

   net_margin_percent:
    revenue > 0
     ? round(
       profit / revenue * 100
      )
     : 0
  };
 });
}

function abcNet(){

 const products =
  productNet()
   .filter(
    x => x.net_revenue > 0
   )
   .sort(
    (a,b) =>
     b.net_revenue -
     a.net_revenue
   );

 const total =
  products.reduce(
   (sum,x) =>
    sum + n(x.net_revenue),
   0
  );

 let accumulated = 0;

 return products.map(
  (x,index) => {

   const share =
    total > 0
     ? x.net_revenue /
       total * 100
     : 0;

   accumulated += share;

   let abc = "C";

   if(accumulated <= 80){
    abc = "A";
   }
   else if(accumulated <= 95){
    abc = "B";
   }

   return {
    rank:index + 1,
    ...x,
    abc,

    revenue_share_percent:
     round(share),

    accumulated_percent:
     round(accumulated)
   };
  }
 );
}

function confidence(
 current,
 previous
){

 const sample =
  n(current.sales) +
  n(previous.sales);

 if(
  current.sales < 3 ||
  previous.sales < 3 ||
  sample < 8
 ){
  return {
   level:"LOW",
   label:"AMOSTRA INICIAL",
   reliable_growth:false,
   message:
    "Histórico ainda pequeno para tratar a variação percentual como tendência consolidada."
  };
 }

 if(sample < 20){
  return {
   level:"MEDIUM",
   label:"BASE EM FORMAÇÃO",
   reliable_growth:true,
   message:
    "A comparação já é útil, mas o histórico ainda está em formação."
  };
 }

 return {
  level:"HIGH",
  label:"BASE CONSOLIDADA",
  reliable_growth:true,
  message:
   "Indicador baseado em volume histórico mais representativo."
 };
}

function netOverview(){

 const current =
  periodNet(30,0);

 const previous =
  periodNet(30,30);

 let growthPercent = null;

 if(previous.revenue > 0){

  growthPercent = round(
   (
    current.revenue -
    previous.revenue
   ) /
   previous.revenue *
   100
  );
 }

 return {
  generated_at:
   new Date().toISOString(),

  current,
  previous,

  growth_percent:
   growthPercent,

  confidence:
   confidence(
    current,
    previous
   ),

  abc:
   abcNet()
 };
}

export function registerNetIntelligenceV25(
 app,
 {auth,minRole}
){

 app.get(
  "/api/v25/intelligence/net-overview",
  auth,
  tenantContext,
  minRole(70),
  (_req,res) => {

   try{

    res.json(
     netOverview()
    );

   }
   catch(error){

    console.error(
     "NET_INTELLIGENCE_ERROR",
     error
    );

    res.status(500).json({
     error:
      "NET_INTELLIGENCE_FAILED",

     detail:
      error.message
    });
   }
  }
 );
}


