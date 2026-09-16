import fs from 'node:fs';
import { db } from '../server/db.js';

const tx=fs.readFileSync(
  './server/transaction-engine.js',
  'utf8'
);

const op=fs.readFileSync(
  './server/operation-v14.js',
  'utf8'
);

const api=fs.readFileSync(
  './src/api.js',
  'utf8'
);

const checks={
  ITEM_LEDGER_TABLE:
    tx.includes('sale_item_inventory_ledger'),

  ITEM_LEDGER_CAPTURE:
    tx.includes('itemLedgerDiff('),

  LEGACY_LEDGER_PRESERVED:
    tx.includes('ledgerDiff(saleId,saleBefore)'),

  PAYMENT_REQUIRED:
    op.includes('PAGAMENTO_NAO_CONFIRMADO'),

  CASH_RECEIVED_GUARD:
    op.includes('VALOR_RECEBIDO_INSUFICIENTE'),

  RELEASE_PAYMENT_GUARD:
    op.includes('FICHA_RETIRADA_NAO_GERADA'),

  RELEASE_DUPLICATE_GUARD:
    op.includes('VENDA_JA_LIBERADA'),

  API_CANCEL_V16:
    api.includes('cancelSaleV16'),

  API_RETURN_PREVIEW:
    api.includes('returnPreviewV16'),

  API_RETURN:
    api.includes('returnSaleV16'),

  API_UTF8:
    api.includes('indisponível') &&
    api.includes('está ativo')
};

let failed=false;

for(const [name,value] of Object.entries(checks)){
  console.log(
    name+':',
    value?'PASS':'FAIL'
  );

  if(!value)failed=true;
}

const table=db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name='sale_item_inventory_ledger'
`).get();

console.log(
  'DB ITEM LEDGER:',
  table?'PASS':'FAIL'
);

if(!table)failed=true;

const integrity=db.prepare(
  'PRAGMA integrity_check'
).get();

const ok=
  String(
    Object.values(integrity)[0]
  ).toLowerCase()==='ok';

console.log(
  'SQLITE INTEGRITY:',
  ok?'PASS':'FAIL'
);

if(!ok)failed=true;

if(failed)process.exit(1);
