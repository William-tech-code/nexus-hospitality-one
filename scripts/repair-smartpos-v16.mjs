import fs from 'node:fs';

const file = 'src/SmartPOSV16.jsx';
const text = fs.readFileSync(file,'utf8');

/*
 Windows-1252 -> bytes.
 Necessario porque alguns mojibakes usam caracteres
 como € ™ œ – — etc., que Buffer latin1 nao representa
 corretamente.
*/
const cp1252 = new Map([
  [0x20AC,0x80],[0x201A,0x82],[0x0192,0x83],
  [0x201E,0x84],[0x2026,0x85],[0x2020,0x86],
  [0x2021,0x87],[0x02C6,0x88],[0x2030,0x89],
  [0x0160,0x8A],[0x2039,0x8B],[0x0152,0x8C],
  [0x017D,0x8E],[0x2018,0x91],[0x2019,0x92],
  [0x201C,0x93],[0x201D,0x94],[0x2022,0x95],
  [0x2013,0x96],[0x2014,0x97],[0x02DC,0x98],
  [0x2122,0x99],[0x0161,0x9A],[0x203A,0x9B],
  [0x0153,0x9C],[0x017E,0x9E],[0x0178,0x9F]
]);

function encode1252(s){
  const bytes=[];

  for(const ch of s){
    const cp=ch.codePointAt(0);

    if(cp <= 0xFF){
      bytes.push(cp);
      continue;
    }

    if(cp1252.has(cp)){
      bytes.push(cp1252.get(cp));
      continue;
    }

    return null;
  }

  return Buffer.from(bytes);
}

function decodeOnce(s){
  const buf=encode1252(s);
  if(!buf) return s;

  const out=buf.toString('utf8');

  if(out.includes('\uFFFD'))
    return s;

  return out;
}

function badScore(s){
  const patterns=[
    /Ã/g,
    /Â/g,
    /â/g,
    /ð/g,
    /�/g
  ];

  return patterns.reduce(
    (n,re)=>n+(s.match(re)||[]).length,
    0
  );
}

function repairToken(token){
  let current=token;

  for(let pass=0;pass<3;pass++){
    const candidate=decodeOnce(current);

    if(candidate===current)
      break;

    if(badScore(candidate) >= badScore(current))
      break;

    current=candidate;
  }

  return current;
}

/*
 Corrige somente trechos que contem marcador.
 Nao converte o arquivo inteiro.
*/
let repaired=text.replace(
  /[^\s"'`<>{}=;(),]+/gu,
  token => badScore(token) ? repairToken(token) : token
);

/*
 Identidade interna:
 arquivo SmartPOSV16 deve exportar SmartPOSV16.
*/
const oldExport =
  'export default function SmartPOSV15';

const newExport =
  'export default function SmartPOSV16';

const exportCount =
  repaired.split(oldExport).length - 1;

console.log(
  'Export SmartPOSV15 encontrado:',
  exportCount
);

if(exportCount !== 1){
  console.error(
    'BLOQUEADO: EXPORT V15 INESPERADO.'
  );
  process.exit(20);
}

repaired =
  repaired.replace(oldExport,newExport);

const beforeScore=badScore(text);
const afterScore=badScore(repaired);

console.log(
  'Marcadores antes:',
  beforeScore
);

console.log(
  'Marcadores depois:',
  afterScore
);

console.log(
  'Eliminados:',
  beforeScore-afterScore
);

console.log(
  'Replacement characters:',
  [...repaired].filter(c=>c==='\uFFFD').length
);

if(afterScore >= beforeScore){
  console.error(
    'BLOQUEADO: REPARO NAO MELHOROU O ARQUIVO.'
  );
  process.exit(21);
}

if(repaired.includes('\uFFFD')){
  console.error(
    'BLOQUEADO: REPLACEMENT CHARACTER DETECTADO.'
  );
  process.exit(22);
}

const required=[
  'export default function SmartPOSV16',
  'createSaleV14',
  'releaseSaleV14',
  'printSaleV14',
  'CONFIRMAR RECEBIMENTO',
  'LIBERAR PRODUTO PARA ENTREGA'
];

for(const marker of required){
  if(!repaired.includes(marker)){
    console.error(
      'BLOQUEADO: MARCADOR FUNCIONAL AUSENTE:',
      marker
    );
    process.exit(23);
  }
}

fs.writeFileSync(
  'src/SmartPOSV16.jsx.CANDIDATE',
  repaired,
  'utf8'
);

console.log('\nCANDIDATO SMARTPOS V1.6: OK');
console.log('ARQUIVO ORIGINAL AINDA PRESERVADO');
