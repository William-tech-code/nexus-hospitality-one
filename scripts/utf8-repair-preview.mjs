import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'server'];
const extensions = new Set([
  '.js',
  '.jsx',
  '.css',
  '.json',
  '.cjs',
  '.mjs'
]);

const suspicious = [
  'Ã',
  'Â',
  'â',
  'ðŸ',
  '�'
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }

  return out;
}

function score(text) {
  let total = 0;

  for (const marker of suspicious) {
    total += text.split(marker).length - 1;
  }

  return total;
}

function repairOnce(text) {
  try {
    return Buffer
      .from(text, 'latin1')
      .toString('utf8');
  } catch {
    return text;
  }
}

const files = roots.flatMap(walk);

const candidates = [];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const before = score(original);

  if (!before) continue;

  const repaired = repairOnce(original);
  const after = score(repaired);

  if (after < before && !repaired.includes('\uFFFD')) {
    candidates.push({
      file,
      before,
      after,
      improved: before - after
    });
  }
}

candidates.sort((a, b) => b.improved - a.improved);

console.log('');
console.log('=== CANDIDATOS SEGUROS PARA REPARO ===');
console.table(candidates);

console.log('');
console.log('Arquivos analisados:', files.length);
console.log('Arquivos candidatos:', candidates.length);

console.log(
  'Ocorrencias suspeitas antes:',
  candidates.reduce((s, x) => s + x.before, 0)
);

console.log(
  'Ocorrencias suspeitas depois:',
  candidates.reduce((s, x) => s + x.after, 0)
);

console.log('');
console.log('SIMULACAO_CONCLUIDA');
console.log('NENHUM_ARQUIVO_FOI_ALTERADO');
