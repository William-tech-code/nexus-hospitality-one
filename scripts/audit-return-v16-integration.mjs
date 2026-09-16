import fs from 'node:fs';

const server =
  fs.readFileSync('./server/index.js','utf8');

const api =
  fs.readFileSync('./src/api.js','utf8');

const business =
  fs.readFileSync('./src/BusinessV15.jsx','utf8');

const routes =
  fs.readFileSync('./server/return-routes-v16.js','utf8');

const engine =
  fs.readFileSync('./server/return-engine-v16.js','utf8');

const checks = {
  SERVER_IMPORT:
    server.includes("from './return-routes-v16.js'"),

  SERVER_INIT:
    server.includes('initReturnRoutesV16();'),

  SERVER_REGISTER:
    server.includes('registerReturnRoutesV16(app'),

  RETURN_ROUTE:
    routes.includes('/api/v16/sales/:id/return'),

  PREVIEW_ROUTE:
    routes.includes('/api/v16/sales/:id/return-preview'),

  OWNER_AFTER_RELEASE:
    routes.includes('VENDA_ENTREGUE_EXIGE_PROPRIETARIO'),

  REASON_REQUIRED:
    routes.includes('MOTIVO_OBRIGATORIO'),

  FINANCIAL_REVERSAL:
    routes.includes('sale_return_payment_reversals'),

  RETURN_BALANCE:
    engine.includes('QUANTIDADE_SUPERA_SALDO_DEVOLVIVEL'),

  LEDGER_REVERSAL:
    engine.includes('sale_inventory_ledger'),

  MULTI_ITEM_GUARD:
    engine.includes('DEVOLUCAO_MULTITEM_REQUER_LEDGER_POR_ITEM'),

  API_RETURN_V16:
    api.includes('returnSaleV16:'),

  API_PREVIEW_V16:
    api.includes('returnPreviewV16:'),

  UI_RETURN_V16:
    business.includes('api.returnSaleV16('),

  UI_RETURN_V14_REMOVED:
    !business.includes('api.returnSaleV14(')
};

console.table(checks);

const failed =
  Object.entries(checks)
    .filter(([,value]) => !value)
    .map(([key]) => key);

if (failed.length) {
  console.error('');
  console.error('AUDITORIA_FALHOU:',failed);
  process.exit(80);
}

console.log('');
console.log('AUDITORIA ESTATICA: PASS');
