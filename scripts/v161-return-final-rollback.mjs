import {db} from '../server/db.js';
import '../server/transaction-engine.js';

import {
  validateReturnRequest,
  buildInventoryReturnPlan,
  returnCoverage
} from '../server/return-engine-v16.js';

const n=v=>Number(v||0);
const EPS=.000001;

const create=
  globalThis.__NEXUS_TX__?.createUnifiedSale;

if(!create){
  throw new Error(
    'CREATE_ENGINE_UNAVAILABLE'
  );
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
  throw new Error(
    'OWNER_NOT_FOUND'
  );
}

const cash=db.prepare(`
  SELECT id
  FROM cash_sessions
  WHERE status='OPEN'
  ORDER BY id DESC
  LIMIT 1
`).get();

if(!cash){
  throw new Error(
    'CASH_SESSION_REQUIRED'
  );
}

const products=db.prepare(`
  SELECT
    id,
    name,
    price,
    stock
  FROM products
  WHERE active=1
    AND COALESCE(price,0)>0
    AND COALESCE(stock,0)>=2
  ORDER BY id
  LIMIT 20
`).all();

if(products.length<2){
  throw new Error(
    'TWO_PRODUCTS_REQUIRED'
  );
}

const inventoryBefore=
  JSON.stringify(
    db.prepare(`
      SELECT
        p.id,
        p.stock,
        COALESCE(ip.closed_units,0) closed_units,
        COALESCE(ip.open_base,0) open_base
      FROM products p
      LEFT JOIN inventory_profiles ip
        ON ip.product_id=p.id
      ORDER BY p.id
    `).all()
  );

let testSaleId=null;

const test=db.transaction(()=>{

  const sale=create({
    items:[
      {
        product_id:products[0].id,
        qty:2,
        mode:'UNIT'
      },
      {
        product_id:products[1].id,
        qty:1,
        mode:'UNIT'
      }
    ],
    payments:[],
    payment_method:'DINHEIRO',
    customer_name:'ROLLBACK V161 FINAL',
    user_id:owner.id,
    source:'ROLLBACK_V161_FINAL'
  });

  testSaleId=n(sale.id);

  const items=db.prepare(`
    SELECT *
    FROM sale_items
    WHERE sale_id=?
    ORDER BY id
  `).all(testSaleId);

  if(items.length!==2){
    throw new Error(
      'MULTI_ITEM_CREATE_FAILED'
    );
  }

  const ledger=db.prepare(`
    SELECT *
    FROM sale_item_inventory_ledger
    WHERE sale_id=?
    ORDER BY sale_item_id,id
  `).all(testSaleId);

  if(!ledger.length){
    throw new Error(
      'ITEM_LEDGER_EMPTY'
    );
  }

  /*
   * Segundo item: devolução integral individual.
   */
  const second=items[1];

  const secondValidation=
    validateReturnRequest(
      testSaleId,
      [{
        sale_item_id:second.id,
        qty:n(second.qty)
      }]
    );

  const secondPlan=
    buildInventoryReturnPlan(
      secondValidation
    );

  if(!secondPlan.length){
    throw new Error(
      'MULTI_ITEM_PLAN_EMPTY'
    );
  }

  console.log(
    'MULTI-ITEM INDIVIDUAL: PASS'
  );

  /*
   * Primeiro item qty 2:
   * parcial simples permitida;
   * smart parcial obrigatoriamente bloqueada.
   */
  const first=items[0];

  const firstLedger=
    ledger.filter(
      x=>
        n(x.sale_item_id)===
        n(first.id)
    );

  const smart=
    firstLedger.some(
      x=>
        Math.abs(n(x.closed_delta))>EPS ||
        Math.abs(n(x.open_delta))>EPS
    );

  if(smart){

    let blocked=false;

    try{
      const v=
        validateReturnRequest(
          testSaleId,
          [{
            sale_item_id:first.id,
            qty:1
          }]
        );

      buildInventoryReturnPlan(v);

    }catch(error){

      if(
        String(error.message).includes(
          'ESTOQUE_INTELIGENTE_BLOQUEADA'
        )
      ){
        blocked=true;
      }
    }

    if(!blocked){
      throw new Error(
        'SMART_PARTIAL_NOT_BLOCKED'
      );
    }

    console.log(
      'SMART PARCIAL: BLOQUEADA / PASS'
    );

  }else{

    const v=
      validateReturnRequest(
        testSaleId,
        [{
          sale_item_id:first.id,
          qty:1
        }]
      );

    const plan=
      buildInventoryReturnPlan(v);

    if(!plan.length){
      throw new Error(
        'SIMPLE_PARTIAL_PLAN_EMPTY'
      );
    }

    console.log(
      'PARCIAL SIMPLES: PASS'
    );
  }

  /*
   * O status antes de persistir devolução deve continuar
   * SEM_DEVOLUCAO.
   */
  const coverage=
    returnCoverage(testSaleId);

  if(
    coverage.status!==
    'SEM_DEVOLUCAO'
  ){
    throw new Error(
      'TEST_COVERAGE_UNEXPECTED'
    );
  }

  throw new Error(
    '__ROLLBACK_OK__'
  );
});

try{
  test();
}catch(error){

  if(
    error.message!==
    '__ROLLBACK_OK__'
  ){
    throw error;
  }
}

/*
 * Confirma rollback completo.
 */
if(
  testSaleId &&
  db.prepare(
    'SELECT id FROM sales WHERE id=?'
  ).get(testSaleId)
){
  throw new Error(
    'ROLLBACK_SALE_PERSISTED'
  );
}

const inventoryAfter=
  JSON.stringify(
    db.prepare(`
      SELECT
        p.id,
        p.stock,
        COALESCE(ip.closed_units,0) closed_units,
        COALESCE(ip.open_base,0) open_base
      FROM products p
      LEFT JOIN inventory_profiles ip
        ON ip.product_id=p.id
      ORDER BY p.id
    `).all()
  );

if(
  inventoryBefore!==
  inventoryAfter
){
  throw new Error(
    'ROLLBACK_INVENTORY_CHANGED'
  );
}

console.log(
  'ROLLBACK: PASS'
);

console.log(
  'ESTOQUE RESTAURADO: PASS'
);
