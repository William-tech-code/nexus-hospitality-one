import fs from 'node:fs';

const file = 'src/App.jsx';
const text = fs.readFileSync(file,'utf8');
const lines = text.split(/\r?\n/);

const markers = new Set([
  0x00C3,
  0x00C2,
  0x00E2,
  0xFFFD
]);

let total = 0;

for (let i=0; i<lines.length; i++) {

  const chars = [...lines[i]];

  const suspicious = chars.filter(ch =>
    markers.has(ch.codePointAt(0))
  );

  if (!suspicious.length) continue;

  total += suspicious.length;

  console.log('\n----------------------------------------');
  console.log('LINHA:',i+1);
  console.log(lines[i]);

  console.log('\nCARACTERES SUSPEITOS:');

  for (const ch of suspicious) {
    console.log(
      JSON.stringify(ch),
      'U+' +
      ch.codePointAt(0)
        .toString(16)
        .toUpperCase()
        .padStart(4,'0')
    );
  }
}

console.log('\n========================================');
console.log('TOTAL DE MARCADORES:',total);
console.log('ARQUIVO ALTERADO: NAO');
console.log('BANCO ALTERADO: NAO');
console.log('========================================');
