import fs from 'node:fs';

const files=[
  'server/operation-v16.js',
  'src/RecentSalesV16.jsx',
  'src/BusinessV15.jsx'
];

const terms=[
  '/sales/:id',
  'router.get',
  'items',
  'payments',
  'received_amount',
  'change_amount',
  'release_code',
  'released_at',
  'operator_name',
  'setDetail',
  'saleV16'
];

for(const file of files){

  console.log('\n====================================================');
  console.log('ARQUIVO:',file);
  console.log('====================================================');

  if(!fs.existsSync(file)){
    console.log('NAO ENCONTRADO');
    continue;
  }

  const lines=
    fs.readFileSync(file,'utf8')
      .split(/\r?\n/);

  let count=0;

  for(let i=0;i<lines.length;i++){

    const hits=
      terms.filter(t=>lines[i].includes(t));

    if(!hits.length)
      continue;

    count++;

    console.log('\nLINHA:',i+1);
    console.log('HITS:',hits.join(', '));
    console.log(lines[i]);
  }

  console.log('\nLINHAS RELEVANTES:',count);
}

console.log('\n====================================================');
console.log('CONTRATO INSPECIONADO');
console.log('ARQUIVOS ALTERADOS: NAO');
console.log('BANCO ALTERADO: NAO');
console.log('====================================================');
