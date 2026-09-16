import fs from 'node:fs';
import {db} from '../server/db.js';

const files=[
  './server/operation-v14.js',
  './server/operation-v16.js',
  './server/transaction-engine.js',
  './server/return-engine-v16.js',
  './server/return-routes-v16.js',
  './src/SmartPOSV16.jsx',
  './src/RecentSalesV16.jsx',
  './src/BusinessV15.jsx',
  './src/api.js'
];

const out=[];

const add=(...x)=>{
  const line=x.map(v=>
    typeof v==='string'
      ? v
      : JSON.stringify(v,null,2)
  ).join(' ');

  out.push(line);
  console.log(line);
};

add('============================================================');
add('NEXUS HOSPITALITY ONE V1.6.1');
add('FINAL OPERATIONAL CLOSING MAP');
add('============================================================');

for(const file of files){

  add('');
  add('============================================================');
  add('FILE:',file);
  add('============================================================');

  if(!fs.existsSync(file)){
    add('FILE_NOT_FOUND');
    continue;
  }

  const text=fs.readFileSync(file,'utf8');
  const lines=text.split(/\r?\n/);

  const patterns=[
    /change/i,
    /troco/i,
    /received/i,
    /payment/i,
    /pagamento/i,
    /release/i,
    /liberad/i,
    /retirad/i,
    /pickup/i,
    /print/i,
    /impress/i,
    /receipt/i,
    /cupom/i,
    /comprovante/i,
    /print_log/i,
    /change_correction/i,
    /sales\/recent/i,
    /return_coverage/i,
    /cancel/i
  ];

  const hits=new Set();

  lines.forEach((line,index)=>{

    if(patterns.some(p=>p.test(line))){

      const start=Math.max(
        0,
        index-5
      );

      const end=Math.min(
        lines.length-1,
        index+10
      );

      for(let i=start;i<=end;i++){
        hits.add(i);
      }
    }
  });

  [...hits]
    .sort((a,b)=>a-b)
    .forEach(i=>{
      add(
        String(i+1).padStart(5,'0')+
        ' | '+
        lines[i]
      );
    });
}

add('');
add('============================================================');
add('DATABASE SCHEMA');
add('============================================================');

const tables=[
  'sales',
  'sale_items',
  'payment_splits',
  'cash_sessions',
  'cash_movements',
  'print_log',
  'change_corrections',
  'sale_returns',
  'sale_return_items',
  'sale_payment_reversals',
  'sale_return_payment_reversals',
  'sale_inventory_ledger',
  'sale_item_inventory_ledger',
  'audit_log'
];

for(const table of tables){

  const exists=db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name=?
  `).get(table);

  add('');
  add('TABLE:',table);

  if(!exists){
    add('NOT_FOUND');
    continue;
  }

  const cols=db.prepare(
    `PRAGMA table_info(${table})`
  ).all();

  add(cols);
}

add('');
add('============================================================');
add('PROTECTED SALES');
add('============================================================');

for(const id of [7,8,9]){

  const sale=db.prepare(`
    SELECT *
    FROM sales
    WHERE id=?
  `).get(id);

  add('');
  add('SALE',id);
  add(sale||null);

  if(!sale)continue;

  add(
    'PAYMENTS',
    db.prepare(`
      SELECT *
      FROM payment_splits
      WHERE sale_id=?
      ORDER BY id
    `).all(id)
  );

  add(
    'PRINT LOG',
    db.prepare(`
      SELECT *
      FROM print_log
      WHERE sale_id=?
      ORDER BY id
    `).all(id)
  );

  add(
    'CHANGE CORRECTIONS',
    db.prepare(`
      SELECT *
      FROM change_corrections
      WHERE sale_id=?
      ORDER BY id
    `).all(id)
  );

  add(
    'RETURNS',
    db.prepare(`
      SELECT *
      FROM sale_returns
      WHERE sale_id=?
      ORDER BY id
    `).all(id)
  );
}

add('');
add('============================================================');
add('CURRENT CASH SESSION');
add('============================================================');

const cash=db.prepare(`
  SELECT *
  FROM cash_sessions
  WHERE status='OPEN'
  ORDER BY id DESC
  LIMIT 1
`).get();

add(cash||null);

if(cash){

  const movements=db.prepare(`
    SELECT *
    FROM cash_movements
    WHERE cash_session_id=?
    ORDER BY id DESC
    LIMIT 30
  `).all(cash.id);

  add(
    'MOVEMENTS',
    movements
  );
}

add('');
add('============================================================');
add('OPERATIONAL COUNTS');
add('============================================================');

const count=t=>{

  try{
    return db.prepare(
      `SELECT COUNT(*) c FROM ${t}`
    ).get().c;

  }catch{
    return null;
  }
};

for(const table of tables){
  add(
    table,
    count(table)
  );
}

const integrity=db.prepare(
  'PRAGMA integrity_check'
).get();

add('');
add(
  'SQLITE INTEGRITY',
  integrity
);

add('');
add('============================================================');
add('STATIC FLAGS');
add('============================================================');

const read=f=>
  fs.existsSync(f)
    ? fs.readFileSync(f,'utf8')
    : '';

const op14=read(
  './server/operation-v14.js'
);

const op16=read(
  './server/operation-v16.js'
);

const pos=read(
  './src/SmartPOSV16.jsx'
);

const business=read(
  './src/BusinessV15.jsx'
);

const api=read(
  './src/api.js'
);

const flags={

  CHANGE_CORRECTION_ROUTE:
    /change-correction/i.test(op14),

  RECEIVED_AMOUNT:
    /received_amount/i.test(op14),

  CHANGE_AMOUNT:
    /change_amount/i.test(op14),

  RELEASE_ROUTE:
    /release/i.test(op14),

  PRINT_ROUTE:
    /print/i.test(op14),

  PRINT_LOG:
    /print_log/i.test(op14),

  PICKUP:
    /PICKUP/i.test(op14+pos+business),

  RECEIPT:
    /RECEIPT/i.test(op14+pos+business),

  RETURN_COVERAGE_RECENT:
    /return_coverage:\s*returnCoverage\(row\.id\)/.test(op16),

  RETURN_COVERAGE_DETAIL:
    /return_coverage:\s*returnCoverage\(sale\.id\)/.test(op16),

  API_CHANGE_CORRECTION:
    /changeCorrectionV14/i.test(api),

  API_RELEASE:
    /release/i.test(api),

  API_PRINT:
    /print/i.test(api),

  BUSINESS_RETURN_STATUS:
    /DEVOLUÇÃO PARCIAL|DEVOLVIDA/.test(business),

  POS_RELEASE:
    /release/i.test(pos),

  POS_PRINT:
    /print/i.test(pos)
};

for(
  const [name,value]
  of Object.entries(flags)
){
  add(
    name,
    value?'SIM':'NAO'
  );
}

add('');
add('============================================================');
add('FINAL SAFETY');
add('============================================================');
add('VENDA CRIADA: NAO');
add('DEVOLUCAO EXECUTADA: NAO');
add('CANCELAMENTO EXECUTADO: NAO');
add('ESTOQUE ALTERADO: NAO');
add('CAIXA ALTERADO: NAO');
add('PRINT LOG ALTERADO: NAO');
add('============================================================');

const output=process.argv[2];

fs.writeFileSync(
  output,
  out.join('\n'),
  'utf8'
);

console.log('');
console.log(
  'REPORT:',
  output
);
