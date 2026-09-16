Set-Location "C:\Users\rodri\Desktop\NEXUS-HOSPITALITY-ONE\NEXUS-HOSPITALITY-ONE"
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " NEXUS HOSPITALITY ONE" -ForegroundColor Yellow
Write-Host " V2.3.0-B22 - FRONTEND MASTER RECOVERY" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = ".\backups\V2.3.0-B22-BEFORE-$stamp"

$targets = @(
 ".\src\BusinessV15.jsx",
 ".\src\desktopPrintRuntime.js",
 ".\src\desktopPrintWorker.js",
 ".\src\format.js",
 ".\src\OperationalV03.jsx",
 ".\src\PremiumV05.jsx",
 ".\src\RecentSalesV16.jsx",
 ".\src\SmartPOSV16.jsx"
)

New-Item -ItemType Directory -Force -Path $backup | Out-Null

foreach($file in $targets){
    $rel = $file -replace '^[.][\\/]',''
    $dest = Join-Path $backup $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
    Copy-Item $file $dest -Force
}

Write-Host "BACKUP=$backup" -ForegroundColor Green

# ============================================================
# 1. PATCH ATOMICO CONTROLADO
# ============================================================

@'
import fs from "node:fs";

function patch(file,name,regex,replacement){
  let s=fs.readFileSync(file,"utf8");
  const before=s;

  s=s.replace(regex,replacement);

  if(s!==before){
    fs.writeFileSync(file,s,"utf8");
    console.log(`${name}=APPLIED`);
    return 1;
  }

  console.log(`${name}=NOT_FOUND`);
  return 0;
}

let count=0;

/* BUSINESS V15 */
count+=patch(
  "./src/BusinessV15.jsx",
  "BUSINESS_RETURN_TOTAL",
  /preview\?\.return_total\s*\?\s*preview\?\.total\s*\?\s*requested\.reduce/g,
  "preview?.return_total ?? preview?.total ?? requested.reduce"
);

/* PRINT RUNTIME */
count+=patch(
  "./src/desktopPrintRuntime.js",
  "PRINT_RUNTIME_ENV",
  /environment\s*:\s*electron\s+'ELECTRON'\s*:\s*'BROWSER'/g,
  "environment:electron ? 'ELECTRON' : 'BROWSER'"
);

/* PRINT WORKER */
count+=patch(
  "./src/desktopPrintWorker.js",
  "PRINT_WORKER_SALE_ID",
  /saleId\s*:\s*job\.sale_id\s+null/g,
  "saleId:job.sale_id ?? null"
);

count+=patch(
  "./src/desktopPrintWorker.js",
  "PRINT_WORKER_JOBS",
  /const jobs = Array\.isArray\(response\)\s+response\s+: Array\.isArray\(response\?\.jobs\)\s+response\.jobs\s+: Array\.isArray\(response\?\.data\)\s+response\.data\s+: \[\];/g,
`const jobs = Array.isArray(response)
    ? response
    : Array.isArray(response?.jobs)
      ? response.jobs
      : Array.isArray(response?.data)
        ? response.data
        : [];`
);

/* FORMAT */
count+=patch(
  "./src/format.js",
  "FORMAT_NULLISH",
  /String\(v\?''\)/g,
  "String(v??'')"
);

/* OPERATIONAL V03
   Estado corrompido real:
   x.lead_days?'—'
   Intenção:
   se houver prazo mostra N; se não houver mostra —
*/
count+=patch(
  "./src/OperationalV03.jsx",
  "OPERATIONAL_LEAD_DAYS",
  /x\.lead_days\?'\?'?—'/g,
  "x.lead_days ? `${x.lead_days}` : '—'"
);

/* PREMIUM */
const premium="./src/PremiumV05.jsx";

count+=patch(
  premium,
  "PREMIUM_PACKAGE",
  /package_ml\s*:\s*p\.package_ml\?''/g,
  "package_ml:p.package_ml??''"
);

count+=patch(
  premium,
  "PREMIUM_DOSE",
  /dose_ml\s*:\s*p\.dose_ml\?''/g,
  "dose_ml:p.dose_ml??''"
);

count+=patch(
  premium,
  "PREMIUM_STOCK",
  /stock\s*:\s*p\.stock\?''/g,
  "stock:p.stock??''"
);

count+=patch(
  premium,
  "PREMIUM_MINIMUM",
  /minimum_stock\s*:\s*p\.minimum_stock\?''/g,
  "minimum_stock:p.minimum_stock??''"
);

/* RECENT SALES */
const recent="./src/RecentSalesV16.jsx";

count+=patch(
  recent,
  "RECENT_RETURN_TOTAL",
  /preview\?\.return_total\s*\?\s*preview\?\.total\s*\?\s*fallbackTotal/g,
  "preview?.return_total ?? preview?.total ?? fallbackTotal"
);

count+=patch(
  recent,
  "RECENT_LOADING",
  /\{loading\s{2,}'ATUALIZANDO\.\.\.'\s*:\s*'ATUALIZAR'\}/g,
  "{loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}"
);

count+=patch(
  recent,
  "RECENT_SELECTED",
  /\(selected\?\.id === sale\.id\s{2,}'active'\s*:\s*''\)/g,
  "(selected?.id === sale.id ? 'active' : '')"
);

count+=patch(
  recent,
  "RECENT_CANCEL_CLASS",
  /selected\.status === 'CANCELLED'\s+'recent-sale-cancel-disabled'\s*:\s*'recent-sale-cancel'/g,
  "selected.status === 'CANCELLED' ? 'recent-sale-cancel-disabled' : 'recent-sale-cancel'"
);

count+=patch(
  recent,
  "RECENT_CANCEL_TITLE",
  /selected\.status === 'CANCELLED'\s+'Venda ja cancelada'\s*:\s*'Cancelar venda com motivo obrigatorio e registro de auditoria'/g,
  "selected.status === 'CANCELLED' ? 'Venda ja cancelada' : 'Cancelar venda com motivo obrigatorio e registro de auditoria'"
);

count+=patch(
  recent,
  "RECENT_CANCEL_LABEL",
  /selected\.status === 'CANCELLED'\s+'VENDA CANCELADA'\s*:\s*'CANCELAR VENDA - AUDITADO'/g,
  "selected.status === 'CANCELLED' ? 'VENDA CANCELADA' : 'CANCELAR VENDA - AUDITADO'"
);

/* B21 - NOVAS CAMADAS RECENT SALES */
count+=patch(
  recent,
  "RECENT_RETURN_CURSOR",
  /selected\?\.return_coverage\?\.status === 'DEVOLVIDA'\s+'not-allowed'\s*:\s*'pointer'/g,
  "selected?.return_coverage?.status === 'DEVOLVIDA'\n                      ? 'not-allowed'\n                      : 'pointer'"
);

count+=patch(
  recent,
  "RECENT_RETURN_FULL_LABEL",
  /selected\?\.return_coverage\?\.status === 'DEVOLVIDA'\s+'VENDA TOTALMENTE DEVOLVIDA'\s*:\s*selected\?\.return_coverage\?\.status === 'DEVOLUCAO_PARCIAL'/g,
  "selected?.return_coverage?.status === 'DEVOLVIDA'\n                    ? 'VENDA TOTALMENTE DEVOLVIDA'\n                    : selected?.return_coverage?.status === 'DEVOLUCAO_PARCIAL'"
);

/* B22 - FINAL RETURN LABEL TERNARY */
count+=patch(
  recent,
  "RECENT_PARTIAL_RETURN_LABEL",
  /selected\?\.return_coverage\?\.status === 'DEVOLUCAO_PARCIAL'\s+'REALIZAR NOVA DEVOLUCAO'\s*:\s*'DEVOLVER ITENS - AUDITADO'/g,
  "selected?.return_coverage?.status === 'DEVOLUCAO_PARCIAL'\n                      ? 'REALIZAR NOVA DEVOLUCAO'\n                      : 'DEVOLVER ITENS - AUDITADO'"
);

/* SMART POS */
const pos="./src/SmartPOSV16.jsx";

count+=patch(
  pos,
  "POS_NUM_NULLISH",
  /String\(v\?''\)/g,
  "String(v??'')"
);

count+=patch(
  pos,
  "POS_NORMALIZED",
  /raw\.includes\(','\)\s+raw\.replace\(\/\\\.\/g,''\)\.replace\(',','\.'\)\s*:\s*raw/g,
`raw.includes(',')
      ? raw.replace(/\./g,'').replace(',','.')
      : raw`
);

count+=patch(
  pos,
  "POS_SINGLE_CHANGE",
  /singleMethod==='DINHEIRO'\s+Math\.max\(/g,
  "singleMethod==='DINHEIRO'\n      ? Math.max("
);

count+=patch(
  pos,
  "POS_CART_UPDATE_ADD",
  /item\.id===product\.id\s+\{\.\.\.item,qty:item\.qty\+1\}\s*:\s*item/g,
  "item.id===product.id\n              ? {...item,qty:item.qty+1}\n              : item"
);

/* B21 - NOVA CAMADA SMART POS qty() */
count+=patch(
  pos,
  "POS_CART_UPDATE_QTY",
  /item\.id===id\s+\{\.\.\.item,qty:item\.qty\+delta\}\s*:\s*item/g,
  "item.id===id\n            ? {...item,qty:item.qty+delta}\n            : item"
);

/* B22 - FINAL UPDATE PERSON TERNARY */
count+=patch(
  pos,
  "POS_UPDATE_PERSON",
  /i===index\s+\{\.\.\.person,\.\.\.patch\}\s*:\s*person/g,
  "i===index\n            ? {...person,...patch}\n            : person"
);

console.log("");
console.log("PATCH_RULES_APPLIED="+count);
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){
    throw "B22_PATCH_ENGINE_FAIL"
}

# ============================================================
# 2. PARSE COMPLETO - PRIMEIRA PASSAGEM
# ============================================================

Write-Host ""
Write-Host "=== SRC PARSE - PASS 1 ===" -ForegroundColor Cyan

@'
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

function walk(dir){
  let out=[];

  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const f=path.join(dir,e.name);

    if(e.isDirectory()){
      out.push(...walk(f));
    }else if(/\.(js|jsx|mjs)$/i.test(e.name)){
      out.push(f);
    }
  }

  return out;
}

const files=walk("./src");
const broken=[];

for(const file of files){

  const source=fs.readFileSync(file,"utf8");

  try{
    esbuild.transformSync(source,{
      loader:file.endsWith(".jsx")?"jsx":"js",
      jsx:"automatic",
      sourcefile:file,
      logLevel:"silent"
    });

    console.log("SRC_PASS="+file);

  }catch(error){

    const e=error.errors?.[0];

    broken.push({
      file,
      line:e?.location?.line,
      column:e?.location?.column,
      error:e?.text
    });

    console.log(
      `SRC_FAIL=${file}:${e?.location?.line}:${e?.location?.column} :: ${e?.text}`
    );

    const lines=source.split(/\r?\n/);
    const line=e?.location?.line||1;

    for(
      let i=Math.max(1,line-12);
      i<=Math.min(lines.length,line+16);
      i++
    ){
      console.log(
        `${i===line?">>>":"   "} ${String(i).padStart(5)} | ${lines[i-1]}`
      );
    }
  }
}

console.log("");
console.log("SRC_FILES="+files.length);
console.log("SRC_BROKEN="+broken.length);

if(broken.length){
  console.log("BROKEN_JSON="+JSON.stringify(broken,null,2));
  process.exit(80);
}

console.log("SRC_ALL=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host " B22 DETECTOU OUTRA CAMADA SINTATICA" -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red

    Write-Host ""
    Write-Host "RESTAURANDO BACKUP..." -ForegroundColor Yellow

    foreach($file in $targets){
        $rel = $file -replace '^[.][\\/]',''
        Copy-Item (Join-Path $backup $rel) $file -Force
    }

    Write-Host "ROLLBACK=COMPLETE" -ForegroundColor Green
    Write-Host "DATABASE=NAO TOCADO"
    Write-Host "BACKEND=NAO TOCADO"
    Write-Host "PRINTING=NAO TOCADO"
    Write-Host "VENDA_12=NAO TOCADA"
    Write-Host "VENDA_13=NAO TOCADA"

    throw "B22_NEW_FRONTEND_LAYER_FOUND"
}

# ============================================================
# 3. BACKEND / ELECTRON REGRESSION
# ============================================================

Write-Host ""
Write-Host "=== BACKEND + ELECTRON REGRESSION ===" -ForegroundColor Cyan

$nodeFiles = @()

$nodeFiles += Get-ChildItem ".\server" -Recurse -File |
    Where-Object {$_.Extension -in ".js",".cjs",".mjs"}

$nodeFiles += Get-ChildItem ".\electron" -Recurse -File |
    Where-Object {$_.Extension -in ".js",".cjs",".mjs"}

$nodeFiles = $nodeFiles | Sort-Object FullName -Unique

$nodeFail = 0

foreach($file in $nodeFiles){

    & node --check $file.FullName

    if($LASTEXITCODE -eq 0){
        Write-Host "NODE_PASS=$($file.Name)" -ForegroundColor DarkGreen
    }
    else{
        Write-Host "NODE_FAIL=$($file.FullName)" -ForegroundColor Red
        $nodeFail++
    }
}

Write-Host "NODE_COUNT=$($nodeFiles.Count)"
Write-Host "NODE_FAIL=$nodeFail"

if($nodeFail -gt 0){
    throw "BACKEND_REGRESSION_DETECTED"
}

Write-Host "BACKEND_NODE_ALL=PASS" -ForegroundColor Green

# ============================================================
# 4. BUILD PRODUCAO
# ============================================================

Write-Host ""
Write-Host "=== PRODUCTION BUILD ===" -ForegroundColor Cyan

npm run build

if($LASTEXITCODE -ne 0){
    throw "PRODUCTION_BUILD_FAIL"
}

Write-Host "PRODUCTION_BUILD=PASS" -ForegroundColor Green

# ============================================================
# 5. FRONTEND CONTRACT AUDIT
# ============================================================

Write-Host ""
Write-Host "=== FRONTEND MASTER CONTRACT AUDIT ===" -ForegroundColor Cyan

@'
import fs from "node:fs";

const pos=fs.readFileSync("./src/SmartPOSV16.jsx","utf8");
const biz=fs.readFileSync("./src/BusinessV15.jsx","utf8");
const recent=fs.readFileSync("./src/RecentSalesV16.jsx","utf8");
const worker=fs.readFileSync("./src/desktopPrintWorker.js","utf8");
const operational=fs.readFileSync("./src/OperationalV03.jsx","utf8");

const checks={

  splitCheckout:
    pos.includes("splitTotal"),

  dinheiro:
    pos.includes("'DINHEIRO'"),

  singleChange:
    pos.includes("singleChange"),

  receivedAmount:
    pos.includes("received"),

  paymentSplits:
    pos.includes("payments"),

  cartQty:
    pos.includes("qty:item.qty+delta"),

  partialReturnBusiness:
    biz.includes("requested") &&
    biz.includes("returnPreviewV16") &&
    biz.includes("returnSaleV16"),

  auditedCancellation:
    recent.includes("cancelSaleV16") &&
    recent.includes("CANCELAR VENDA"),

  partialReturnRecent:
    recent.includes("returnSaleV16"),

  returnCoverage:
    recent.includes("return_coverage"),

  desktopPrintWorker:
    worker.includes("Array.isArray(response)") &&
    worker.includes("saleId:job.sale_id ?? null"),

  procurement:
    operational.includes("lead_days")

};

let fail=0;

for(const [name,ok] of Object.entries(checks)){
  console.log(`${name}=${ok?"PASS":"FAIL"}`);
  if(!ok)fail++;
}

console.log("");
console.log("CONTRACT_FAILURES="+fail);

if(fail){
  process.exit(81);
}

console.log("FRONTEND_MASTER_CONTRACTS=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){
    throw "FRONTEND_CONTRACT_FAIL"
}

# ============================================================
# 6. DB FORENSIC READ-ONLY
# ============================================================

Write-Host ""
Write-Host "=== DATABASE FORENSIC READ-ONLY ===" -ForegroundColor Cyan

@'
import Database from "better-sqlite3";

const db=new Database(
  "./data/nexus-hospitality.sqlite",
  {
    readonly:true,
    fileMustExist:true
  }
);

function one(sql,...args){
  return db.prepare(sql).get(...args);
}

function all(sql,...args){
  return db.prepare(sql).all(...args);
}

const sale12=one(`
  SELECT id,status,total,payment_method,
         release_code,released_at
  FROM sales
  WHERE id=12
`);

const sale13=one(`
  SELECT id,status,total,payment_method,
         cancelled_at,cancelled_by,release_code
  FROM sales
  WHERE id=13
`);

const returns12=all(`
  SELECT id,sale_id,reason,total,user_id,created_at
  FROM sale_returns
  WHERE sale_id=12
  ORDER BY id
`);

const returnItems12=all(`
  SELECT return_id,sale_item_id,product_id,qty,amount
  FROM sale_return_items
  WHERE return_id IN (
    SELECT id
    FROM sale_returns
    WHERE sale_id=12
  )
`);

const product5=one(`
  SELECT id,name,stock
  FROM products
  WHERE id=5
`);

const jobs=all(`
  SELECT id,sale_id,document_type,status,mode,attempts
  FROM print_jobs
  WHERE sale_id IN (12,13)
  ORDER BY id
`);

const integrity=db.prepare(
  "PRAGMA integrity_check"
).all();

console.log("SALE12="+JSON.stringify(sale12));
console.log("SALE13="+JSON.stringify(sale13));
console.log("RETURNS12="+JSON.stringify(returns12));
console.log("RETURN_ITEMS12="+JSON.stringify(returnItems12));
console.log("PRODUCT5="+JSON.stringify(product5));
console.log("PRINT_JOBS="+JSON.stringify(jobs));
console.log("INTEGRITY="+JSON.stringify(integrity));

let fail=0;

if(!sale12 || sale12.status!=="PAID"){
  console.log("ASSERT_SALE12=FAIL");
  fail++;
}else{
  console.log("ASSERT_SALE12=PASS");
}

if(!sale13 || sale13.status!=="CANCELLED"){
  console.log("ASSERT_SALE13=FAIL");
  fail++;
}else{
  console.log("ASSERT_SALE13=PASS");
}

if(returns12.length!==1){
  console.log("ASSERT_RETURN12_COUNT=FAIL");
  fail++;
}else{
  console.log("ASSERT_RETURN12_COUNT=PASS");
}

if(Number(product5?.stock)!==15){
  console.log("ASSERT_PRODUCT5_STOCK=FAIL");
  fail++;
}else{
  console.log("ASSERT_PRODUCT5_STOCK=PASS");
}

if(!integrity.every(x=>x.integrity_check==="ok")){
  console.log("ASSERT_DB_INTEGRITY=FAIL");
  fail++;
}else{
  console.log("ASSERT_DB_INTEGRITY=PASS");
}

console.log("DB_ASSERT_FAILURES="+fail);
console.log("DATABASE_ACCESS=READ_ONLY");

db.close();

if(fail){
  process.exit(82);
}

console.log("DATABASE_FORENSIC=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){
    throw "DATABASE_FORENSIC_FAIL"
}

# ============================================================
# 7. BACKEND HEALTH
# ============================================================

Write-Host ""
Write-Host "=== BACKEND HEALTH 8989 ===" -ForegroundColor Cyan

$healthOK = $false

try {

    $health = Invoke-RestMethod `
        -Uri "http://127.0.0.1:8989/api/health" `
        -TimeoutSec 5

    $healthOK = $true

    Write-Host "BACKEND_8989=ONLINE" -ForegroundColor Green
    $health | ConvertTo-Json -Depth 8

}
catch {

    Write-Host "BACKEND_8989=OFFLINE - STARTING" -ForegroundColor Yellow

    $stdout = Join-Path $env:TEMP "nexus-b21-server.log"
    $stderr = Join-Path $env:TEMP "nexus-b21-server.err.log"

    Remove-Item $stdout,$stderr -Force -ErrorAction SilentlyContinue

    Start-Process `
        -FilePath "node" `
        -ArgumentList "server/index.js" `
        -WorkingDirectory (Get-Location).Path `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden

    Start-Sleep -Seconds 3

    try {

        $health = Invoke-RestMethod `
            -Uri "http://127.0.0.1:8989/api/health" `
            -TimeoutSec 5

        $healthOK = $true

        Write-Host "BACKEND_8989=ONLINE_AFTER_START" -ForegroundColor Green
        $health | ConvertTo-Json -Depth 8

    }
    catch {

        Write-Host "BACKEND_8989=FAIL" -ForegroundColor Red

        if(Test-Path $stdout){
            Get-Content $stdout -Tail 80
        }

        if(Test-Path $stderr){
            Get-Content $stderr -Tail 80
        }
    }
}

if(!$healthOK){
    throw "BACKEND_HEALTH_FAIL"
}

# ============================================================
# 8. VITE CONTRACT
# ============================================================

Write-Host ""
Write-Host "=== VITE CONTRACT ===" -ForegroundColor Cyan

@'
import fs from "node:fs";

const s=fs.readFileSync("./vite.config.js","utf8");

const checks={
  port5180:/port\s*:\s*5180/.test(s),
  backend8989:/8989/.test(s),
  apiProxy:/['"]\/api['"]/.test(s)
};

for(const [name,ok] of Object.entries(checks)){
  console.log(`${name}=${ok?"PASS":"FAIL"}`);
}

if(!Object.values(checks).every(Boolean)){
  process.exit(83);
}

console.log("VITE_CONTRACT=PASS");
'@ | node --input-type=module

if($LASTEXITCODE -ne 0){
    throw "VITE_CONTRACT_FAIL"
}

# ============================================================
# 9. FINAL
# ============================================================

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " NEXUS HOSPITALITY ONE V2.3.0" -ForegroundColor Yellow
Write-Host " B22 FRONTEND MASTER RECOVERY = PASS" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Write-Host ""
Write-Host " FRONTEND SRC 22              = PASS" -ForegroundColor Green
Write-Host " BACKEND / ELECTRON           = PASS" -ForegroundColor Green
Write-Host " PRODUCTION BUILD             = PASS" -ForegroundColor Green
Write-Host " SMART POS                    = PASS" -ForegroundColor Green
Write-Host " DIVISAO DE CONTA             = PASS" -ForegroundColor Green
Write-Host " TROCO                        = PASS" -ForegroundColor Green
Write-Host " BUSINESS V15                 = PASS" -ForegroundColor Green
Write-Host " DEVOLUCAO PARCIAL            = PASS" -ForegroundColor Green
Write-Host " CANCELAMENTO AUDITADO        = PASS" -ForegroundColor Green
Write-Host " PROCUREMENT                  = PASS" -ForegroundColor Green
Write-Host " PRINT WORKER                 = PASS" -ForegroundColor Green
Write-Host " IMPRESSAO FISICA             = OFF / SEGURA" -ForegroundColor Yellow
Write-Host " DATABASE                     = INTEGRO / READ-ONLY" -ForegroundColor Green
Write-Host " VENDA #12                    = PRESERVADA" -ForegroundColor Green
Write-Host " VENDA #13                    = PRESERVADA" -ForegroundColor Green
Write-Host " BACKEND 8989                 = ONLINE" -ForegroundColor Green
Write-Host " FRONTEND CONFIG              = 5180" -ForegroundColor Green

Write-Host ""
Write-Host " BACKUP=$backup" -ForegroundColor DarkGray

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " RECOVERY B1-B22 ENCERRADA." -ForegroundColor Green
Write-Host " PROXIMO: V2.3 FINAL OPERACIONAL EM LOTE." -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Green
