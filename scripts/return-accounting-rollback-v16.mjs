import { db } from '../server/db.js';
import { cashSummary } from '../server/transaction-engine.js';

const cash=db.prepare(`
  SELECT *
  FROM cash_sessions
  WHERE status='OPEN'
  ORDER BY id DESC
  LIMIT 1
`).get();

if(!cash){
  console.error('NO_OPEN_CASH');
  process.exit(60);
}

/*
 * Escolhemos uma venda PAID do caixa atual
 * apenas para simulacao.
 */

const sale=db.prepare(`
  SELECT
    s.*
  FROM sales s
  WHERE s.cash_session_id=?
    AND s.status='PAID'
    AND EXISTS(
      SELECT 1
      FROM payment_splits ps
      WHERE ps.sale_id=s.id
    )
  ORDER BY s.id DESC
  LIMIT 1
`).get(cash.id);

if(!sale){
  console.log(
    'SEM VENDA PAID PARA SIMULACAO.'
  );
  console.log(
    'TESTE TRANSACIONAL IGNORADO COM SEGURANCA.'
  );
  process.exit(0);
}

const payment=db.prepare(`
  SELECT *
  FROM payment_splits
  WHERE sale_id=?
  ORDER BY id
  LIMIT 1
`).get(sale.id);

if(!payment){
  console.error('PAYMENT_NOT_FOUND');
  process.exit(61);
}

const before=
  cashSummary(cash.id);

const testAmount=
  Math.min(
    0.01,
    Number(payment.amount)
  );

if(testAmount<=0){
  console.error('INVALID_TEST_AMOUNT');
  process.exit(62);
}

console.log('');
console.log('VENDA USADA NA SIMULACAO:',sale.id);
console.log('METODO:',payment.method);
console.log('VALOR TEMPORARIO:',testAmount);

db.exec('BEGIN IMMEDIATE');

try{

  /*
   * Criamos somente registros temporarios dentro
   * da transacao que sera revertida.
   */

  const ret=db.prepare(`
    INSERT INTO sale_returns(
      sale_id,
      reason,
      total,
      user_id
    )
    VALUES(?,?,?,?)
  `).run(
    sale.id,
    'SIMULACAO ROLLBACK RETURN ACCOUNTING V1.6',
    testAmount,
    sale.user_id || 1
  );

  db.prepare(`
    INSERT INTO sale_return_payment_reversals(
      return_id,
      sale_id,
      payment_split_id,
      method,
      amount,
      status,
      user_id,
      reason
    )
    VALUES(
      ?,?,?,?,?, 'RECORDED', ?,?
    )
  `).run(
    ret.lastInsertRowid,
    sale.id,
    payment.id,
    payment.method,
    testAmount,
    sale.user_id || 1,
    'SIMULACAO ROLLBACK RETURN ACCOUNTING V1.6'
  );

  const during=
    cashSummary(cash.id);

  const beforeMethod=
    Number(
      before.methods[payment.method] || 0
    );

  const duringMethod=
    Number(
      during.methods[payment.method] || 0
    );

  const methodDelta=
    Number(
      (
        beforeMethod-
        duringMethod
      ).toFixed(6)
    );

  const revenueDelta=
    Number(
      (
        Number(before.sales.revenue)-
        Number(during.sales.revenue)
      ).toFixed(6)
    );

  console.log('');
  console.log(
    'DELTA METODO:',
    methodDelta
  );

  console.log(
    'DELTA RECEITA:',
    revenueDelta
  );

  if(
    Math.abs(
      methodDelta-testAmount
    )>0.000001
  ){
    throw new Error(
      'PAYMENT_METHOD_NOT_REDUCED'
    );
  }

  if(
    Math.abs(
      revenueDelta-testAmount
    )>0.000001
  ){
    throw new Error(
      'REVENUE_NOT_REDUCED'
    );
  }

  if(
    String(payment.method).toUpperCase()
      ==='DINHEIRO'
  ){

    const expectedDelta=
      Number(
        (
          Number(before.expected_cash)-
          Number(during.expected_cash)
        ).toFixed(6)
      );

    console.log(
      'DELTA CAIXA FISICO:',
      expectedDelta
    );

    if(
      Math.abs(
        expectedDelta-testAmount
      )>0.000001
    ){
      throw new Error(
        'EXPECTED_CASH_NOT_REDUCED'
      );
    }
  }

  db.exec('ROLLBACK');

  const after=
    cashSummary(cash.id);

  const stable=
    JSON.stringify(before)===
    JSON.stringify(after);

  if(!stable){
    console.error('');
    console.error(
      'ROLLBACK_SUMMARY_MISMATCH'
    );
    process.exit(63);
  }

  const leakedReturn=
    db.prepare(`
      SELECT COUNT(*) AS c
      FROM sale_returns
      WHERE reason=
        'SIMULACAO ROLLBACK RETURN ACCOUNTING V1.6'
    `).get().c;

  const leakedReversal=
    db.prepare(`
      SELECT COUNT(*) AS c
      FROM sale_return_payment_reversals
      WHERE reason=
        'SIMULACAO ROLLBACK RETURN ACCOUNTING V1.6'
    `).get().c;

  if(
    Number(leakedReturn)!==0 ||
    Number(leakedReversal)!==0
  ){
    console.error(
      'ROLLBACK_LEFT_RECORDS'
    );
    process.exit(64);
  }

  console.log('');
  console.log(
    'RETURN ACCOUNTING SIMULATION: PASS'
  );

  console.log(
    'PAYMENT REVERSAL: PASS'
  );

  console.log(
    'REVENUE REVERSAL: PASS'
  );

  console.log(
    'ROLLBACK: PASS'
  );

  console.log(
    'BANCO RESTAURADO: PASS'
  );

}catch(error){

  try{
    db.exec('ROLLBACK');
  }catch{}

  console.error('');
  console.error(
    'SIMULATION_FAILURE:',
    error?.message || error
  );

  process.exit(65);
}
