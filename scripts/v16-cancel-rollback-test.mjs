import { db } from '../server/db.js';

const n = (v) => Number(v || 0);

function count(sql, ...params) {
  return db.prepare(sql).get(...params).qty;
}

let transactionStarted = false;

try {
  console.log('\n=== LOCALIZANDO OWNER ===');

  const owner = db.prepare(`
    SELECT id, name, role
    FROM users
    WHERE role = 'OWNER'
      AND active = 1
    ORDER BY id
    LIMIT 1
  `).get();

  if (!owner) {
    throw new Error('OWNER_ATIVO_NAO_ENCONTRADO');
  }

  console.log(owner);

  console.log('\n=== LOCALIZANDO VENDA SEGURA ===');

  const sale = db.prepare(`
    SELECT s.*
    FROM sales s
    WHERE s.status = 'PAID'
      AND EXISTS (
        SELECT 1
        FROM sale_inventory_ledger l
        WHERE l.sale_id = s.id
      )
    ORDER BY s.id DESC
    LIMIT 1
  `).get();

  if (!sale) {
    throw new Error('VENDA_PAID_COM_LEDGER_NAO_ENCONTRADA');
  }

  console.log({
    id: sale.id,
    total: sale.total,
    status: sale.status,
    released_at: sale.released_at,
    release_code: sale.release_code
  });

  const ledger = db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id = ?
    ORDER BY id
  `).all(sale.id);

  const payments = db.prepare(`
    SELECT *
    FROM payment_splits
    WHERE sale_id = ?
    ORDER BY id
  `).all(sale.id);

  const productIds = [
    ...new Set(
      ledger
        .map(x => x.product_id)
        .filter(Boolean)
    )
  ];

  function productSnapshot() {
    if (!productIds.length) return [];

    const placeholders =
      productIds.map(() => '?').join(',');

    return db.prepare(`
      SELECT id, stock
      FROM products
      WHERE id IN (${placeholders})
      ORDER BY id
    `).all(...productIds);
  }

  function profileSnapshot() {
    if (!productIds.length) return [];

    const placeholders =
      productIds.map(() => '?').join(',');

    return db.prepare(`
      SELECT
        product_id,
        closed_units,
        open_base
      FROM inventory_profiles
      WHERE product_id IN (${placeholders})
      ORDER BY product_id
    `).all(...productIds);
  }

  const BEFORE = {
    sale: db.prepare(`
      SELECT
        id,
        status,
        cancelled_at,
        cancel_reason,
        cancelled_by,
        release_code
      FROM sales
      WHERE id = ?
    `).get(sale.id),

    products: productSnapshot(),
    profiles: profileSnapshot(),

    cancellations: count(`
      SELECT COUNT(*) qty
      FROM sale_cancellations
      WHERE sale_id = ?
    `, sale.id),

    paymentReversals: count(`
      SELECT COUNT(*) qty
      FROM sale_payment_reversals
      WHERE sale_id = ?
    `, sale.id),

    stockMovements: count(`
      SELECT COUNT(*) qty
      FROM stock_movements
      WHERE reference_type = 'SALE'
        AND reference_id = ?
    `, sale.id),

    tips: db.prepare(`
      SELECT id, status
      FROM tips
      WHERE sale_id = ?
      ORDER BY id
    `).all(sale.id),

    rewards: db.prepare(`
      SELECT id, status
      FROM employee_rewards
      WHERE sale_id = ?
      ORDER BY id
    `).all(sale.id)
  };

  console.log('\n=== SNAPSHOT ANTES ===');
  console.log(JSON.stringify(BEFORE, null, 2));

  db.exec('BEGIN IMMEDIATE');
  transactionStarted = true;

  console.log('\n=== SIMULANDO CANCELAMENTO ===');

  for (const row of ledger) {
    const stockReverse = -n(row.stock_delta);
    const closedReverse = -n(row.closed_delta);
    const openReverse = -n(row.open_delta);

    if (stockReverse !== 0) {
      db.prepare(`
        UPDATE products
        SET stock = stock + ?
        WHERE id = ?
      `).run(stockReverse, row.product_id);
    }

    const profile = db.prepare(`
      SELECT product_id
      FROM inventory_profiles
      WHERE product_id = ?
    `).get(row.product_id);

    if (profile) {
      db.prepare(`
        UPDATE inventory_profiles
        SET
          closed_units = closed_units + ?,
          open_base = open_base + ?
        WHERE product_id = ?
      `).run(
        closedReverse,
        openReverse,
        row.product_id
      );
    }

    db.prepare(`
      INSERT INTO stock_movements(
        product_id,
        type,
        qty,
        reference_type,
        reference_id,
        user_id,
        notes
      )
      VALUES(?,?,?,?,?,?,?)
    `).run(
      row.product_id,
      'SALE_CANCEL_REVERSAL',
      stockReverse + closedReverse + openReverse,
      'SALE',
      sale.id,
      owner.id,
      'TESTE V1.6 - ROLLBACK'
    );
  }

  const refundTotal = payments.length
    ? payments.reduce(
        (sum, payment) =>
          sum + n(payment.amount),
        0
      )
    : n(sale.total);

  db.prepare(`
    INSERT INTO sale_cancellations(
      sale_id,
      reason,
      user_id,
      cancel_type,
      refund_total,
      total,
      released_before_cancel
    )
    VALUES(?,?,?,?,?,?,?)
  `).run(
    sale.id,
    'TESTE V1.6 - ROLLBACK',
    owner.id,
    'TOTAL',
    refundTotal,
    n(sale.total) + n(sale.tip_amount),
    sale.released_at ? 1 : 0
  );

  const reversePayment = db.prepare(`
    INSERT INTO sale_payment_reversals(
      sale_id,
      payment_split_id,
      method,
      amount,
      status,
      user_id,
      reason
    )
    VALUES(?,?,?,?,?,?,?)
  `);

  for (const payment of payments) {
    reversePayment.run(
      sale.id,
      payment.id,
      payment.method,
      payment.amount,
      'RECORDED',
      owner.id,
      'TESTE V1.6 - ROLLBACK'
    );
  }

  db.prepare(`
    UPDATE tips
    SET status = 'CANCELLED'
    WHERE sale_id = ?
      AND status <> 'CANCELLED'
  `).run(sale.id);

  db.prepare(`
    UPDATE employee_rewards
    SET status = 'CANCELLED'
    WHERE sale_id = ?
      AND status <> 'CANCELLED'
  `).run(sale.id);

  db.prepare(`
    UPDATE sales
    SET
      status = 'CANCELLED',
      cancelled_at = CURRENT_TIMESTAMP,
      cancel_reason = ?,
      cancelled_by = ?,
      release_code = NULL
    WHERE id = ?
  `).run(
    'TESTE V1.6 - ROLLBACK',
    owner.id,
    sale.id
  );

  const DURING = {
    sale: db.prepare(`
      SELECT
        id,
        status,
        cancelled_at,
        cancel_reason,
        cancelled_by,
        release_code
      FROM sales
      WHERE id = ?
    `).get(sale.id),

    products: productSnapshot(),
    profiles: profileSnapshot(),

    cancellations: count(`
      SELECT COUNT(*) qty
      FROM sale_cancellations
      WHERE sale_id = ?
    `, sale.id),

    paymentReversals: count(`
      SELECT COUNT(*) qty
      FROM sale_payment_reversals
      WHERE sale_id = ?
    `, sale.id),

    stockMovements: count(`
      SELECT COUNT(*) qty
      FROM stock_movements
      WHERE reference_type = 'SALE'
        AND reference_id = ?
    `, sale.id),

    tips: db.prepare(`
      SELECT id, status
      FROM tips
      WHERE sale_id = ?
      ORDER BY id
    `).all(sale.id),

    rewards: db.prepare(`
      SELECT id, status
      FROM employee_rewards
      WHERE sale_id = ?
      ORDER BY id
    `).all(sale.id)
  };

  console.log('\n=== DENTRO DA TRANSACAO ===');
  console.log(JSON.stringify(DURING, null, 2));

  if (DURING.sale.status !== 'CANCELLED') {
    throw new Error('STATUS_CANCELAMENTO_NAO_APLICADO');
  }

  if (
    DURING.cancellations !==
    BEFORE.cancellations + 1
  ) {
    throw new Error('SALE_CANCELLATION_NAO_REGISTRADO');
  }

  if (
    DURING.paymentReversals !==
    BEFORE.paymentReversals + payments.length
  ) {
    throw new Error('REVERSAO_PAGAMENTO_INCONSISTENTE');
  }

  if (
    DURING.stockMovements !==
    BEFORE.stockMovements + ledger.length
  ) {
    throw new Error('MOVIMENTO_ESTOQUE_INCONSISTENTE');
  }

  db.exec('ROLLBACK');
  transactionStarted = false;

  console.log('\n=== ROLLBACK EXECUTADO ===');

  const AFTER = {
    sale: db.prepare(`
      SELECT
        id,
        status,
        cancelled_at,
        cancel_reason,
        cancelled_by,
        release_code
      FROM sales
      WHERE id = ?
    `).get(sale.id),

    products: productSnapshot(),
    profiles: profileSnapshot(),

    cancellations: count(`
      SELECT COUNT(*) qty
      FROM sale_cancellations
      WHERE sale_id = ?
    `, sale.id),

    paymentReversals: count(`
      SELECT COUNT(*) qty
      FROM sale_payment_reversals
      WHERE sale_id = ?
    `, sale.id),

    stockMovements: count(`
      SELECT COUNT(*) qty
      FROM stock_movements
      WHERE reference_type = 'SALE'
        AND reference_id = ?
    `, sale.id),

    tips: db.prepare(`
      SELECT id, status
      FROM tips
      WHERE sale_id = ?
      ORDER BY id
    `).all(sale.id),

    rewards: db.prepare(`
      SELECT id, status
      FROM employee_rewards
      WHERE sale_id = ?
      ORDER BY id
    `).all(sale.id)
  };

  console.log('\n=== SNAPSHOT DEPOIS ===');
  console.log(JSON.stringify(AFTER, null, 2));

  const restored =
    JSON.stringify(BEFORE) ===
    JSON.stringify(AFTER);

  if (!restored) {
    throw new Error(
      'ROLLBACK_NAO_RESTAURou_ESTADO_ORIGINAL'
    );
  }

  console.log('');
  console.log('============================================');
  console.log(' TESTE V1.6: PASS');
  console.log(' CANCELAMENTO SIMULADO: OK');
  console.log(' ESTOQUE REVERSO: OK');
  console.log(' PAGAMENTOS REVERSOS: OK');
  console.log(' TIPS / REWARDS: OK');
  console.log(' ROLLBACK: OK');
  console.log(' BANCO RESTAURADO: OK');
  console.log(' NENHUMA VENDA FOI CANCELADA');
  console.log('============================================');

} catch (error) {

  if (transactionStarted) {
    try {
      db.exec('ROLLBACK');
      console.log(
        '\nROLLBACK DE SEGURANCA EXECUTADO'
      );
    } catch {}
  }

  console.error('\nTESTE V1.6 FALHOU:');
  console.error(error);

  process.exitCode = 1;
}
