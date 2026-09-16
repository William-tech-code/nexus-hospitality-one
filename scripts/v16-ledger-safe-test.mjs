import { db } from '../server/db.js';

console.log('\n=== TESTE V1.6 / LEDGER ===');

const sale = db.prepare(`
    SELECT
        s.id,
        s.status,
        s.total,
        s.released_at,
        COUNT(l.id) AS ledger_rows
    FROM sales s
    INNER JOIN sale_inventory_ledger l
        ON l.sale_id = s.id
    WHERE s.status = 'PAID'
    GROUP BY
        s.id,
        s.status,
        s.total,
        s.released_at
    ORDER BY s.id DESC
    LIMIT 1
`).get();

console.log('\n=== VENDA CANDIDATA ===');
console.table(sale ? [sale] : []);

if (!sale) {
    console.log('\nSEM_VENDA_PAID_COM_LEDGER');
    process.exit(0);
}

const ledger = db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id = ?
    ORDER BY id
`).all(sale.id);

console.log('\n=== LEDGER ORIGINAL ===');
console.table(ledger);

function snapshot() {
    return ledger.map(row => {
        const product = db.prepare(`
            SELECT id, name, stock
            FROM products
            WHERE id = ?
        `).get(row.product_id);

        const profile = db.prepare(`
            SELECT closed_units, open_base
            FROM inventory_profiles
            WHERE product_id = ?
        `).get(row.product_id);

        return {
            product_id: row.product_id,
            name: product?.name ?? null,
            stock: Number(product?.stock ?? 0),
            closed: Number(profile?.closed_units ?? 0),
            open: Number(profile?.open_base ?? 0)
        };
    });
}

const before = snapshot();

console.log('\n=== ESTOQUE ANTES ===');
console.table(before);

let simulationOk = false;

db.exec('BEGIN IMMEDIATE');

try {

    for (const row of ledger) {

        const stockReverse =
            -Number(row.stock_delta ?? 0);

        const closedReverse =
            -Number(row.closed_delta ?? 0);

        const openReverse =
            -Number(row.open_delta ?? 0);

        db.prepare(`
            UPDATE products
            SET stock = COALESCE(stock,0) + ?
            WHERE id = ?
        `).run(
            stockReverse,
            row.product_id
        );

        db.prepare(`
            UPDATE inventory_profiles
            SET
                closed_units = COALESCE(closed_units,0) + ?,
                open_base = COALESCE(open_base,0) + ?
            WHERE product_id = ?
        `).run(
            closedReverse,
            openReverse,
            row.product_id
        );
    }

    const simulated = snapshot();

    console.log('\n=== REVERSÃO SIMULADA ===');
    console.table(simulated);

    simulationOk = true;

    console.log(
        '\nSIMULACAO_EXECUTADA_COM_SUCESSO:',
        simulationOk
    );

} catch (error) {

    console.error('\nERRO_NA_SIMULACAO:');
    console.error(error);

} finally {

    db.exec('ROLLBACK');

    console.log('\nROLLBACK_EXECUTADO: true');
}

const afterRollback = snapshot();

console.log('\n=== ESTOQUE APÓS ROLLBACK ===');
console.table(afterRollback);

const restored =
    JSON.stringify(before) ===
    JSON.stringify(afterRollback);

console.log('\n================================');
console.log('RESULTADO FINAL');
console.log('================================');

console.log({
    sale_id: sale.id,
    ledger_rows: ledger.length,
    simulacao_ok: simulationOk,
    rollback_ok: true,
    estado_restaurado: restored
});

if (!simulationOk || !restored) {
    process.exitCode = 1;
}
