import fs from 'node:fs';

const file = 'src/App.jsx';
const text = fs.readFileSync(file,'utf8');

/*
 * Construimos a sequencia quebrada por code points
 * para nao depender da codificacao do PowerShell.
 *
 * quebrado: "Creditar Ã  equipe"
 * correto : "Creditar à equipe"
 */

const broken =
  'Creditar ' +
  String.fromCodePoint(0x00C3) +
  '  equipe';

const correct =
  'Creditar ' +
  String.fromCodePoint(0x00E0) +
  ' equipe';

const count = text.split(broken).length - 1;

console.log('Ocorrencias exatas encontradas:',count);

if(count !== 1){
  console.error(
    'BLOQUEADO: ESPERADA EXATAMENTE 1 OCORRENCIA.'
  );
  process.exit(10);
}

const repaired = text.replace(broken,correct);

if(repaired.includes(broken)){
  console.error('BLOQUEADO: SEQUENCIA QUEBRADA PERMANECE.');
  process.exit(11);
}

if(!repaired.includes(correct)){
  console.error('BLOQUEADO: TEXTO CORRETO NAO FOI CRIADO.');
  process.exit(12);
}

if(repaired.includes('\uFFFD')){
  console.error('BLOQUEADO: REPLACEMENT CHARACTER DETECTADO.');
  process.exit(13);
}

fs.writeFileSync(file,repaired,'utf8');

console.log('CORRECAO: OK');
console.log('Creditar à equipe: OK');
