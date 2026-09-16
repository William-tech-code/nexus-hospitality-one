import fs from 'node:fs';

const text = fs.readFileSync('src/App.jsx', 'utf8');

const needle = 'Creditar';
const positions = [];

let start = 0;

while (true) {
  const pos = text.indexOf(needle, start);

  if (pos === -1) break;

  positions.push(pos);
  start = pos + needle.length;
}

console.log('\nOcorrencias de "Creditar":', positions.length);

for (const [n, pos] of positions.entries()) {

  const trecho = text.slice(
    pos,
    Math.min(text.length, pos + 50)
  );

  console.log('\n========================================');
  console.log('OCORRENCIA:', n + 1);
  console.log('POSICAO:', pos);
  console.log('TEXTO JSON:');
  console.log(JSON.stringify(trecho));

  console.log('\nCODE POINTS:');

  [...trecho].forEach((ch, i) => {

    const cp = ch.codePointAt(0);

    console.log(
      String(i).padStart(2, '0'),
      JSON.stringify(ch).padEnd(10),
      'U+' +
      cp
        .toString(16)
        .toUpperCase()
        .padStart(4, '0')
    );
  });
}

console.log('\n========================================');
console.log('DIAGNOSTICO CONCLUIDO');
console.log('APP.JSX ALTERADO: NAO');
console.log('BANCO ALTERADO: NAO');
console.log('========================================');
