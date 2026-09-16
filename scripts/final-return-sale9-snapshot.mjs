import fs from 'node:fs';
import { db } from '../server/db.js';
import { cashSummary } from '../server/transaction-engine.js';

const sale=db.prepare(`
  SELECT *
  FROM sales
  WHERE id=9
`).get();

const item=db.prepare(`
  SELECT *
  FROM sale_items
  WHERE sale_id=9
  ORDER BY id
  LIMIT 1
`).get();

const allItems=db.prepare(`
  SELECT *
  FROM sale_items
  WHERE sale_id=9
`).all();

const ledger=db.prepare(`
  SELECT *
  FROM sale_inventory_ledger
  WHERE sale_id=9
  ORDER BY id
`).all();

const returns=db.prepare(`
  SELECT *
  FROM sale_returns
  WHERE sale_id=9
`).all();

if(!sale || sale.status!=='PAID'){
  console.error('SALE_9_INVALID');
  process.exit(60);
}

if(allItems.length!==1){
  console.error('SALE_9_NOT_SINGLE_ITEM');
  process.exit(61);
}

if(Number(item.qty)!==1){
  console.error('SALE_9_QTY_NOT_ONE');
  process.exit(62);
}

if(!ledger.length){
  console.error('SALE_9_NO_LEDGER');
  process.exit(63);
}

if(returns.length){
  console.error('SALE_9_ALREADY_RETURNED');
  process.exit(64);
}

const inventory={};

for(const row of ledger){

  const product=db.prepare(`
    SELECT id,name,stock
    FROM products
    WHERE id=?
  `).get(row.product_id);

  const profile=db.prepare(`
    SELECT
      product_id,
      closed_units,
      open_base
    FROM inventory_profiles
    WHERE product_id=?
  `).get(row.product_id);

  inventory[row.product_id]={
    product,
    profile:profile || null
  };
}

const summary=cashSummary(
  sale.cash_session_id
);

const state={
  sale,
  item,
  ledger,
  inventory,
  summary
};

fs.writeFileSync(
  './scripts/final-return-sale9-before.json',
  JSON.stringify(state,null,2),
  'utf8'
);

fs.writeFileSync(
  './scripts/final-return-sale9-item.txt',
  String(item.id),
  'utf8'
);

console.log('SALE:',sale.id);
console.log('ITEM:',item.id);
console.log('QTY:',item.qty);
console.log('TOTAL:',sale.total);
console.log('LEDGER ROWS:',ledger.length);
console.log('RELEASED:',Boolean(sale.released_at));
console.log('SNAPSHOT: PASS');
