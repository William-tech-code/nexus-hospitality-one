import {db} from "./db.js";

const n=v=>Number(v||0);
const round=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

function tableExists(name){
 return !!db.prepare(`
  SELECT 1
  FROM sqlite_master
  WHERE type='table' AND name=?
 `).get(name);
}

function columns(name){
 if(!tableExists(name)) return new Set();

 return new Set(
  db.prepare(`PRAGMA table_info(${name})`)
   .all()
   .map(x=>x.name)
 );
}

function paidSalesWhere(days){
 return `
  status='PAID'
  AND datetime(created_at)>=datetime('now','-${days} days')
 `;
}

function salesSummary(days){

 if(!tableExists("sales")){
  return {
   revenue:0,
   sales:0,
   average_ticket:0
  };
 }

 const row=db.prepare(`
  SELECT
   COUNT(*) sales,
   COALESCE(SUM(total),0) revenue,
   COALESCE(AVG(total),0) average_ticket
  FROM sales
  WHERE ${paidSalesWhere(days)}
 `).get();

 return {
  revenue:round(row.revenue),
  sales:n(row.sales),
  average_ticket:round(row.average_ticket)
 };
}

function previousSalesSummary(days){

 if(!tableExists("sales")){
  return {
   revenue:0,
   sales:0,
   average_ticket:0
  };
 }

 const row=db.prepare(`
  SELECT
   COUNT(*) sales,
   COALESCE(SUM(total),0) revenue,
   COALESCE(AVG(total),0) average_ticket
  FROM sales
  WHERE status='PAID'
   AND datetime(created_at)<
       datetime('now','-${days} days')
   AND datetime(created_at)>=
       datetime('now','-${days*2} days')
 `).get();

 return {
  revenue:round(row.revenue),
  sales:n(row.sales),
  average_ticket:round(row.average_ticket)
 };
}

function pct(current,previous){
 if(!previous){
  return current>0 ? 100 : 0;
 }

 return round(
  ((current-previous)/previous)*100
 );
}

function weekdayProfile(){

 if(!tableExists("sales")) return [];

 const rows=db.prepare(`
  SELECT
   CAST(
    strftime('%w',created_at,'localtime')
    AS INTEGER
   ) weekday,

   COUNT(DISTINCT date(created_at,'localtime'))
    active_days,

   COUNT(*) sales,

   COALESCE(SUM(total),0) revenue

  FROM sales

  WHERE status='PAID'
   AND datetime(created_at)>=
       datetime('now','-56 days')

  GROUP BY
   strftime('%w',created_at,'localtime')

  ORDER BY weekday
 `).all();

 const names=[
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado"
 ];

 return rows.map(x=>({
  weekday:x.weekday,
  name:names[x.weekday],
  active_days:n(x.active_days),
  sales:n(x.sales),
  revenue:round(x.revenue),
  average_daily_revenue:round(
   n(x.revenue)/
   Math.max(1,n(x.active_days))
  )
 }));
}

function dailyTrend(days=30){

 if(!tableExists("sales")) return [];

 return db.prepare(`
  SELECT
   date(created_at,'localtime') day,
   COUNT(*) sales,
   ROUND(COALESCE(SUM(total),0),2) revenue,
   ROUND(COALESCE(AVG(total),0),2) average_ticket
  FROM sales
  WHERE status='PAID'
   AND datetime(created_at)>=
       datetime('now','-${days} days')
  GROUP BY date(created_at,'localtime')
  ORDER BY day
 `).all();
}

function productPerformance(){

 if(
  !tableExists("sale_items") ||
  !tableExists("sales") ||
  !tableExists("products")
 ){
  return [];
 }

 const si=columns("sale_items");
 const productId=
  si.has("product_id")?"si.product_id":"NULL";

 const qty=
  si.has("qty")?"si.qty":"0";

 const unitPrice=
  si.has("unit_price")
   ?"si.unit_price"
   :si.has("price")
    ?"si.price"
    :"0";

 return db.prepare(`
  SELECT
   p.id,
   p.name,
   p.category,
   p.stock,
   p.cost,
   p.price,

   COALESCE(SUM(${qty}),0) qty_sold,

   COALESCE(
    SUM(${qty}*${unitPrice}),
    0
   ) revenue,

   COALESCE(
    SUM(${qty}*p.cost),
    0
   ) estimated_cmv

  FROM sale_items si

  JOIN sales s
   ON s.id=si.sale_id

  JOIN products p
   ON p.id=${productId}

  WHERE s.status='PAID'
   AND datetime(s.created_at)>=
       datetime('now','-30 days')

  GROUP BY p.id

  ORDER BY qty_sold DESC
 `).all().map(x=>{

  const grossProfit=
   n(x.revenue)-n(x.estimated_cmv);

  const margin=
   n(x.revenue)>0
    ?grossProfit/n(x.revenue)*100
    :0;

  const dailyVelocity=
   n(x.qty_sold)/30;

  const coverage=
   dailyVelocity>0
    ?n(x.stock)/dailyVelocity
    :null;

  return {
   ...x,
   stock:round(x.stock),
   cost:round(x.cost),
   price:round(x.price),
   qty_sold:round(x.qty_sold),
   revenue:round(x.revenue),
   estimated_cmv:round(x.estimated_cmv),
   estimated_gross_profit:round(grossProfit),
   estimated_margin:round(margin),
   daily_velocity:round(dailyVelocity),
   stock_coverage_days:
    coverage===null
     ?null
     :round(coverage)
  };
 });
}

function categoryPerformance(){

 const products=productPerformance();
 const map=new Map();

 for(const p of products){

  const key=p.category||"SEM CATEGORIA";

  if(!map.has(key)){
   map.set(key,{
    category:key,
    revenue:0,
    cmv:0,
    gross_profit:0,
    qty_sold:0
   });
  }

  const x=map.get(key);

  x.revenue+=n(p.revenue);
  x.cmv+=n(p.estimated_cmv);
  x.gross_profit+=n(
   p.estimated_gross_profit
  );
  x.qty_sold+=n(p.qty_sold);
 }

 return [...map.values()]
  .map(x=>({
   ...x,
   revenue:round(x.revenue),
   cmv:round(x.cmv),
   gross_profit:round(x.gross_profit),
   qty_sold:round(x.qty_sold),
   margin:
    x.revenue>0
     ?round(
       x.gross_profit/
       x.revenue*100
      )
     :0
  }))
  .sort(
   (a,b)=>b.revenue-a.revenue
  );
}

function obligations(){

 const list=[];

 if(tableExists("financial_obligations")){

  const rows=db.prepare(`
   SELECT *
   FROM financial_obligations
   WHERE status='OPEN'
   ORDER BY due_date
  `).all();

  for(const x of rows){

   list.push({
    source:"OBLIGATION",
    id:x.id,
    title:x.title,
    category:x.category,
    amount:round(x.amount),
    due_date:x.due_date,
    essential:
     x.essential===0?false:true
   });
  }
 }

 if(tableExists("expenses")){

  const c=columns("expenses");

  if(
   c.has("amount") &&
   c.has("due_date")
  ){

   let statusFilter="";

   if(c.has("status")){
    statusFilter=
     " AND COALESCE(status,'OPEN') NOT IN ('PAID','CANCELLED')";
   }

   const title=
    c.has("description")
     ?"description"
     :c.has("title")
      ?"title"
      :"'Despesa'";

   const category=
    c.has("category")
     ?"category"
     :"'DESPESA'";

   const rows=db.prepare(`
    SELECT
     id,
     ${title} title,
     ${category} category,
     amount,
     due_date
    FROM expenses
    WHERE amount>0
     ${statusFilter}
    ORDER BY due_date
   `).all();

   for(const x of rows){
    list.push({
     source:"EXPENSE",
     id:x.id,
     title:x.title,
     category:x.category,
     amount:round(x.amount),
     due_date:x.due_date,
     essential:true
    });
   }
  }
 }

 return list.sort(
  (a,b)=>
   String(a.due_date)
    .localeCompare(String(b.due_date))
 );
}

function localDateString(date){
 const y=date.getFullYear();
 const m=String(
  date.getMonth()+1
 ).padStart(2,"0");

 const d=String(
  date.getDate()
 ).padStart(2,"0");

 return `${y}-${m}-${d}`;
}

function daysUntil(dateText){

 if(!dateText)return 0;

 const now=new Date();
 now.setHours(0,0,0,0);

 const due=new Date(
  `${dateText}T12:00:00`
 );

 due.setHours(0,0,0,0);

 return Math.max(
  0,
  Math.ceil(
   (due-now)/86400000
  )
 );
}

function reservePlan(){

 const items=obligations();
 const profile=weekdayProfile();

 const profileMap=new Map(
  profile.map(x=>[
   x.weekday,
   Math.max(
    1,
    n(x.average_daily_revenue)
   )
  ])
 );

 const result=[];

 for(const obligation of items){

  const days=
   Math.max(
    1,
    daysUntil(obligation.due_date)+1
   );

  const today=new Date();
  const calendar=[];

  let totalWeight=0;

  for(let i=0;i<days;i++){

   const date=new Date(today);
   date.setDate(
    today.getDate()+i
   );

   const weekday=date.getDay();

   const weight=
    profileMap.get(weekday) || 1;

   totalWeight+=weight;

   calendar.push({
    date:localDateString(date),
    weekday,
    weight
   });
  }

  const todayWeight=
   calendar[0]?.weight||1;

  const todayReserve=
   round(
    n(obligation.amount)*
    todayWeight/
    Math.max(1,totalWeight)
   );

  const simpleDaily=
   round(
    n(obligation.amount)/days
   );

  result.push({
   ...obligation,
   days_remaining:days,
   simple_daily_reserve:simpleDaily,
   weighted_today_reserve:todayReserve,
   coverage_percent:0,
   reserved_amount:0,
   remaining_amount:
    round(obligation.amount),
   schedule:
    calendar.map(x=>({
     date:x.date,
     reserve:round(
      n(obligation.amount)*
      x.weight/
      Math.max(1,totalWeight)
     )
    }))
  });
 }

 return result;
}

function inventoryMetrics(){

 if(!tableExists("products")){
  return {
   stock_cost_value:0,
   stock_sale_value:0,
   potential_margin_value:0,
   slow_stock_cost:0
  };
 }

 const p=columns("products");

 if(
  !p.has("stock") ||
  !p.has("cost") ||
  !p.has("price")
 ){
  return {
   stock_cost_value:0,
   stock_sale_value:0,
   potential_margin_value:0,
   slow_stock_cost:0
  };
 }

 const products=productPerformance();

 const base=db.prepare(`
  SELECT
   COALESCE(SUM(stock*cost),0) stock_cost,
   COALESCE(SUM(stock*price),0) stock_sale
  FROM products
  WHERE COALESCE(active,1)=1
 `).get();

 const slow=
  products
   .filter(
    x=>n(x.stock)>0 &&
       n(x.qty_sold)===0
   )
   .reduce(
    (s,x)=>s+n(x.stock)*n(x.cost),
    0
   );

 return {
  stock_cost_value:
   round(base.stock_cost),

  stock_sale_value:
   round(base.stock_sale),

  potential_margin_value:
   round(
    n(base.stock_sale)-
    n(base.stock_cost)
   ),

  slow_stock_cost:
   round(slow)
 };
}

function forecast(){

 const current30=salesSummary(30);
 const trend=dailyTrend(30);

 const averageDaily=
  trend.length
   ?round(
     trend.reduce(
      (s,x)=>s+n(x.revenue),
      0
     )/trend.length
    )
   :0;

 return {
  average_daily_revenue:averageDaily,
  projected_7d:
   round(averageDaily*7),
  projected_14d:
   round(averageDaily*14),
  projected_30d:
   round(averageDaily*30),
  historical_30d:
   current30.revenue
 };
}

function financialSnapshot(){

 const current7=salesSummary(7);
 const previous7=
  previousSalesSummary(7);

 const current30=salesSummary(30);
 const previous30=
  previousSalesSummary(30);

 const products=productPerformance();
 const categories=categoryPerformance();

 const cmv=round(
  products.reduce(
   (s,x)=>s+n(x.estimated_cmv),
   0
  )
 );

 const grossProfit=round(
  current30.revenue-cmv
 );

 const grossMargin=
  current30.revenue>0
   ?round(
     grossProfit/
     current30.revenue*100
    )
   :0;

 const obligationList=obligations();

 const openCommitments=round(
  obligationList.reduce(
   (s,x)=>s+n(x.amount),
   0
  )
 );

 const reserve=reservePlan();

 const todayReserve=round(
  reserve.reduce(
   (s,x)=>
    s+n(x.weighted_today_reserve),
   0
  )
 );

 const forecastData=forecast();
 const inventory=inventoryMetrics();

 const workingCapitalNeed=round(
  openCommitments+
  Math.max(
   cmv/30*7,
   inventory.stock_cost_value*.15
  )
 );

 const projectedFreeCash=round(
  forecastData.projected_30d-
  openCommitments-
  cmv
 );

 return {
  generated_at:
   new Date().toISOString(),

  sales:{
   today:salesSummary(1),
   current_7d:current7,
   previous_7d:previous7,
   current_30d:current30,
   previous_30d:previous30,

   growth_7d:pct(
    current7.revenue,
    previous7.revenue
   ),

   growth_30d:pct(
    current30.revenue,
    previous30.revenue
   )
  },

  profitability:{
   revenue_30d:current30.revenue,
   estimated_cmv_30d:cmv,
   estimated_gross_profit_30d:
    grossProfit,
   estimated_gross_margin:
    grossMargin
  },

  commitments:{
   open_total:openCommitments,
   count:obligationList.length,
   today_reserve_target:
    todayReserve,
   obligations:reserve
  },

  inventory,

  working_capital:{
   estimated_need:
    workingCapitalNeed,
   projected_free_cash_30d:
    projectedFreeCash
  },

  forecast:forecastData,

  weekday_profile:weekdayProfile(),
  daily_trend:dailyTrend(30),
  products,
  categories
 };
}

function simulatePurchase(input={}){

 const amount=round(input.amount);
 const days=Math.max(
  1,
  Math.floor(n(input.days)||1)
 );

 const expectedMargin=
  Math.max(
   0,
   n(input.expected_margin)
  );

 const snapshot=
  financialSnapshot();

 const simpleReserve=
  round(amount/days);

 const expectedRevenue=
  expectedMargin>=100
   ?0
   :round(
     amount/
     (1-expectedMargin/100)
    );

 const expectedProfit=
  round(expectedRevenue-amount);

 const projectedRevenue=
  snapshot.forecast
   .average_daily_revenue*days;

 const reserveBurden=
  projectedRevenue>0
   ?round(
     amount/projectedRevenue*100
    )
   :0;

 return {
  purchase_amount:amount,
  payment_days:days,
  simple_daily_reserve:
   simpleReserve,
  expected_margin:expectedMargin,
  expected_revenue:expectedRevenue,
  expected_gross_profit:
   expectedProfit,
  projected_revenue_until_due:
   round(projectedRevenue),
  reserve_burden_percent:
   reserveBurden,
  projected_balance_after_purchase:
   round(
    projectedRevenue-amount
   ),
  historical_average_daily_revenue:
   snapshot.forecast
    .average_daily_revenue
 };
}

export function initFinancialIntelligence(){

 db.exec(`
  CREATE TABLE IF NOT EXISTS
  financial_intelligence_reserves(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   obligation_source TEXT NOT NULL,
   obligation_id INTEGER NOT NULL,
   reserve_date TEXT NOT NULL,
   target_amount REAL NOT NULL DEFAULT 0,
   reserved_amount REAL NOT NULL DEFAULT 0,
   status TEXT NOT NULL DEFAULT 'OPEN',
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   UNIQUE(
    obligation_source,
    obligation_id,
    reserve_date
   )
  );

  CREATE TABLE IF NOT EXISTS
  financial_intelligence_audit(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   action TEXT NOT NULL,
   entity_type TEXT,
   entity_id TEXT,
   payload TEXT,
   user_id INTEGER,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
 `);
}

export function registerFinancialIntelligence(
 app,
 {auth,minRole,audit}
){

 app.get(
  "/api/v25/intelligence/dashboard",
  auth,
  minRole(70),
  (_req,res)=>{
   try{
    res.json(
     financialSnapshot()
    );
   }catch(error){
    console.error(
     "FINANCIAL_INTELLIGENCE_DASHBOARD_ERROR",
     error
    );

    res.status(500).json({
     error:
      "FINANCIAL_INTELLIGENCE_FAILED"
    });
   }
  }
 );

 app.get(
  "/api/v25/intelligence/reserve-plan",
  auth,
  minRole(70),
  (_req,res)=>{
   try{
    res.json({
     generated_at:
      new Date().toISOString(),
     plan:reservePlan()
    });
   }catch(error){
    res.status(500).json({
     error:error.message
    });
   }
  }
 );

 app.post(
  "/api/v25/intelligence/purchase-simulation",
  auth,
  minRole(70),
  (req,res)=>{
   try{
    const amount=n(req.body?.amount);

    if(amount<=0){
     return res.status(400).json({
      error:"VALOR_DE_COMPRA_OBRIGATORIO"
     });
    }

    const result=
     simulatePurchase(req.body);

    if(audit){
     audit(
      req.user.id,
      "SIMULATE",
      "PURCHASE_FINANCIAL_IMPACT",
      null,
      result
     );
    }

    res.json(result);

   }catch(error){
    res.status(400).json({
     error:error.message
    });
   }
  }
 );

 app.post(
  "/api/v25/intelligence/reserve",
  auth,
  minRole(70),
  (req,res)=>{
   try{

    const source=
     String(
      req.body?.source||""
     ).toUpperCase();

    const obligationId=
     Math.floor(
      n(req.body?.obligation_id)
     );

    const amount=
     round(req.body?.amount);

    if(
     !["OBLIGATION","EXPENSE"]
      .includes(source) ||
     obligationId<=0 ||
     amount<=0
    ){
     return res.status(400).json({
      error:"DADOS_DA_RESERVA_INVALIDOS"
     });
    }

    const date=
     localDateString(
      new Date()
     );

    db.prepare(`
     INSERT INTO
      financial_intelligence_reserves(
       obligation_source,
       obligation_id,
       reserve_date,
       target_amount,
       reserved_amount,
       status
      )
     VALUES(?,?,?,?,?,'OPEN')

     ON CONFLICT(
      obligation_source,
      obligation_id,
      reserve_date
     )

     DO UPDATE SET
      reserved_amount=
       financial_intelligence_reserves
        .reserved_amount+
       excluded.reserved_amount,
      updated_at=CURRENT_TIMESTAMP
    `).run(
     source,
     obligationId,
     date,
     amount,
     amount
    );

    db.prepare(`
     INSERT INTO
      financial_intelligence_audit(
       action,
       entity_type,
       entity_id,
       payload,
       user_id
      )
     VALUES(
      'RESERVE_RECORDED',
      'FINANCIAL_OBLIGATION',
      ?,
      ?,
      ?
     )
    `).run(
     `${source}:${obligationId}`,
     JSON.stringify({
      amount,
      date
     }),
     req.user.id
    );

    if(audit){
     audit(
      req.user.id,
      "RESERVE_RECORDED",
      "FINANCIAL_OBLIGATION",
      `${source}:${obligationId}`,
      {amount,date}
     );
    }

    res.json({
     ok:true,
     source,
     obligation_id:
      obligationId,
     amount,
     reserve_date:date
    });

   }catch(error){
    res.status(400).json({
     error:error.message
    });
   }
  }
 );
}

export {
 financialSnapshot,
 simulatePurchase
};

/* ============================================================
   NEXUS_GROWTH_INTELLIGENCE_T25C
   ABC + GOALS + ALERTS + RECOMMENDATIONS
   ============================================================ */

function currentMonthKeyV25(){
 const now=new Date();
 return [
  now.getFullYear(),
  String(now.getMonth()+1).padStart(2,"0")
 ].join("-");
}

function monthProgressV25(){
 const now=new Date();

 const daysInMonth=
  new Date(
   now.getFullYear(),
   now.getMonth()+1,
   0
  ).getDate();

 return {
  day:now.getDate(),
  days_in_month:daysInMonth,
  remaining_days:
   Math.max(
    0,
    daysInMonth-now.getDate()
   ),
  progress_percent:
   round(
    now.getDate()/
    daysInMonth*100
   )
 };
}

function abcAnalysisV25(){

 const products=productPerformance()
  .filter(x=>n(x.revenue)>0)
  .sort(
   (a,b)=>n(b.revenue)-n(a.revenue)
  );

 const totalRevenue=
  products.reduce(
   (sum,x)=>sum+n(x.revenue),
   0
  );

 let accumulated=0;

 return products.map((x,index)=>{

  const participation=
   totalRevenue>0
    ?n(x.revenue)/totalRevenue*100
    :0;

  accumulated+=participation;

  let abc="C";

  if(accumulated<=80){
   abc="A";
  }
  else if(accumulated<=95){
   abc="B";
  }

  return {
   rank:index+1,
   product_id:x.id,
   name:x.name,
   category:x.category,
   abc,
   revenue:round(x.revenue),
   revenue_share_percent:
    round(participation),
   accumulated_percent:
    round(accumulated),
   qty_sold:round(x.qty_sold),
   estimated_gross_profit:
    round(x.estimated_gross_profit),
   estimated_margin:
    round(x.estimated_margin),
   stock:round(x.stock),
   stock_coverage_days:
    x.stock_coverage_days
  };
 });
}

function getCurrentGoalV25(){

 if(!tableExists("business_growth_goals")){
  return null;
 }

 return db.prepare(`
  SELECT *
  FROM business_growth_goals
  WHERE period_type='MONTHLY'
   AND period_key=?
   AND active=1
  LIMIT 1
 `).get(currentMonthKeyV25())||null;
}

function monthSalesV25(){

 if(!tableExists("sales")){
  return {
   revenue:0,
   sales:0,
   average_ticket:0
  };
 }

 const row=db.prepare(`
  SELECT
   COUNT(*) sales,
   COALESCE(SUM(total),0) revenue,
   COALESCE(AVG(total),0) average_ticket
  FROM sales
  WHERE status='PAID'
   AND strftime(
    '%Y-%m',
    created_at,
    'localtime'
   )=?
 `).get(currentMonthKeyV25());

 return {
  revenue:round(row?.revenue),
  sales:n(row?.sales),
  average_ticket:
   round(row?.average_ticket)
 };
}

function goalStatusV25(){

 const goal=getCurrentGoalV25();
 const actual=monthSalesV25();
 const calendar=monthProgressV25();

 if(!goal){
  return {
   configured:false,
   period_key:currentMonthKeyV25(),
   actual,
   calendar
  };
 }

 const revenueTarget=
  n(goal.revenue_target);

 const grossTarget=
  n(goal.gross_profit_target);

 const currentSnapshot=
  financialSnapshot();

 const grossProfit=
  n(
   currentSnapshot
    ?.profitability
    ?.estimated_gross_profit_30d
  );

 const revenueRemaining=
  Math.max(
   0,
   revenueTarget-actual.revenue
  );

 const dailyRevenueRequired=
  calendar.remaining_days>0
   ?round(
     revenueRemaining/
     calendar.remaining_days
    )
   :round(revenueRemaining);

 const expectedByProgress=
  revenueTarget*
  calendar.progress_percent/100;

 const paceDifference=
  round(
   actual.revenue-
   expectedByProgress
  );

 return {
  configured:true,
  id:goal.id,
  period_key:goal.period_key,

  targets:{
   revenue:round(revenueTarget),
   gross_profit:
    round(grossTarget),
   average_ticket:
    round(goal.average_ticket_target)
  },

  actual:{
   ...actual,
   estimated_gross_profit:
    round(grossProfit)
  },

  progress:{
   revenue_percent:
    revenueTarget>0
     ?round(
       actual.revenue/
       revenueTarget*100
      )
     :0,

   gross_profit_percent:
    grossTarget>0
     ?round(
       grossProfit/
       grossTarget*100
      )
     :0
  },

  calendar,

  revenue_remaining:
   round(revenueRemaining),

  required_daily_revenue:
   dailyRevenueRequired,

  pace_difference:
   paceDifference,

  pace_status:
   paceDifference>=0
    ?"AHEAD"
    :"BEHIND"
 };
}

function growthAlertsV25(){

 const snapshot=financialSnapshot();
 const abc=abcAnalysisV25();
 const goal=goalStatusV25();

 const alerts=[];

 const growth30=
  n(snapshot?.sales?.growth_30d);

 if(growth30<=-10){
  alerts.push({
   severity:"HIGH",
   type:"REVENUE_DECLINE",
   title:"Queda de faturamento",
   message:
    `O faturamento dos últimos 30 dias está ${Math.abs(growth30).toFixed(1)}% abaixo do período anterior.`,
   metric:growth30
  });
 }
 else if(growth30<0){
  alerts.push({
   severity:"MEDIUM",
   type:"REVENUE_DECLINE",
   title:"Faturamento em desaceleração",
   message:
    `O faturamento recuou ${Math.abs(growth30).toFixed(1)}% em relação ao período anterior.`,
   metric:growth30
  });
 }
 else if(growth30>=10){
  alerts.push({
   severity:"POSITIVE",
   type:"REVENUE_GROWTH",
   title:"Crescimento de faturamento",
   message:
    `O faturamento cresceu ${growth30.toFixed(1)}% em relação ao período anterior.`,
   metric:growth30
  });
 }

 const lowCoverage=
  (snapshot.products||[])
   .filter(
    x=>
     x.stock_coverage_days!==null &&
     n(x.stock_coverage_days)<=5 &&
     n(x.qty_sold)>0
   )
   .slice(0,5);

 for(const product of lowCoverage){
  alerts.push({
   severity:"HIGH",
   type:"STOCK_RUPTURE",
   title:"Risco de ruptura",
   message:
    `${product.name} possui aproximadamente ${numberSafeV25(product.stock_coverage_days)} dia(s) de cobertura.`,
   product_id:product.id
  });
 }

 const slowStock=
  (snapshot.products||[])
   .filter(
    x=>
     n(x.stock)>0 &&
     n(x.qty_sold)===0
   );

 if(slowStock.length){
  const capital=
   slowStock.reduce(
    (sum,x)=>
     sum+n(x.stock)*n(x.cost),
    0
   );

  alerts.push({
   severity:"MEDIUM",
   type:"SLOW_STOCK",
   title:"Capital em produtos sem giro",
   message:
    `${slowStock.length} produto(s) não registraram saída no período analisado. Capital estimado a custo: R$ ${round(capital).toFixed(2)}.`,
   amount:round(capital)
  });
 }

 const commitments=
  n(snapshot?.commitments?.open_total);

 const projectedRevenue=
  n(snapshot?.forecast?.projected_30d);

 if(
  commitments>0 &&
  projectedRevenue>0 &&
  commitments/projectedRevenue>=0.5
 ){
  alerts.push({
   severity:"HIGH",
   type:"COMMITMENT_PRESSURE",
   title:"Pressão de compromissos",
   message:
    `Os compromissos abertos representam aproximadamente ${round(commitments/projectedRevenue*100)}% da receita projetada para 30 dias.`,
   amount:commitments
  });
 }

 if(
  goal?.configured &&
  goal.pace_status==="BEHIND"
 ){
  alerts.push({
   severity:"MEDIUM",
   type:"GOAL_BEHIND",
   title:"Meta abaixo do ritmo necessário",
   message:
    `Para alcançar a meta mensal, o negócio precisa faturar em média R$ ${round(goal.required_daily_revenue).toFixed(2)} por dia restante.`,
   amount:
    goal.required_daily_revenue
  });
 }

 const lowMarginA=
  abc.filter(
   x=>
    x.abc==="A" &&
    n(x.estimated_margin)<25
  );

 if(lowMarginA.length){
  alerts.push({
   severity:"MEDIUM",
   type:"ABC_LOW_MARGIN",
   title:"Produto Classe A com margem reduzida",
   message:
    `${lowMarginA[0].name} possui alta participação no faturamento, mas margem bruta estimada de ${round(lowMarginA[0].estimated_margin)}%.`,
   product_id:lowMarginA[0].product_id
  });
 }

 return alerts;
}

function numberSafeV25(value){
 return round(value)
  .toLocaleString(
   "pt-BR",
   {maximumFractionDigits:1}
  );
}

function growthRecommendationsV25(){

 const snapshot=financialSnapshot();
 const abc=abcAnalysisV25();
 const goal=goalStatusV25();

 const recommendations=[];

 const classA=
  abc.filter(x=>x.abc==="A");

 if(classA.length){
  const leaders=
   classA.slice(0,3)
    .map(x=>x.name)
    .join(", ");

  recommendations.push({
   priority:"HIGH",
   type:"ABC_PRIORITY",
   title:"Proteja os produtos que sustentam o faturamento",
   message:
    `Os principais itens Classe A são ${leaders}. Evite ruptura e acompanhe custo, preço e margem desses produtos com prioridade.`
  });
 }

 const profitable=
  [...abc]
   .filter(
    x=>n(x.estimated_gross_profit)>0
   )
   .sort(
    (a,b)=>
     n(b.estimated_gross_profit)-
     n(a.estimated_gross_profit)
   );

 if(profitable.length){
  const top=profitable[0];

  recommendations.push({
   priority:"MEDIUM",
   type:"PROFIT_LEADER",
   title:"Maior contribuição de lucro bruto",
   message:
    `${top.name} apresenta a maior contribuição estimada de lucro bruto no período: R$ ${round(top.estimated_gross_profit).toFixed(2)}.`
  });
 }

 const bestWeekday=
  [...(snapshot.weekday_profile||[])]
   .sort(
    (a,b)=>
     n(b.average_daily_revenue)-
     n(a.average_daily_revenue)
   )[0];

 if(bestWeekday){
  recommendations.push({
   priority:"MEDIUM",
   type:"BEST_WEEKDAY",
   title:"Dia de maior força comercial",
   message:
    `${bestWeekday.name} apresenta a maior média histórica de faturamento diário: R$ ${round(bestWeekday.average_daily_revenue).toFixed(2)}.`
  });
 }

 if(
  n(snapshot.inventory.slow_stock_cost)>0
 ){
  recommendations.push({
   priority:"MEDIUM",
   type:"REDUCE_IDLE_CAPITAL",
   title:"Reduza capital parado",
   message:
    `Há aproximadamente R$ ${round(snapshot.inventory.slow_stock_cost).toFixed(2)} a custo em itens sem giro no período analisado. Avalie reposição, exposição e estratégia comercial antes de novas compras desses itens.`
  });
 }

 if(
  n(snapshot.commitments.today_reserve_target)>0
 ){
  recommendations.push({
   priority:"HIGH",
   type:"DAILY_RESERVE",
   title:"Reserva financeira sugerida para hoje",
   message:
    `O motor calcula uma provisão sugerida de R$ ${round(snapshot.commitments.today_reserve_target).toFixed(2)} para os compromissos atuais. Este valor é uma orientação e não significa que o dinheiro tenha sido efetivamente separado.`
  });
 }

 if(goal?.configured){

  if(goal.pace_status==="AHEAD"){
   recommendations.push({
    priority:"POSITIVE",
    type:"GOAL_PACE",
    title:"Ritmo acima da meta",
    message:
     `O faturamento está R$ ${Math.abs(round(goal.pace_difference)).toFixed(2)} acima do ritmo proporcional da meta mensal.`
   });
  }
  else{
   recommendations.push({
    priority:"HIGH",
    type:"GOAL_RECOVERY",
    title:"Ritmo necessário para alcançar a meta",
    message:
     `Faltam R$ ${round(goal.revenue_remaining).toFixed(2)} para a meta. A média necessária nos dias restantes é R$ ${round(goal.required_daily_revenue).toFixed(2)} por dia.`
   });
  }
 }

 return recommendations;
}

function executiveGrowthV25(){

 const snapshot=financialSnapshot();

 return {
  generated_at:
   new Date().toISOString(),

  snapshot,

  abc:abcAnalysisV25(),

  goal:goalStatusV25(),

  alerts:growthAlertsV25(),

  recommendations:
   growthRecommendationsV25()
 };
}

export function registerGrowthIntelligenceV25(
 app,
 {auth,minRole,audit}
){

 app.get(
  "/api/v25/intelligence/executive-growth",
  auth,
  minRole(70),
  (_req,res)=>{
   try{
    res.json(
     executiveGrowthV25()
    );
   }
   catch(error){
    console.error(
     "EXECUTIVE_GROWTH_ERROR",
     error
    );

    res.status(500).json({
     error:
      "EXECUTIVE_GROWTH_FAILED"
    });
   }
  }
 );

 app.get(
  "/api/v25/intelligence/goal",
  auth,
  minRole(70),
  (_req,res)=>{
   res.json(
    goalStatusV25()
   );
  }
 );

 app.put(
  "/api/v25/intelligence/goal",
  auth,
  minRole(70),
  (req,res)=>{
   try{

    const periodKey=
     currentMonthKeyV25();

    const revenueTarget=
     Math.max(
      0,
      n(req.body?.revenue_target)
     );

    const grossProfitTarget=
     Math.max(
      0,
      n(req.body?.gross_profit_target)
     );

    const averageTicketTarget=
     Math.max(
      0,
      n(req.body?.average_ticket_target)
     );

    if(revenueTarget<=0){
     return res.status(400).json({
      error:
       "META_DE_FATURAMENTO_OBRIGATORIA"
     });
    }

    db.prepare(`
     INSERT INTO business_growth_goals(
      period_type,
      period_key,
      revenue_target,
      gross_profit_target,
      average_ticket_target,
      notes,
      active,
      created_by
     )
     VALUES(
      'MONTHLY',
      ?,
      ?,
      ?,
      ?,
      ?,
      1,
      ?
     )

     ON CONFLICT(
      period_type,
      period_key
     )

     DO UPDATE SET
      revenue_target=
       excluded.revenue_target,
      gross_profit_target=
       excluded.gross_profit_target,
      average_ticket_target=
       excluded.average_ticket_target,
      notes=
       excluded.notes,
      active=1,
      updated_at=CURRENT_TIMESTAMP
    `).run(
     periodKey,
     revenueTarget,
     grossProfitTarget,
     averageTicketTarget,
     String(req.body?.notes||""),
     req.user.id
    );

    if(audit){
     audit(
      req.user.id,
      "BUSINESS_GROWTH_GOAL_UPDATED",
      "BUSINESS_GROWTH_GOAL",
      periodKey,
      {
       revenue_target:
        revenueTarget,
       gross_profit_target:
        grossProfitTarget,
       average_ticket_target:
        averageTicketTarget
      }
     );
    }

    res.json({
     ok:true,
     goal:goalStatusV25()
    });

   }
   catch(error){
    console.error(
     "GROWTH_GOAL_UPDATE_ERROR",
     error
    );

    res.status(400).json({
     error:error.message
    });
   }
  }
 );
}

