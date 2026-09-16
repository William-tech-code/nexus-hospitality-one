import fs from 'node:fs';

const file='./server/operation-v16.js';
let s=fs.readFileSync(file,'utf8');

if(!s.includes("from './return-engine-v16.js'")){
  const imports=[...s.matchAll(/^import .*?;$/gm)];

  if(!imports.length){
    throw new Error('IMPORT_MARKER_NOT_FOUND');
  }

  const last=imports[imports.length-1];
  const pos=last.index+last[0].length;

  s=
    s.slice(0,pos)+
    "\nimport { returnCoverage } from './return-engine-v16.js';"+
    s.slice(pos);
}

/*
 * Não alteramos o schema da venda.
 * Enriquecemos as respostas V16 depois que o objeto é obtido.
 */

if(!s.includes('function withReturnCoverage')){

  const marker='export function';

  const pos=s.indexOf(marker);

  if(pos<0){
    throw new Error('OP_V16_EXPORT_NOT_FOUND');
  }

  const helper=`
function withReturnCoverage(row){
  if(!row)return row;

  try{
    return {
      ...row,
      return_coverage:returnCoverage(row.id)
    };
  }catch{
    return {
      ...row,
      return_coverage:{
        status:'SEM_DEVOLUCAO',
        original_qty:0,
        returned_qty:0,
        remaining_qty:0,
        returned_value:0
      }
    };
  }
}

`;

  s=s.slice(0,pos)+helper+s.slice(pos);
}

/*
 * Aplicamos cobertura nos res.json que retornam detail(id)
 * e em listas recentes somente quando os padrões existirem.
 */
s=s.replace(
  /res\.json\(detail\(id\)\)/g,
  'res.json(withReturnCoverage(detail(id)))'
);

s=s.replace(
  /res\.json\(detail\(saleId\)\)/g,
  'res.json(withReturnCoverage(detail(saleId)))'
);

fs.writeFileSync(file,s,'utf8');
console.log('OPERATION V16 RETURN COVERAGE: OK');
