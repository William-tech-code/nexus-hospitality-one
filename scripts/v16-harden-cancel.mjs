import fs from 'node:fs';

const file = './server/operation-v16.js';
let source = fs.readFileSync(file, 'utf8');

const startMarker =
  "  app.post(\n    '/api/v16/sales/:id/cancel',";

const start = source.indexOf(startMarker);

if (start < 0) {
  throw new Error(
    'INICIO_DA_ROTA_CANCEL_NAO_ENCONTRADO'
  );
}

const functionEnd = source.lastIndexOf('\n}');

if (functionEnd <= start) {
  throw new Error(
    'FIM_DO_REGISTER_NAO_ENCONTRADO'
  );
}

const replacement = `  app.post(
    '/api/v16/sales/:id/cancel',
    auth,
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

        const sale = db.prepare(\`
          SELECT *
          FROM sales
          WHERE id = ?
        \`).get(id);

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
            .json({
              error: 'STATUS_NAO_PERMITE_CANCELAMENTO'
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
              error:
                'VENDA_LIBERADA_EXIGE_PROPRIETARIO'
            });
        }

        const previous = db.prepare(\`
          SELECT id
          FROM sale_cancellations
          WHERE sale_id = ?
        \`).get(id);

        if (previous) {
          return res
            .status(409)
            .json({
              error: 'CANCELAMENTO_JA_REGISTRADO'
            });
        }

        const payments = db.prepare(\`
          SELECT *
          FROM payment_splits
          WHERE sale_id = ?
          ORDER BY id
        \`).all(id);

        const result = db.transaction(() => {

          const reversedRows =
            reverseInventory(
              id,
              req.user.id,
              reason
            );

          const refundTotal =
            payments.length
              ? payments.reduce(
                  (sum, payment) =>
                    sum + n(payment.amount),
                  0
                )
              : n(sale.total);

          db.prepare(\`
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
          \`).run(
            id,
            reason,
            req.user.id,
            'TOTAL',
            refundTotal,
            n(sale.total) + n(sale.tip_amount),
            sale.released_at ? 1 : 0
          );

          const paymentReverse = db.prepare(\`
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
          \`);

          for (const payment of payments) {
            paymentReverse.run(
              id,
              payment.id,
              payment.method,
              n(payment.amount),
              'RECORDED',
              req.user.id,
              reason
            );
          }

          db.prepare(\`
            UPDATE tips
            SET status = 'CANCELLED'
            WHERE sale_id = ?
              AND status <> 'CANCELLED'
          \`).run(id);

          db.prepare(\`
            UPDATE employee_rewards
            SET status = 'CANCELLED'
            WHERE sale_id = ?
              AND status <> 'CANCELLED'
          \`).run(id);

          db.prepare(\`
            UPDATE sales
            SET
              status = 'CANCELLED',
              cancelled_at = CURRENT_TIMESTAMP,
              cancel_reason = ?,
              cancelled_by = ?,
              release_code = NULL
            WHERE id = ?
          \`).run(
            reason,
            req.user.id,
            id
          );

          return {
            saleId: id,
            refundTotal,
            reversedRows,
            releasedBeforeCancel:
              !!sale.released_at
          };
        })();

        audit(
          req,
          'SALE_CANCELLED_V16',
          'sales',
          id,
          {
            reason,
            cancel_type: 'TOTAL',
            refund_total: result.refundTotal,
            released_before_cancel:
              result.releasedBeforeCancel,
            inventory_reversal_rows:
              result.reversedRows,
            payment_reversal_status:
              'RECORDED'
          }
        );

        return res.json({
          ok: true,
          message: 'VENDA_CANCELADA_COM_SUCESSO',
          cancellation: result,
          sale: saleDetail(id)
        });

      } catch (error) {
        console.error(
          '[NEXUS V1.6 CANCEL]',
          error
        );

        return res
          .status(500)
          .json({
            error:
              error?.message ||
              'ERRO_AO_CANCELAR_VENDA'
          });
      }
    }
  );
`;

const updated =
  source.slice(0, start) +
  replacement +
  source.slice(functionEnd);

fs.writeFileSync(file, updated, 'utf8');

console.log('CANCEL_ROUTE_V16_HARDENED');
