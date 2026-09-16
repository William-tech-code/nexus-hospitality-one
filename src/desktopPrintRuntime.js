/* NEXUS_PRINT_RUNTIME_V218I3R */

import {
  nexusDesktopPrintAvailable,
  nexusDiscoverDesktopPrinter,
  NEXUS_PRINT_WORKER
} from './desktopPrintWorker.js';

let runtimeState = {
  initialized:false,
  environment:'BROWSER',
  bridgeAvailable:false,
  printerAvailable:false,
  printer:null,
  discovery:null,
  lastCheck:null,
  physicalPrintingEnabled:false,
  blocksSale:false
};

const now = () => new Date().toISOString();

export function getDesktopPrintRuntimeState(){
  return { ...runtimeState };
}

export function isElectronPrintEnvironment(){
  return Boolean(
    typeof window !== 'undefined' &&
    window.nexusPrinter &&
    window.nexusPrinter.available
  );
}

export async function initializeDesktopPrintRuntime({preferredName=''}={}){
  const electron = isElectronPrintEnvironment();

  runtimeState = {
    ...runtimeState,
    initialized:true,
    environment:electron ? 'ELECTRON' : 'BROWSER',
    bridgeAvailable:nexusDesktopPrintAvailable(),
    printerAvailable:false,
    printer:null,
    discovery:null,
    lastCheck:now(),
    physicalPrintingEnabled:false,
    blocksSale:false
  };

  if(!electron){
    return getDesktopPrintRuntimeState();
  }

  try {
    const discovery = await nexusDiscoverDesktopPrinter(preferredName);

    runtimeState = {
      ...runtimeState,
      printerAvailable:Boolean(discovery?.available && discovery?.selected),
      printer:discovery?.selected || null,
      discovery,
      lastCheck:now(),
      physicalPrintingEnabled:false,
      blocksSale:false
    };
  } catch(error){
    runtimeState = {
      ...runtimeState,
      printerAvailable:false,
      printer:null,
      discovery:{
        ok:false,
        reason:'RUNTIME_DISCOVERY_FAILED',
        error:String(error?.message || error)
      },
      lastCheck:now(),
      physicalPrintingEnabled:false,
      blocksSale:false
    };
  }

  return getDesktopPrintRuntimeState();
}

export async function refreshDesktopPrinter({preferredName=''}={}){
  return initializeDesktopPrintRuntime({preferredName});
}

export const NEXUS_PRINT_RUNTIME = Object.freeze({
  version:'2.1.8-I3R',
  workerVersion:NEXUS_PRINT_WORKER.version,
  autoDiscovery:true,
  browserSafe:true,
  saleIndependent:true,
  physicalPrintingEnabled:false,
  marksPrinted:false
});
