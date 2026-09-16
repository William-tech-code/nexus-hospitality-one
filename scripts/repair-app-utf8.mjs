import fs from 'node:fs';

const file = 'src/App.jsx';
const temp = 'src/App.jsx.UTF8-CANDIDATE';

const original = fs.readFileSync(file, 'utf8');

const bad = new Set([
  '\u00C3',
  '\u00C2',
  '\u00E2',
  '\uFFFD'
]);

function score(text) {
  let total = 0;

  for (const ch of text) {
    if (bad.has(ch)) total++;
  }

  return total;
}

/*
 * App.jsx foi identificado pelo dry-run como arquivo
 * predominantemente afetado pelo padrao UTF8 -> Latin1.
 */
const repaired = Buffer.from(original, 'latin1').toString('utf8');

const before = score(original);
const after = score(repaired);

console.log('\n=== APP.JSX ===');
console.log('Marcadores antes :', before);
console.log('Marcadores depois:', after);
console.log('Melhoria          :', before - after);

/*
 * Protecoes estruturais.
 */
const required = [
  'NEXUS',
  'HOSPITALITY ONE',
  'OPERATIONAL CORE',
  'setTab',
  'doLogout'
];

const missing = required.filter(x => !repaired.includes(x));

const replacementChars =
  [...repaired].filter(ch => ch === '\uFFFD').length;

if (after >= before) {
  console.error('BLOQUEADO: CODIFICACAO NAO MELHOROU');
  process.exit(10);
}

if (missing.length) {
  console.error(
    'BLOQUEADO: ESTRUTURA AUSENTE:',
    missing.join(', ')
  );
  process.exit(11);
}

if (replacementChars > 0) {
  console.error(
    'BLOQUEADO: CONVERSAO GEROU REPLACEMENT CHARACTERS:',
    replacementChars
  );
  process.exit(12);
}

fs.writeFileSync(temp, repaired, 'utf8');

console.log('CANDIDATO_UTF8: OK');
console.log('ARQUIVO_ORIGINAL_AINDA_INTACTO');
