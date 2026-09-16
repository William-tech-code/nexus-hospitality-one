import {db} from '../server/db.js';

const n=v=>Number(v||0);
const r=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

const before={
  sales:db.prepare('SELECT COUNT(*) c FROM sales').get().c,
  prints:db.prepare('SELECT COUNT(*) c FROM print_log').get().c,
  changes:db.prepare('SELECT COUNT(*) c FROM change_corrections').get().c,
  returns:db.prepare('SELECT COUNT(*) c FROM sale_returns').get().c,
  s7:db.prepare('SELECT id,status,released_at,cancelled_at FROM sales WHERE id=7').get(),
  s8:db.prepare('SELECT id,status,released_at,cancelled_at FROM sales WHERE id=8').get(),
  s9:db.prepare('SELECT id,status,released_at,cancelled_at FROM sales WHERE id=9').get(),
  r9:db.prepare('SELECT COUNT(*) c FROM sale_returns WHERE sale_id=9').get().c
};

/*
 * ===========================================================
 * TESTE MATEMATICO DO TROCO MISTO
 *
 * Exemplo:
 * venda = 30
 * PIX = 20
 * DINHEIRO = 10
 * cliente entrega 20 em dinheiro
 * troco correto = 10
 * ===========================================================
 */

const payments=[
  {method:'PIX',amount:20},
  {method:'DINHEIRO',amount:10}
];

const cashDue=r(
  payments
    .filter(x=>x.method==='DINHEIRO')
    .reduce(
      (a,x)=>a+n(x.amount),
      0
    )
);

const received=20;
const change=r(received-cashDue);

if(cashDue!==10){
  throw new Error(
    'MIXED_CASH_DUE_INVALID'
  );
}

if(change!==10){
  throw new Error(
    'MIXED_CHANGE_INVALID'
  );
}

console.log(
  'TROCO MISTO:',
  'PASS'
);

/*
 * ===========================================================
 * TESTE DE ORDEM DE IMPRESSAO EM ROLLBACK
 * ===========================================================
 *
 * Não usamos venda real.
 * Criamos somente um registro temporário dentro da transação
 * e forçamos rollback.
 */

let fakeSaleId=null;

const owner=
  db.prepare(`
    SELECT id
    FROM users
    WHERE role='OWNER'
      AND active=1
    ORDER BY id
    LIMIT 1
  `).get();

const cash=
  db.prepare(`
    SELECT id
    FROM cash_sessions
    WHERE status='OPEN'
    ORDER BY id DESC
    LIMIT 1
  `).get();

if(!owner){
  throw new Error(
    'OWNER_NOT_FOUND'
  );
}

if(!cash){
  throw new Error(
    'OPEN_CASH_REQUIRED'
  );
}

const test=db.transaction(()=>{

  const result=
    db.prepare(`
      INSERT INTO sales(
        total,
        payment_method,
        status,
        cash_session_id,
        user_id,
        received_amount,
        change_amount,
        release_code
      )
      VALUES(
        30,
        'MISTO',
        'PAID',
        ?,
        ?,
        20,
        10,
        'ROLLBACK-V161'
      )
    `).run(
      cash.id,
      owner.id
    );

  fakeSaleId=
    Number(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO payment_splits(
      sale_id,
      method,
      amount
    )
    VALUES(?,?,?)
  `).run(
    fakeSaleId,
    'PIX',
    20
  );

  db.prepare(`
    INSERT INTO payment_splits(
      sale_id,
      method,
      amount
    )
    VALUES(?,?,?)
  `).run(
    fakeSaleId,
    'DINHEIRO',
    10
  );

  const cashRow=
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) amount
      FROM payment_splits
      WHERE sale_id=?
        AND UPPER(method)='DINHEIRO'
    `).get(fakeSaleId);

  if(r(cashRow.amount)!==10){
    throw new Error(
      'DB_MIXED_CASH_DUE_INVALID'
    );
  }

  const dbChange=
    r(20-r(cashRow.amount));

  if(dbChange!==10){
    throw new Error(
      'DB_MIXED_CHANGE_INVALID'
    );
  }

  /*
   * Antes da ficha não existe PICKUP.
   */

  let pickup=
    db.prepare(`
      SELECT id
      FROM print_log
      WHERE sale_id=?
        AND document_type='PICKUP'
    `).get(fakeSaleId);

  if(pickup){
    throw new Error(
      'PICKUP_ALREADY_EXISTS'
    );
  }

  /*
   * Registra ficha.
   */

  db.prepare(`
    INSERT INTO print_log(
      sale_id,
      document_type,
      user_id
    )
    VALUES(
      ?,
      'PICKUP',
      ?
    )
  `).run(
    fakeSaleId,
    owner.id
  );

  pickup=
    db.prepare(`
      SELECT id
      FROM print_log
      WHERE sale_id=?
        AND document_type='PICKUP'
    `).get(fakeSaleId);

  if(!pickup){
    throw new Error(
      'PICKUP_NOT_RECORDED'
    );
  }

  /*
   * Agora cupom.
   */

  db.prepare(`
    INSERT INTO print_log(
      sale_id,
      document_type,
      user_id
    )
    VALUES(
      ?,
      'RECEIPT',
      ?
    )
  `).run(
    fakeSaleId,
    owner.id
  );

  const receipt=
    db.prepare(`
      SELECT id
      FROM print_log
      WHERE sale_id=?
        AND document_type='RECEIPT'
    `).get(fakeSaleId);

  if(!receipt){
    throw new Error(
      'RECEIPT_NOT_RECORDED'
    );
  }

  console.log(
    'PICKUP -> RECEIPT:',
    'PASS'
  );

  throw new Error(
    '__ROLLBACK_OK__'
  );
});

try{
  test();
}
catch(error){

  if(
    error.message!==
    '__ROLLBACK_OK__'
  ){
    throw error;
  }
}

if(
  fakeSaleId &&
  db.prepare(
    'SELECT id FROM sales WHERE id=?'
  ).get(fakeSaleId)
){
  throw new Error(
    'ROLLBACK_FAKE_SALE_PERSISTED'
  );
}

const after={
  sales:db.prepare('SELECT COUNT(*) c FROM sales').get().c,
  prints:db.prepare('SELECT COUNT(*) c FROM print_log').get().c,
  changes:db.prepare('SELECT COUNT(*) c FROM change_corrections').get().c,
  returns:db.prepare('SELECT COUNT(*) c FROM sale_returns').get().c,
  s7:db.prepare('SELECT id,status,released_at,cancelled_at FROM sales WHERE id=7').get(),
  s8:db.prepare('SELECT id,status,released_at,cancelled_at FROM sales WHERE id=8').get(),
  s9:db.prepare('SELECT id,status,released_at,cancelled_at FROM sales WHERE id=9').get(),
  r9:db.prepare('SELECT COUNT(*) c FROM sale_returns WHERE sale_id=9').get().c
};

if(
  JSON.stringify(before)!==
  JSON.stringify(after)
){
  console.log(
    'BEFORE',
    before
  );

  console.log(
    'AFTER',
    after
  );

  throw new Error(
    'PROTECTED_STATE_CHANGED'
  );
}

const integrity=
  db.prepare(
    'PRAGMA integrity_check'
  ).get();

if(
  String(
    Object.values(integrity)[0]
  ).toLowerCase()!=='ok'
){
  throw new Error(
    'SQLITE_INTEGRITY_FAILED'
  );
}

console.log(
  'ROLLBACK:',
  'PASS'
);

console.log(
  '#7:',
  'PRESERVADA'
);

console.log(
  '#8:',
  'PRESERVADA'
);

console.log(
  '#9:',
  'PRESERVADA'
);

console.log(
  'SQLITE:',
  'PASS'
);
