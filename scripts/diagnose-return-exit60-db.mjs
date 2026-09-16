import fs from 'node:fs';
import { db } from '../server/db.js';

const sales=db.prepare(`
    SELECT
        id,
        total,
        payment_method,
        status,
        customer_name,
        created_at,
        released_at,
        released_by,
        cancelled_at
    FROM sales
    ORDER BY id DESC
    LIMIT 10
`).all();

console.log('');
console.log('ULTIMAS VENDAS:');
console.table(sales);

const homolog=db.prepare(`
    SELECT *
    FROM sales
    WHERE customer_name='HOMOLOGACAO RETURN NEXUS V1.6'
    ORDER BY id DESC
    LIMIT 1
`).get();

console.log('');
console.log('VENDA HOMOLOGACAO RETURN:');
console.log(homolog || 'NAO LOCALIZADA');

if(homolog){

    const items=db.prepare(`
        SELECT
            si.*,
            p.name product_name
        FROM sale_items si
        LEFT JOIN products p
          ON p.id=si.product_id
        WHERE si.sale_id=?
        ORDER BY si.id
    `).all(homolog.id);

    const ledger=db.prepare(`
        SELECT *
        FROM sale_inventory_ledger
        WHERE sale_id=?
        ORDER BY id
    `).all(homolog.id);

    const payments=db.prepare(`
        SELECT *
        FROM payment_splits
        WHERE sale_id=?
        ORDER BY id
    `).all(homolog.id);

    const returns=db.prepare(`
        SELECT *
        FROM sale_returns
        WHERE sale_id=?
        ORDER BY id
    `).all(homolog.id);

    const reversals=db.prepare(`
        SELECT *
        FROM sale_return_payment_reversals
        WHERE sale_id=?
        ORDER BY id
    `).all(homolog.id);

    console.log('');
    console.log('ITEMS:');
    console.table(items);

    console.log('');
    console.log('LEDGER:');
    console.table(ledger);

    console.log('');
    console.log('PAYMENTS:');
    console.table(payments);

    console.log('');
    console.log('RETURNS:');
    console.table(returns);

    console.log('');
    console.log('RETURN PAYMENT REVERSALS:');
    console.table(reversals);

    fs.writeFileSync(
        './scripts/current-homolog-return-sale.txt',
        String(homolog.id),
        'utf8'
    );
}

const sale7=db.prepare(`
    SELECT
        id,
        status,
        released_at,
        cancelled_at
    FROM sales
    WHERE id=7
`).get();

const return7=db.prepare(`
    SELECT COUNT(*) c
    FROM sale_returns
    WHERE sale_id=7
`).get();

console.log('');
console.log('VENDA #7:',sale7);
console.log('RETURNS #7:',Number(return7.c));

console.log('');
console.log(
    'SQLITE:',
    db.prepare('PRAGMA integrity_check').get()
);
