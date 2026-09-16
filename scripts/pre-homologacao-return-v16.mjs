import fs from 'node:fs';
import { db } from '../server/db.js';

const required = [
  './server/suite-v06.js',
  './server/transaction-engine.js',
  './server/return-engine-v16.js',
  './server/return-routes-v16.js',
  './server/index.js',
  './src/api.js',
  './src/BusinessV15.jsx'
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error('ARQUIVO_AUSENTE:', file);
    process.exit(10);
  }
}

const smart =
  fs.readFileSync('./server/suite-v06.js','utf8');

const transaction =
  fs.readFileSync('./server/transaction-engine.js','utf8');

const engine =
  fs.readFileSync('./server/return-engine-v16.js','utf8');

const routes =
  fs.readFileSync('./server/return-routes-v16.js','utf8');

const server =
  fs.readFileSync('./server/index.js','utf8');

const api =
  fs.readFileSync('./src/api.js','utf8');

const business =
  fs.readFileSync('./src/BusinessV15.jsx','utf8');

console.log('');
console.log('==============================================');
console.log('1. RETURN V1.6');
console.log('==============================================');

const checks = {
  SERVER_IMPORT:
    server.includes("return-routes-v16.js"),

  SERVER_REGISTER:
    server.includes('registerReturnRoutesV16'),

  ROUTE_PREVIEW:
    routes.includes('/api/v16/sales/:id/return-preview'),

  ROUTE_RETURN:
    routes.includes('/api/v16/sales/:id/return'),

  OWNER_AFTER_RELEASE:
    routes.includes('VENDA_ENTREGUE_EXIGE_PROPRIETARIO'),

  REASON_REQUIRED:
    routes.includes('MOTIVO_OBRIGATORIO'),

  PAYMENT_REVERSALS:
    routes.includes('sale_return_payment_reversals'),

  INVENTORY_LEDGER:
    engine.includes('sale_inventory_ledger'),

  MULTI_ITEM_BLOCK:
    engine.includes('DEVOLUCAO_MULTITEM_REQUER_LEDGER_POR_ITEM'),

  API_RETURN:
    api.includes('returnSaleV16:'),

  UI_RETURN:
    business.includes('api.returnSaleV16('),

  OLD_RETURN_V14_DISABLED:
    !business.includes('api.returnSaleV14(')
};

console.table(checks);

const failures =
  Object.entries(checks)
    .filter(([,value]) => !value)
    .map(([key]) => key);

if (failures.length) {
  console.error('');
  console.error('FALHAS_RETURN_V16:', failures);
  process.exit(20);
}

console.log('');
console.log('RETURN V1.6 STATIC: PASS');

console.log('');
console.log('==============================================');
console.log('2. CONSUME SMART INVENTORY');
console.log('==============================================');

const smartLines = smart.split(/\r?\n/);

let foundSmart = false;

for (let i=0; i<smartLines.length; i++) {

  if (
    smartLines[i].includes('consumeSmartInventory') ||
    smartLines[i].includes('closed_units') ||
    smartLines[i].includes('open_base')
  ) {

    foundSmart = true;

    const start = Math.max(0,i-5);
    const end = Math.min(smartLines.length,i+20);

    console.log('');
    console.log(
      `--- suite-v06.js ${start+1}-${end} ---`
    );

    for (let x=start; x<end; x++) {
      console.log(
        String(x+1).padStart(4,' ') +
        ' | ' +
        smartLines[x]
      );
    }
  }
}

if (!foundSmart) {
  console.log(
    'consumeSmartInventory NAO LOCALIZADO'
  );
}

console.log('');
console.log('==============================================');
console.log('3. CASH SUMMARY');
console.log('==============================================');

const txLines = transaction.split(/\r?\n/);

for (let i=0; i<txLines.length; i++) {

  if (
    txLines[i].includes('cashSummary') ||
    txLines[i].includes('payment_splits') ||
    txLines[i].includes("status='PAID'") ||
    txLines[i].includes('expected')
  ) {

    const start = Math.max(0,i-4);
    const end = Math.min(txLines.length,i+15);

    console.log('');
    console.log(
      `--- transaction-engine.js ${start+1}-${end} ---`
    );

    for (let x=start; x<end; x++) {
      console.log(
        String(x+1).padStart(4,' ') +
        ' | ' +
        txLines[x]
      );
    }
  }
}

console.log('');
console.log('==============================================');
console.log('4. BANCO ATUAL');
console.log('==============================================');

const sale7 = db.prepare(`
  SELECT
    id,
    status,
    total,
    released_at,
    released_by,
    cancelled_at,
    cancelled_by
  FROM sales
  WHERE id=7
`).get();

console.log('');
console.log('VENDA #7:');
console.log(sale7);

const return7 = db.prepare(`
  SELECT COUNT(*) AS total
  FROM sale_returns
  WHERE sale_id=7
`).get();

console.log(
  'RETURNS #7:',
  Number(return7.total)
);

const latestSales = db.prepare(`
  SELECT
    id,
    total,
    payment_method,
    status,
    released_at,
    cancelled_at
  FROM sales
  ORDER BY id DESC
  LIMIT 10
`).all();

console.log('');
console.log('ULTIMAS VENDAS:');
console.table(latestSales);

const returns = db.prepare(`
  SELECT
    sr.id,
    sr.sale_id,
    sr.total,
    sr.reason,
    sr.created_at
  FROM sale_returns sr
  ORDER BY sr.id DESC
  LIMIT 10
`).all();

console.log('');
console.log('DEVOLUCOES EXISTENTES:');
console.table(returns);

const reversalTable = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name='sale_return_payment_reversals'
`).get();

console.log('');
console.log(
  'RETURN PAYMENT REVERSALS TABLE:',
  Boolean(reversalTable)
);

if (reversalTable) {

  const reversals = db.prepare(`
    SELECT *
    FROM sale_return_payment_reversals
    ORDER BY id DESC
    LIMIT 10
  `).all();

  console.log('');
  console.log('REVERSOES FINANCEIRAS DE RETURN:');
  console.table(reversals);
}

if (sale7 && sale7.status !== 'CANCELLED') {
  console.error('VENDA_7_NAO_PRESERVADA');
  process.exit(30);
}

if (Number(return7.total) !== 0) {
  console.error(
    'VENDA_7_RECEBEU_RETURN_INESPERADO'
  );
  process.exit(31);
}

console.log('');
console.log('==============================================');
console.log('PRE-HOMOLOGACAO READ-ONLY: PASS');
console.log('BANCO ALTERADO: NAO');
console.log('VENDA CRIADA: NAO');
console.log('DEVOLUCAO EXECUTADA: NAO');
console.log('VENDA #7: PRESERVADA');
console.log('==============================================');
