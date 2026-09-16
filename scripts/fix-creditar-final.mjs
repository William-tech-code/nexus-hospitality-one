import fs from 'node:fs';

const file = 'src/App.jsx';
const text = fs.readFileSync(file,'utf8');

const broken =
  'Creditar ' +
  String.fromCodePoint(0x00C3,0x00A0) +
  ' equipe';

const correct =
  'Creditar ' +
  String.fromCodePoint(0x00E0) +
  ' equipe';

const count =
  text.split(broken).length - 1;

console.log('\nOcorrencias quebradas encontradas:',count);

if(count !== 1){
  console.error(
    'BLOQUEADO: ESPERADA EXATAMENTE 1 OCORRENCIA.'
  );
  process.exit(10);
}

const repaired =
  text.replace(broken,correct);

if(repaired.includes(broken)){
  console.error(
    'BLOQUEADO: SEQUENCIA C3 A0 PERMANECE.'
  );
  process.exit(11);
}

const correctCount =
  repaired.split(correct).length - 1;

console.log(
  'Ocorrencias corretas "Creditar à equipe":',
  correctCount
);

if(correctCount !== 1){
  console.error(
    'BLOQUEADO: RESULTADO SEMANTICO INESPERADO.'
  );
  process.exit(12);
}

if(repaired.includes('\uFFFD')){
  console.error(
    'BLOQUEADO: REPLACEMENT CHARACTER DETECTADO.'
  );
  process.exit(13);
}

fs.writeFileSync(file,repaired,'utf8');

console.log('\nSUBSTITUICAO EXATA: OK');
console.log('U+00C3 U+00A0 -> U+00E0');
console.log('APP.JSX SALVO EM UTF-8: OK');
