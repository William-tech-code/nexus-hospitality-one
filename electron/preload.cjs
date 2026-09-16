/* NEXUS_SAFE_DESKTOP_BRIDGE_V218H2 */
const {
  contextBridge,
  ipcRenderer
} = require('electron');

contextBridge.exposeInMainWorld(
  'nexusPrinter',
  {
    available: true,

    getStatus: () =>
      ipcRenderer.invoke(
        'nexus-printer:status'
      ),

    getPrinters: () =>
      ipcRenderer.invoke(
        'nexus-printer:list'
      ),

    discover: (preferredName = '') =>
      ipcRenderer.invoke(
        'nexus-printer:discover',
        {
          preferredName
        }
      ),

    prepare: (document, preferredName = '') =>
      ipcRenderer.invoke('nexus-printer:prepare',{document,preferredName}),

    simulate: (document) =>
      ipcRenderer.invoke(
        'nexus-printer:simulate',
        document
      )
  }
);
