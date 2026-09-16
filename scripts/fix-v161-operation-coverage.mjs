import fs from 'node:fs';

const file='./server/operation-v16.js';
let s=fs.readFileSync(file,'utf8');

/*
 * Import correto.
 */
if(!s.includes("returnCoverage } from './return-engine-v16.js'")){

  const marker="import { db } from './db.js';";

  if(!s.includes(marker)){
    throw new Error('DB_IMPORT_NOT_FOUND');
  }

  s=s.replace(
    marker,
    marker+
    "\nimport { returnCoverage } from './return-engine-v16.js';"
  );
}

/*
 * Helper.
 */
if(!s.includes('function withReturnCoverage(')){

  const marker="const t = v => String(v || '').trim();";

  if(!s.includes(marker)){
    throw new Error('CONST_T_MARKER_NOT_FOUND');
  }

  const helper=`

function withReturnCoverage(row) {
  if (!row) return row;

  try {
    return {
      ...row,
      return_coverage: returnCoverage(row.id)
    };
  } catch (error) {
    return {
      ...row,
      return_coverage: {
        status: 'SEM_DEVOLUCAO',
        original_qty: 0,
        returned_qty: 0,
        remaining_qty: 0,
        returned_value: 0
      }
    };
  }
}

`;

  s=s.replace(marker,marker+helper);
}

/*
 * DETAIL:
 * saleDetail passa a devolver coverage diretamente.
 *
 * Fazemos no return final da função, cuja estrutura real é:
 *
 * return {
 *   ...sale,
 *   items,
 *   payments,
 *   inventory
 * };
 */

const detailOld=`  return {
    ...sale,
    items,
    payments,
    inventory
  };
}`;

const detailNew=`  return withReturnCoverage({
    ...sale,
    items,
    payments,
    inventory
  });
}`;

if(
  s.includes(detailOld) &&
  !s.includes('return withReturnCoverage({')
){
  s=s.replace(detailOld,detailNew);
}

/*
 * RECENT:
 * estrutura real usa res.json(rows).
 * Aplicamos coverage em cada venda.
 */
if(
  s.includes('res.json(rows);') &&
  !s.includes('res.json(rows.map(withReturnCoverage));')
){
  s=s.replace(
    'res.json(rows);',
    'res.json(rows.map(withReturnCoverage));'
  );
}

if(!s.includes('return withReturnCoverage({')){
  throw new Error(
    'SALE_DETAIL_COVERAGE_NOT_INSTALLED'
  );
}

if(!s.includes('res.json(rows.map(withReturnCoverage));')){
  throw new Error(
    'RECENT_COVERAGE_NOT_INSTALLED'
  );
}

fs.writeFileSync(file,s,'utf8');

console.log('OPERATION V16 COVERAGE: OK');
