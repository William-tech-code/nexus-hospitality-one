import fs from 'node:fs';
import { db } from '../server/db.js';
import { cashSummary } from '../server/transaction-engine.js';

const before=JSON.parse(
  fs.readFileSync(
    './scripts/final-return-sale9-before.json',
    'utf8'
  )
);

const sale=db.prepare(`
  SELECT *
  FROM sales
  WHERE id=9
`).get();

const returns=db.prepare(`
  SELECT *
  FROM sale_returns
  WHERE sale_id=9
  ORDER BY id
`).all();

const returnItems=db.prepare(`
  SELECT sri.*
  FROM sale_return_items sri
  JOIN sale_returns sr
    ON sr.id=sri.return_id
  WHERE sr.sale_id=9
  ORDER BY sri.id
`).all();

const reversals=db.prepare(`
  SELECT *
  FROM sale_return_payment_reversals
  WHERE sale_id=9
  ORDER BY id
`).all();

const audit=db.prepare(`
  SELECT *
  FROM audit_log
  WHERE entity='SALE'
    AND entity_id='9'
  ORDER BY id DESC
`).all();

const afterSummary=
  cashSummary(sale.cash_session_id);

const checks={};

checks.STATUS_PAID =
  sale.status==='PAID';

checks.ENTREGA_PRESERVADA =
  Boolean(sale.released_at) &&
  Boolean(sale.released_by);

checks.UMA_DEVOLUCAO =
  returns.length===1;

checks.UM_ITEM_DEVOLVIDO =
  returnItems.length===1 &&
  Math.abs(Number(returnItems[0].qty)-1)<0.000001;

const returnTotal=
  returns.reduce(
    (s,x)=>s+Number(x.total||0),
    0
  );

const reversalTotal=
  reversals.reduce(
    (s,x)=>s+Number(x.amount||0),
    0
  );

checks.RETURN_R9 =
  Math.abs(returnTotal-9)<0.01;

checks.REVERSAO_R9 =
  Math.abs(reversalTotal-9)<0.01;

let inventoryOK=true;

for(const row of before.ledger){

  const afterProduct=db.prepare(`
    SELECT *
    FROM products
    WHERE id=?
  `).get(row.product_id);

  const beforeInv=
    before.inventory[row.product_id];

  const expectedStock=
    Number(beforeInv.product.stock) -
    Number(row.stock_delta);

  if(
    Math.abs(
      Number(afterProduct.stock)-
      expectedStock
    )>0.000001
  ){
    inventoryOK=false;
  }

  if(beforeInv.profile){

    const afterProfile=db.prepare(`
      SELECT *
      FROM inventory_profiles
      WHERE product_id=?
    `).get(row.product_id);

    const expectedClosed=
      Number(beforeInv.profile.closed_units) -
      Number(row.closed_delta);

    const expectedOpen=
      Number(beforeInv.profile.open_base) -
      Number(row.open_delta);

    if(
      Math.abs(
        Number(afterProfile?.closed_units||0)-
        expectedClosed
      )>0.000001
    ){
      inventoryOK=false;
    }

    if(
      Math.abs(
        Number(afterProfile?.open_base||0)-
        expectedOpen
      )>0.000001
    ){
      inventoryOK=false;
    }
  }
}

checks.ESTOQUE_RESTAURADO =
  inventoryOK;

const beforeRevenue=
  Number(before.summary.sales.revenue);

const afterRevenue=
  Number(afterSummary.sales.revenue);

checks.FATURAMENTO_REVERTIDO =
  Math.abs(
    (beforeRevenue-afterRevenue)-9
  )<0.01;

const beforeCash=
  Number(before.summary.expected_cash);

const afterCash=
  Number(afterSummary.expected_cash);

checks.CAIXA_REVERTIDO =
  Math.abs(
    (beforeCash-afterCash)-9
  )<0.01;

const beforeDinheiro=
  Number(before.summary.methods.DINHEIRO||0);

const afterDinheiro=
  Number(afterSummary.methods.DINHEIRO||0);

checks.DINHEIRO_REVERTIDO =
  Math.abs(
    (beforeDinheiro-afterDinheiro)-9
  )<0.01;

checks.AUDITORIA_V16 =
  audit.some(
    x=>String(x.action)==='SALE_RETURNED_V16'
  );

const sale7=db.prepare(`
  SELECT *
  FROM sales
  WHERE id=7
`).get();

const return7=db.prepare(`
  SELECT COUNT(*) c
  FROM sale_returns
  WHERE sale_id=7
`).get().c;

checks.VENDA_7_PRESERVADA =
  sale7.status==='CANCELLED' &&
  Number(return7)===0;

console.log('');
console.log('RETURN:');
console.table(returns);

console.log('');
console.log('RETURN ITEMS:');
console.table(returnItems);

console.log('');
console.log('REVERSOES:');
console.table(reversals);

console.log('');
console.log('AUDITORIA:');
console.table(audit);

console.log('');
console.log('==============================================');
console.log('CHECKS');
console.log('==============================================');

console.table(checks);

console.log('');
console.log('RECEITA ANTES:',beforeRevenue);
console.log('RECEITA DEPOIS:',afterRevenue);
console.log('CAIXA ANTES:',beforeCash);
console.log('CAIXA DEPOIS:',afterCash);
console.log('RETURN TOTAL:',returnTotal);
console.log('REVERSAO TOTAL:',reversalTotal);

const failed=
  Object.entries(checks)
    .filter(([,v])=>!v)
    .map(([k])=>k);

if(failed.length){

  console.error('');
  console.error(
    'FALHAS:',
    failed
  );

  process.exit(80);
}

const integrity=
  db.prepare(
    'PRAGMA integrity_check'
  ).get();

console.log('');
console.log('SQLITE:',integrity);

console.log('');
console.log('==============================================');
console.log('RETURN V1.6 HOMOLOGADO COM SUCESSO');
console.log('VENDA #9: PASS');
console.log('ENTREGA: PASS');
console.log('DEVOLUCAO R$ 9: PASS');
console.log('ESTOQUE: PASS');
console.log('REVERSAO FINANCEIRA: PASS');
console.log('CAIXA: PASS');
console.log('FATURAMENTO: PASS');
console.log('AUDITORIA: PASS');
console.log('VENDA #7: PRESERVADA');
console.log('==============================================');
