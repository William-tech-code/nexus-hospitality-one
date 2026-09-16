import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  engine: path.join(root, "server", "print-jobs-engine.js"),
  renderer: path.join(root, "server", "document-renderer.js"),
  index: path.join(root, "server", "index.js"),
  api: path.join(root, "src", "api.js"),
  pos: path.join(root, "src", "SmartPOSV16.jsx")
};

function read(file){
  return fs.readFileSync(file, "utf8");
}

function write(file, value){
  fs.writeFileSync(file, value, "utf8");
}

function assert(condition, message){
  if(!condition){
    throw new Error(message);
  }
}

function replaceOnce(source, search, replacement, label){

  const first = source.indexOf(search);

  assert(
    first >= 0,
    "ANCHOR_NOT_FOUND=" + label
  );

  const second =
    source.indexOf(
      search,
      first + search.length
    );

  assert(
    second < 0,
    "ANCHOR_NOT_UNIQUE=" + label
  );

  return (
    source.slice(0, first) +
    replacement +
    source.slice(first + search.length)
  );
}

/* ==========================================================
   A. PRINT JOB ENGINE
   ========================================================== */

let engine = read(files.engine);

const oldQueue = `  function queueSaleDocuments({
    saleId,
    requestedBy = null,
    mode = "SIMULATION"
  }) {

    const transaction =
      db.transaction(() => {

        const pickup =
          queueJob({
            saleId,
            documentType:
              "PICKUP",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        const receipt =
          queueJob({
            saleId,
            documentType:
              "RECEIPT",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        return {
          pickup,
          receipt
        };
      });

    return transaction();
  }`;

const newQueue = `  function queueSaleDocuments({
    saleId,
    requestedBy = null,
    mode = "SIMULATION"
  }) {

    /*
      NEXUS HOSPITALITY ONE V2.1.6

      Fluxo documental oficial da venda:

      1. PICKUP_CUSTOMER
         Ficha numerada entregue ao cliente.

      2. PRODUCTION
         Via operacional para preparo/producao.

      3. RECEIPT
         Comprovante da venda.

      A retirada fisica NAO depende de released_at.
      A fila possui idempotencia por venda/documento/purpose.
    */

    const transaction =
      db.transaction(() => {

        const pickupCustomer =
          queueJob({
            saleId,
            documentType:
              "PICKUP_CUSTOMER",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        const production =
          queueJob({
            saleId,
            documentType:
              "PRODUCTION",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        const receipt =
          queueJob({
            saleId,
            documentType:
              "RECEIPT",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        return {
          pickup_customer:
            pickupCustomer,
          production,
          receipt
        };
      });

    return transaction();
  }`;

engine = replaceOnce(
  engine,
  oldQueue,
  newQueue,
  "QUEUE_SALE_DOCUMENTS"
);

write(files.engine, engine);

/* ==========================================================
   B. DOCUMENT RENDERER
   Corrigir somente a linguagem de obrigatoriedade.
   ========================================================== */

let renderer = read(files.renderer);

renderer =
  renderer.replace(
    /FICHA OBRIGAT[ÓO]RIA PARA ENTREGA/giu,
    "APRESENTE ESTA FICHA NA RETIRADA"
  );

renderer =
  renderer.replace(
    /FICHA OBRIGATORIA PARA ENTREGA/giu,
    "APRESENTE ESTA FICHA NA RETIRADA"
  );

write(files.renderer, renderer);

/* ==========================================================
   C. SERVER
   Importa engine e cria rota moderna.
   ========================================================== */

let index = read(files.index);

const importAnchor =
  `import './transaction-engine.js';`;

const importReplacement =
  `import './transaction-engine.js';
import {createPrintJobsEngine} from './print-jobs-engine.js';`;

if(
  !index.includes(
    `createPrintJobsEngine} from './print-jobs-engine.js'`
  )
){
  index = replaceOnce(
    index,
    importAnchor,
    importReplacement,
    "PRINT_ENGINE_IMPORT"
  );
}

const routeAnchor =
  `registerReturnRoutesV16(app,{auth,minRole,audit});`;

const routeBlock = `registerReturnRoutesV16(app,{auth,minRole,audit});

/*
  NEXUS HOSPITALITY ONE V2.1.6
  Nova fila documental do PDV.

  Esta rota NAO marca retirada/liberacao.
  Ela somente registra os documentos operacionais
  no print_jobs.
*/
const printJobsEngine =
  createPrintJobsEngine({db});

app.post(
  '/api/v16/sales/:id/documents',
  auth,
  minRole(40),
  (req,res)=>{

    try{

      const saleId =
        Number(req.params.id);

      if(
        !Number.isInteger(saleId) ||
        saleId <= 0
      ){
        return res.status(400).json({
          error:'VENDA_INVALIDA'
        });
      }

      const sale =
        printJobsEngine.getSale(
          saleId
        );

      if(
        String(sale.status || '')
          .toUpperCase() !== 'PAID'
      ){
        return res.status(409).json({
          error:'VENDA_NAO_PAGA'
        });
      }

      const mode =
        String(
          req.body?.mode ||
          'SIMULATION'
        )
        .trim()
        .toUpperCase();

      const documents =
        printJobsEngine.queueSaleDocuments({
          saleId,
          requestedBy:req.user.id,
          mode
        });

      const jobs =
        printJobsEngine.listJobsForSale(
          saleId
        );

      audit(
        req.user.id,
        'SALE_DOCUMENTS_QUEUED',
        'SALE',
        saleId,
        {
          mode,
          documents:[
            'PICKUP_CUSTOMER',
            'PRODUCTION',
            'RECEIPT'
          ],
          engine:'V2.1.6'
        }
      );

      return res.json({
        ok:true,
        sale_id:saleId,
        mode,
        documents,
        jobs
      });

    }catch(error){

      console.error(
        '[NEXUS][PRINT_JOBS]',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'PRINT_QUEUE_ERROR'
      });
    }
  }
);`;

if(
  !index.includes(
    "'/api/v16/sales/:id/documents'"
  )
){
  index = replaceOnce(
    index,
    routeAnchor,
    routeBlock,
    "DOCUMENT_ROUTE"
  );
}

write(files.index, index);

/* ==========================================================
   D. FRONTEND API
   Adiciona metodo sem destruir a API existente.
   ========================================================== */

let api = read(files.api);

assert(
  !api.includes("queueSaleDocumentsV16"),
  "API_METHOD_ALREADY_EXISTS"
);

const apiClosing =
  api.lastIndexOf("}");

assert(
  apiClosing >= 0,
  "API_CLOSING_NOT_FOUND"
);

/*
  Detectamos o estilo atual da API pelas chamadas existentes.
  Inserimos o metodo antes do fechamento do objeto exportado.
*/

const method = `

  queueSaleDocumentsV16:
    (id, mode='SIMULATION') =>
      request(
        \`/v16/sales/\${id}/documents\`,
        {
          method:'POST',
          body:JSON.stringify({mode})
        }
      ),
`;

const beforeClosing =
  api.slice(0, apiClosing);

const afterClosing =
  api.slice(apiClosing);

const trimmed =
  beforeClosing.trimEnd();

if(trimmed.endsWith(",")){
  api =
    trimmed +
    method +
    afterClosing;
}else{
  api =
    trimmed +
    "," +
    method +
    afterClosing;
}

write(files.api, api);

/* ==========================================================
   E. SMART POS
   Troca somente postSaleFlow.
   Checkout permanece intacto.
   ========================================================== */

let pos = read(files.pos);

const start =
  pos.indexOf(
    "  async function postSaleFlow(sale){"
  );

assert(
  start >= 0,
  "POST_SALE_FLOW_START_NOT_FOUND"
);

const next =
  pos.indexOf(
    "  async function finishSingle(){",
    start
  );

assert(
  next > start,
  "POST_SALE_FLOW_END_NOT_FOUND"
);

const newPostSale = `  async function postSaleFlow(sale){

    /*
      NEXUS HOSPITALITY ONE V2.1.6

      Venda confirmada = venda concluida.

      Depois do pagamento, registramos automaticamente:

      - ficha do cliente
      - ficha de producao
      - comprovante

      Nenhum desses documentos bloqueia a retirada.

      Neste momento usamos SIMULATION:
      a fila e os documentos sao reais,
      mas ainda nao enviamos fisicamente
      para a impressora termica.

      A camada Electron/thermal printer sera
      conectada na proxima evolucao.
    */

    try{

      const printResult =
        await api.queueSaleDocumentsV16(
          sale.id,
          'SIMULATION'
        );

      return{
        ...sale,
        print_jobs:
          printResult?.jobs || [],
        documents_queued:true
      };

    }catch(printError){

      console.warn(
        '[NEXUS][POS] Documentos operacionais nao enfileirados:',
        printError
      );

      /*
        Falha documental NAO desfaz a venda.
        A venda ja foi confirmada pelo backend.
      */

      return{
        ...sale,
        documents_queued:false,
        print_warning:
          printError?.message ||
          'Venda concluida, mas os documentos nao foram enfileirados.'
      };
    }
  }

`;

pos =
  pos.slice(0,start) +
  newPostSale +
  pos.slice(next);

write(files.pos, pos);

console.log("PATCH_ENGINE=OK");
console.log("PATCH_RENDERER=OK");
console.log("PATCH_SERVER=OK");
console.log("PATCH_API=OK");
console.log("PATCH_POS=OK");
console.log("V2.1.6_PATCH=INSTALLED");
