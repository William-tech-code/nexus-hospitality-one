import { db } from '../server/db.js';

const table=db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
    AND name='sale_return_payment_reversals'
`).get();

if(!table){
  console.error(
    'TABELA_REVERSAO_RETURN_NAO_CRIADA'
  );
  process.exit(80);
}

const columns=
  db.prepare(`
    PRAGMA table_info(
      sale_return_payment_reversals
    )
  `).all();

console.log('');
console.log('COLUNAS REVERSAO FINANCEIRA:');
console.table(columns);

const sale7=
  db.prepare(`
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

if(sale7 && sale7.status!=='CANCELLED'){
  console.error(
    'VENDA_7_NAO_ESTA_CANCELLED'
  );
  process.exit(81);
}

const return7=
  db.prepare(`
    SELECT COUNT(*) AS c
    FROM sale_returns
    WHERE sale_id=7
  `).get().c;

if(return7!==0){
  console.error(
    'VENDA_7_RECEBEU_DEVOLUCAO_INESPERADA'
  );
  process.exit(82);
}

console.log('');
console.log('ESTRUTURA RETURN V1.6: PASS');
console.log('VENDA #7: PRESERVADA');
console.log('DEVOLUCAO #7: NAO EXISTE');
