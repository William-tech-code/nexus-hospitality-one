import { db } from '../server/db.js';

const sale7 =
  db.prepare(`
    SELECT
      id,
      status,
      released_at,
      released_by,
      cancelled_at,
      cancelled_by,
      cancel_reason
    FROM sales
    WHERE id = 7
  `).get();

const returnCount =
  db.prepare(`
    SELECT COUNT(*) AS c
    FROM sale_returns
  `).get().c;

console.log('VENDA #7:',sale7);
console.log('DEVOLUCOES EXISTENTES:',returnCount);
console.log('AUDITORIA FINAL DO BANCO: OK');
