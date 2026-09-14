export const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
export const numberBR=(v,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d});
export const percentBR=(v,d=1)=>`${numberBR(v,d)}%`;
export const ml=v=>`${numberBR(v,0)} ml`;
export const liters=v=>`${numberBR(v,2)} L`;
export const grams=v=>`${numberBR(v,0)} g`;
export const kg=v=>`${numberBR(v,2)} kg`;
export function measure(v,unit){const u=String(unit||'UNIT').toUpperCase();if(u==='ML')return ml(v);if(u==='L')return liters(v);if(u==='G')return grams(v);if(u==='KG')return kg(v);return `${numberBR(v,2)} ${u==='UNIT'?'un.':u.toLowerCase()}`}
export function parseBR(v){if(typeof v==='number')return v;let s=String(v??'').trim().replace(/R\$|\s/g,'');if(!s)return 0;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');return Number(s)||0}
export function inputMoney(v){return numberBR(parseBR(v),2)}
