const {app,BrowserWindow}=require('electron');
const {spawn}=require('child_process');
const path=require('path');
let apiProcess;
function create(){
  apiProcess=spawn(process.execPath,[path.join(__dirname,'..','server','index.js')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',PORT:'8989'},stdio:'inherit'});
  const win=new BrowserWindow({width:1440,height:920,minWidth:1100,minHeight:720,backgroundColor:'#080706',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  setTimeout(()=>win.loadURL('http://127.0.0.1:8989'),900);
}
app.whenReady().then(create);
app.on('window-all-closed',()=>{if(apiProcess)apiProcess.kill();if(process.platform!=='darwin')app.quit()});
