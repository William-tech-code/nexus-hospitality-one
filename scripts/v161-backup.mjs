import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';

fs.mkdirSync('./database-backups',{recursive:true});

const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const target=path.resolve(
  `./database-backups/hospitality-pre-v161-${stamp}.sqlite`
);

await db.backup(target);

const integrity=db.prepare('PRAGMA integrity_check').get();
const value=String(Object.values(integrity)[0]).toLowerCase();

console.log('BACKUP SQLITE:',target);
console.log('INTEGRITY:',value);

if(value!=='ok')process.exit(20);
