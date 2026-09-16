import { db } from '../server/db.js';

function tableExists(name) {
  return !!db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(name);
}

function columns(name) {
  if (!tableExists(name)) return [];
  return db.prepare(`PRAGMA table_info(${name})`).all();
}

function hasColumn(table, column) {
  return columns(table).some(x => x.name === column);
}

console.log('\n=== SALE_CANCELLATIONS ===');
console.table(columns('sale_cancellations'));

console.log('\n=== SALE_PAYMENT_REVERSALS ===');
console.table(columns('sale_payment_reversals'));

console.log('\n=== TIPS ===');
console.table(columns('tips'));

console.log('\n=== EMPLOYEE_REWARDS ===');
console.table(columns('employee_rewards'));

console.log('\n=== SALES - CAMPOS DE CANCELAMENTO ===');
console.table(
  columns('sales').filter(x =>
    [
      'id',
      'status',
      'cancelled_at',
      'cancel_reason',
      'cancelled_by',
      'released_at',
      'released_by',
      'release_code',
      'tip_amount'
    ].includes(x.name)
  )
);

const sale = db.prepare(`
  SELECT
    id,
    total,
    status,
    tip_amount,
    release_code,
    released_at,
    released_by,
    cancelled_at,
    cancel_reason,
    cancelled_by
  FROM sales
  WHERE status='PAID'
  ORDER BY id DESC
  LIMIT 1
`).get();

console.log('\n=== VENDA PAGA MAIS RECENTE ===');
console.table(sale ? [sale] : []);

if (sale) {

  console.log('\n=== PAYMENT SPLITS ===');

  if (tableExists('payment_splits')) {
    console.table(
      db.prepare(`
        SELECT *
        FROM payment_splits
        WHERE sale_id=?
        ORDER BY id
      `).all(sale.id)
    );
  }

  console.log('\n=== INVENTORY LEDGER ===');

  if (tableExists('sale_inventory_ledger')) {
    console.table(
      db.prepare(`
        SELECT *
        FROM sale_inventory_ledger
        WHERE sale_id=?
        ORDER BY id
      `).all(sale.id)
    );
  }

  console.log('\n=== TIPS DA VENDA ===');

  if (
    tableExists('tips') &&
    hasColumn('tips','sale_id')
  ) {
    console.table(
      db.prepare(`
        SELECT *
        FROM tips
        WHERE sale_id=?
      `).all(sale.id)
    );
  } else {
    console.log(
      'Tabela tips inexistente ou sem coluna sale_id.'
    );
  }

  console.log('\n=== EMPLOYEE_REWARDS DA VENDA ===');

  if (
    tableExists('employee_rewards') &&
    hasColumn('employee_rewards','sale_id')
  ) {
    console.table(
      db.prepare(`
        SELECT *
        FROM employee_rewards
        WHERE sale_id=?
      `).all(sale.id)
    );
  } else {
    console.log(
      'Tabela employee_rewards inexistente ou sem coluna sale_id.'
    );
  }
}

const checks = {

  cancellation_total:
    hasColumn('sale_cancellations','total'),

  cancellation_type:
    hasColumn('sale_cancellations','cancel_type'),

  cancellation_refund:
    hasColumn('sale_cancellations','refund_total'),

  released_before_cancel:
    hasColumn(
      'sale_cancellations',
      'released_before_cancel'
    ),

  cancelled_by:
    hasColumn('sales','cancelled_by'),

  payment_reversals:
    tableExists('sale_payment_reversals'),

  tips_table:
    tableExists('tips'),

  tips_sale_id:
    hasColumn('tips','sale_id'),

  tips_status:
    hasColumn('tips','status'),

  rewards_table:
    tableExists('employee_rewards'),

  rewards_sale_id:
    hasColumn('employee_rewards','sale_id'),

  rewards_status:
    hasColumn('employee_rewards','status'),

  inventory_ledger:
    tableExists('sale_inventory_ledger'),

  stock_movements:
    tableExists('stock_movements')
};

console.log('\n=== CHECKLIST DE SEGURANCA ===');

console.table(
  Object.entries(checks).map(([item, ok]) => ({
    item,
    ok
  }))
);

console.log('\n============================================');
console.log('PRE_CANCEL_DIAGNOSTIC_COMPLETE');
console.log('NENHUM_DADO_FOI_ALTERADO');
console.log('============================================');
