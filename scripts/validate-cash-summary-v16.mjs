import { db } from '../server/db.js';
import { cashSummary } from '../server/transaction-engine.js';

const cs=db.prepare(`
  SELECT *
  FROM cash_sessions
  WHERE status='OPEN'
  ORDER BY id DESC
  LIMIT 1
`).get();

if(!cs){
  console.error('CASH_SESSION_REQUIRED');
  process.exit(50);
}

const summary=
  cashSummary(cs.id);

console.log('');
console.log('CASH SESSION:',cs.id);

console.log('');
console.log('SUMMARY ATUAL:');
console.dir(summary,{depth:5});

if(
  !summary ||
  !summary.sales ||
  !summary.methods
){
  console.error('INVALID_CASH_SUMMARY');
  process.exit(51);
}

if(
  !Object.prototype.hasOwnProperty.call(
    summary.sales,
    'gross_revenue'
  )
){
  console.error(
    'GROSS_REVENUE_NOT_EXPOSED'
  );
  process.exit(52);
}

if(
  !Object.prototype.hasOwnProperty.call(
    summary.sales,
    'returns'
  )
){
  console.error(
    'RETURNS_NOT_EXPOSED'
  );
  process.exit(53);
}

console.log('');
console.log('CASH SUMMARY STRUCTURE: PASS');
