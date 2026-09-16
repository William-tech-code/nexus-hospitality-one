import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'server', 'electron'];

const allowed = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json'
]);

const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
    } else if (allowed.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
}

for (const root of roots) walk(root);

/*
  Marcadores tipicos de UTF-8 interpretado incorretamente.
  Usamos escapes Unicode para nao depender da codificacao
  do PowerShell durante a criacao deste script.
*/
const suspiciousChars = new Set([
  '\u00C3', // Ã
  '\u00C2', // Â
  '\u00E2', // â
  '\uFFFD'  // replacement character
]);

const results = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if ([...line].some(ch => suspiciousChars.has(ch))) {
      results.push({
        file: file.replaceAll('\\', '/'),
        line: index + 1,
        text: line.trim()
      });
    }
  });
}

const grouped = new Map();

for (const r of results) {
  grouped.set(r.file, (grouped.get(r.file) || 0) + 1);
}

console.log('\n=== RESUMO POR ARQUIVO ===');

console.table(
  [...grouped.entries()]
    .sort((a,b) => b[1] - a[1])
    .map(([file, occurrences]) => ({
      file,
      occurrences
    }))
);

console.log('\n=== TOTAL ===');
console.log('Arquivos analisados:', files.length);
console.log('Arquivos afetados:', grouped.size);
console.log('Linhas suspeitas:', results.length);

console.log('\n=== PRIMEIRAS 150 LINHAS SUSPEITAS ===');

for (const r of results.slice(0,150)) {
  console.log(`\n[${r.file}:${r.line}]`);
  console.log(r.text);
}

console.log('\n=== APP.JSX - CODIFICACAO ===');

const app = fs.existsSync('src/App.jsx')
  ? fs.readFileSync('src/App.jsx','utf8')
  : '';

console.log(
  'App.jsx contem caracteres suspeitos:',
  [...app].some(ch => suspiciousChars.has(ch))
);

console.log('\n====================================================');
console.log('AUDITORIA NODE CONCLUIDA');
console.log('ZERO ARQUIVOS ALTERADOS');
console.log('ZERO ALTERACOES NO BANCO');
console.log('====================================================');
