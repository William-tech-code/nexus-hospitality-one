import { db } from '../server/db.js';

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
  ORDER BY name
`).all().map(x => x.name);

const candidates = tables.filter(name =>
  /expense|cost|business|financial/i.test(name)
);

console.log('\nTABELAS CANDIDATAS:');
console.table(candidates.map(name => ({ table: name })));

for (const table of candidates) {

  console.log(`\n=== ${table} ===`);

  const cols = db.prepare(`
    PRAGMA table_info("${table}")
  `).all();

  console.table(
    cols.map(c => ({
      cid: c.cid,
      name: c.name,
      type: c.type,
      notnull: c.notnull,
      default: c.dflt_value,
      pk: c.pk
    }))
  );

  try {
    const rows = db.prepare(`
      SELECT *
      FROM "${table}"
      ORDER BY rowid DESC
      LIMIT 5
    `).all();

    console.log('ULTIMOS REGISTROS:');
    console.table(rows);

  } catch (e) {
    console.log('LEITURA:', e.message);
  }
}

console.log('\n=== BUSINESS-V13: TESTE DE IMPORT ===');

try {
  await import('../server/business-v13.js');
  console.log('IMPORT_BUSINESS_V13: OK');
} catch (e) {
  console.log('IMPORT_BUSINESS_V13: FALHOU');
  console.log(e.message);
}

console.log('\n============================================');
console.log('DIAGNOSTICO CONCLUIDO');
console.log('ZERO ALTERACOES NO BANCO');
console.log('ZERO ALTERACOES NO CODIGO');
console.log('============================================');
