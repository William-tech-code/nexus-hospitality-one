Set-Location "C:\Users\rodri\Desktop\NEXUS-HOSPITALITY-ONE\NEXUS-HOSPITALITY-ONE"
$ErrorActionPreference="Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NEXUS HOSPITALITY ONE" -ForegroundColor Yellow
Write-Host " V2.3.0-B29 - SMART POS DEEP FINAL RECOVERY" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

# ============================================================
# 1. BACKUP ATOMICO DOS 8 ARQUIVOS
# ============================================================

$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$backup=".\backups\V2.3.0-B29-MASTER-$stamp"

New-Item -ItemType Directory -Force "$backup\src" | Out-Null

$targets=@(
 ".\src\BusinessV15.jsx",
 ".\src\desktopPrintRuntime.js",
 ".\src\desktopPrintWorker.js",
 ".\src\format.js",
 ".\src\OperationalV03.jsx",
 ".\src\PremiumV05.jsx",
 ".\src\RecentSalesV16.jsx",
 ".\src\SmartPOSV16.jsx"
)

foreach($f in $targets){
 if(!(Test-Path $f)){
   throw "ARQUIVO_AUSENTE=$f"
 }
 Copy-Item $f "$backup\src\$([IO.Path]::GetFileName($f))" -Force
}

Write-Host "BACKUP=$backup" -ForegroundColor Green

# ============================================================
# 2. MASTER REPAIR
# ============================================================

@'
import fs from "node:fs";
import * as esbuild from "esbuild";

const changed=[];

function read(file){
  return fs.readFileSync(file,"utf8");
}

function write(file,src){
  fs.writeFileSync(file,src,"utf8");
}

function exact(file,name,from,to,required=true){

  let src=read(file);

  const count=src.split(from).length-1;

  console.log(`${name}_MATCHES=${count}`);

  if(count===0){

    if(required){
      console.error(`${name}=NOT_FOUND`);
      process.exit(80);
    }

    return false;
  }

  if(count!==1){
    console.error(`${name}=UNSAFE_COUNT_${count}`);
    process.exit(81);
  }

  src=src.replace(from,to);
  write(file,src);

  changed.push(name);

  console.log(`${name}=APPLIED`);

  return true;
}

function regexOne(file,name,re,to,required=true){

  let src=read(file);

  const matches=[...src.matchAll(re)];

  console.log(`${name}_MATCHES=${matches.length}`);

  if(matches.length===0){

    if(required){
      console.error(`${name}=NOT_FOUND`);
      process.exit(82);
    }

    return false;
  }

  if(matches.length!==1){
    console.error(`${name}=UNSAFE_COUNT_${matches.length}`);
    process.exit(83);
  }

  src=src.replace(re,to);
  write(file,src);

  changed.push(name);

  console.log(`${name}=APPLIED`);

  return true;
}

function parse(file){

  const src=read(file);

  try{

    esbuild.transformSync(src,{
      loader:file.endsWith(".jsx")?"jsx":"js",
      jsx:"automatic",
      sourcefile:file,
      logLevel:"silent"
    });

    return null;

  }catch(err){

    return err.errors?.[0] || {
      text:String(err)
    };
  }
}

/*
==============================================================
BUSINESS V15
==============================================================
*/

// available_qty
regexOne(
 "./src/BusinessV15.jsx",
 "BUSINESS_AVAILABLE_QTY",
 /available_qty:\s*Number\(\s*i\.returnable_qty\s*\?\s*Math\.max\(\s*0,\s*Number\(i\.qty\|\|0\)-\s*Number\(i\.returned_qty\|\|0\)\s*\)\s*\)/g,
 `available_qty:
          i.returnable_qty != null
            ? Number(i.returnable_qty)
            : Math.max(
                0,
                Number(i.qty||0) -
                Number(i.returned_qty||0)
              )`,
 false
);

// return total atual comprovado pelo B24
regexOne(
 "./src/BusinessV15.jsx",
 "BUSINESS_RETURN_TOTAL",
 /const total=\s*Number\(\s*preview\?\.return_total\s*\?\s*preview\?\.total\s*\?\s*requested\.reduce\([\s\S]*?\)\s*\);/g,
 match=>{
   /*
   Preserva integralmente o reduce existente.
   Apenas recupera os operadores ?? perdidos.
   */
   return match
     .replace(
       /preview\?\.return_total\s*\?\s*preview\?\.total\s*\?/,
       "preview?.return_total ?? preview?.total ??"
     );
 },
 false
);

/*
==============================================================
DESKTOP PRINT RUNTIME
==============================================================
*/

exact(
 "./src/desktopPrintRuntime.js",
 "PRINT_RUNTIME_ENV",
 "environment:electron  'ELECTRON' : 'BROWSER'",
 "environment:electron ? 'ELECTRON' : 'BROWSER'"
);

/*
==============================================================
DESKTOP PRINT WORKER
==============================================================
*/

exact(
 "./src/desktopPrintWorker.js",
 "PRINT_WORKER_SALE_ID",
 "saleId:job.sale_id  null",
 "saleId:job.sale_id ?? null"
);

// nested array ternary previously mapped
regexOne(
 "./src/desktopPrintWorker.js",
 "PRINT_WORKER_JOBS_ARRAY",
 /const jobs = Array\.isArray\(response\)\s+response\s+:\s+Array\.isArray\(response\?\.jobs\)\s+response\.jobs\s+:\s+Array\.isArray\(response\?\.data\)\s+response\.data\s+:\s+\[\];/g,
 `const jobs = Array.isArray(response)
    ? response
    : Array.isArray(response?.jobs)
      ? response.jobs
      : Array.isArray(response?.data)
        ? response.data
        : [];`,
 false
);

/*
==============================================================
FORMAT
==============================================================
*/

exact(
 "./src/format.js",
 "FORMAT_PARSE_BR",
 "String(v?'')",
 "String(v??'')"
);

/*
==============================================================
OPERATIONAL V03
==============================================================
*/

regexOne(
 "./src/OperationalV03.jsx",
 "OPERATIONAL_LEAD_DAYS",
 /\{x\.lead_days\?'[^']*'\}\s*dias/g,
 "{x.lead_days ? x.lead_days : '\\u2014'} dias"
);

/*
==============================================================
PREMIUM V05
==============================================================
*/

exact(
 "./src/PremiumV05.jsx",
 "PREMIUM_EDIT_NULLISH",
 "package_ml:p.package_ml?'',dose_ml:p.dose_ml?'',stock:p.stock?'',minimum_stock:p.minimum_stock?''",
 "package_ml:p.package_ml??'',dose_ml:p.dose_ml??'',stock:p.stock??'',minimum_stock:p.minimum_stock??''"
);

/*
==============================================================
RECENT SALES V16
==============================================================
*/

regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_RETURN_TOTAL",
 /Number\(\s*preview\?\.return_total\s*\?\s*preview\?\.total\s*\?\s*fallbackTotal\s*\)/g,
 "Number(preview?.return_total ?? preview?.total ?? fallbackTotal)"
);

// outras duas camadas já conhecidas da análise anterior
exact(
 "./src/RecentSalesV16.jsx",
 "RECENT_LOADING_BUTTON",
 "{loading  'ATUALIZANDO...' : 'ATUALIZAR'}",
 "{loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}",
 false
);

exact(
 "./src/RecentSalesV16.jsx",
 "RECENT_ACTIVE_CLASS",
 "(selected?.id === sale.id  'active' : '')",
 "(selected?.id === sale.id ? 'active' : '')",
 false
);

/*
==============================================================
SMART POS V16
==============================================================
*/

exact(
 "./src/SmartPOSV16.jsx",
 "POS_NUM_NULLISH",
 "String(v?'')",
 "String(v??'')"
);

regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_NORMALIZED",
 /raw\.includes\(','\)\s+raw\.replace\(\/\\\.\/g,''\)\.replace\(',','\.'\)\s+:\s+raw/g,
 "raw.includes(',') ? raw.replace(/\\./g,'').replace(',','.') : raw"
);

regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_UPDATE_PERSON",
 /i===index\s+(\{\.\.\.person,\.\.\.patch\})\s*:\s*person/g,
 "i===index ? $1 : person"
);

regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_SINGLE_RECEIVED",
 /singleMethod==='DINHEIRO'\s+singleReceivedValue\s*:\s*total/g,
 "singleMethod==='DINHEIRO' ? singleReceivedValue : total"
);

/*
==============================================================
B26 - CAMADAS FINAIS COMPROVADAS PELO B25
==============================================================
*/

/*
RECENT SALES
status CANCELLED -> classe do botao
*/
regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_CANCEL_CLASS_FINAL",
 /selected\.status === 'CANCELLED'\s+'recent-sale-cancel-disabled'\s*:\s*'recent-sale-cancel'/g,
 "selected.status === 'CANCELLED' ? 'recent-sale-cancel-disabled' : 'recent-sale-cancel'",
 false
);

/*
RECENT SALES
title do botao cancelado
*/
regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_CANCEL_TITLE_FINAL",
 /selected\.status === 'CANCELLED'\s+'Venda ja cancelada'\s*:\s*'Cancelar venda com motivo obrigatorio e registro de auditoria'/g,
 "selected.status === 'CANCELLED' ? 'Venda ja cancelada' : 'Cancelar venda com motivo obrigatorio e registro de auditoria'",
 false
);

/*
RECENT SALES
label do botao cancelado
*/
regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_CANCEL_LABEL_FINAL",
 /selected\.status === 'CANCELLED'\s+'VENDA CANCELADA'\s*:\s*'CANCELAR VENDA - AUDITADO'/g,
 "selected.status === 'CANCELLED' ? 'VENDA CANCELADA' : 'CANCELAR VENDA - AUDITADO'",
 false
);

/*
SMART POS
singleChange.

Estado conhecido:
singleMethod==='DINHEIRO'
   Math.max(...)
  : 0

Recuperar ?.
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_SINGLE_CHANGE_FINAL",
 /singleMethod==='DINHEIRO'\s+Math\.max\(/g,
 "singleMethod==='DINHEIRO' ? Math.max(",
 false
);

/*
SMART POS
add(product)

Estado comprovado no B25:
item.id===product.id
   {...item,qty:item.qty+1}
  : item
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_ADD_PRODUCT_FINAL",
 /item\.id===product\.id\s+(\{\.\.\.item,qty:item\.qty\+1\})\s*:\s*item/g,
 "item.id===product.id ? $1 : item",
 false
);

/*
SMART POS
qty(id,delta)

Mesma corrupcao em atualizacao de quantidade.
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_QTY_UPDATE_FINAL",
 /item\.id===id\s+(\{\.\.\.item,qty:item\.qty\+delta\})\s*:\s*item/g,
 "item.id===id ? $1 : item",
 false
);

/*
SMART POS
updatePerson

Pode ser revelado novamente depois das camadas anteriores.
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_UPDATE_PERSON_FINAL_B26",
 /i===index\s+(\{\.\.\.person,\.\.\.patch\})\s*:\s*person/g,
 "i===index ? $1 : person",
 false
);

/*
SMART POS
received_amount dinheiro
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_RECEIVED_AMOUNT_FINAL_B26",
 /singleMethod==='DINHEIRO'\s+singleReceivedValue\s*:\s*total/g,
 "singleMethod==='DINHEIRO' ? singleReceivedValue : total",
 false
);

/*
==============================================================
B27 - ULTIMAS TERNARIAS MAPEADAS
==============================================================
*/

/*
RECENT SALES
cursor do botao de devolucao.

A condicao completa termina em DEVOLVIDA.
O ? pertence DEPOIS da condicao inteira.
*/
regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_RETURN_CURSOR_B27",
 /selected\?\.return_coverage\?\.status === 'DEVOLVIDA'\s+'not-allowed'\s*:\s*'pointer'/g,
 "selected?.return_coverage?.status === 'DEVOLVIDA' ? 'not-allowed' : 'pointer'",
 false
);

/*
RECENT SALES
rotulo VENDA TOTALMENTE DEVOLVIDA.
*/
regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_FULL_RETURN_LABEL_B27",
 /selected\?\.return_coverage\?\.status === 'DEVOLVIDA'\s+'VENDA TOTALMENTE DEVOLVIDA'\s*:/g,
 "selected?.return_coverage?.status === 'DEVOLVIDA' ? 'VENDA TOTALMENTE DEVOLVIDA' :",
 false
);

/*
RECENT SALES
rotulo DEVOLUCAO PARCIAL.
*/
regexOne(
 "./src/RecentSalesV16.jsx",
 "RECENT_PARTIAL_RETURN_LABEL_B27",
 /selected\?\.return_coverage\?\.status === 'DEVOLUCAO_PARCIAL'\s+'REALIZAR NOVA DEVOLUCAO'\s*:\s*'DEVOLVER ITENS - AUDITADO'/g,
 "selected?.return_coverage?.status === 'DEVOLUCAO_PARCIAL' ? 'REALIZAR NOVA DEVOLUCAO' : 'DEVOLVER ITENS - AUDITADO'",
 false
);

/*
SMART POS
forma de pagamento interna.

IMPORTANTE:
MISTO continua apenas como representacao interna da venda
quando existem multiplos pagamentos.
Nao altera a interface simplificada.
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_PAYMENT_METHOD_B27",
 /payments\.length>1\s+'MISTO'\s*:\s*payments\[0\]\.method/g,
 "payments.length>1 ? 'MISTO' : payments[0].method"
);

/*
SMART POS
valor fisicamente recebido em dinheiro.
Mantem a regra correta de troco.
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_CASH_RECEIVED_B27",
 /cashAmount>0\s+receivedCash\s*:\s*total/g,
 "cashAmount>0 ? receivedCash : total"
);

console.log("B27_ADDITIONAL_PATCHES=READY");

/*
==============================================================
B28 - SMART POS METHOD SELECTED TERNARY
==============================================================

Estado comprovado:

singleMethod===method.id
   'selected'
  : ''

Correto:

singleMethod===method.id
  ? 'selected'
  : ''

==============================================================
*/

regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_METHOD_SELECTED_B28",
 /singleMethod===method\.id\s+'selected'\s*:\s*''/g,
 "singleMethod===method.id ? 'selected' : ''"
);

console.log("B28_FINAL_KNOWN_PATCH=APPLIED");

/*
==============================================================
B29 - SMART POS DEEP FINAL LAYER
==============================================================
*/

/*
1. BOTAO FINALIZAR PAGAMENTO UNICO

Estado atual comprovado:
{busy
   'FINALIZANDO...'
  : 'CONFIRMAR E FINALIZAR'
}
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_SINGLE_FINISH_BUSY_B29",
 /\{busy\s+'FINALIZANDO\.\.\.'\s*:\s*'CONFIRMAR E FINALIZAR'\s*\}/g,
 "{busy ? 'FINALIZANDO...' : 'CONFIRMAR E FINALIZAR'}"
);

/*
2. BOTAO FINALIZAR PAGAMENTO DIVIDIDO
Mesma estrutura, caso exista com outro texto.
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_SPLIT_FINISH_BUSY_B29",
 /\{busy\s+'FINALIZANDO\.\.\.'\s*:\s*'FINALIZAR PAGAMENTO'\s*\}/g,
 "{busy ? 'FINALIZANDO...' : 'FINALIZAR PAGAMENTO'}",
 false
);

/*
3. BUSY / PROCESSANDO
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_PROCESSING_BUSY_B29",
 /\{busy\s+'PROCESSANDO\.\.\.'\s*:\s*'([^']+)'\s*\}/g,
 "{busy ? 'PROCESSANDO...' : '$1'}",
 false
);

/*
4. CLASSE SELECTED DE METODOS POR PESSOA
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_PERSON_METHOD_SELECTED_B29",
 /person\.method===method\.id\s+'selected'\s*:\s*''/g,
 "person.method===method.id ? 'selected' : ''",
 false
);

/*
5. TROCO POR PESSOA
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_PERSON_CASH_CHANGE_B29",
 /person\.method==='DINHEIRO'\s+Math\.max\(/g,
 "person.method==='DINHEIRO' ? Math.max(",
 false
);

/*
6. TEXTO PAGO / PENDENTE
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_PERSON_PAID_LABEL_B29",
 /person\.paid\s+'PAGO'\s*:\s*'PENDENTE'/g,
 "person.paid ? 'PAGO' : 'PENDENTE'",
 false
);

/*
7. CLASSE PAGO
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_PERSON_PAID_CLASS_B29",
 /person\.paid\s+'paid'\s*:\s*''/g,
 "person.paid ? 'paid' : ''",
 false
);

/*
8. DISABLED POR BUSY
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_BUSY_DISABLED_TEXT_B29",
 /busy\s+'disabled'\s*:\s*''/g,
 "busy ? 'disabled' : ''",
 false
);

/*
9. PAYMENT MODE SINGLE
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_MODE_SINGLE_CLASS_B29",
 /paymentMode==='SINGLE'\s+'selected'\s*:\s*''/g,
 "paymentMode==='SINGLE' ? 'selected' : ''",
 false
);

/*
10. PAYMENT MODE SPLIT
*/
regexOne(
 "./src/SmartPOSV16.jsx",
 "POS_MODE_SPLIT_CLASS_B29",
 /paymentMode==='SPLIT'\s+'selected'\s*:\s*''/g,
 "paymentMode==='SPLIT' ? 'selected' : ''",
 false
);

console.log("B29_DEEP_SMARTPOS_PATCHES=READY");

/*
==============================================================
PARSE ITERATIVO DOS 8 ARQUIVOS
==============================================================
*/

const targets=[
 "./src/BusinessV15.jsx",
 "./src/desktopPrintRuntime.js",
 "./src/desktopPrintWorker.js",
 "./src/format.js",
 "./src/OperationalV03.jsx",
 "./src/PremiumV05.jsx",
 "./src/RecentSalesV16.jsx",
 "./src/SmartPOSV16.jsx"
];

console.log("");
console.log("=== TARGET PARSE ===");

let failures=[];

for(const file of targets){

 const error=parse(file);

 if(!error){
   console.log("TARGET_PASS="+file);
   continue;
 }

 failures.push({
   file,
   line:error.location?.line,
   column:error.location?.column,
   error:error.text
 });

 console.log("");
 console.log("TARGET_FAIL="+file);
 console.log(
   `LOCATION=${error.location?.line}:${error.location?.column}`
 );
 console.log("ERROR="+error.text);

 const src=read(file);
 const lines=src.split(/\r?\n/);
 const line=error.location?.line||1;

 for(
   let i=Math.max(1,line-15);
   i<=Math.min(lines.length,line+20);
   i++
 ){
   console.log(
     `${i===line?">>>":"   "} ${String(i).padStart(5)} | ${lines[i-1]}`
   );
 }
}

console.log("");
console.log("MASTER_PATCHES="+changed.length);
console.log("TARGET_BROKEN="+failures.length);

if(failures.length){

 console.log("FAILURES_JSON=");
 console.log(JSON.stringify(failures,null,2));

 process.exit(90);
}

console.log("B25_TARGETS=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){

 Write-Host ""
 Write-Host "B25 ENCONTROU CAMADA ADICIONAL." -ForegroundColor Red
 Write-Host "RESTAURANDO BACKUP ATOMICO..." -ForegroundColor Yellow

 foreach($f in $targets){
   $name=[IO.Path]::GetFileName($f)
   Copy-Item "$backup\src\$name" $f -Force
 }

 Write-Host "ROLLBACK=COMPLETE" -ForegroundColor Green
 Write-Host "DATABASE=NAO TOCADO"
 Write-Host "BACKEND=NAO TOCADO"
 Write-Host "PRINTING=NAO TOCADO"
 Write-Host "VENDA_12=NAO TOCADA"
 Write-Host "VENDA_13=NAO TOCADA"

 throw "B29_EXTRA_LAYER_FOUND"
}

# ============================================================
# 3. ZERO-TOLERANCE DE TODO SRC
# ============================================================

Write-Host ""
Write-Host "=== ZERO-TOLERANCE TODO SRC ===" -ForegroundColor Cyan

@'
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

function walk(dir){

 let out=[];

 for(const e of fs.readdirSync(dir,{withFileTypes:true})){

   const p=path.join(dir,e.name);

   if(e.isDirectory())
     out.push(...walk(p));

   else if(/\.(js|jsx|mjs)$/i.test(e.name))
     out.push(p);
 }

 return out;
}

const files=walk("./src");
const failures=[];

for(const file of files){

 const src=fs.readFileSync(file,"utf8");

 try{

   esbuild.transformSync(src,{
     loader:file.endsWith(".jsx")?"jsx":"js",
     jsx:"automatic",
     sourcefile:file,
     logLevel:"silent"
   });

   console.log("SRC_PASS="+file);

 }catch(err){

   const e=err.errors?.[0];

   failures.push({
     file,
     line:e?.location?.line,
     column:e?.location?.column,
     error:e?.text
   });

   console.log(
     `SRC_FAIL=${file}:${e?.location?.line}:${e?.location?.column} :: ${e?.text}`
   );
 }
}

console.log("");
console.log("SRC_FILES="+files.length);
console.log("SRC_BROKEN="+failures.length);

if(failures.length){

 console.log(JSON.stringify(failures,null,2));
 process.exit(91);
}

console.log("SRC_ALL=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){

 foreach($f in $targets){
   $name=[IO.Path]::GetFileName($f)
   Copy-Item "$backup\src\$name" $f -Force
 }

 throw "B29_SRC_FAIL_ROLLBACK"
}

# ============================================================
# 4. BACKEND / ELECTRON
# ============================================================

Write-Host ""
Write-Host "=== BACKEND + ELECTRON ===" -ForegroundColor Cyan

$nodeFiles=@()

$nodeFiles += Get-ChildItem ".\server" -Recurse -File |
 Where-Object {$_.Extension -in ".js",".cjs",".mjs"}

$nodeFiles += Get-ChildItem ".\electron" -Recurse -File |
 Where-Object {$_.Extension -in ".js",".cjs",".mjs"}

$nodeFiles=$nodeFiles | Sort-Object FullName -Unique

$nodeFailures=0

foreach($f in $nodeFiles){

 node --check $f.FullName

 if($LASTEXITCODE -ne 0){
   Write-Host "NODE_FAIL=$($f.FullName)" -ForegroundColor Red
   $nodeFailures++
 }
}

if($nodeFailures){
 throw "B26_BACKEND_REGRESSION"
}

Write-Host "BACKEND_NODE_ALL=PASS" -ForegroundColor Green

# ============================================================
# 5. BUILD
# ============================================================

Write-Host ""
Write-Host "=== PRODUCTION BUILD ===" -ForegroundColor Cyan

npm run build

if($LASTEXITCODE -ne 0){
 throw "B26_BUILD_FAIL"
}

Write-Host "PRODUCTION_BUILD=PASS" -ForegroundColor Green

# ============================================================
# 6. MASTER CONTRACT AUDIT
# ============================================================

Write-Host ""
Write-Host "=== CRITICAL CONTRACT AUDIT ===" -ForegroundColor Cyan

@'
import fs from "node:fs";

const checks=[];

function check(file,name,needles){

 const src=fs.readFileSync(file,"utf8");

 const ok=needles.every(n=>src.includes(n));

 checks.push({name,ok});

 console.log(`${name}=${ok?'PASS':'FAIL'}`);
}

check(
 "./server/transaction-engine.js",
 "UNIFIED_SALE",
 ["createUnifiedSale","payment_splits"]
);

check(
 "./server/operation-v14.js",
 "CASH_CHANGE",
 ["received_amount","change_amount","DINHEIRO"]
);

check(
 "./server/return-routes-v16.js",
 "RETURN_ENGINE",
 ["SALE_RETURNED_V16","sale_return_payment_reversals"]
);

check(
 "./server/print-jobs-engine.js",
 "SAFE_PRINT_QUEUE",
 ["QUEUED","PRINTED","FAILED"]
);

check(
 "./src/SmartPOSV16.jsx",
 "SPLIT_CHECKOUT",
 ["buildSplitPayments","splitCashReceived","personChange"]
);

const failed=checks.filter(x=>!x.ok);

console.log("CONTRACT_FAILURES="+failed.length);

if(failed.length)
 process.exit(92);

console.log("MASTER_CONTRACTS=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){
 throw "B26_CONTRACT_FAIL"
}

# ============================================================
# 7. DB READ ONLY
# ============================================================

Write-Host ""
Write-Host "=== DATABASE PRESERVATION ===" -ForegroundColor Cyan

@'
import Database from "better-sqlite3";

const db=new Database(
 "./data/nexus-hospitality.sqlite",
 {readonly:true,fileMustExist:true}
);

const integrity=
 db.prepare("PRAGMA integrity_check").all();

const s12=
 db.prepare(
   "SELECT id,status,total FROM sales WHERE id=12"
 ).get();

const s13=
 db.prepare(
   "SELECT id,status,total FROM sales WHERE id=13"
 ).get();

const r12=
 db.prepare(
   "SELECT COUNT(*) qty FROM sale_returns WHERE sale_id=12"
 ).get();

const p5=
 db.prepare(
   "SELECT id,name,stock FROM products WHERE id=5"
 ).get();

console.log("SALE12="+JSON.stringify(s12));
console.log("SALE13="+JSON.stringify(s13));
console.log("RETURN12="+r12.qty);
console.log("PRODUCT5="+JSON.stringify(p5));
console.log("INTEGRITY="+JSON.stringify(integrity));

const ok=
 s12?.status==="PAID" &&
 s13?.status==="CANCELLED" &&
 Number(r12.qty)===1 &&
 Number(p5?.stock)===15 &&
 integrity.every(x=>x.integrity_check==="ok");

db.close();

if(!ok)
 process.exit(93);

console.log("DATABASE_FORENSIC=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){
 throw "B26_DATABASE_FAIL"
}

# ============================================================
# 8. VITE / HEALTH
# ============================================================

$config=Get-Content ".\vite.config.js" -Raw

if(
 $config -notmatch "port\s*:\s*5180" -or
 $config -notmatch "8989"
){
 throw "B26_VITE_FAIL"
}

Write-Host "VITE_5180=PASS" -ForegroundColor Green
Write-Host "PROXY_8989=PASS" -ForegroundColor Green

try{

 Invoke-RestMethod `
   -Uri "http://127.0.0.1:8989/api/health" `
   -TimeoutSec 5 |
   Out-Null

 Write-Host "BACKEND_8989=ONLINE" -ForegroundColor Green

}catch{

 Write-Host "BACKEND_8989=OFFLINE / CODIGO PRESERVADO" -ForegroundColor Yellow
}

# ============================================================
# FINAL
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " NEXUS HOSPITALITY ONE V2.3.0" -ForegroundColor Yellow
Write-Host " B29 FINAL FRONTEND RECOVERY = PASS" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Write-Host ""
Write-Host " FRONTEND 22 FILES      = PASS" -ForegroundColor Green
Write-Host " BUSINESS V15           = PASS" -ForegroundColor Green
Write-Host " OPERATIONAL V03        = PASS" -ForegroundColor Green
Write-Host " SMART POS V16          = PASS" -ForegroundColor Green
Write-Host " RECENT SALES V16       = PASS" -ForegroundColor Green
Write-Host " PRINT FRONTEND         = PASS" -ForegroundColor Green
Write-Host " FORMAT                  = PASS" -ForegroundColor Green
Write-Host " PREMIUM V05             = PASS" -ForegroundColor Green
Write-Host " BACKEND / ELECTRON      = PASS" -ForegroundColor Green
Write-Host " MASTER CONTRACTS        = PASS" -ForegroundColor Green
Write-Host " PRODUCTION BUILD        = PASS" -ForegroundColor Green
Write-Host " DATABASE                = PASS / READ ONLY" -ForegroundColor Green
Write-Host " VENDA #12               = PRESERVADA" -ForegroundColor Green
Write-Host " VENDA #13               = PRESERVADA" -ForegroundColor Green
Write-Host " PHYSICAL PRINTING       = OFF" -ForegroundColor Yellow
Write-Host ""
Write-Host "BACKUP=$backup"
Write-Host ""
Write-Host "RECOVERY_FRONTEND=ENCERRADA" -ForegroundColor Green
Write-Host "NEXT=FINAL_OPERACIONAL_EM_LOTE" -ForegroundColor Yellow



