import { db } from '../server/db.js';

const sale = db.prepare(`
  SELECT
    id,
    total,
    payment_method,
    status,
    customer_name,
    cash_session_id,
    user_id,
    received_amount,
    change_amount,
    release_code,
    released_at,
    created_at
  FROM sales
  WHERE customer_name = 'HOMOLOGACAO NEXUS V1.6'
  ORDER BY id DESC
  LIMIT 1
`).get();

if (!sale) {
  throw new Error('VENDA_HOMOLOGACAO_NAO_LOCALIZADA');
}

const items = db.prepare(`
  SELECT
    si.id,
    si.sale_id,
    si.product_id,
    p.name,
    si.qty,
    si.unit_price,
    si.unit_cost,
    si.sale_mode
  FROM sale_items si
  LEFT JOIN products p ON p.id=si.product_id
  WHERE si.sale_id=?
`).all(sale.id);

const payments = db.prepare(`
  SELECT id,sale_id,method,amount
  FROM payment_splits
  WHERE sale_id=?
`).all(sale.id);

const ledger = db.prepare(`
  SELECT
    id,
    sale_id,
    product_id,
    stock_delta,
    closed_delta,
    open_delta
  FROM sale_inventory_ledger
  WHERE sale_id=?
`).all(sale.id);

const product = db.prepare(`
  SELECT id,name,stock
  FROM products
  WHERE id=3
`).get();

console.log('\n============================================');
console.log(' VENDA DE HOMOLOGACAO LOCALIZADA');
console.log('============================================');

console.log('\nVENDA:');
console.table([sale]);

console.log('\nITENS:');
console.table(items);

console.log('\nPAGAMENTO:');
console.table(payments);

console.log('\nLEDGER DE ESTOQUE:');
console.table(ledger);

console.log('\nESTOQUE ATUAL PRODUTO #3:');
console.table([product]);

const ok =
  sale.status === 'PAID' &&
  Number(sale.total) === 7 &&
  items.length === 1 &&
  Number(items[0]?.product_id) === 3 &&
  Number(items[0]?.qty) === 1 &&
  payments.length >= 1 &&
  ledger.length >= 1 &&
  Number(product.stock) === 34;

console.log('\n============================================');

if (ok) {
  console.log('VENDA_REAL_V16: OK');
  console.log(`SALE_ID=${sale.id}`);
  console.log('STATUS=PAID');
  console.log('TOTAL=7');
  console.log('ESTOQUE_35_PARA_34: OK');
  console.log('LEDGER: OK');
  console.log('PAGAMENTO: OK');
  console.log('PRONTA_PARA_TESTE_DE_CANCELAMENTO');
} else {
  console.log('VALIDACAO_DA_VENDA: FALHOU');
  process.exitCode = 1;
}

console.log('============================================');
