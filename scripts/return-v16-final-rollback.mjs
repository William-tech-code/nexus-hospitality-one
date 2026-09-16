import { db } from '../server/db.js';

import {
  validateReturnRequest,
  buildInventoryReturnPlan,
  applyInventoryReturnPlan,
  calculateReturnTotal
} from '../server/return-engine-v16.js';

const candidate=db.prepare(`
  SELECT s.id
  FROM sales s
  WHERE
    s.status='PAID'
    AND s.id<>7
    AND (
      SELECT COUNT(*)
      FROM sale_items si
      WHERE si.sale_id=s.id
    )=1
    AND EXISTS(
      SELECT 1
      FROM sale_inventory_ledger l
      WHERE l.sale_id=s.id
    )
  ORDER BY s.id DESC
  LIMIT 1
`).get();

if(!candidate){
  console.log(
    'SEM CANDIDATA SEGURA - TESTE SKIPPED'
  );
  process.exit(0);
}

const saleId=candidate.id;

const item=db.prepare(`
  SELECT *
  FROM sale_items
  WHERE sale_id=?
  LIMIT 1
`).get(saleId);

const qty=Math.min(
  Number(item.qty),
  Math.max(
    Number(item.qty)/2,
    0.001
  )
);

const productsBefore=JSON.stringify(
  db.prepare(`
    SELECT id,stock
    FROM products
    ORDER BY id
  `).all()
);

const profilesBefore=JSON.stringify(
  db.prepare(`
    SELECT product_id,closed_units,open_base
    FROM inventory_profiles
    ORDER BY product_id
  `).all()
);

const movementsBefore=
  db.prepare(`
    SELECT COUNT(*) c
    FROM stock_movements
  `).get().c;

db.exec('BEGIN IMMEDIATE');

try{

  const normalized=
    validateReturnRequest(
      saleId,
      [{
        sale_item_id:item.id,
        qty
      }]
    );

  const total=
    calculateReturnTotal(normalized);

  const plan=
    buildInventoryReturnPlan(
      saleId,
      normalized
    );

  applyInventoryReturnPlan(
    plan,
    {
      returnId:-160001,
      userId:1,
      reason:'ROLLBACK TEST V1.6'
    }
  );

  console.log({
    sale_id:saleId,
    sale_item_id:item.id,
    qty,
    total,
    inventory_rows:plan.length
  });

  console.log(
    'SIMULACAO: PASS'
  );

}finally{

  db.exec('ROLLBACK');
}

const productsAfter=JSON.stringify(
  db.prepare(`
    SELECT id,stock
    FROM products
    ORDER BY id
  `).all()
);

const profilesAfter=JSON.stringify(
  db.prepare(`
    SELECT product_id,closed_units,open_base
    FROM inventory_profiles
    ORDER BY product_id
  `).all()
);

const movementsAfter=
  db.prepare(`
    SELECT COUNT(*) c
    FROM stock_movements
  `).get().c;

if(productsBefore!==productsAfter){
  console.error('PRODUCT_ROLLBACK_FAIL');
  process.exit(90);
}

if(profilesBefore!==profilesAfter){
  console.error('PROFILE_ROLLBACK_FAIL');
  process.exit(91);
}

if(movementsBefore!==movementsAfter){
  console.error('MOVEMENT_ROLLBACK_FAIL');
  process.exit(92);
}

console.log('');
console.log('RETURN SIMULATION: PASS');
console.log('PRODUCT ROLLBACK: PASS');
console.log('PROFILE ROLLBACK: PASS');
console.log('MOVEMENT ROLLBACK: PASS');
console.log('BANCO RESTAURADO: PASS');
console.log('DEVOLUCAO REAL: NAO');
