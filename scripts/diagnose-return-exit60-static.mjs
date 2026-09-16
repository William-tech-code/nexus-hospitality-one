import fs from 'node:fs';

const index=
    fs.readFileSync(
        './server/index.js',
        'utf8'
    );

const routes=
    fs.readFileSync(
        './server/return-routes-v16.js',
        'utf8'
    );

const api=
    fs.readFileSync(
        './src/api.js',
        'utf8'
    );

const business=
    fs.readFileSync(
        './src/BusinessV15.jsx',
        'utf8'
    );

const checks={
    INDEX_IMPORT_RETURN:
        index.includes('return-routes-v16.js'),

    INDEX_INIT_RETURN:
        index.includes('initReturnRoutesV16'),

    INDEX_REGISTER_RETURN:
        index.includes('registerReturnRoutesV16'),

    ROUTE_PREVIEW:
        routes.includes(
            '/api/v16/sales/:id/return-preview'
        ),

    ROUTE_POST:
        routes.includes(
            '/api/v16/sales/:id/return'
        ),

    API_PREVIEW:
        api.includes('returnPreviewV16:'),

    API_RETURN:
        api.includes('returnSaleV16:'),

    BUSINESS_RETURN:
        business.includes('api.returnSaleV16(')
};

console.log('');
console.table(checks);

const failed=
    Object.entries(checks)
        .filter(([,ok])=>!ok)
        .map(([name])=>name);

if(failed.length){
    console.log('');
    console.log('FALHAS ESTATICAS:',failed);
}else{
    console.log('');
    console.log('INTEGRACAO ESTATICA: PASS');
}

/*
 * Mostrar somente as linhas relevantes de index.js
 * para vermos exatamente a ordem de registro.
 */

console.log('');
console.log('--- INDEX.JS / RETURN V1.6 ---');

index
    .split(/\r?\n/)
    .forEach((line,i)=>{
        if(
            line.includes('ReturnRoutesV16') ||
            line.includes('return-routes-v16')
        ){
            console.log(
                String(i+1).padStart(4,' '),
                '|',
                line
            );
        }
    });

console.log('');
console.log('--- RETURN ROUTES ---');

routes
    .split(/\r?\n/)
    .forEach((line,i)=>{
        if(
            line.includes('return-preview') ||
            line.includes("app.post('/api/v16/sales") ||
            line.includes('VENDA_ENTREGUE_EXIGE_PROPRIETARIO')
        ){
            console.log(
                String(i+1).padStart(4,' '),
                '|',
                line
            );
        }
    });
