import {db} from './db.js';
import {consumeProduct} from './recipe-engine.js';
import {smartSalePrice,smartUnitCost} from './suite-v06.js';
const n=v=>Number(v||0);
function inventorySnapshot(){const products=db.prepare('SELECT id,stock FROM products').all();const prof=Object.fromEntries(db.prepare('SELECT product_id,closed_units,open_base FROM inventory_profiles').all().map(x=>[x.product_id,x]));return Object.fromEntries(products.map(x=>[x.id,{stock:n(x.stock),closed:n(prof[x.id]?.closed_units),open:n(prof[x.id]?.open_base)}]))}
function ledgerDiff(saleId,before){const after=inventorySnapshot(),ins=db.prepare('INSERT INTO sale_inventory_ledger(sale_id,product_id,stock_delta,closed_delta,open_delta) VALUES(?,?,?,?,?)');for(const [id,b] of Object.entries(before)){const a=after[id]||b,ds=n(a.stock)-n(b.stock),dc=n(a.closed)-n(b.closed),doo=n(a.open)-n(b.open);if(Math.abs(ds)>1e-9||Math.abs(dc)>1e-9||Math.abs(doo)>1e-9)ins.run(saleId,n(id),ds,dc,doo)}}

function ensureItemInventoryLedger(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_item_inventory_ledger(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      sale_item_id INTEGER NOT NULL,
      affected_product_id INTEGER NOT NULL,
      stock_delta REAL NOT NULL DEFAULT 0,
      closed_delta REAL NOT NULL DEFAULT 0,
      open_delta REAL NOT NULL DEFAULT 0,
      source_mode TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sale_item_inventory_ledger_sale
      ON sale_item_inventory_ledger(sale_id);

    CREATE INDEX IF NOT EXISTS idx_sale_item_inventory_ledger_item
      ON sale_item_inventory_ledger(sale_item_id);
  `);
}

ensureItemInventoryLedger();

function itemLedgerDiff(saleId,saleItemId,before,mode){
  const after=inventorySnapshot();

  const ins=db.prepare(`
    INSERT INTO sale_item_inventory_ledger(
      sale_id,
      sale_item_id,
      affected_product_id,
      stock_delta,
      closed_delta,
      open_delta,
      source_mode
    )
    VALUES(?,?,?,?,?,?,?)
  `);

  for(const [id,b] of Object.entries(before)){
    const a=after[id]||b;

    const ds=n(a.stock)-n(b.stock);
    const dc=n(a.closed)-n(b.closed);
    const doo=n(a.open)-n(b.open);

    if(
      Math.abs(ds)>1e-9 ||
      Math.abs(dc)>1e-9 ||
      Math.abs(doo)>1e-9
    ){
      ins.run(
        saleId,
        saleItemId,
        n(id),
        ds,
        dc,
        doo,
        String(mode||'UNIT').toUpperCase()
      );
    }
  }
}

export function currentCash(){return db.prepare("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get()||null}
export function resolveItems(items=[]){const get=db.prepare('SELECT * FROM products WHERE id=? AND active=1');return items.map(i=>{const p=get.get(n(i.product_id));if(!p)throw new Error(`Produto inválido: ${i.product_id}`);const qty=Math.max(.01,n(i.qty||1)),mode=String(i.mode||'UNIT').toUpperCase();return{p,qty,mode,price:smartSalePrice(p.id,mode,p.price),cost:smartUnitCost(p.id,mode,p.cost)}})}
export function createUnifiedSale({
  items,
  payment_method='DINHEIRO',
  payments=[],
  table_label=null,
  customer_name=null,
  customer_id=null,
  employee_id=null,
  tip_amount=0,
  user_id,
  source='POS',
  source_id=null
}){
  const cs=currentCash();

  if(!cs)throw new Error('CASH_SESSION_REQUIRED');

  const resolved=resolveItems(items);

  if(!resolved.length){
    throw new Error('VENDA_SEM_ITENS');
  }

  const total=resolved.reduce(
    (a,x)=>a+x.price*x.qty,
    0
  );

  const tip=n(tip_amount);
  const due=total+tip;

  const splits=Array.isArray(payments)
    ? payments
        .filter(x=>n(x.amount)>0)
        .map(x=>({
          method:String(x.method||'DINHEIRO').toUpperCase(),
          amount:n(x.amount)
        }))
    : [];

  if(
    splits.length &&
    Math.abs(
      splits.reduce((a,x)=>a+x.amount,0)-due
    )>.01
  ){
    throw new Error('PAYMENT_SPLIT_MISMATCH');
  }

  return db.transaction(()=>{

    const saleBefore=inventorySnapshot();

    const s=db.prepare(`
      INSERT INTO sales(
        total,
        payment_method,
        status,
        table_label,
        customer_name,
        cash_session_id,
        user_id,
        employee_id,
        tip_amount
      )
      VALUES(?,?,'PAID',?,?,?,?,?,?)
    `).run(
      total,
      splits.length>1
        ? 'MISTO'
        : String(
            splits[0]?.method ||
            payment_method
          ).toUpperCase(),
      table_label,
      customer_name,
      cs.id,
      user_id,
      employee_id,
      tip
    );

    const saleId=n(s.lastInsertRowid);

    for(const x of resolved){

      const itemInfo=db.prepare(`
        INSERT INTO sale_items(
          sale_id,
          product_id,
          qty,
          unit_price,
          unit_cost,
          sale_mode
        )
        VALUES(?,?,?,?,?,?)
      `).run(
        saleId,
        x.p.id,
        x.qty,
        x.price,
        x.cost,
        x.mode
      );

      const saleItemId=n(itemInfo.lastInsertRowid);

      /*
       * Snapshot imediatamente antes deste item.
       * Assim receitas e estoque inteligente ficam vinculados
       * ao sale_item correto.
       */
      const itemBefore=inventorySnapshot();

      consumeProduct(
        x.p.id,
        x.qty,
        user_id,
        source,
        source_id||saleId,
        x.mode
      );

      itemLedgerDiff(
        saleId,
        saleItemId,
        itemBefore,
        x.mode
      );
    }

    if(splits.length){
      const q=db.prepare(
        'INSERT INTO payment_splits(sale_id,method,amount) VALUES(?,?,?)'
      );

      splits.forEach(x=>
        q.run(saleId,x.method,x.amount)
      );

    }else{

      db.prepare(
        'INSERT INTO payment_splits(sale_id,method,amount) VALUES(?,?,?)'
      ).run(
        saleId,
        String(payment_method).toUpperCase(),
        due
      );
    }

    if(customer_id){
      db.prepare(`
        UPDATE customers
        SET
          visits=COALESCE(visits,0)+1,
          total_spent=COALESCE(total_spent,0)+?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        due,
        n(customer_id)
      );
    }

    /*
     * Ledger legado permanece para cancelamento integral
     * e compatibilidade das vendas existentes.
     */
    ledgerDiff(saleId,saleBefore);

    if(employee_id&&tip>0){
      db.prepare(
        "INSERT INTO tips(sale_id,employee_id,amount,method,status) VALUES(?,?,?,'SALE','PENDING')"
      ).run(
        saleId,
        n(employee_id),
        tip
      );
    }

    return db.prepare(
      'SELECT * FROM sales WHERE id=?'
    ).get(saleId);

  })();
}

export function cashSummary(id){
  const cs=db.prepare(
    'SELECT * FROM cash_sessions WHERE id=?'
  ).get(n(id));

  if(!cs)return null;

  /*
   * PAGAMENTOS LIQUIDOS
   *
   * Vendas CANCELLED continuam excluidas pela condicao PAID.
   * Para vendas PAID com devolucao V1.6, subtraimos somente
   * as reversoes registradas em sale_return_payment_reversals.
   *
   * Dessa forma:
   * - cancelamento total nao sofre dupla subtracao;
   * - devolucao reduz o metodo de pagamento correto;
   * - DINHEIRO reduz caixa fisico esperado;
   * - PIX/CARTAO reduzem seus respectivos totais.
   */

  const grossMethods=db.prepare(`
    SELECT
      ps.method,
      COALESCE(SUM(ps.amount),0) amount
    FROM payment_splits ps
    JOIN sales s
      ON s.id=ps.sale_id
    WHERE s.cash_session_id=?
      AND s.status='PAID'
    GROUP BY ps.method
  `).all(cs.id);

  const returnMethods=db.prepare(`
    SELECT
      rpr.method,
      COALESCE(SUM(rpr.amount),0) amount
    FROM sale_return_payment_reversals rpr
    JOIN sales s
      ON s.id=rpr.sale_id
    WHERE s.cash_session_id=?
      AND s.status='PAID'
      AND rpr.status='RECORDED'
    GROUP BY rpr.method
  `).all(cs.id);

  const map={};

  for(const x of grossMethods){
    map[x.method]=n(x.amount);
  }

  for(const x of returnMethods){
    map[x.method]=
      n(map[x.method])-n(x.amount);
  }

  /*
   * Evita residuos negativos de ponto flutuante.
   */

  for(const method of Object.keys(map)){
    if(
      map[method]<0 &&
      Math.abs(map[method])<0.01
    ){
      map[method]=0;
    }
  }

  const mv=db.prepare(`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN type='SUPRIMENTO'
            THEN amount
            ELSE 0
          END
        ),0
      ) supplies,

      COALESCE(
        SUM(
          CASE
            WHEN type='SANGRIA'
            THEN amount
            ELSE 0
          END
        ),0
      ) withdrawals

    FROM cash_movements
    WHERE cash_session_id=?
  `).get(cs.id);

  /*
   * Receita bruta PAID.
   */

  const grossSales=db.prepare(`
    SELECT
      COUNT(*) count,
      COALESCE(SUM(total),0) revenue,
      COALESCE(SUM(tip_amount),0) tips
    FROM sales
    WHERE cash_session_id=?
      AND status='PAID'
  `).get(cs.id);

  /*
   * Somente devolucoes de vendas ainda PAID.
   * CANCELLED nao entra aqui para impedir dupla deducao.
   */

  const returned=db.prepare(`
    SELECT
      COALESCE(SUM(sr.total),0) amount
    FROM sale_returns sr
    JOIN sales s
      ON s.id=sr.sale_id
    WHERE s.cash_session_id=?
      AND s.status='PAID'
  `).get(cs.id);

  const returnedAmount=
    n(returned?.amount);

  const netRevenue=
    Math.max(
      0,
      n(grossSales.revenue)-returnedAmount
    );

  /*
   * Mantemos count como numero de vendas PAID.
   * Uma devolucao parcial nao apaga a venda.
   */

  const sales={
    ...grossSales,
    gross_revenue:n(grossSales.revenue),
    returns:returnedAmount,
    revenue:netRevenue
  };

  const cashSales=
    n(map.DINHEIRO);

  const expectedCash=
    n(cs.opening_amount)+
    cashSales+
    n(mv.supplies)-
    n(mv.withdrawals);

  return{
    session:cs,
    sales,
    methods:map,
    supplies:n(mv.supplies),
    withdrawals:n(mv.withdrawals),
    expected_cash:expectedCash
  };
}

if(!globalThis.__NEXUS_TX__)globalThis.__NEXUS_TX__={};globalThis.__NEXUS_TX__.createUnifiedSale=createUnifiedSale;
