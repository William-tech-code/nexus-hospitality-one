import fs from 'node:fs';

const file='./src/RecentSalesV16.jsx';

let s=
  fs.readFileSync(
    file,
    'utf8'
  );

const old=`const statusLabel = sale => {
  if (sale?.status === 'CANCELLED') return 'CANCELADA';
  if (sale?.released_at) return 'LIBERADA';
  if (sale?.status === 'PAID') return 'PAGA';

  return sale?.status || '—';
};`;

const replacement=`const statusLabel = sale => {
  if (sale?.status === 'CANCELLED') return 'CANCELADA';

  if (sale?.return_coverage?.status === 'DEVOLVIDA') {
    return 'DEVOLVIDA';
  }

  if (sale?.return_coverage?.status === 'DEVOLUCAO_PARCIAL') {
    return 'DEVOLUÇÃO PARCIAL';
  }

  if (sale?.released_at) return 'ENTREGUE';
  if (sale?.status === 'PAID') return 'PAGA';

  return sale?.status || '—';
};`;

if(s.includes(old)){
  s=s.replace(
    old,
    replacement
  );
}

if(
  !s.includes(
    "return 'DEVOLUÇÃO PARCIAL'"
  )
){
  throw new Error(
    'RECENT_STATUS_PATCH_FAILED'
  );
}

fs.writeFileSync(
  file,
  s,
  'utf8'
);

console.log(
  'RECENT SALES STATUS: PASS'
);
