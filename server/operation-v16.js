import { db } from './db.js';
import { returnCoverage } from './return-engine-v16.js';
import { tenantContext } from './tenant-guard.js';

const n = v => Number(v || 0);
const t = v => String(v || '').trim();

function saleDetail(id) {
  const sale = db.prepare(`
    SELECT
      s.*,
      u.name AS operator_name,
      cu.name AS cancelled_by_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN users cu ON cu.id = s.cancelled_by
    WHERE s.id = ?
  `).get(id);

  if (!sale) return null;

  const items = db.prepare(`
    SELECT si.*, p.name
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = ?
  `).all(id);

  const payments = db.prepare(`
    SELECT id, method, amount, created_at
    FROM payment_splits
    WHERE sale_id = ?
    ORDER BY id
  `).all(id);

  const inventory = db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id = ?
    ORDER BY id
  `).all(id);

  return {
    ...sale,
    items,
    payments,
    inventory
  };
}

function reverseInventory(saleId, userId, reason) {
  const ledger = db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id = ?
    ORDER BY id DESC
  `).all(saleId);

  if (!ledger.length) {
    throw new Error('LEDGER_DA_VENDA_NAO_ENCONTRADO');
  }

  for (const row of ledger) {
    const stockReverse = -n(row.stock_delta);
    const closedReverse = -n(row.closed_delta);
    const openReverse = -n(row.open_delta);

    if (Math.abs(stockReverse) > 0.0000001) {
      db.prepare(`
        UPDATE products
        SET stock = COALESCE(stock,0) + ?
        WHERE id = ?
      `).run(stockReverse, row.product_id);
    }

    const profile = db.prepare(`
      SELECT product_id
      FROM inventory_profiles
      WHERE product_id = ?
    `).get(row.product_id);

    if (
      profile &&
      (
        Math.abs(closedReverse) > 0.0000001 ||
        Math.abs(openReverse) > 0.0000001
      )
    ) {
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
      VALUES(
        ?,
        'SALE_CANCEL_REVERSAL',
        ?,
        'SALE',
        ?,
        ?,
        ?
      )
    `).run(
      row.product_id,
      stockReverse + closedReverse + openReverse,
      String(saleId),
      userId,
      reason
    );
  }

  return ledger.length;
}

export function initOperationV16() {
  const salesColumns = db
    .prepare('PRAGMA table_info(sales)')
    .all()
    .map(x => x.name);

  if (!salesColumns.includes('cancelled_by')) {
    db.exec(
      'ALTER TABLE sales ADD COLUMN cancelled_by INTEGER'
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_cancellations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      cancel_type TEXT NOT NULL DEFAULT 'TOTAL',
      refund_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      released_before_cancel INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_payment_reversals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      payment_split_id INTEGER,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECORDED',
      user_id INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const cancellationColumns = db
    .prepare('PRAGMA table_info(sale_cancellations)')
    .all()
    .map(x => x.name);

  if (!cancellationColumns.includes('total')) {
    db.exec(
      'ALTER TABLE sale_cancellations ADD COLUMN total REAL NOT NULL DEFAULT 0'
    );
  }

  if (!cancellationColumns.includes('released_before_cancel')) {
    db.exec(
      'ALTER TABLE sale_cancellations ADD COLUMN released_before_cancel INTEGER NOT NULL DEFAULT 0'
    );
  }
}

export function registerOperationV16(
  app,
  { auth, minRole, audit }
) {

  app.get(
    '/api/v16/sales/recent',
    auth,
    tenantContext,
    minRole(50),
    (req, res) => {
      const rows = db.prepare(`
        SELECT
          s.*,
          u.name AS operator_name,
          cu.name AS cancelled_by_name,
          (
            SELECT group_concat(
              ps.method || ' ' || printf('%.2f',ps.amount),
              ' + '
            )
            FROM payment_splits ps
            WHERE ps.sale_id = s.id
          ) AS payments
        FROM sales s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN users cu ON cu.id = s.cancelled_by
        ORDER BY s.id DESC
        LIMIT 100
      `).all();

      res.json(
        rows.map(row => ({
          ...row,
          return_coverage: returnCoverage(row.id)
        }))
      );
    }
  );

  app.get(
    '/api/v16/sales/:id',
    auth,
    tenantContext,
    minRole(40),
    (req, res) => {
      const sale = saleDetail(n(req.params.id));

      if (!sale) {
        return res
          .status(404)
          .json({ error: 'VENDA_NAO_ENCONTRADA' });
      }

      res.json({
        ...sale,
        return_coverage: returnCoverage(sale.id)
      });
    }
  );

  app.post(
    '/api/v16/sales/:id/cancel',
    auth,
    tenantContext,
    minRole(80),
    (req, res) => {
      try {
        const id = n(req.params.id);
        const reason = t(req.body?.reason);

        if (!reason) {
          return res
            .status(400)
            .json({ error: 'MOTIVO_OBRIGATORIO' });
        }

        const sale = db.prepare(`
          SELECT *
          FROM sales
          WHERE id = ?
        `).get(id);

        if (!sale) {
          return res
            .status(404)
            .json({ error: 'VENDA_NAO_ENCONTRADA' });
        }

        if (sale.status === 'CANCELLED') {
          return res
            .status(409)
            .json({ error: 'VENDA_JA_CANCELADA' });
        }

        if (sale.status !== 'PAID') {
          return res
            .status(409)
            .json({ error: 'STATUS_NAO_PERMITE_CANCELAMENTO' });
        }

        /*
         * NEXUS V4.2 CANCEL RETURN GUARD
         *
         * Uma venda com devolucao registrada nao pode receber
         * cancelamento integral depois. A devolucao ja pode ter
         * restaurado estoque e registrado reversao financeira.
         * Bloquear aqui impede dupla reposicao e dupla reversao.
         */
        const previousReturn = db.prepare(`
          SELECT
            COUNT(*) AS qty,
            COALESCE(SUM(total), 0) AS total
          FROM sale_returns
          WHERE sale_id = ?
        `).get(id);

        if (n(previousReturn?.qty) > 0) {
          return res
            .status(409)
            .json({
              error: 'VENDA_COM_DEVOLUCAO_NAO_PERMITE_CANCELAMENTO_TOTAL',
              message: 'Esta venda ja possui devolucao registrada. Continue pelo fluxo de devolucao.',
              return_count: n(previousReturn.qty),
              returned_total: n(previousReturn.total)
            });
        }

        const roleLevel = {
          OWNER: 100,
          MANAGER: 80,
          FINANCE: 70,
          EVENTS: 60,
          STOCK: 55,
          CASHIER: 50,
          WAITER: 40,
          KITCHEN: 30
        };

        const requesterLevel =
          roleLevel[req.user?.role] || 0;

        if (
          sale.released_at &&
          requesterLevel < 100
        ) {
          return res
            .status(403)
            .json({
              error: 'VENDA_LIBERADA_EXIGE_PROPRIETARIO'
            });
        }

        const previous = db.prepare(`
          SELECT id
          FROM sale_cancellations
          WHERE sale_id = ?
        `).get(id);

        if (previous) {
          return res
            .status(409)
            .json({ error: 'CANCELAMENTO_JA_REGISTRADO' });
        }

        const payments = db.prepare(`
          SELECT *
          FROM payment_splits
          WHERE sale_id = ?
        `).all(id);

        const result = db.transaction(() => {

          const reversedRows =
            reverseInventory(id, req.user.id, reason);

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
            id,
            reason,
            req.user.id,
            'TOTAL',
            payments.length
              ? payments.reduce(
                  (sum, payment) =>
                    sum + n(payment.amount),
                  0
                )
              : n(sale.total),
            n(sale.total) + n(sale.tip_amount),
            sale.released_at ? 1 : 0
          );

          const paymentReverse = db.prepare(`
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
            paymentReverse.run(
              id,
              payment.id,
              payment.method,
              payment.amount,
              'RECORDED',
              req.user.id,
              reason
            );
          }

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
            reason,
            req.user.id,
            id
          );

          db.prepare(`
            UPDATE tips
            SET status = 'CANCELLED'
            WHERE sale_id = ?
              AND status <> 'CANCELLED'
          `).run(id);

          db.prepare(`
            UPDATE employee_rewards
            SET status = 'CANCELLED'
            WHERE sale_id = ?
              AND status <> 'CANCELLED'
          `).run(id);

          return {
            reversed_inventory_rows: reversedRows,
            reversed_payments: payments.length
          };
        })();

        audit(
          req.user.id,
          'SALE_CANCELLED_V16',
          'SALE',
          id,
          {
            reason,
            total: n(sale.total),
            tip: n(sale.tip_amount),
            was_released: Boolean(sale.released_at),
            ...result
          }
        );

        res.json({
          ok: true,
          message: 'VENDA_CANCELADA_COM_SUCESSO',
          ...result,
          sale: saleDetail(id)
        });

      } catch (error) {
        console.error(
          '[NEXUS V1.6 CANCEL]',
          error
        );

        res.status(400).json({
          error: error.message ||
            'ERRO_AO_CANCELAR_VENDA'
        });
      }
    }
  );
}
