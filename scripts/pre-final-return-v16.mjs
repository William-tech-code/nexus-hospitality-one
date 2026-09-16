import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';

const dir=path.resolve('./database-backups');
fs.mkdirSync(dir,{recursive:true});

const stamp=
  new Date().toISOString().replace(/[:.]/g,'-');

const target=
  path.join(
    dir,
    `hospitality-pre-final-return-v16-${stamp}.sqlite`
  );

await db.backup(target);

const integrity=
  db.prepare('PRAGMA integrity_check').get();

const sale=db.prepare(`
  SELECT *
  FROM sales
  WHERE id=9
`).get();

const returns=db.prepare(`
  SELECT COUNT(*) c
  FROM sale_returns
  WHERE sale_id=9
`).get().c;

console.log('BACKUP:',target);
console.log('INTEGRITY:',integrity);
console.log('SALE #9:',sale);
console.log('RETURNS #9:',Number(returns));

if(!sale){
  console.error('SALE_9_NOT_FOUND');
  process.exit(10);
}

if(sale.status!=='PAID'){
  console.error('SALE_9_NOT_PAID');
  process.exit(11);
}

if(Number(returns)!==0){
  console.error('SALE_9_ALREADY_RETURNED');
  process.exit(12);
}

console.log('BACKUP PRE-FINAL: PASS');
