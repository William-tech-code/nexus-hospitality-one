import fs from 'node:fs';
import {db} from '../server/db.js';
import {returnCoverage} from '../server/return-engine-v16.js';

const op14=
  fs.readFileSync(
    './server/operation-v14.js',
    'utf8'
  );

const op16=
  fs.readFileSync(
    './server/operation-v16.js',
    'utf8'
  );

const business=
  fs.readFileSync(
    './src/BusinessV15.jsx',
    'utf8'
  );

const recent=
  fs.readFileSync(
    './src/RecentSalesV16.jsx',
    'utf8'
  );

const pos=
  fs.readFileSync(
    './src/SmartPOSV16.jsx',
    'utf8'
  );

const checks={

  PAYMENT_REQUIRED:
    op14.includes(
      'PAGAMENTO_NAO_CONFIRMADO'
    ),

  MIXED_CASH_CALCULATION:
    op14.includes(
      "UPPER(method)='DINHEIRO'"
    ),

  CHANGE_NO_CASH_GUARD:
    op14.includes(
      'VENDA_SEM_PAGAMENTO_EM_DINHEIRO'
    ),

  CHANGE_INSUFFICIENT_GUARD:
    op14.includes(
      'VALOR_RECEBIDO_INSUFICIENTE'
    ),

  RELEASE_PAYMENT_GUARD:
    op14.includes(
      'PAGAMENTO_NAO_CONFIRMADO'
    ),

  RELEASE_DUPLICATE_GUARD:
    op14.includes(
      'VENDA_JA_LIBERADA'
    ),

  RELEASE_CODE_GUARD:
    op14.includes(
      'FICHA_RETIRADA_NAO_GERADA'
    ),

  RELEASE_PICKUP_GUARD:
    op14.includes(
      'FICHA_RETIRADA_NAO_IMPRESSA'
    ),

  PRINT_PICKUP:
    op14.includes(
      "'PICKUP'"
    ),

  PRINT_RECEIPT:
    op14.includes(
      "'RECEIPT'"
    ),

  PRINT_ORDER_GUARD:
    op14.includes(
      'IMPRIMA_FICHA_RETIRADA_ANTES_DO_CUPOM'
    ),

  PRINT_AUDIT:
    op14.includes(
      'DOCUMENT_PRINTED'
    ),

  LEGACY_RETURN_DISABLED:
    op14.includes(
      'DEVOLUCAO_LEGADA_DESATIVADA_USE_V16'
    ),

  V16_RETURN_RECENT:
    op16.includes(
      'return_coverage: returnCoverage(row.id)'
    ),

  V16_RETURN_DETAIL:
    op16.includes(
      'return_coverage: returnCoverage(sale.id)'
    ),

  BUSINESS_PREVIEW:
    business.includes(
      'returnPreviewV16'
    ),

  BUSINESS_RETURNABLE:
    business.includes(
      'returnable_qty'
    ),

  RECENT_RETURNED:
    recent.includes(
      "return 'DEVOLVIDA'"
    ),

  RECENT_PARTIAL:
    recent.includes(
      "return 'DEVOLUÇÃO PARCIAL'"
    ),

  POS_CONFIRM_PAYMENT:
    pos.includes(
      'CONFIRMAR RECEBIMENTO'
    ),

  POS_PICKUP:
    pos.includes(
      "print('PICKUP')"
    ),

  POS_RECEIPT:
    pos.includes(
      "print('RECEIPT')"
    ),

  POS_RELEASE:
    pos.includes(
      'releaseSaleV14'
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

  if(!value){
    fail=true;
  }
}

const c8=
  returnCoverage(8);

const c9=
  returnCoverage(9);

console.log(
  'SALE8:',
  c8.status
);

console.log(
  'SALE9:',
  c9.status
);

if(
  c8.status!==
  'SEM_DEVOLUCAO'
){
  fail=true;
}

if(
  c9.status!==
  'DEVOLVIDA'
){
  fail=true;
}

const s7=
  db.prepare(
    'SELECT status FROM sales WHERE id=7'
  ).get();

if(
  s7?.status!==
  'CANCELLED'
){
  fail=true;
}

const integrity=
  db.prepare(
    'PRAGMA integrity_check'
  ).get();

const sqliteOk=
  String(
    Object.values(integrity)[0]
  ).toLowerCase()==='ok';

console.log(
  'SQLITE:',
  sqliteOk?'PASS':'FAIL'
);

if(!sqliteOk){
  fail=true;
}

if(fail){
  process.exit(1);
}
