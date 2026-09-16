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

const backupRoot = path.join(
  'backups',
  'UTF8-PRE-V16-' +
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];

  const result = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...walk(full));
    } else if (
      extensions.has(path.extname(entry.name).toLowerCase())
    ) {
      result.push(full);
    }
  }

  return result;
}

function score(text) {
  let total = 0;

  for (const marker of suspicious) {
    total += text.split(marker).length - 1;
  }

  return total;
}

function repairOnce(text) {
  return Buffer
    .from(text, 'latin1')
    .toString('utf8');
}

function backup(file) {
  const target = path.join(backupRoot, file);

  fs.mkdirSync(path.dirname(target), {
    recursive: true
  });

  fs.copyFileSync(file, target);
}

const files = roots.flatMap(walk);

const changed = [];

for (const file of files) {

  const original = fs.readFileSync(file, 'utf8');
  const before = score(original);

  if (!before) continue;

  let repaired;

  try {
    repaired = repairOnce(original);
  } catch {
    continue;
  }

  const after = score(repaired);

  /*
    Só altera quando:
    1. havia sinais de mojibake;
    2. a conversão reduz esses sinais;
    3. não introduz caractere Unicode de substituição.
  */

  if (
    after < before &&
    !repaired.includes('\uFFFD')
  ) {

    backup(file);

    fs.writeFileSync(
      file,
      repaired,
      'utf8'
    );

    changed.push({
      file,
      before,
      after,
      removed: before - after
    });
  }
}

console.log('');
console.log('=== ARQUIVOS REPARADOS ===');
console.table(changed);

console.log('');
console.log('Backup:', backupRoot);
console.log('Arquivos alterados:', changed.length);

console.log(
  'Ocorrencias antes:',
  changed.reduce((s, x) => s + x.before, 0)
);

console.log(
  'Ocorrencias depois:',
  changed.reduce((s, x) => s + x.after, 0)
);

fs.writeFileSync(
  '.utf8-v16-last-backup',
  backupRoot,
  'utf8'
);

console.log('');
console.log('UTF8_REPAIR_APPLIED');
