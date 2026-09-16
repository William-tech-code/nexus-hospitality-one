const {
  app,
  BrowserWindow,
  shell,
  ipcMain
} = require('electron');

const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const CLOUD_URL =
  process.env.NEXUS_CLOUD_URL ||
  'https://nexus-hospitality-one-production.up.railway.app/';

/*
  ============================================================
  NEXUS PRINT ENGINE V2.1.2
  ============================================================

  SIMULATION
  ----------
  Desenvolve e valida a ponte nativa sem afirmar que houve
  impressÃƒÂ£o fÃƒÂ­sica.

  DESKTOP
  -------
  SerÃƒÂ¡ habilitado depois da homologaÃƒÂ§ÃƒÂ£o da impressora tÃƒÂ©rmica.

  IMPORTANTE:
  O modo SIMULATION NÃƒÆ’O grava print_log no backend e NÃƒÆ’O
  representa confirmaÃƒÂ§ÃƒÂ£o fÃƒÂ­sica de impressÃƒÂ£o.
*/

const PRINT_MODE =
  process.env.NEXUS_PRINT_MODE ||
  'SIMULATION';

let mainWindow = null;

function normalizeDocument(input = {}) {
  return {
    type:
      String(
        input.type || 'PICKUP'
      ).toUpperCase(),

    saleId:
      Number(
        input.saleId || 0
      ),

    releaseCode:
      String(
        input.releaseCode || ''
      ),

    title:
      String(
        input.title ||
        'NEXUS HOSPITALITY ONE'
      ),

    createdAt:
      new Date().toISOString(),

    items:
      Array.isArray(input.items)
        ? input.items
        : [],

    total:
      Number(
        input.total || 0
      ),

    operator:
      String(
        input.operator || ''
      )
  };
}


/*
  ============================================================
  NEXUS_THERMAL_AUTO_DISCOVERY_V218D3
  ============================================================

  Descoberta segura de impressora termica.

  Esta versao NAO executa impressao fisica.

  A venda nao depende da impressora.
  A Epson comum nao e fallback automatico.
  POS-80 possui prioridade.
*/

function nexusPrinterSearchText(printer = {}) {

  return [
    printer.name,
    printer.displayName,
    printer.description
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

function nexusPrinterThermalScore(printer = {}) {

  const text =
    nexusPrinterSearchText(printer);

  let score = 0;

  if(
    text.includes('POS-80') ||
    text.includes('POS 80') ||
    text.includes('POS_80')
  ){
    score += 1000;
  }

  if(
    text.includes('THERMAL') ||
    text.includes('TERMICA') ||
    text.includes('TÃƒâ€°RMICA')
  ){
    score += 800;
  }

  if(
    text.includes('RECEIPT')
  ){
    score += 700;
  }

  if(
    text.includes('XPRINTER') ||
    text.includes('GPRINTER') ||
    text.includes('BEMATECH') ||
    text.includes('ELGIN') ||
    text.includes('DARUMA') ||
    text.includes('SWEDA') ||
    text.includes('TANCA')
  ){
    score += 500;
  }

  /*
    Impressoras comuns proibidas como
    fallback automatico.
  */
  if(
    text.includes('L3250') ||
    text.includes('MICROSOFT PRINT TO PDF') ||
    text.includes('MICROSOFT XPS') ||
    text.includes('ONENOTE')
  ){
    score -= 10000;
  }

  return score;
}

function nexusNormalizeDetectedPrinter(
  printer = {}
){

  return {

    name:
      String(
        printer.name || ''
      ),

    displayName:
      String(
        printer.displayName ||
        printer.name ||
        ''
      ),

    description:
      String(
        printer.description || ''
      ),

    status:
      printer.status,

    isDefault:
      Boolean(
        printer.isDefault
      ),

    thermalScore:
      nexusPrinterThermalScore(
        printer
      )
  };
}

async function nexusDiscoverThermalPrinter(
  preferredName = ''
){

  if(!mainWindow){

    return {
      available: false,
      reason:
        'MAIN_WINDOW_UNAVAILABLE',
      preferredName:
        String(
          preferredName || ''
        ),
      selected: null,
      candidates: []
    };
  }

  const rawPrinters =
    await mainWindow.webContents
      .getPrintersAsync();

  const printers =
    rawPrinters.map(
      nexusNormalizeDetectedPrinter
    );

  const preferred =
    String(
      preferredName ||
      process.env.NEXUS_THERMAL_PRINTER ||
      ''
    ).trim();

  if(preferred){

    const preferredPrinter =
      printers.find(
        printer =>
          printer.name
            .toLowerCase() ===
          preferred.toLowerCase()
      );

    if(preferredPrinter){

      return {

        available: true,

        reason:
          'PREFERRED_PRINTER_FOUND',

        preferredName:
          preferred,

        selected:
          preferredPrinter,

        candidates:
          printers
            .filter(
              printer =>
                printer.thermalScore > 0
            )
            .sort(
              (a,b) =>
                b.thermalScore -
                a.thermalScore
            )
      };
    }
  }

  const candidates =
    printers
      .filter(
        printer =>
          printer.thermalScore > 0
      )
      .sort(
        (a,b) =>
          b.thermalScore -
          a.thermalScore
      );

  const selected =
    candidates[0] || null;

  return {

    available:
      Boolean(selected),

    reason:
      selected
        ? 'THERMAL_AUTO_DISCOVERED'
        : 'THERMAL_NOT_FOUND',

    preferredName:
      preferred || null,

    selected,

    candidates
  };
}


/* NEXUS_SAFE_DESKTOP_BRIDGE_V218H2 */
async function nexusPrepareDesktopPrint(input = {}) {
  const document = normalizeDocument(input?.document || input);
  const preferredName = String(input?.preferredName || '').trim();
  const discovery = await nexusDiscoverThermalPrinter(preferredName);
  if (!discovery?.available || !discovery?.selected) {
    return {ok:false,prepared:false,physicallyPrinted:false,physicalPrintingEnabled:false,safeQueue:true,reason:discovery?.reason || 'THERMAL_PRINTER_NOT_AVAILABLE',document,discovery};
  }
  const printer = discovery.selected;
  const text = String([printer?.name,printer?.displayName,printer?.description].filter(Boolean).join(' ')).toLowerCase();
  if (text.includes('epson') && (text.includes('l3250') || text.includes('ecotank'))) {
    return {ok:false,prepared:false,physicallyPrinted:false,physicalPrintingEnabled:false,safeQueue:true,reason:'EPSON_FALLBACK_BLOCKED',printer,document,discovery};
  }
  return {ok:true,prepared:true,physicallyPrinted:false,physicalPrintingEnabled:false,safeQueue:true,reason:'DESKTOP_PRINT_PREPARED_SAFE_MODE',printer,printerName:printer.name,document,discovery};
}

function registerPrinterIPC() {
  ipcMain.handle('nexus-printer:prepare', async (_event,input={}) => {
    try {
      return await nexusPrepareDesktopPrint(input);
    } catch(error) {
      return {ok:false,prepared:false,physicallyPrinted:false,physicalPrintingEnabled:false,safeQueue:true,reason:'DESKTOP_PRINT_PREPARE_ERROR',error:String(error?.message || error)};
    }
  });


  ipcMain.handle(
    'nexus-printer:discover',
    async (_event, input = {}) => {

      try {

        const result =
          await nexusDiscoverThermalPrinter(
            String(
              input?.preferredName ||
              ''
            )
          );

        return {

          ok: true,

          mode:
            PRINT_MODE,

          physicalPrintingEnabled:
            false,

          safeQueue:
            true,

          ...result
        };

      }
      catch(error){

        return {

          ok: false,

          mode:
            PRINT_MODE,

          physicalPrintingEnabled:
            false,

          safeQueue:
            true,

          available:
            false,

          selected:
            null,

          candidates:
            [],

          reason:
            'THERMAL_DISCOVERY_ERROR',

          error:
            String(
              error?.message ||
              error
            )
        };
      }
    }
  );

  ipcMain.handle(
    'nexus-printer:status',
    async () => ({
      available: true,
      mode: PRINT_MODE,
      physicalPrintConfirmed: false,
      engine: 'NEXUS_PRINT_ENGINE_V2.1.2'
    })
  );

  ipcMain.handle(
    'nexus-printer:list',
    async () => {

      if (!mainWindow) {
        return [];
      }

      const printers =
        await mainWindow.webContents
          .getPrintersAsync();

      return printers.map(
        printer => ({
          name: printer.name,
          displayName:
            printer.displayName ||
            printer.name,
          description:
            printer.description || '',
          status:
            printer.status,
          isDefault:
            Boolean(printer.isDefault)
        })
      );
    }
  );

  ipcMain.handle(
    'nexus-printer:simulate',
    async (_event, input) => {

      const document =
        normalizeDocument(input);

      /*
        NÃƒÆ’O usar webContents.print({silent:true})
        nesta fase.

        NÃƒÆ’O declarar PRINTED.

        NÃƒÆ’O chamar backend.

        NÃƒÆ’O liberar produto.

        Apenas comprovamos que Renderer -> Preload -> Main
        estÃƒÂ¡ funcionando.
      */

      console.log('');
      console.log(
        '=========================================='
      );
      console.log(
        'NEXUS PRINT ENGINE - SIMULATION'
      );
      console.log(
        '=========================================='
      );
      console.log(
        JSON.stringify(
          document,
          null,
          2
        )
      );
      console.log(
        '=========================================='
      );
      console.log('');

      return {
        ok: true,
        mode: PRINT_MODE,
        simulated: true,
        physicallyPrinted: false,
        document
      };
    }
  );
}

function probeURL(url, timeout = 1800) {
  return new Promise(resolve => {
    try {
      const client =
        url.startsWith('https:')
          ? https
          : http;

      const req = client.get(
        url,
        response => {
          response.resume();

          resolve(
            response.statusCode >= 200 &&
            response.statusCode < 500
          );
        }
      );

      req.setTimeout(
        timeout,
        () => {
          req.destroy();
          resolve(false);
        }
      );

      req.on(
        'error',
        () => resolve(false)
      );

    } catch {
      resolve(false);
    }
  });
}

async function resolveFrontendURL() {

  /*
    Se NEXUS_DESKTOP_URL for informada,
    ela sempre tem prioridade.
  */

  if (process.env.NEXUS_DESKTOP_URL) {
    return process.env.NEXUS_DESKTOP_URL;
  }

  /*
    Desenvolvimento:
    procurar Vite local antes da Cloud.
  */

  if (!app.isPackaged) {

    const localCandidates = [
      'http://127.0.0.1:5180/',
      'http://127.0.0.1:5181/',
      'http://127.0.0.1:5173/',
      'http://127.0.0.1:5174/',
      'http://127.0.0.1:5175/',
      'http://127.0.0.1:5182/'
    ];

    for (const candidate of localCandidates) {

      const online =
        await probeURL(candidate);

      if (online) {

        console.log(
          `[NEXUS DESKTOP] Frontend local: ${candidate}`
        );

        return candidate;
      }
    }
  }

  /*
    Se nÃƒÂ£o houver Vite local, usa Cloud.
  */

  const cloudOnline =
    await probeURL(CLOUD_URL, 5000);

  if (cloudOnline) {

    console.log(
      `[NEXUS DESKTOP] Frontend cloud: ${CLOUD_URL}`
    );

    return CLOUD_URL;
  }

  return null;
}

function loadFailurePage(window) {

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>NEXUS Hospitality One</title>

        <style>
          body {
            margin: 0;
            background: #080706;
            color: #f5f1e8;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            display: flex;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
          }

          .box {
            width: min(680px, 86vw);
            border: 1px solid #8f7535;
            border-radius: 20px;
            padding: 42px;
            background: #11100e;
            box-shadow:
              0 30px 80px rgba(0,0,0,.55);
          }

          .over {
            color: #c9a956;
            letter-spacing: 4px;
            font-size: 12px;
            font-weight: 700;
          }

          h1 {
            font-size: 32px;
            margin: 12px 0;
          }

          p {
            color: #bbb4a7;
            line-height: 1.6;
          }

          code {
            display: block;
            margin-top: 20px;
            padding: 16px;
            background: #080706;
            border-radius: 10px;
            color: #d6bc75;
          }
        </style>
      </head>

      <body>
        <div class="box">

          <div class="over">
            NEXUS DESKTOP
          </div>

          <h1>
            Frontend nÃƒÂ£o localizado
          </h1>

          <p>
            O aplicativo desktop estÃƒÂ¡ funcionando,
            porÃƒÂ©m nenhum frontend local ou Cloud
            respondeu.
          </p>

          <p>
            Para desenvolvimento, inicie o Vite e
            reinicie o NEXUS Desktop.
          </p>

          <code>
            npm run dev
          </code>

        </div>
      </body>
    </html>
  `;

  window.loadURL(
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(html)
  );
}

async function createWindow() {

  mainWindow =
    new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 1100,
      minHeight: 720,

      backgroundColor:
        '#080706',

      autoHideMenuBar: true,

      show: false,

      title:
        'NEXUS Hospitality One',

      webPreferences: {

        preload:
          path.join(
            __dirname,
            'preload.cjs'
          ),

        contextIsolation: true,

        nodeIntegration: false,

        /*
          sandbox permanece ativo.
          A ponte exposta pelo preload ÃƒÂ© mÃƒÂ­nima
          e controlada.
        */
        sandbox: true
      }
    });

  mainWindow
    .setMenuBarVisibility(false);

  mainWindow.once(
    'ready-to-show',
    () => {
      mainWindow.show();
      mainWindow.focus();

      if (!app.isPackaged) {
        mainWindow.webContents.openDevTools({
          mode: 'detach'
        });
      }
    }
  );

  mainWindow
    .webContents
    .setWindowOpenHandler(
      ({ url }) => {

        if (
          url.startsWith(
            CLOUD_URL
          )
        ) {
          return {
            action: 'allow'
          };
        }

        shell.openExternal(url);

        return {
          action: 'deny'
        };
      }
    );

  const frontendURL =
    await resolveFrontendURL();

  if (frontendURL) {

    console.log(
      `[NEXUS DESKTOP] Carregando ${frontendURL}`
    );

    await mainWindow.loadURL(
      frontendURL
    );

  } else {

    console.error(
      '[NEXUS DESKTOP] Nenhum frontend disponÃƒÂ­vel.'
    );

    loadFailurePage(
      mainWindow
    );
  }

  mainWindow.on(
    'closed',
    () => {
      mainWindow = null;
    }
  );
}

app.setName(
  'NEXUS Hospitality One'
);

app.whenReady().then(
  () => {

    registerPrinterIPC();

    createWindow();

    app.on(
      'activate',
      () => {

        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      }
    );
  }
);

app.on(
  'window-all-closed',
  () => {

    if (
      process.platform !==
      'darwin'
    ) {
      app.quit();
    }
  }
);



