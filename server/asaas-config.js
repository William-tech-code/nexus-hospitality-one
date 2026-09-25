import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const dataDir=path.resolve(process.cwd(),'data');
const secretFile=path.join(dataDir,'asaas-secure.json');

function normalizeEnv(value){
  return String(value||'sandbox').toLowerCase()==='production'
    ? 'production'
    : 'sandbox';
}

export function asaasEnvironment(){
  return normalizeEnv(
    process.env.ASAAS_ENV ||
    globalThis.__NEXUS_ASAAS_CONFIG__?.environment ||
    'sandbox'
  );
}

export function asaasBaseUrl(){
  const cfg=globalThis.__NEXUS_ASAAS_CONFIG__||{};
  const env=asaasEnvironment();

  return String(
    process.env.ASAAS_BASE_URL ||
    cfg.base_url ||
    (
      env==='production'
        ? 'https://api.asaas.com/v3'
        : 'https://api-sandbox.asaas.com/v3'
    )
  ).replace(/\/$/,'');
}

function dpapiBridgePath(){
  return path.resolve(
    process.cwd(),
    'server',
    'asaas-dpapi-bridge.ps1'
  );
}

function runDpapiBridge(mode,value){
  if(
    process.platform!=='win32' ||
    !value
  ){
    return null;
  }

  const bridge=
    dpapiBridgePath();

  if(!fs.existsSync(bridge)){
    return null;
  }

  try{
    return String(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          bridge,
          '-Mode',
          mode,
          '-Value',
          String(value)
        ],
        {
          encoding:'utf8',
          windowsHide:true,
          stdio:[
            'ignore',
            'pipe',
            'pipe'
          ]
        }
      )
    ).trim();
  }catch{
    return null;
  }
}

function protectWindows(value){
  if(
    process.platform!=='win32' ||
    !value
  ){
    return null;
  }

  const encoded=
    Buffer
      .from(
        String(value),
        'utf8'
      )
      .toString('base64');

  return runDpapiBridge(
    'protect',
    encoded
  );
}

function unprotectWindows(value){
  if(
    process.platform!=='win32' ||
    !value
  ){
    return null;
  }

  const output=
    runDpapiBridge(
      'unprotect',
      String(value)
    );

  if(!output){
    return null;
  }

  try{
    return Buffer
      .from(
        output,
        'base64'
      )
      .toString('utf8');
  }catch{
    return null;
  }
}
export async function initializeAsaasSecureRuntime(){

  if(!fs.existsSync(dataDir)){
    fs.mkdirSync(
      dataDir,
      {recursive:true}
    );
  }

  let stored={};

  try{
    stored=JSON.parse(
      fs.readFileSync(
        secretFile,
        'utf8'
      )
    );
  }catch{}

  const environment=
    normalizeEnv(stored.environment);

  const base_url=
    String(
      stored.base_url ||
      (
        environment==='production'
          ? 'https://api.asaas.com/v3'
          : 'https://api-sandbox.asaas.com/v3'
      )
    ).replace(/\/$/,'');

  globalThis.__NEXUS_ASAAS_CONFIG__={
    environment,
    base_url,
    api_key:'',
    webhook_token:''
  };

  if(stored.api_key_dpapi){
    globalThis.__NEXUS_ASAAS_CONFIG__.api_key=
      unprotectWindows(
        stored.api_key_dpapi
      )||'';
  }

  if(stored.webhook_token_dpapi){
    globalThis.__NEXUS_ASAAS_CONFIG__.webhook_token=
      unprotectWindows(
        stored.webhook_token_dpapi
      )||'';
  }
}

export function asaasApiKey(){
  return String(
    process.env.ASAAS_API_KEY ||
    globalThis.__NEXUS_ASAAS_CONFIG__?.api_key ||
    ''
  ).trim();
}

export function asaasWebhookToken(){
  return String(
    process.env.ASAAS_WEBHOOK_TOKEN ||
    globalThis.__NEXUS_ASAAS_CONFIG__?.webhook_token ||
    ''
  ).trim();
}

export function asaasPublicConfig(){

  const key=asaasApiKey();
  const webhook=asaasWebhookToken();

  return {
    environment:
      asaasEnvironment().toUpperCase(),

    configured:
      Boolean(key),

    webhook_configured:
      Boolean(webhook),

    base_url:
      asaasBaseUrl(),

    api_key_masked:
      key
        ? '********'+key.slice(-4)
        : '',

    webhook_token_masked:
      webhook
        ? '********'+webhook.slice(-4)
        : '',

    secure_storage:
      process.platform==='win32'
        ? 'WINDOWS_DPAPI'
        : 'ENV_ONLY',

    webhook_url_hint:
      '/api/webhooks/asaas/saas'
  };
}

export function saveAsaasSecureConfig(input={}){

  if(process.platform!=='win32'){
    throw new Error(
      'SECURE_STORAGE_REQUIRES_WINDOWS_OR_ENV'
    );
  }

  const current=
    globalThis.__NEXUS_ASAAS_CONFIG__||{};

  const environment=
    normalizeEnv(
      input.environment ||
      current.environment
    );

  const base_url=
    String(
      input.base_url ||
      (
        environment==='production'
          ? 'https://api.asaas.com/v3'
          : 'https://api-sandbox.asaas.com/v3'
      )
    ).replace(/\/$/,'');

  const api_key=
    String(
      input.api_key ||
      current.api_key ||
      ''
    ).trim();

  const webhook_token=
    String(
      input.webhook_token ||
      current.webhook_token ||
      ''
    ).trim();

  if(!api_key){
    throw new Error(
      'ASAAS_API_KEY_REQUIRED'
    );
  }

  if(!webhook_token){
    throw new Error(
      'ASAAS_WEBHOOK_TOKEN_REQUIRED'
    );
  }

  const api_key_dpapi=
    protectWindows(api_key);

  const webhook_token_dpapi=
    protectWindows(webhook_token);

  if(
    !api_key_dpapi ||
    !webhook_token_dpapi
  ){
    throw new Error(
      'ASAAS_DPAPI_ENCRYPTION_FAILED'
    );
  }

  const stored={
    version:1,
    environment,
    base_url,
    api_key_dpapi,
    webhook_token_dpapi,
    updated_at:
      new Date().toISOString()
  };

  fs.writeFileSync(
    secretFile,
    JSON.stringify(
      stored,
      null,
      2
    ),
    {
      encoding:'utf8',
      mode:0o600
    }
  );

  globalThis.__NEXUS_ASAAS_CONFIG__={
    environment,
    base_url,
    api_key,
    webhook_token
  };

  return asaasPublicConfig();
}

export async function asaasRequest(
  requestPath,
  {
    method='GET',
    body
  }={}
){

  const key=asaasApiKey();

  if(!key){
    const error=
      new Error(
        'ASAAS_API_KEY_NOT_CONFIGURED'
      );

    error.status=409;
    throw error;
  }

  /*
   * NEXUS_ASAAS_TRANSPORT_V31
   *
   * Timeout explicito para impedir requests externos
   * indefinidamente pendentes.
   *
   * IMPORTANTE:
   * nao fazemos retry automatico aqui, especialmente
   * para POST. Em falha ambigua, a camada SaaS deve
   * reconciliar pelo externalReference antes de uma
   * nova tentativa de criacao.
   */
  const timeoutMs=30000;
  const controller=new AbortController();
  const timeout=setTimeout(
    ()=>controller.abort(),
    timeoutMs
  );

  let response;

  try{

    response=
      await fetch(
        asaasBaseUrl()+requestPath,
        {
          method,
          headers:{
            accept:'application/json',
            'content-type':'application/json',
            access_token:key
          },
          body:
            body===undefined
              ? undefined
              : JSON.stringify(body),
          signal:controller.signal
        }
      );

  }catch(cause){

    const timedOut=
      cause?.name === 'AbortError';

    const error=
      new Error(
        timedOut
          ? 'ASAAS_REQUEST_TIMEOUT'
          : 'ASAAS_TRANSPORT_ERROR'
      );

    error.code=
      timedOut
        ? 'ASAAS_REQUEST_TIMEOUT'
        : 'ASAAS_TRANSPORT_ERROR';

    error.transport_error=true;
    error.ambiguous=
      String(method).toUpperCase() !== 'GET';

    error.cause=cause;

    throw error;

  }finally{

    clearTimeout(timeout);
  }

  const data=
    await response
      .json()
      .catch(()=>({}));

  if(!response.ok){

    const error=
      new Error(
        data?.errors?.[0]?.description ||
        `ASAAS_HTTP_${response.status}`
      );

    error.status=response.status;
    error.data=data;

    throw error;
  }

  return data;
}

