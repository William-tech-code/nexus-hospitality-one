import fs from 'node:fs';

const files = [
  'src/SmartPOSV16.jsx',
  'src/RecentSalesV16.jsx'
];

function isMarker(ch) {
  return [
    0x00C3,
    0x00C2,
    0x00E2,
    0xFFFD
  ].includes(ch.codePointAt(0));
}

for (const file of files) {

  console.log('\n====================================================');
  console.log('ARQUIVO:',file);
  console.log('====================================================');

  if (!fs.existsSync(file)) {
    console.log('ARQUIVO NAO ENCONTRADO');
    continue;
  }

  const text = fs.readFileSync(file,'utf8');
  const lines = text.split(/\r?\n/);

  let occurrences = 0;

  for (let i=0;i<lines.length;i++) {

    const chars=[...lines[i]];

    const positions=[];

    chars.forEach((ch,index)=>{
      if(isMarker(ch)){
        positions.push({
          index,
          ch,
          cp:
            'U+'+
            ch.codePointAt(0)
              .toString(16)
              .toUpperCase()
              .padStart(4,'0')
        });
      }
    });

    if(!positions.length) continue;

    occurrences += positions.length;

    console.log('\nLINHA:',i+1);
    console.log(lines[i]);

    console.log('\nMARCADORES:');

    for(const x of positions){
      console.log(
        'POS',
        x.index,
        JSON.stringify(x.ch),
        x.cp
      );
    }
  }

  console.log('\nTOTAL DE MARCADORES:',occurrences);

  console.log(
    'REPLACEMENT CHARACTERS:',
    [...text].filter(x=>x==='\uFFFD').length
  );

  console.log(
    'EXPORT DEFAULT:',
    text.match(/export\s+default\s+function\s+[A-Za-z0-9_]+/)?.[0]
      || 'NAO IDENTIFICADO'
  );
}

console.log('\n====================================================');
console.log('AUDITORIA V1.6 CONCLUIDA');
console.log('ARQUIVOS ALTERADOS: NAO');
console.log('BACKEND ALTERADO: NAO');
console.log('BANCO ALTERADO: NAO');
console.log('====================================================');
