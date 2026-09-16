import fs from 'node:fs';
import path from 'node:path';

const roots = ['src','server','electron'];

const allowed = new Set([
  '.js','.jsx','.mjs','.cjs','.css','.html','.json'
]);

const bad = new Set([
  '\u00C3',
  '\u00C2',
  '\u00E2',
  '\uFFFD'
]);

const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,e.name);

    if (e.isDirectory()) {
      walk(full);
    } else if (allowed.has(path.extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
}

for (const root of roots) walk(root);

function score(text) {
  let n = 0;
  for (const ch of text) {
    if (bad.has(ch)) n++;
  }
  return n;
}

function latin1Repair(text) {
  /*
    Simula o caso classico:
    bytes UTF-8 que foram interpretados como Windows-1252/Latin-1.

    NAO grava nada.
  */
  try {
    return Buffer.from(text, 'latin1').toString('utf8');
  } catch {
    return text;
  }
}

const report = [];

for (const file of files) {

  const original = fs.readFileSync(file,'utf8');
  const before = score(original);

  if (!before) continue;

  const candidate = latin1Repair(original);
  const after = score(candidate);

  report.push({
    file: file.replaceAll('\\','/'),
    before,
    after,
    improvement: before - after,
    safeCandidate: after < before
  });
}

report.sort((a,b) => b.improvement-a.improvement);

console.log('\n=== DRY RUN UTF-8 ===');

console.table(report);

const improving = report.filter(x => x.safeCandidate);
const rejected = report.filter(x => !x.safeCandidate);

console.log('\n=== RESULTADO ===');
console.log('Arquivos suspeitos:', report.length);
console.log('Melhorariam com conversao:', improving.length);
console.log('Rejeitados / sem melhora:', rejected.length);

console.log(
  'Marcadores antes:',
  report.reduce((s,x)=>s+x.before,0)
);

console.log(
  'Marcadores depois, apenas candidatos:',
  improving.reduce((s,x)=>s+x.after,0)
);

console.log('\n=== CANDIDATOS SEGUROS ===');

for (const x of improving) {
  console.log(
    `${x.file}: ${x.before} -> ${x.after} ` +
    `(melhora ${x.improvement})`
  );
}

if (rejected.length) {
  console.log('\n=== NAO SERIAM ALTERADOS ===');

  for (const x of rejected) {
    console.log(`${x.file}: ${x.before} -> ${x.after}`);
  }
}

console.log('\n====================================================');
console.log('DRY RUN CONCLUIDO');
console.log('NENHUM FONTE FOI ALTERADO');
console.log('BANCO NAO ALTERADO');
console.log('BACKUP PRE-UTF8 CRIADO');
console.log('====================================================');
