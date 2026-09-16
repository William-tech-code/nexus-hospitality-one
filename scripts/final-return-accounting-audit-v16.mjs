import fs from 'node:fs';
import { db } from '../server/db.js';

const tx=
  fs.readFileSync(
    './server/transaction-engine.js',
    'utf8'
  );

const routes=
  fs.readFileSync(
    './server/return-routes-v16.js',
    'utf8'
  );

const engine=
  fs.readFileSync(
    './server/return-engine-v16.js',
    'utf8'
  );

const api=
  fs.readFileSync(
    './src/api.js',
    'utf8'
  );

const business=
  fs.readFileSync(
    './src/BusinessV15.jsx',
    'utf8'
  );

const checks={
  RETURN_ACCOUNTING:
    tx.includes(
      'sale_return_payment_reversals'
    ),

  RETURN_REVENUE:
    tx.includes(
      'FROM sale_returns sr'
    ),

  GROSS_REVENUE:
    tx.includes(
      'gross_revenue'
    ),

  RETURNS_METRIC:
    tx.includes(
      'returns:returnedAmount'
    ),

  RETURN_ROUTE:
    routes.includes(
      '/api/v16/sales/:id/return'
    ),

  OWNER_RELEASED:
    routes.includes(
      'VENDA_ENTREGUE_EXIGE_PROPRIETARIO'
    ),

  PAYMENT_REVERSAL:
    routes.includes(
      'sale_return_payment_reversals'
    ),

  LEDGER_REVERSAL:
    engine.includes(
      'sale_inventory_ledger'
    ),

  MULTI_ITEM_GUARD:
    engine.includes(
      'DEVOLUCAO_MULTITEM_REQUER_LEDGER_POR_ITEM'
    ),

  API_RETURN:
    api.includes(
      'returnSaleV16:'
    ),

  UI_RETURN:
    business.includes(
      'api.returnSaleV16('
    ),

  OLD_RETURN_V14_REMOVED:
    !business.includes(
      'api.returnSaleV14('
    )
};

console.log('');
console.log('FINAL STATIC CHECK:');
console.table(checks);

const failed=
  Object.entries(checks)
    .filter(([,v])=>!v)
    .map(([k])=>k);

if(failed.length){
  console.error(
    'FINAL_FAILURES:',
    failed
  );
  process.exit(70);
}

const integrity=
  db.prepare(
    'PRAGMA integrity_check'
  ).get();

const sale7=
  db.prepare(`
    SELECT
      id,
      status,
      released_at,
      released_by,
      cancelled_at,
      cancelled_by
    FROM sales
    WHERE id=7
  `).get();

const returns7=
  db.prepare(`
    SELECT COUNT(*) AS c
    FROM sale_returns
    WHERE sale_id=7
  `).get().c;

const testReturns=
  db.prepare(`
    SELECT COUNT(*) AS c
    FROM sale_returns
    WHERE reason=
      'SIMULACAO ROLLBACK RETURN ACCOUNTING V1.6'
  `).get().c;

const testReversals=
  db.prepare(`
    SELECT COUNT(*) AS c
    FROM sale_return_payment_reversals
    WHERE reason=
      'SIMULACAO ROLLBACK RETURN ACCOUNTING V1.6'
  `).get().c;

console.log('');
console.log('SQLITE INTEGRITY:',integrity);
console.log('VENDA #7:',sale7);
console.log('RETURNS #7:',returns7);
console.log(
  'SIMULATED RETURNS LEFT:',
  testReturns
);
console.log(
  'SIMULATED REVERSALS LEFT:',
  testReversals
);

if(
  sale7 &&
  sale7.status!=='CANCELLED'
){
  console.error(
    'SALE_7_CHANGED'
  );
  process.exit(71);
}

if(Number(returns7)!==0){
  console.error(
    'SALE_7_RETURN_CHANGED'
  );
  process.exit(72);
}

if(
  Number(testReturns)!==0 ||
  Number(testReversals)!==0
){
  console.error(
    'ROLLBACK_RESIDUE_FOUND'
  );
  process.exit(73);
}

console.log('');
console.log('DATABASE FINAL CHECK: PASS');
console.log('VENDA #7: PRESERVADA');
console.log('SIMULACAO: ZERO RESIDUOS');
console.log('DEVOLUCAO REAL EXECUTADA: NAO');
