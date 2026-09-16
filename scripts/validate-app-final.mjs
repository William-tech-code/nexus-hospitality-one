import fs from 'node:fs';

const text =
  fs.readFileSync('src/App.jsx','utf8');

const broken =
  'Creditar ' +
  String.fromCodePoint(0x00C3,0x00A0) +
  ' equipe';

const correct =
  'Creditar ' +
  String.fromCodePoint(0x00E0) +
  ' equipe';

console.log(
  'Mojibake C3 A0 restante:',
  text.includes(broken)
);

console.log(
  'Texto correto presente:',
  text.includes(correct)
);

console.log(
  'Replacement characters:',
  [...text].filter(c=>c==='\uFFFD').length
);

if(
  text.includes(broken) ||
  !text.includes(correct) ||
  text.includes('\uFFFD')
){
  process.exit(20);
}

console.log('\nAPP.JSX UTF-8: APROVADO');
