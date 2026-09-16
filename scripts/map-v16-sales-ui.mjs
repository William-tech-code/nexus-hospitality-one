import fs from 'node:fs';

const files = [
  'src/BusinessV15.jsx',
  'src/RecentSalesV16.jsx',
  'src/api.js'
];

const terms = [
  'salesRecentV13',
  'salesRecentV14',
  'salesRecentV16',
  'saleV13',
  'saleV14',
  'saleV16',
  'cancelSaleV13',
  'cancelSaleV14',
  'cancelSaleV16',
  'RecentSalesV16',
  '/v16/sales/recent',
  '/v16/sales/',
  '/cancel'
];

for (const file of files) {

  console.log('\n====================================================');
  console.log('ARQUIVO:', file);
  console.log('====================================================');

  if (!fs.existsSync(file)) {
    console.log('NAO ENCONTRADO');
    continue;
  }

  const text = fs.readFileSync(file,'utf8');
  const lines = text.split(/\r?\n/);

  let found = 0;

  for (let i=0; i<lines.length; i++) {

    const hits = terms.filter(term =>
      lines[i].includes(term)
    );

    if (!hits.length) continue;

    found++;

    console.log('\nLINHA:', i + 1);
    console.log('HITS:', hits.join(', '));
    console.log(lines[i]);
  }

  console.log('\nLINHAS RELEVANTES:', found);
}

console.log('\n====================================================');
console.log('DIAGNOSTICO CONCLUIDO');
console.log('ARQUIVOS ALTERADOS: NAO');
console.log('BACKEND ALTERADO: NAO');
console.log('BANCO ALTERADO: NAO');
console.log('====================================================');
