import {db} from '../server/db.js';

import {
  returnCoverage,
  returnableItems
} from '../server/return-engine-v16.js';

const n=v=>Number(v||0);

const integrity=
  db.prepare(
    'PRAGMA integrity_check'
  ).get();

const integrityValue=
  String(
    Object.values(integrity)[0]
  ).toLowerCase();

if(integrityValue!=='ok'){
  throw new Error(
    'SQLITE_INTEGRITY_FAILED'
  );
}

/*
 * Evidências protegidas.
 */
const sale7=db.prepare(`
  SELECT
    id,status,released_at,cancelled_at
  FROM sales
  WHERE id=7
`).get();

const sale8=db.prepare(`
  SELECT
    id,status,released_at,cancelled_at
  FROM sales
  WHERE id=8
`).get();

const sale9=db.prepare(`
  SELECT
    id,status,released_at,cancelled_at
  FROM sales
  WHERE id=9
`).get();

const returns9=n(
  db.prepare(`
    SELECT COUNT(*) c
    FROM sale_returns
    WHERE sale_id=9
  `).get()?.c
);

if(sale7?.status!=='CANCELLED'){
  throw new Error(
    'SALE7_CHANGED'
  );
}

if(sale8?.status!=='PAID'){
  throw new Error(
    'SALE8_CHANGED'
  );
}

if(sale9?.status!=='PAID'){
  throw new Error(
    'SALE9_CHANGED'
  );
}

if(returns9!==1){
  throw new Error(
    'SALE9_RETURN_COUNT_CHANGED'
  );
}

const coverage8=
  returnCoverage(8);

const coverage9=
  returnCoverage(9);

console.log(
  'SALE8 COVERAGE:',
  coverage8
);

console.log(
  'SALE9 COVERAGE:',
  coverage9
);

if(
  coverage8.status!==
  'SEM_DEVOLUCAO'
){
  throw new Error(
    'SALE8_COVERAGE_INVALID'
  );
}

if(
  coverage9.status!==
  'DEVOLVIDA'
){
  throw new Error(
    'SALE9_COVERAGE_INVALID'
  );
}

/*
 * Confirma saldo dos itens.
 */
console.log(
  'SALE8 ITEMS:',
  returnableItems(8)
);

console.log(
  'SALE9 ITEMS:',
  returnableItems(9)
);

console.log(
  'SQLITE: PASS'
);

console.log(
  '#7: PRESERVADA'
);

console.log(
  '#8: SEM DEVOLUCAO'
);

console.log(
  '#9: DEVOLVIDA'
);
