import { db } from '../server/db.js';

const tables = [
  'tips',
  'employee_rewards',
  'audit_log',
  'audit_logs',
  'sale_cancellations',
  'sale_payment_reversals',
  'stock_movements'
];

console.log('\n=== TABELAS RELACIONADAS ===');

for (const table of tables) {

  const exists = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(table);

  console.log(`\n--- ${table} ---`);

  if (!exists) {
    console.log('NAO_EXISTE');
    continue;
  }

  console.table(
    db.prepare(`PRAGMA table_info(${table})`).all()
  );
}

console.log('\n=== VENDA PAID MAIS RECENTE COM LEDGER ===');

const sale = db.prepare(`
  SELECT
    s.id,
    s.total,
    s.status,
    s.user_id,
    s.employee_id,
    s.tip_amount,
    s.released_at,
    s.cancelled_at,
    s.cancelled_by
  FROM sales s
  WHERE s.status='PAID'
    AND EXISTS(
      SELECT 1
      FROM sale_inventory_ledger l
      WHERE l.sale_id=s.id
    )
  ORDER BY s.id DESC
  LIMIT 1
`).get();

console.table(sale ? [sale] : []);

if (sale) {

  console.log('\n=== PAGAMENTOS ===');

  console.table(
    db.prepare(`
      SELECT *
      FROM payment_splits
      WHERE sale_id=?
    `).all(sale.id)
  );

  console.log('\n=== LEDGER ===');

  console.table(
    db.prepare(`
      SELECT *
      FROM sale_inventory_ledger
      WHERE sale_id=?
    `).all(sale.id)
  );

  for (const table of ['tips','employee_rewards']) {

    const exists = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type='table' AND name=?
    `).get(table);

    if (!exists) continue;

    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map(x => x.name);

    if (columns.includes('sale_id')) {

      console.log(`\n=== ${table.toUpperCase()} DA VENDA ===`);

      console.table(
        db.prepare(`
          SELECT *
          FROM ${table}
          WHERE sale_id=?
        `).all(sale.id)
      );
    }
  }
}

console.log('\n================================');
console.log('DIAGNOSTICO_CONCLUIDO');
console.log('================================');
