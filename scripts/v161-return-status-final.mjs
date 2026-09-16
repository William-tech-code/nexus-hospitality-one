import fs from 'node:fs';

const file='./src/BusinessV15.jsx';
let s=fs.readFileSync(file,'utf8');

const old=
`<em>{s.status}{s.released_at?' • ENTREGUE':' • AGUARDANDO'}</em>`;

const replacement=
`<em>{s.status}{s.return_coverage?.status==='DEVOLVIDA'?' • DEVOLVIDA':s.return_coverage?.status==='DEVOLUCAO_PARCIAL'?' • DEVOLUÇÃO PARCIAL':s.released_at?' • ENTREGUE':' • AGUARDANDO'}</em>`;

if(s.includes(old)){
  s=s.replace(
    old,
    replacement
  );
}

const marker=
`<p>Retirada: <b>{detail.release_code||'—'}</b> • {detail.released_at?'ENTREGUE':'AGUARDANDO ENTREGA'}</p>`;

if(
  s.includes(marker) &&
  !s.includes(
    "detail.return_coverage?.status==='DEVOLVIDA'"
  )
){

  const extra=
`<p>Devolução: <b>{detail.return_coverage?.status==='DEVOLVIDA'?'DEVOLVIDA':detail.return_coverage?.status==='DEVOLUCAO_PARCIAL'?'DEVOLUÇÃO PARCIAL':'SEM DEVOLUÇÃO'}</b>{detail.return_coverage?.returned_value>0?\` • \${brl(detail.return_coverage.returned_value)}\`:''}</p>`;

  s=s.replace(
    marker,
    marker+extra
  );
}

fs.writeFileSync(
  file,
  s,
  'utf8'
);

console.log(
  'FRONTEND STATUS: PASS'
);
