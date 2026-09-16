import fs from 'node:fs';
import {db} from '../server/db.js';
import {returnCoverage} from '../server/return-engine-v16.js';

const op=fs.readFileSync(
  './server/operation-v16.js',
  'utf8'
);

const engine=fs.readFileSync(
  './server/return-engine-v16.js',
  'utf8'
);

const checks={
  COVERAGE_IMPORT:
    op.includes(
      "import { returnCoverage } from './return-engine-v16.js';"
    ),

  RECENT_COVERAGE:
    op.includes(
      'return_coverage: returnCoverage(row.id)'
    ),

  DETAIL_COVERAGE:
    op.includes(
      'return_coverage: returnCoverage(sale.id)'
    ),

  ITEM_LEDGER_RETURN:
    engine.includes(
      'sale_item_inventory_ledger'
    ),

  MULTI_ITEM_HISTORY_GUARD:
    engine.includes(
      'DEVOLUCAO_HISTORICA_MULTITEM_NAO_SUPORTADA'
    ),

  SMART_PARTIAL_GUARD:
    engine.includes(
      'DEVOLUCAO_PARCIAL_ESTOQUE_INTELIGENTE_BLOQUEADA'
    ),

  EXCESS_GUARD:
    engine.includes(
      'DEVOLUCAO_EXCEDE_SALDO'
    ),

  COVERAGE_FUNCTION:
    engine.includes(
      'function returnCoverage'
    )
};

let fail=false;

for(
  const [name,value]
  of Object.entries(checks)
){
  console.log(
    name+':',
    value?'PASS':'FAIL'
  );

  if(!value)fail=true;
}

const c8=returnCoverage(8);
const c9=returnCoverage(9);

console.log(
  'SALE8:',
  c8.status
);

console.log(
  'SALE9:',
  c9.status
);

if(c8.status!=='SEM_DEVOLUCAO'){
  fail=true;
}

if(c9.status!=='DEVOLVIDA'){
  fail=true;
}

const integrity=
  db.prepare(
    'PRAGMA integrity_check'
  ).get();

const ok=
  String(
    Object.values(integrity)[0]
  ).toLowerCase()==='ok';

console.log(
  'SQLITE:',
  ok?'PASS':'FAIL'
);

if(!ok)fail=true;

if(fail)process.exit(1);
