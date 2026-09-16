import fs from 'node:fs';

function fail(message){
  console.error('');
  console.error('PATCH_BLOQUEADO:',message);
  process.exit(50);
}

function save(file,text){
  if(text.includes('\uFFFD')){
    fail(`UTF8_INVALIDO_EM_${file}`);
  }

  fs.writeFileSync(file,text,'utf8');
}

/* ---------------------------------------------------------
   SERVER INDEX
   --------------------------------------------------------- */

{
  const file='./server/index.js';
  let text=fs.readFileSync(file,'utf8');

  const importLine=
    "import { initReturnRoutesV16, registerReturnRoutesV16 } from './return-routes-v16.js';";

  if(!text.includes("from './return-routes-v16.js'")){

    const imports=[...text.matchAll(/^import .*;$/gm)];

    if(!imports.length){
      fail('IMPORTS_SERVER_NAO_LOCALIZADOS');
    }

    const last=imports[imports.length-1];
    const pos=last.index+last[0].length;

    text=
      text.slice(0,pos)+
      '\n'+importLine+
      text.slice(pos);
  }

  /*
   * Inicialização:
   * colocamos imediatamente antes de registerOperationV16.
   */
  if(!text.includes('initReturnRoutesV16();')){

    const marker='registerOperationV16(';
    const pos=text.indexOf(marker);

    if(pos<0){
      fail('registerOperationV16_NAO_LOCALIZADO');
    }

    text=
      text.slice(0,pos)+
      'initReturnRoutesV16();\n'+
      text.slice(pos);
  }

  /*
   * Registro:
   * captura os mesmos argumentos/dependências utilizados
   * pelo registerOperationV16.
   */
  if(!text.includes('registerReturnRoutesV16(app')){

    const regex=
      /registerOperationV16\s*\(\s*app\s*,\s*(\{[\s\S]*?\})\s*\)\s*;/;

    const match=text.match(regex);

    if(!match){
      fail('DEPENDENCIAS_OPERATION_V16_NAO_LOCALIZADAS');
    }

    const operationCall=match[0];
    const dependencies=match[1];

    const returnCall=
      `registerReturnRoutesV16(app,${dependencies});`;

    text=text.replace(
      operationCall,
      operationCall+'\n'+returnCall
    );
  }

  const importCount=
    (text.match(/from '\.\/return-routes-v16\.js'/g)||[]).length;

  const initCount=
    (text.match(/initReturnRoutesV16\s*\(\s*\)/g)||[]).length;

  const registerCount=
    (text.match(/registerReturnRoutesV16\s*\(\s*app/g)||[]).length;

  if(importCount!==1)
    fail(`IMPORT_COUNT_${importCount}`);

  if(initCount!==1)
    fail(`INIT_COUNT_${initCount}`);

  if(registerCount!==1)
    fail(`REGISTER_COUNT_${registerCount}`);

  save(file,text);

  console.log('SERVER INDEX: OK');
}

/* ---------------------------------------------------------
   API FRONTEND
   --------------------------------------------------------- */

{
  const file='./src/api.js';
  let text=fs.readFileSync(file,'utf8');

  if(!text.includes('returnPreviewV16:')){

    const marker='cancelSaleV16:';

    const start=text.indexOf(marker);

    if(start<0)
      fail('cancelSaleV16_NAO_LOCALIZADO');

    /*
     * Localiza a próxima propriedade do objeto depois
     * de cancelSaleV16 sem reformatar o restante do arquivo.
     */
    const after=text.slice(start);

    const next=
      after.search(/\n\s*[A-Za-z_$][\w$]*\s*:/);

    let insertPos;

    if(next>0){
      insertPos=start+next;
    }else{
      const closing=text.lastIndexOf('}');
      if(closing<0)
        fail('OBJETO_API_NAO_LOCALIZADO');
      insertPos=closing;
    }

    const methods=
`
  returnPreviewV16:(id)=>request(\`/v16/sales/\${id}/return-preview\`),

  returnSaleV16:(id,body)=>request(\`/v16/sales/\${id}/return\`,{
    method:'POST',
    body:JSON.stringify(body)
  }),
`;

    text=
      text.slice(0,insertPos)+
      methods+
      text.slice(insertPos);
  }

  if(
    (text.match(/returnPreviewV16\s*:/g)||[]).length!==1
  ){
    fail('returnPreviewV16_DUPLICADO_OU_AUSENTE');
  }

  if(
    (text.match(/returnSaleV16\s*:/g)||[]).length!==1
  ){
    fail('returnSaleV16_DUPLICADO_OU_AUSENTE');
  }

  save(file,text);

  console.log('API FRONTEND: OK');
}

/* ---------------------------------------------------------
   BUSINESS
   --------------------------------------------------------- */

{
  const file='./src/BusinessV15.jsx';
  let text=fs.readFileSync(file,'utf8');

  if(text.includes('api.returnSaleV14(detail.id')){

    text=text.replaceAll(
      'api.returnSaleV14(detail.id',
      'api.returnSaleV16(detail.id'
    );
  }

  /*
   * Depois de uma devolução, o detalhe precisa voltar
   * pelo contrato V1.6.
   *
   * Substituímos somente quando o mesmo trecho contém
   * returnSaleV16.
   */
  const segments=text.split('api.returnSaleV16(detail.id');

  if(segments.length>1){

    for(let i=1;i<segments.length;i++){

      const window=
        segments[i].slice(0,1000);

      if(window.includes(
        'setDetail(await api.saleV14(detail.id))'
      )){
        segments[i]=segments[i].replace(
          'setDetail(await api.saleV14(detail.id))',
          'setDetail(await api.saleV16(detail.id))'
        );
      }
    }

    text=segments.join(
      'api.returnSaleV16(detail.id'
    );
  }

  if(text.includes('api.returnSaleV14(detail.id')){
    fail('RETURN_V14_AINDA_PRESENTE_NO_BUSINESS');
  }

  if(!text.includes('api.returnSaleV16(detail.id')){
    fail('RETURN_V16_NAO_LOCALIZADO_NO_BUSINESS');
  }

  save(file,text);

  console.log('BUSINESS RETURN V1.6: OK');
}

console.log('');
console.log('PATCH CONTROLADO: PASS');
