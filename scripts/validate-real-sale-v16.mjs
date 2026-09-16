import { db } from '../server/db.js';

const id=
    Number(process.env.NEXUS_HOMOLOG_SALE_ID);

const sale=db.prepare(`
    SELECT *
    FROM sales
    WHERE id=?
`).get(id);

const items=db.prepare(`
    SELECT *
    FROM sale_items
    WHERE sale_id=?
`).all(id);

const ledger=db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id=?
    ORDER BY id
`).all(id);

const payments=db.prepare(`
    SELECT *
    FROM payment_splits
    WHERE sale_id=?
    ORDER BY id
`).all(id);

console.log('');
console.log('SALE:',sale);

console.log('');
console.log('ITEMS:');
console.table(items);

console.log('');
console.log('LEDGER:');
console.table(ledger);

console.log('');
console.log('PAYMENTS:');
console.table(payments);

if(!sale || sale.status!=='PAID'){
    console.error('SALE_NOT_PAID');
    process.exit(40);
}

if(items.length!==1){
    console.error('SALE_NOT_SINGLE_ITEM');
    process.exit(41);
}

if(Number(items[0].qty)!==1){
    console.error('SALE_QTY_NOT_ONE');
    process.exit(42);
}

if(!ledger.length){
    console.error('SALE_LEDGER_NOT_FOUND');
    process.exit(43);
}

if(!payments.length){
    console.error('SALE_PAYMENT_NOT_FOUND');
    process.exit(44);
}

console.log('');
console.log('LEDGER PRE-RETURN: PASS');
