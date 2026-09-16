import fs from 'node:fs';

const txFile='./server/transaction-engine.js';
const opFile='./server/operation-v14.js';
const apiFile='./src/api.js';

let tx=fs.readFileSync(txFile,'utf8');
let op=fs.readFileSync(opFile,'utf8');
let api=fs.readFileSync(apiFile,'utf8');

/*
 * ==========================================================
 * TRANSACTION ENGINE
 * ==========================================================
 */

if(!tx.includes('sale_item_inventory_ledger')){

  const marker=
`export function currentCash(){return db.prepare("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get()||null}`;

  if(!tx.includes(marker)){
    throw new Error('TX_MARKER_CURRENT_CASH_NOT_FOUND');
  }

  const layer=`
function ensureItemInventoryLedger(){
  db.exec(\`
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
  \`);
}

ensureItemInventoryLedger();

function itemLedgerDiff(saleId,saleItemId,before,mode){
  const after=inventorySnapshot();

  const ins=db.prepare(\`
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
  \`);

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

`;

  tx=tx.replace(marker,layer+marker);
}

/*
 * Substitui SOMENTE createUnifiedSale.
 * Mantem ledger agregado legado e adiciona ledger por item.
 */

const start=tx.indexOf('export function createUnifiedSale(');
const end=tx.indexOf('\nexport function cashSummary',start);

if(start<0 || end<0){
  throw new Error('CREATE_UNIFIED_SALE_BOUNDARY_NOT_FOUND');
}

const newCreate=`export function createUnifiedSale({
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

    const s=db.prepare(\`
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
    \`).run(
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

      const itemInfo=db.prepare(\`
        INSERT INTO sale_items(
          sale_id,
          product_id,
          qty,
          unit_price,
          unit_cost,
          sale_mode
        )
        VALUES(?,?,?,?,?,?)
      \`).run(
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
      db.prepare(\`
        UPDATE customers
        SET
          visits=COALESCE(visits,0)+1,
          total_spent=COALESCE(total_spent,0)+?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      \`).run(
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
`;

tx=tx.slice(0,start)+newCreate+tx.slice(end);

/*
 * ==========================================================
 * OPERATION V14 - PAYMENT/RELEASE HARDENING
 * ==========================================================
 */

const routeStart=op.indexOf(" app.post('/api/v14/sales',");
const releaseStart=op.indexOf(" app.post('/api/v14/sales/:id/release'",routeStart);

if(routeStart<0 || releaseStart<0){
  throw new Error('OPERATION_V14_SALE_ROUTE_NOT_FOUND');
}

const newSaleRoute=` app.post('/api/v14/sales',auth,minRole(50),(req,res)=>{
  try{
    const b=req.body||{};
    const items=b.items||[];

    const payments=(b.payments||[])
      .filter(x=>n(x.amount)>0)
      .map(x=>({
        method:String(x.method||'DINHEIRO').toUpperCase(),
        amount:r(x.amount)
      }));

    if(!items.length){
      return res.status(400).json({
        error:'VENDA_SEM_ITENS'
      });
    }

    /*
     * O frontend calcula o total, mas o backend nao confia nele.
     * createUnifiedSale valida novamente os splits contra o
     * valor real calculado dos produtos.
     */
    if(!payments.length){
      return res.status(400).json({
        error:'PAGAMENTO_NAO_CONFIRMADO'
      });
    }

    const {createUnifiedSale}=
      globalThis.__NEXUS_TX__||{};

    if(!createUnifiedSale){
      throw new Error(
        'TRANSACTION_ENGINE_UNAVAILABLE'
      );
    }

    /*
     * Para dinheiro, received_amount precisa existir e cobrir
     * especificamente a parcela em dinheiro.
     */
    const cashDue=r(
      payments
        .filter(x=>x.method==='DINHEIRO')
        .reduce((a,x)=>a+n(x.amount),0)
    );

    const received=r(b.received_amount);

    if(cashDue>0 && received+0.001<cashDue){
      return res.status(400).json({
        error:'VALOR_RECEBIDO_INSUFICIENTE',
        cash_due:cashDue,
        received
      });
    }

    const sale=createUnifiedSale({
      items,
      payments,
      payment_method:
        payments.length>1
          ? 'MISTO'
          : payments[0].method,
      employee_id:b.employee_id||null,
      customer_name:b.customer_name||null,
      customer_id:b.customer_id||null,
      tip_amount:n(b.tip_amount),
      user_id:req.user.id,
      source:'POS_V161'
    });

    const due=r(
      n(sale.total)+n(sale.tip_amount)
    );

    const paid=r(
      payments.reduce(
        (a,x)=>a+n(x.amount),
        0
      )
    );

    if(Math.abs(paid-due)>.01){
      /*
       * Em condicao normal isto ja foi bloqueado dentro
       * de createUnifiedSale e a transacao revertida.
       */
      throw new Error('PAYMENT_SPLIT_MISMATCH');
    }

    const effectiveReceived=
      cashDue>0
        ? received
        : paid;

    const change=
      cashDue>0
        ? Math.max(
            0,
            r(effectiveReceived-cashDue)
          )
        : 0;

    const code=
      \`R\${String(sale.id).padStart(5,'0')}-\${crypto.randomBytes(2).toString('hex').toUpperCase()}\`;

    db.prepare(\`
      UPDATE sales
      SET
        received_amount=?,
        change_amount=?,
        release_code=?
      WHERE id=?
    \`).run(
      effectiveReceived,
      change,
      code,
      sale.id
    );

    audit(
      req.user.id,
      'SALE_COMPLETED',
      'SALE',
      sale.id,
      {
        payments,
        payment_confirmed:true,
        received:effectiveReceived,
        cash_due:cashDue,
        change,
        release_code:code,
        engine:'V1.6.1'
      }
    );

    res.status(201).json(
      detail(sale.id)
    );

  }catch(e){
    res.status(400).json({
      error:e.message
    });
  }
});
`;

op=op.slice(0,routeStart)+newSaleRoute+op.slice(releaseStart);

/*
 * Troca apenas a rota release.
 */

const releaseEnd=op.indexOf(
  " app.post('/api/v14/sales/:id/change-correction'",
  op.indexOf(" app.post('/api/v14/sales/:id/release'")
);

const releaseRouteStart=
  op.indexOf(" app.post('/api/v14/sales/:id/release'");

if(releaseRouteStart<0 || releaseEnd<0){
  throw new Error('RELEASE_ROUTE_BOUNDARY_NOT_FOUND');
}

const newRelease=` app.post('/api/v14/sales/:id/release',auth,minRole(40),(req,res)=>{
  const id=n(req.params.id);

  const s=db.prepare(
    "SELECT * FROM sales WHERE id=? AND status='PAID'"
  ).get(id);

  if(!s){
    return res.status(409).json({
      error:'VENDA_NAO_LIBERAVEL'
    });
  }

  if(s.released_at){
    return res.status(409).json({
      error:'VENDA_JA_LIBERADA'
    });
  }

  const payment=db.prepare(\`
    SELECT COALESCE(SUM(amount),0) total
    FROM payment_splits
    WHERE sale_id=?
  \`).get(id);

  const due=r(
    n(s.total)+n(s.tip_amount)
  );

  const paid=r(
    n(payment?.total)
  );

  if(Math.abs(paid-due)>.01){
    return res.status(409).json({
      error:'PAGAMENTO_NAO_CONFIRMADO',
      due,
      paid
    });
  }

  if(!t(s.release_code)){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_GERADA'
    });
  }

  db.prepare(\`
    UPDATE sales
    SET
      released_at=CURRENT_TIMESTAMP,
      released_by=?
    WHERE id=?
  \`).run(
    req.user.id,
    id
  );

  audit(
    req.user.id,
    'RELEASE',
    'SALE',
    id,
    {
      payment_confirmed:true,
      release_code:s.release_code,
      engine:'V1.6.1'
    }
  );

  res.json(
    detail(id)
  );
});
`;

op=
  op.slice(0,releaseRouteStart)+
  newRelease+
  op.slice(releaseEnd);

/*
 * ==========================================================
 * API.JS - REPARO E NORMALIZACAO V16
 * ==========================================================
 */

api=api.replace(
  'indisponÃ­vel',
  'indisponível'
).replace(
  'estÃ¡ ativo',
  'está ativo'
);

const apiStart=
  api.indexOf('  salesRecentV16:');

if(apiStart<0){
  throw new Error('API_V16_START_NOT_FOUND');
}

const apiEnd=
  api.lastIndexOf('};');

if(apiEnd<apiStart){
  throw new Error('API_OBJECT_END_NOT_FOUND');
}

const cleanV16=`  salesRecentV16: () =>
    request('/v16/sales/recent'),

  saleV16: id =>
    request(\`/v16/sales/\${id}\`),

  cancelSaleV16: (id, reason) =>
    request(\`/v16/sales/\${id}/cancel\`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  returnPreviewV16: id =>
    request(\`/v16/sales/\${id}/return-preview\`),

  returnSaleV16: (id, body) =>
    request(\`/v16/sales/\${id}/return\`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
`;

api=
  api.slice(0,apiStart)+
  cleanV16+
  api.slice(apiEnd);

/*
 * GRAVACAO
 */

fs.writeFileSync(txFile,tx,'utf8');
fs.writeFileSync(opFile,op,'utf8');
fs.writeFileSync(apiFile,api,'utf8');

console.log('PATCH V1.6.1: OK');
