import fs from 'node:fs';

const file='src/SmartPOSV16.jsx';
let text=fs.readFileSync(file,'utf8');

const brokenA =
  'Adicione produtos ' +
  String.fromCodePoint(0x00C3,0x00A0) +
  ' venda.';

const correctA =
  'Adicione produtos ' +
  String.fromCodePoint(0x00E0) +
  ' venda.';

const brokenB =
  'vinculado ' +
  String.fromCodePoint(0x00C3,0x00A0) +
  's opera' +
  String.fromCodePoint(0x00E7,0x00F5,0x0065,0x0073);

const correctB =
  'vinculado ' +
  String.fromCodePoint(0x00E0) +
  's opera' +
  String.fromCodePoint(0x00E7,0x00F5,0x0065,0x0073);

const countA=text.split(brokenA).length-1;
const countB=text.split(brokenB).length-1;

console.log('Erro "produtos à venda":',countA);
console.log('Erro "vinculado às operações":',countB);

if(countA!==1 || countB!==1){
  console.error('BLOQUEADO: CONTAGEM INESPERADA.');
  process.exit(10);
}

text=text
  .replace(brokenA,correctA)
  .replace(brokenB,correctB);

if(text.includes(brokenA) || text.includes(brokenB)){
  console.error('BLOQUEADO: MOJIBAKE PERMANECE.');
  process.exit(11);
}

if(text.includes('\uFFFD')){
  console.error('BLOQUEADO: REPLACEMENT CHARACTER.');
  process.exit(12);
}

if(!text.includes('export default function SmartPOSV16')){
  console.error('BLOQUEADO: IDENTIDADE V1.6 AUSENTE.');
  process.exit(13);
}

fs.writeFileSync(file,text,'utf8');

console.log('CORRECOES EXATAS: OK');
console.log('SMARTPOS V1.6 UTF8: OK');
