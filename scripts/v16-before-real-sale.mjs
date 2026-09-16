import { db } from '../server/db.js';

const product = db.prepare(`
  SELECT id,name,price,cost,stock,active
  FROM products
  WHERE id = 3
`).get();

const cash = db.prepare(`
  SELECT id,user_id,status,opening_amount,opened_at
  FROM cash_sessions
  WHERE status='OPEN'
  ORDER BY id DESC
  LIMIT 1
`).get();

console.log('\n=== ANTES DA VENDA ===');
console.table([product]);
console.log('\nCAIXA:');
console.table(cash ? [cash] : []);

if (!product || product.active !== 1 || Number(product.stock) < 1) {
  throw new Error('PRODUTO_3_INDISPONIVEL');
}

if (!cash) {
  throw new Error('NENHUM_CAIXA_ABERTO');
}

console.log('PRE_CONDICOES_OK');
