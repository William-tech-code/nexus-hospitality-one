/* NEXUS_SAFE_PRINT_QUEUE_WORKER_V218I2 */

const SUPPORTED_DOCUMENTS = new Set([
  'PICKUP_CUSTOMER',
  'PRODUCTION',
  'RECEIPT'
]);

function printerBridge(){
  if(typeof window === 'undefined') return null;
  return window.nexusPrinter || null;
}

export function nexusDesktopPrintAvailable(){
  const bridge = printerBridge();
  return Boolean(
    bridge &&
    bridge.available &&
    typeof bridge.discover === 'function' &&
    typeof bridge.prepare === 'function'
  );
}

export async function nexusDiscoverDesktopPrinter(preferredName=''){
  const bridge = printerBridge();

  if(!bridge || typeof bridge.discover !== 'function'){
    return {
      ok:false,
      available:false,
      safeQueue:true,
      physicallyPrinted:false,
      reason:'ELECTRON_PRINTER_BRIDGE_UNAVAILABLE'
    };
  }

  try {
    return await bridge.discover(preferredName);
  } catch(error){
    return {
      ok:false,
      available:false,
      safeQueue:true,
      physicallyPrinted:false,
      reason:'PRINTER_DISCOVERY_FAILED',
      error:String(error?.message || error)
    };
  }
}

export async function nexusPreparePrintJob(job,{preferredName=''}={}){
  if(!job || !job.id){
    return {
      ok:false,
      prepared:false,
      safeQueue:true,
      physicallyPrinted:false,
      reason:'INVALID_PRINT_JOB'
    };
  }

  if(!SUPPORTED_DOCUMENTS.has(String(job.document_type || ''))){
    return {
      ok:false,
      prepared:false,
      safeQueue:true,
      physicallyPrinted:false,
      reason:'UNSUPPORTED_DOCUMENT_TYPE',
      jobId:job.id
    };
  }

  const bridge = printerBridge();

  if(!bridge || typeof bridge.prepare !== 'function'){
    return {
      ok:false,
      prepared:false,
      safeQueue:true,
      physicallyPrinted:false,
      reason:'ELECTRON_PREPARE_UNAVAILABLE',
      jobId:job.id
    };
  }

  let payload = job.payload_json;

  if(typeof payload === 'string'){
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {text:payload};
    }
  }

  const document = {
    jobId:job.id,
    saleId:job.sale_id ?? null,
    documentType:job.document_type,
    payload:payload || {}
  };

  try {
    const result = await bridge.prepare(document,preferredName);

    return {
      ...result,
      jobId:job.id,
      safeQueue:true,
      physicallyPrinted:false
    };
  } catch(error){
    return {
      ok:false,
      prepared:false,
      safeQueue:true,
      physicallyPrinted:false,
      reason:'DESKTOP_PREPARE_FAILED',
      jobId:job.id,
      error:String(error?.message || error)
    };
  }
}

export async function nexusInspectPrintQueue(api,{limit=50,preferredName=''}={}){
  if(!api || typeof api.desktopPrintPendingV16 !== 'function'){
    throw new Error('DESKTOP_PRINT_API_UNAVAILABLE');
  }

  const response = await api.desktopPrintPendingV16(limit);

  const jobs = Array.isArray(response)
    ? response
    : Array.isArray(response?.jobs)
      ? response.jobs
      : Array.isArray(response?.data)
        ? response.data
        : [];

  const discovery = await nexusDiscoverDesktopPrinter(preferredName);

  if(!discovery?.available || !discovery?.selected){
    return {
      ok:true,
      workerMode:'SAFE_INSPECTION',
      printerAvailable:false,
      physicallyPrinted:false,
      jobs,
      discovery
    };
  }

  const prepared = [];

  for(const job of jobs){
    if(String(job.status || '') !== 'QUEUED') continue;

    prepared.push(
      await nexusPreparePrintJob(job,{preferredName})
    );
  }

  return {
    ok:true,
    workerMode:'SAFE_INSPECTION',
    printerAvailable:true,
    printer:discovery.selected,
    physicallyPrinted:false,
    jobs,
    prepared
  };
}

export const NEXUS_PRINT_WORKER = Object.freeze({
  version:'2.1.8-I2',
  mode:'SAFE_INSPECTION',
  physicalPrintingEnabled:false,
  marksPrinted:false,
  blocksSale:false
});
