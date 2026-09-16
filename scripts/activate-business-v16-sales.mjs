import fs from 'node:fs';

const file='src/BusinessV15.jsx';
const original=fs.readFileSync(file,'utf8');

const changes=[
  {
    from:'api.salesRecentV14()',
    to:'api.salesRecentV16()',
    name:'LISTAGEM V16'
  },
  {
    from:'api.saleV14(id)',
    to:'api.saleV16(id)',
    name:'DETALHE V16'
  },
  {
    from:'api.cancelSaleV13(detail.id,reason)',
    to:'api.cancelSaleV16(detail.id,reason)',
    name:'CANCELAMENTO V16'
  }
];

let text=original;

for(const c of changes){

  const count=
    text.split(c.from).length-1;

  console.log(c.name,':',count);

  if(count!==1){
    console.error(
      'BLOQUEADO:',
      c.name,
      'esperava 1 ocorrencia.'
    );
    process.exit(10);
  }

  text=text.replace(c.from,c.to);
}

/*
 IMPORTANTE:
 Existem chamadas saleV14 que DEVEM continuar
 para devolucao e correcao de troco.

 Portanto nao fazemos substituicao global.
*/

const required=[
  'api.salesRecentV16()',
  'api.saleV16(id)',
  'api.cancelSaleV16(detail.id,reason)',

  // V14 deliberadamente preservado:
  'api.returnSaleV14',
  'api.changeCorrectionV14',
  'api.printSaleV14'
];

for(const marker of required){

  if(!text.includes(marker)){
    console.error(
      'BLOQUEADO: MARCADOR AUSENTE:',
      marker
    );
    process.exit(11);
  }
}

if(text.includes('api.cancelSaleV13(detail.id,reason)')){
  console.error(
    'BLOQUEADO: CANCELAMENTO V13 AINDA ATIVO NA TELA.'
  );
  process.exit(12);
}

if(text.includes('\uFFFD')){
  console.error(
    'BLOQUEADO: REPLACEMENT CHARACTER DETECTADO.'
  );
  process.exit(13);
}

fs.writeFileSync(
  'src/BusinessV15.jsx.CANDIDATE-V16',
  text,
  'utf8'
);

console.log('\nCANDIDATO BUSINESS V1.6: OK');
console.log('ORIGINAL AINDA PRESERVADO');
console.log('DEVOLUCAO V14: PRESERVADA');
console.log('TROCO V14: PRESERVADO');
console.log('IMPRESSAO V14: PRESERVADA');
