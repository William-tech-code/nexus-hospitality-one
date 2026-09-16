import fs from 'node:fs';

const file = './server/operation-v16.js';
let s = fs.readFileSync(file, 'utf8');

function apply(regex, replacement, name) {
  const first = regex.exec(s);

  if (!first) {
    throw new Error(
      `${name}: ponto nao encontrado`
    );
  }

  const before = s.slice(0, first.index);
  const afterStart = first.index + first[0].length;
  const after = s.slice(afterStart);

  const second = regex.exec(after);

  if (second) {
    throw new Error(
      `${name}: mais de um ponto encontrado`
    );
  }

  s = s.replace(regex, replacement);
  console.log(`[OK] ${name}`);
}

/* =========================================================
   1. OWNER OBRIGATORIO PARA VENDA JA LIBERADA
   ========================================================= */

apply(
  /(\s*if\s*\(sale\.status\s*!==\s*'PAID'\)\s*\{[\s\S]*?STATUS_NAO_PERMITE_CANCELAMENTO[\s\S]*?\}\);\s*\})/,
  `$1

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
        }`,
  'PERMISSAO_OWNER'
);

/* =========================================================
   2. CANCELAMENTO TOTAL + REFUND TOTAL
   ========================================================= */

apply(
  /INSERT INTO sale_cancellations\(\s*sale_id,\s*reason,\s*user_id,\s*total,\s*released_before_cancel\s*\)\s*VALUES\(\?,\?,\?,\?,\?\)/,
  `INSERT INTO sale_cancellations(
              sale_id,
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

apply(
  /(\.run\(\s*id,\s*reason,\s*req\.user\.id,\s*)n\(sale\.total\)\s*\+\s*n\(sale\.tip_amount\),\s*sale\.released_at\s*\?\s*1\s*:\s*0\s*\);/,
  `$1'TOTAL',
            payments.length
              ? payments.reduce(
                  (sum, payment) =>
                    sum + n(payment.amount),
                  0
                )
              : n(sale.total),
            n(sale.total) + n(sale.tip_amount),
            sale.released_at ? 1 : 0
          );`,
  'VALORES_CANCELAMENTO'
);

/* =========================================================
   3. CANCELAR TIPS + EMPLOYEE REWARDS
   ========================================================= */

apply(
  /db\.prepare\(`\s*UPDATE tips\s*SET status = 'CANCELLED'\s*WHERE sale_id = \?\s*`\)\.run\(id\);/,
  `db.prepare(\`
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

console.log('');
console.log('HARDEN_V16_FINAL_APLICADO');

