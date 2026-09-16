import { db } from '../server/db.js';
import '../server/transaction-engine.js';

const n=v=>Number(v||0);

const before7=db.prepare(
  'SELECT status,released_at,cancelled_at FROM sales WHERE id=7'
).get();

const before8=db.prepare(
  'SELECT status,released_at,cancelled_at FROM sales WHERE id=8'
).get();

const before9=db.prepare(
  'SELECT status,released_at,cancelled_at FROM sales WHERE id=9'
).get();

const return9=db.prepare(
  'SELECT COUNT(*) c FROM sale_returns WHERE sale_id=9'
).get();

const table=db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name='sale_item_inventory_ledger'
`).get();

if(!table){
  throw new Error('ITEM_LEDGER_TABLE_NOT_CREATED');
}

const cols=db.prepare(
  'PRAGMA table_info(sale_item_inventory_ledger)'
).all().map(x=>x.name);

for(const required of [
  'sale_id',
  'sale_item_id',
  'affected_product_id',
  'stock_delta',
  'closed_delta',
  'open_delta',
  'source_mode'
]){
  if(!cols.includes(required)){
    throw new Error(
      'ITEM_LEDGER_COLUMN_MISSING_'+required
    );
  }
}

/*
 * Escolhe dois produtos ativos vendaveis.
 * Nenhuma venda real sera persistida.
 */
const products=db.prepare(`
  SELECT id,name,price,stock
  FROM products
  WHERE active=1
    AND COALESCE(price,0)>0
  ORDER BY id
  LIMIT 10
`).all();

if(!products.length){
  throw new Error('NO_PRODUCT_FOR_ROLLBACK_TEST');
}

const cash=db.prepare(`
  SELECT *
  FROM cash_sessions
  WHERE status='OPEN'
  ORDER BY id DESC
  LIMIT 1
`).get();

if(!cash){
  throw new Error('CASH_SESSION_REQUIRED_FOR_TEST');
}

const owner=db.prepare(`
  SELECT id
  FROM users
  WHERE role='OWNER'
    AND active=1
  ORDER BY id
  LIMIT 1
`).get();

if(!owner){
  throw new Error('OWNER_NOT_FOUND');
}

const create=
  globalThis.__NEXUS_TX__?.createUnifiedSale;

if(!create){
  throw new Error('CREATE_UNIFIED_SALE_NOT_EXPOSED');
}

const chosen=products.slice(0,Math.min(2,products.length));

const inventoryBefore=
  Object.fromEntries(
    db.prepare(`
      SELECT
        p.id,
        p.stock,
        COALESCE(ip.closed_units,0) closed_units,
        COALESCE(ip.open_base,0) open_base
      FROM products p
      LEFT JOIN inventory_profiles ip
        ON ip.product_id=p.id
    `).all().map(x=>[x.id,x])
  );

let testSaleId=null;

const test=db.transaction(()=>{

  const items=chosen.map(p=>({
    product_id:p.id,
    qty:1,
    mode:'UNIT'
  }));

  /*
   * Descobre total com a mesma resolucao do engine.
   */
  const resolved=
    globalThis.__NEXUS_TX_RESOLVE__
      ? globalThis.__NEXUS_TX_RESOLVE__(items)
      : null;

  /*
   * Como resolveItems nao e global, usamos uma primeira tentativa
   * com os precos atuais. Para perfis inteligentes, smartSalePrice
   * normalmente coincide com o preco comercial cadastrado.
   * Se nao coincidir, o proprio engine bloqueia e o teste nao persiste.
   */
  const expected=chosen.reduce(
    (s,p)=>s+n(p.price),
    0
  );

  const sale=create({
    items,
    payments:[{
      method:'DINHEIRO',
      amount:expected
    }],
    payment_method:'DINHEIRO',
    customer_name:'ROLLBACK V1.6.1',
    user_id:owner.id,
    source:'ROLLBACK_V161'
  });

  testSaleId=n(sale.id);

  const saleItems=db.prepare(`
    SELECT *
    FROM sale_items
    WHERE sale_id=?
    ORDER BY id
  `).all(testSaleId);

  const itemLedger=db.prepare(`
    SELECT *
    FROM sale_item_inventory_ledger
    WHERE sale_id=?
    ORDER BY sale_item_id,id
  `).all(testSaleId);

  const legacy=db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id=?
  `).all(testSaleId);

  if(saleItems.length!==chosen.length){
    throw new Error('SALE_ITEM_COUNT_INVALID');
  }

  if(!itemLedger.length){
    throw new Error('ITEM_LEDGER_EMPTY');
  }

  if(!legacy.length){
    throw new Error('LEGACY_LEDGER_EMPTY');
  }

  for(const item of saleItems){
    const rows=itemLedger.filter(
      x=>n(x.sale_item_id)===n(item.id)
    );

    if(!rows.length){
      throw new Error(
        'ITEM_WITHOUT_LEDGER_'+item.id
      );
    }
  }

  /*
   * Confere soma do item ledger contra ledger agregado.
   */
  const byProduct=new Map();

  for(const row of itemLedger){
    const key=n(row.affected_product_id);

    const cur=byProduct.get(key)||{
      stock:0,
      closed:0,
      open:0
    };

    cur.stock+=n(row.stock_delta);
    cur.closed+=n(row.closed_delta);
    cur.open+=n(row.open_delta);

    byProduct.set(key,cur);
  }

  for(const row of legacy){
    const x=byProduct.get(n(row.product_id));

    if(!x){
      throw new Error(
        'LEGACY_PRODUCT_NOT_IN_ITEM_LEDGER_'+row.product_id
      );
    }

    if(
      Math.abs(x.stock-n(row.stock_delta))>0.0001 ||
      Math.abs(x.closed-n(row.closed_delta))>0.0001 ||
      Math.abs(x.open-n(row.open_delta))>0.0001
    ){
      throw new Error(
        'ITEM_LEDGER_SUM_MISMATCH_PRODUCT_'+row.product_id
      );
    }
  }

  console.log(
    'VENDA SIMULADA:',
    testSaleId
  );

  console.log(
    'ITENS:',
    saleItems.length
  );

  console.log(
    'ITEM LEDGER ROWS:',
    itemLedger.length
  );

  console.log(
    'LEGACY LEDGER ROWS:',
    legacy.length
  );

  console.log(
    'ITEM LEDGER CONSISTENCY: PASS'
  );

  /*
   * Rollback intencional.
   */
  throw new Error('__ROLLBACK_OK__');
});

try{
  test();
}catch(e){
  if(e.message!=='__ROLLBACK_OK__'){
    throw e;
  }
}

if(testSaleId){
  const persisted=db.prepare(
    'SELECT id FROM sales WHERE id=?'
  ).get(testSaleId);

  if(persisted){
    throw new Error('ROLLBACK_SALE_PERSISTED');
  }
}

const afterInventory=
  Object.fromEntries(
    db.prepare(`
      SELECT
        p.id,
        p.stock,
        COALESCE(ip.closed_units,0) closed_units,
        COALESCE(ip.open_base,0) open_base
      FROM products p
      LEFT JOIN inventory_profiles ip
        ON ip.product_id=p.id
    `).all().map(x=>[x.id,x])
  );

if(
  JSON.stringify(inventoryBefore)!==
  JSON.stringify(afterInventory)
){
  throw new Error('ROLLBACK_INVENTORY_CHANGED');
}

const after7=db.prepare(
  'SELECT status,released_at,cancelled_at FROM sales WHERE id=7'
).get();

const after8=db.prepare(
  'SELECT status,released_at,cancelled_at FROM sales WHERE id=8'
).get();

const after9=db.prepare(
  'SELECT status,released_at,cancelled_at FROM sales WHERE id=9'
).get();

const afterReturn9=db.prepare(
  'SELECT COUNT(*) c FROM sale_returns WHERE sale_id=9'
).get();

if(JSON.stringify(before7)!==JSON.stringify(after7)){
  throw new Error('SALE7_CHANGED');
}

if(JSON.stringify(before8)!==JSON.stringify(after8)){
  throw new Error('SALE8_CHANGED');
}

if(JSON.stringify(before9)!==JSON.stringify(after9)){
  throw new Error('SALE9_CHANGED');
}

if(n(return9.c)!==n(afterReturn9.c)){
  throw new Error('SALE9_RETURN_CHANGED');
}

const integrity=db.prepare(
  'PRAGMA integrity_check'
).get();

if(
  String(Object.values(integrity)[0]).toLowerCase()!=='ok'
){
  throw new Error('SQLITE_INTEGRITY_FAILED');
}

console.log('ROLLBACK: PASS');
console.log('ESTOQUE RESTAURADO: PASS');
console.log('VENDA #7 PRESERVADA: PASS');
console.log('VENDA #8 PRESERVADA: PASS');
console.log('VENDA #9 PRESERVADA: PASS');
console.log('SQLITE: PASS');
