import fs from 'node:fs';

const file = 'src/App.jsx';
const temp = 'src/App.jsx.SURGICAL-CANDIDATE';

const original = fs.readFileSync(file,'utf8');

/*
 * Windows-1252 -> byte mapping.
 * Necessario porque mojibake como:
 *
 * U+2014, U+0153, U+2020 etc.
 *
 * nao pode ser corretamente tratado por Buffer latin1.
 */
const cp1252 = new Map([
  [0x20AC,0x80],
  [0x201A,0x82],
  [0x0192,0x83],
  [0x201E,0x84],
  [0x2026,0x85],
  [0x2020,0x86],
  [0x2021,0x87],
  [0x02C6,0x88],
  [0x2030,0x89],
  [0x0160,0x8A],
  [0x2039,0x8B],
  [0x0152,0x8C],
  [0x017D,0x8E],
  [0x2018,0x91],
  [0x2019,0x92],
  [0x201C,0x93],
  [0x201D,0x94],
  [0x2022,0x95],
  [0x2013,0x96],
  [0x2014,0x97],
  [0x02DC,0x98],
  [0x2122,0x99],
  [0x0161,0x9A],
  [0x203A,0x9B],
  [0x0153,0x9C],
  [0x017E,0x9E],
  [0x0178,0x9F]
]);

function suspiciousCount(s) {
  let n = 0;

  for (const ch of s) {
    const cp = ch.codePointAt(0);

    if (
      cp === 0x00C3 ||
      cp === 0x00C2 ||
      cp === 0x00E2 ||
      cp === 0xFFFD
    ) n++;
  }

  return n;
}

function cp1252ToUtf8(s) {

  const bytes = [];

  for (const ch of s) {

    const cp = ch.codePointAt(0);

    if (cp <= 0xFF) {
      bytes.push(cp);
      continue;
    }

    if (cp1252.has(cp)) {
      bytes.push(cp1252.get(cp));
      continue;
    }

    /*
     * Se houver caractere Unicode real que nao pertence
     * ao mojibake CP1252, a conversao e rejeitada.
     */
    return null;
  }

  return Buffer.from(bytes).toString('utf8');
}

function repairToken(token) {

  let current = token;

  for (let pass = 0; pass < 3; pass++) {

    const before = suspiciousCount(current);

    if (!before) break;

    const candidate = cp1252ToUtf8(current);

    if (candidate === null) break;
    if (candidate.includes('\uFFFD')) break;

    const after = suspiciousCount(candidate);

    if (after >= before) break;

    current = candidate;
  }

  return current;
}

/*
 * Repara somente sequencias que contem os marcadores
 * iniciais classicos de mojibake.
 *
 * Nao converte o arquivo inteiro.
 */
const tokenRegex =
  /[^\s<>{}"'`,;:=()[\]]*[\u00C2\u00C3\u00E2][^\s<>{}"'`,;:=()[\]]*/gu;

let repaired = original.replace(tokenRegex, token => repairToken(token));

const before = suspiciousCount(original);
const after = suspiciousCount(repaired);

console.log('\n=== RESULTADO CIRURGICO ===');
console.log('Marcadores antes :',before);
console.log('Marcadores depois:',after);
console.log('Eliminados        :',before-after);

const replacement =
  [...repaired].filter(x=>x==='\uFFFD').length;

console.log('Replacement chars :',replacement);

if (replacement > 0) {
  console.error('BLOQUEADO: REPLACEMENT CHARACTER DETECTADO');
  process.exit(20);
}

if (after >= before) {
  console.error('BLOQUEADO: NAO HOUVE MELHORIA');
  process.exit(21);
}

/*
 * Estrutura funcional obrigatoria.
 */
const required = [
  'NEXUS',
  'HOSPITALITY ONE',
  'setTab',
  'doLogout',
  'SmartPOSV16',
  'BusinessV15'
];

const missing = required.filter(x=>!repaired.includes(x));

if (missing.length) {
  console.error(
    'BLOQUEADO: ESTRUTURA FUNCIONAL AUSENTE:',
    missing.join(', ')
  );
  process.exit(22);
}

fs.writeFileSync(temp,repaired,'utf8');

console.log('CANDIDATO CIRURGICO: OK');
console.log('ORIGINAL AINDA PRESERVADO');
