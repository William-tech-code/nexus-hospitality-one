import fs from 'node:fs';

const file='./src/BusinessV15.jsx';

let s=
  fs.readFileSync(
    file,
    'utf8'
  );

const old=
`if(kind==='return'){const reason=prompt('Motivo da devolução:');if(!reason)return;await api.returnSaleV16(detail.id,{reason,items:detail.items.map(i=>({sale_item_id:i.id,qty:i.qty}))});setDetail(await api.saleV16(detail.id))}`;

const replacement=
`if(kind==='return'){const reason=prompt('Motivo da devolução:');if(!reason)return;const preview=await api.returnPreviewV16(detail.id);const source=preview?.sale?.items||preview?.items||detail.items||[];const items=source.map(i=>({sale_item_id:i.id,qty:Number(i.returnable_qty??Math.max(0,Number(i.qty||0)-Number(i.returned_qty||0)))})).filter(i=>i.qty>0);if(!items.length)throw new Error('VENDA_SEM_ITENS_DEVOLVIVEIS');await api.returnSaleV16(detail.id,{reason,items});setDetail(await api.saleV16(detail.id))}`;

if(s.includes(old)){
  s=s.replace(
    old,
    replacement
  );
}

if(
  !s.includes(
    "VENDA_SEM_ITENS_DEVOLVIVEIS"
  )
){
  throw new Error(
    'BUSINESS_RETURN_PREVIEW_PATCH_FAILED'
  );
}

fs.writeFileSync(
  file,
  s,
  'utf8'
);

console.log(
  'BUSINESS RETURN PREVIEW: PASS'
);
