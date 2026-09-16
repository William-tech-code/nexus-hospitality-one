import { db } from '../server/db.js';
import fs from 'node:fs';

console.log('');
console.log('==============================================');
console.log('NEXUS V1.6 - OWNER + RETURN READ ONLY');
console.log('==============================================');

const owner = db.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    active,
    force_password_change
  FROM users
  WHERE role='OWNER'
  ORDER BY id
  LIMIT 1
`).get();

console.log('');
console.log('OWNER:');
console.log(owner || 'NAO LOCALIZADO');

if (!owner) {
  console.error('OWNER_NAO_LOCALIZADO');
  process.exit(30);
}

if (Number(owner.active) !== 1) {
  console.error('OWNER_INATIVO');
  process.exit(31);
}

const sale7 = db.prepare(`
  SELECT
    id,
    status,
    released_at,
    released_by,
    cancelled_at,
    cancelled_by,
    cancel_reason
  FROM sales
  WHERE id=7
`).get();

console.log('');
console.log('VENDA #7:');
console.log(sale7);

if (sale7 && sale7.status !== 'CANCELLED') {
  console.error('VENDA_7_ALTERADA');
  process.exit(32);
}

const returns7 = db.prepare(`
  SELECT COUNT(*) AS c
  FROM sale_returns
  WHERE sale_id=7
`).get().c;

console.log(
  'DEVOLUCOES DA VENDA #7:',
  returns7
);

if (Number(returns7) !== 0) {
  console.error('VENDA_7_POSSUI_DEVOLUCAO');
  process.exit(33);
}

const reversalTable = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name='sale_return_payment_reversals'
`).get();

console.log(
  'TABELA RETURN PAYMENT REVERSALS:',
  Boolean(reversalTable)
);

const server = fs.readFileSync(
  './server/index.js',
  'utf8'
);

const routes = fs.readFileSync(
  './server/return-routes-v16.js',
  'utf8'
);

const engine = fs.readFileSync(
  './server/return-engine-v16.js',
  'utf8'
);

const api = fs.readFileSync(
  './src/api.js',
  'utf8'
);

const business = fs.readFileSync(
  './src/BusinessV15.jsx',
  'utf8'
);

const checks = {
  RETURN_IMPORT:
    server.includes("from './return-routes-v16.js'"),

  RETURN_INIT:
    server.includes('initReturnRoutesV16();'),

  RETURN_REGISTER:
    server.includes('registerReturnRoutesV16(app'),

  RETURN_HTTP:
    routes.includes('/api/v16/sales/:id/return'),

  RETURN_PREVIEW:
    routes.includes('/api/v16/sales/:id/return-preview'),

  OWNER_PROTECTION:
    routes.includes('VENDA_ENTREGUE_EXIGE_PROPRIETARIO'),

  REASON_REQUIRED:
    routes.includes('MOTIVO_OBRIGATORIO'),

  PAYMENT_REVERSAL:
    routes.includes('sale_return_payment_reversals'),

  LEDGER:
    engine.includes('sale_inventory_ledger'),

  MULTI_ITEM_GUARD:
    engine.includes('DEVOLUCAO_MULTITEM_REQUER_LEDGER_POR_ITEM'),

  API_RETURN:
    api.includes('returnSaleV16:'),

  API_PREVIEW:
    api.includes('returnPreviewV16:'),

  UI_RETURN:
    business.includes('api.returnSaleV16('),

  OLD_RETURN_REMOVED:
    !business.includes('api.returnSaleV14(')
};

console.log('');
console.log('RETURN V1.6 STATIC CHECK:');
console.table(checks);

const failed =
  Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

if (failed.length) {

  console.error('');
  console.error(
    'RETURN_STATIC_FAILURES:',
    failed
  );

  process.exit(40);
}

console.log('');
console.log('RETURN STATIC CHECK: PASS');
console.log('BANCO ALTERADO PELO TESTE: NAO');
console.log('VENDA #7 ALTERADA: NAO');
console.log('==============================================');
