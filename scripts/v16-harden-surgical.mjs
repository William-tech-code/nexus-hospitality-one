import fs from 'node:fs';

const file = './server/operation-v16.js';
let s = fs.readFileSync(file, 'utf8');

function patch(oldText, newText, name) {
  const count = s.split(oldText).length - 1;

  if (count !== 1) {
    throw new Error(`${name}: encontrados ${count} pontos`);
  }

  s = s.replace(oldText, newText);
  console.log(`[OK] ${name}`);
}

patch(
`        if (sale.status !== 'PAID') {
          return res
            .status(409)
            .json({ error: 'STATUS_NAO_PERMITE_CANCELAMENTO' });
        }`,
`        if (sale.status !== 'PAID') {
          return res
            .status(409)
            .json({ error: 'STATUS_NAO_PERMITE_CANCELAMENTO' });
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

        const requesterLevel = roleLevel[req.user?.role] || 0;

        if (sale.released_at && requesterLevel < 100) {
          return res.status(403).json({
            error: 'VENDA_LIBERADA_EXIGE_PROPRIETARIO'
          });
        }`,
'PERMISSAO_OWNER'
);

patch(
`              sale_id,
              reason,
              user_id,
              total,
              released_before_cancel
            )
            VALUES(?,?,?,?,?)`,
`              sale_id,
              reason,
              user_id,
              cancel_type,
              refund_total,
              total,
              released_before_cancel
            )
            VALUES(?,?,?,?,?,?,?)`,
'COLUNAS_CANCELAMENTO'
);

patch(
`            id,
            reason,
            req.user.id,
            n(sale.total) + n(sale.tip_amount),
            sale.released_at ? 1 : 0`,
`            id,
            reason,
            req.user.id,
            'TOTAL',
            payments.length
              ? payments.reduce((sum,p) => sum + n(p.amount), 0)
              : n(sale.total),
            n(sale.total) + n(sale.tip_amount),
            sale.released_at ? 1 : 0`,
'VALORES_CANCELAMENTO'
);

patch(
`          db.prepare(\`
            UPDATE tips
            SET status = 'CANCELLED'
            WHERE sale_id = ?
          \`).run(id);`,
`          db.prepare(\`
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
          \`).run(id);`,
'TIPS_E_REWARDS'
);

fs.writeFileSync(file, s, 'utf8');
console.log('HARDEN_V16_APLICADO');
