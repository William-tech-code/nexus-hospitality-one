import fs from 'node:fs';

const file='./server/operation-v16.js';
let s=fs.readFileSync(file,'utf8');

/*
 * Remove qualquer tentativa incompleta anterior.
 */
s=s.replace(
  /^import \{ returnCoverage \} from '\.\/return-engine-v16\.js';\r?\n/gm,
  ''
);

/*
 * Import limpo imediatamente após db.js.
 */
const dbImport="import { db } from './db.js';";

if(!s.includes(dbImport)){
  throw new Error('DB_IMPORT_NOT_FOUND');
}

s=s.replace(
  dbImport,
  dbImport+
  "\nimport { returnCoverage } from './return-engine-v16.js';"
);

/*
 * RECENT
 *
 * Não mexemos na SQL.
 * Apenas enriquecemos cada row antes de enviar.
 */
const recentOld='      res.json(rows);';

const recentNew=`      res.json(
        rows.map(row => ({
          ...row,
          return_coverage: returnCoverage(row.id)
        }))
      );`;

if(s.includes(recentOld)){
  s=s.replace(
    recentOld,
    recentNew
  );
}else if(
  !s.includes(
    'return_coverage: returnCoverage(row.id)'
  )
){
  throw new Error(
    'RECENT_RESPONSE_NOT_FOUND'
  );
}

/*
 * DETAIL
 *
 * Mantemos saleDetail() completamente intacta.
 * Alteramos SOMENTE a resposta HTTP.
 */
const detailOld='      res.json(sale);';

const detailNew=`      res.json({
        ...sale,
        return_coverage: returnCoverage(sale.id)
      });`;

if(s.includes(detailOld)){
  s=s.replace(
    detailOld,
    detailNew
  );
}else if(
  !s.includes(
    'return_coverage: returnCoverage(sale.id)'
  )
){
  throw new Error(
    'DETAIL_RESPONSE_NOT_FOUND'
  );
}

/*
 * Validação estrutural.
 */
const importCount=
  (
    s.match(
      /import \{ returnCoverage \} from '\.\/return-engine-v16\.js';/g
    )||[]
  ).length;

if(importCount!==1){
  throw new Error(
    'RETURNCOVERAGE_IMPORT_COUNT_'+importCount
  );
}

if(
  !s.includes(
    'return_coverage: returnCoverage(row.id)'
  )
){
  throw new Error(
    'RECENT_COVERAGE_FAILED'
  );
}

if(
  !s.includes(
    'return_coverage: returnCoverage(sale.id)'
  )
){
  throw new Error(
    'DETAIL_COVERAGE_FAILED'
  );
}

fs.writeFileSync(
  file,
  s,
  'utf8'
);

console.log(
  'OPERATION V16 COVERAGE: PASS'
);
