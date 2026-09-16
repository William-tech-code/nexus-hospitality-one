import { db } from './db.js';

import {
  validateReturnRequest,
  buildInventoryReturnPlan,
  applyInventoryReturnPlan,
  calculateReturnTotal,
  returnCoverage
} from './return-engine-v16.js';

const n = v => Number(v || 0);

const r = v =>
  Math.round((n(v) + Number.EPSILON) * 100) / 100;

const t = v =>
  String(v || '').trim();

const ROLE_LEVEL = {
  OWNER: 100,
  MANAGER: 80,
  FINANCE: 70,
  EVENTS: 60,
  STOCK: 55,
  CASHIER: 50,
  WAITER: 40,
  KITCHEN: 30
};

function roleLevel(user) {
  return ROLE_LEVEL[
    String(user?.role || '').toUpperCase()
  ] || 0;
}

function saleDetail(id) {

  const sale = db.prepare(`
    SELECT
      s.*,
      u.name AS operator_name,
      ru.name AS released_by_name
    FROM sales s
    LEFT JOIN users u
      ON u.id = s.user_id
    LEFT JOIN users ru
      ON ru.id = s.released_by
    WHERE s.id = ?
  `).get(n(id));

  if (!sale) return null;

  const items = db.prepare(`
    SELECT
      si.*,
      p.name,
      COALESCE((
        SELECT SUM(sri.qty)
        FROM sale_return_items sri
        JOIN sale_returns sr
          ON sr.id = sri.return_id
        WHERE sri.sale_item_id = si.id
      ),0) AS returned_qty
    FROM sale_items si
    JOIN products p
      ON p.id = si.product_id
    WHERE si.sale_id = ?
    ORDER BY si.id
  `).all(n(id));

  const payments = db.prepare(`
    SELECT id, method, amount, created_at
    FROM payment_splits
    WHERE sale_id = ?
    ORDER BY id
  `).all(n(id));

  const returns = db.prepare(`
    SELECT
      sr.*,
      u.name AS operator_name
    FROM sale_returns sr
    LEFT JOIN users u
      ON u.id = sr.user_id
    WHERE sr.sale_id = ?
    ORDER BY sr.id DESC
  `).all(n(id));

  return {
    ...sale,
    items: items.map(x => ({
      ...x,
      returnable_qty:
        Math.max(
          0,
          n(x.qty) - n(x.returned_qty)
        )
    })),
    payments,
    returns,
    return_coverage: returnCoverage(id)
  };
}

function ensureReturnReversalTable() {

  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_return_payment_reversals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
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
}

function alreadyReversedForSale(saleId) {

  const row = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS amount
    FROM sale_return_payment_reversals
    WHERE sale_id = ?
  `).get(n(saleId));

  return n(row?.amount);
}

function buildPaymentReturnPlan(
  saleId,
  returnTotal
) {

  const payments = db.prepare(`
    SELECT id, method, amount
    FROM payment_splits
    WHERE sale_id = ?
    ORDER BY id
  `).all(n(saleId));

  if (!payments.length) {
    throw new Error(
      'PAGAMENTOS_DA_VENDA_NAO_ENCONTRADOS'
    );
  }

  const paidTotal = r(
    payments.reduce(
      (sum,p) => sum + n(p.amount),
      0
    )
  );

  const previous =
    r(alreadyReversedForSale(saleId));

  const available =
    r(Math.max(0, paidTotal - previous));

  if (returnTotal - available > 0.01) {
    throw new Error(
      'DEVOLUCAO_SUPERA_SALDO_FINANCEIRO'
    );
  }

  let remaining = r(returnTotal);

  const plan = [];

  /*
   * Distribuição determinística pelas formas de pagamento.
   * Isto registra a obrigação/reversão financeira LOCAL.
   *
   * PIX, cartão ou Asaas somente poderão ser considerados
   * efetivamente estornados após confirmação do provedor.
   */
  for (const payment of payments) {

    if (remaining <= 0.001) break;

    const previousForSplit = n(
      db.prepare(`
        SELECT COALESCE(SUM(amount),0) AS amount
        FROM sale_return_payment_reversals
        WHERE payment_split_id = ?
      `).get(payment.id)?.amount
    );

    const splitAvailable =
      r(
        Math.max(
          0,
          n(payment.amount) - previousForSplit
        )
      );

    if (splitAvailable <= 0) continue;

    const amount =
      r(Math.min(splitAvailable, remaining));

    if (amount <= 0) continue;

    plan.push({
      payment_split_id: payment.id,
      method: payment.method,
      amount
    });

    remaining = r(remaining - amount);
  }

  if (remaining > 0.01) {
    throw new Error(
      'SALDO_FINANCEIRO_INSUFICIENTE'
    );
  }

  return plan;
}

function recordPaymentReturnPlan(
  returnId,
  saleId,
  plan,
  userId,
  reason
) {

  const insert = db.prepare(`
    INSERT INTO sale_return_payment_reversals(
      return_id,
      sale_id,
      payment_split_id,
      method,
      amount,
      status,
      user_id,
      reason
    )
    VALUES(?,?,?,?,?,'RECORDED',?,?)
  `);

  for (const row of plan) {
    insert.run(
      n(returnId),
      n(saleId),
      n(row.payment_split_id),
      String(row.method),
      n(row.amount),
      n(userId),
      String(reason)
    );
  }
}

export function initReturnRoutesV16() {
  ensureReturnReversalTable();
}

export function registerReturnRoutesV16(
  app,
  {
    auth,
    minRole,
    audit
  }
) {

  app.post(
    '/api/v16/sales/:id/return-preview',
    auth,
    minRole(80),
    (req,res) => {

      try {

        const id = n(req.params.id);

        const sale = saleDetail(id);

        if (!sale) {
          return res.status(404).json({
            error: 'VENDA_NAO_ENCONTRADA'
          });
        }

        if (sale.status !== 'PAID') {
          return res.status(400).json({
            error: 'VENDA_NAO_PAGA'
          });
        }
        const requested =
          Array.isArray(req.body?.items)
            ? req.body.items
            : [];

        if (!requested.length) {
          return res.status(400).json({
            error: 'ITENS_DEVOLUCAO_OBRIGATORIOS'
          });
        }

        const validated =
          validateReturnRequest(
            id,
            requested
          );

        const returnTotal =
          calculateReturnTotal(validated.requested);

        const inventoryPlan =
          buildInventoryReturnPlan(
            validated
          );

        const paymentPlan =
          buildPaymentReturnPlan(
            id,
            returnTotal
          );

        return res.json({
          ok: true,
          preview: {
            sale_id: id,
            items: validated,
            return_total: returnTotal,
            inventory_rows:
              Array.isArray(inventoryPlan)
                ? inventoryPlan.length
                : 0,
            payment_rows:
              Array.isArray(paymentPlan)
                ? paymentPlan.length
                : 0
          },
          coverage: sale.return_coverage
        });

      } catch (e) {

        return res.status(400).json({
          error: e.message
        });
      }
    }
  );
  app.post(
    '/api/v16/sales/:id/return',
    auth,
    minRole(80),
    (req,res) => {

      try {

        const id = n(req.params.id);

        const reason =
          t(req.body?.reason);
        const requested =
          Array.isArray(req.body?.items)
            ? req.body.items
            : [];

        if (!reason) {
          return res.status(400).json({
            error: 'MOTIVO_OBRIGATORIO'
          });
        }

        const sale = db.prepare(`
          SELECT *
          FROM sales
          WHERE id = ?
        `).get(id);

        if (!sale) {
          return res.status(404).json({
            error: 'VENDA_NAO_ENCONTRADA'
          });
        }

        if (sale.status !== 'PAID') {
          return res.status(409).json({
            error: 'VENDA_NAO_DEVOLVIVEL'
          });
        }

        /*
         * Venda já entregue:
         * somente OWNER pode efetuar devolução.
         */
        if (
          sale.released_at &&
          roleLevel(req.user) < 100
        ) {
          return res.status(403).json({
            error:
              'VENDA_ENTREGUE_EXIGE_PROPRIETARIO'
          });
        }

        const normalized =
          validateReturnRequest(
            id,
            requested
          );

        const returnTotal =
          calculateReturnTotal(normalized.requested);

        if (returnTotal <= 0) {
          return res.status(400).json({
            error:
              'VALOR_DEVOLUCAO_INVALIDO'
          });
        }

        /*
         * Calculamos os dois planos ANTES da escrita.
         * Qualquer inconsistência bloqueia toda a operação.
         */
        const inventoryPlan =
          buildInventoryReturnPlan(
            normalized
          );

        const paymentPlan =
          buildPaymentReturnPlan(
            id,
            returnTotal
          );

        const result = db.transaction(() => {

          const ret = db.prepare(`
            INSERT INTO sale_returns(
              sale_id,
              reason,
              total,
              user_id
            )
            VALUES(?,?,?,?)
          `).run(
            id,
            reason,
            returnTotal,
            req.user.id
          );

          const returnId =
            ret.lastInsertRowid;

          const insertItem = db.prepare(`
            INSERT INTO sale_return_items(
              return_id,
              sale_item_id,
              product_id,
              qty,
              amount
            )
            VALUES(?,?,?,?,?)
          `);

          for (const item of normalized.requested) {

            insertItem.run(
              returnId,
              item.id,
              item.product_id,
              item.requested_qty,
              r(
                n(item.requested_qty) *
                n(item.unit_price)
              )
            );
          }

          const reversedInventoryRows =
            applyInventoryReturnPlan(
              inventoryPlan,
              req.user.id,
              returnId,
              reason
            );

          recordPaymentReturnPlan(
            returnId,
            id,
            paymentPlan,
            req.user.id,
            reason
          );

          return {
            return_id: returnId,
            total: returnTotal,
            reversed_inventory_rows:
              reversedInventoryRows,
            reversed_payment_rows:
              paymentPlan.length
          };
        })();

        const coverage =
          returnCoverage(id);

        audit(
          req.user.id,
          'SALE_RETURNED_V16',
          'SALE',
          id,
          {
            reason,
            return_id: result.return_id,
            total: result.total,
            fully_returned:
              coverage.fully_returned,
            was_released:
              Boolean(sale.released_at),
            reversed_inventory_rows:
              result.reversed_inventory_rows,
            reversed_payment_rows:
              result.reversed_payment_rows
          }
        );

        return res.json({
          ok: true,
          ...result,
          coverage,
          sale: saleDetail(id)
        });

      } catch (e) {

        return res.status(400).json({
          error: e.message
        });
      }
    }
  );
}







