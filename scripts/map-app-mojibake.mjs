import fs from 'node:fs';

const file = 'src/App.jsx';
const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);

function suspicious(s) {
  return (
    s.includes('\u00C3') ||
    s.includes('\u00C2') ||
    s.includes('\u00E2') ||
    s.includes('\uFFFD')
  );
}

/*
 * Extrai sequencias suspeitas sem modificar o arquivo.
 */
const occurrences = [];

for (let i = 0; i < lines.length; i++) {

  if (!suspicious(lines[i])) continue;

  occurrences.push({
    line: i + 1,
    text: lines[i]
  });
}

console.log('\n=== LINHAS SUSPEITAS DO APP.JSX ===');
console.log('Total:', occurrences.length);

for (const item of occurrences) {
  console.log('\n--------------------------------------------------');
  console.log('LINHA:', item.line);
  console.log(item.text);
}

/*
 * Agora lista os code points das sequencias suspeitas.
 * Isso permite diagnosticar sem depender da exibicao
 * do terminal ou da pagina de codigo do Windows.
 */
console.log('\n=== CODE POINTS SUSPEITOS ===');

const sequences = new Map();

const regex = /[\u00C2\u00C3\u00E2][^\s<>{}"'`,;:]*/gu;

for (const item of occurrences) {

  const matches = item.text.match(regex) || [];

  for (const value of matches) {

    const key = value;

    if (!sequences.has(key)) {
      sequences.set(key, {
        value,
        count: 0,
        lines: []
      });
    }

    const obj = sequences.get(key);

    obj.count++;

    if (obj.lines.length < 10) {
      obj.lines.push(item.line);
    }
  }
}

for (const obj of sequences.values()) {

  const cps = [...obj.value]
    .map(ch =>
      'U+' +
      ch.codePointAt(0)
        .toString(16)
        .toUpperCase()
        .padStart(4,'0')
    )
    .join(' ');

  console.log('\nTEXTO :', JSON.stringify(obj.value));
  console.log('COUNT :', obj.count);
  console.log('LINHAS:', obj.lines.join(', '));
  console.log('CODES :', cps);
}

console.log('\n====================================================');
console.log('MAPEAMENTO CONCLUIDO');
console.log('APP.JSX NAO ALTERADO');
console.log('BANCO NAO ALTERADO');
console.log('====================================================');
