import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
const api=fs.readFileSync(path.join(root,'src','api.js'),'utf8');
const checks=[
 ['package version 0.3.4',pkg.version==='0.3.4'],
 ['backend login route',server.includes("app.post('/api/auth/login'")],
 ['backend health 0.3.4',server.includes("version:'0.3.4'")],
 ['frontend login target',api.includes("request('/auth/login'")],
 ['frontend relative /api base',api.includes("'/api'")],
];
let ok=true;
for(const [name,pass] of checks){console.log(`${pass?'OK':'FAIL'} ${name}`); if(!pass) ok=false;}
if(!ok) process.exit(2);
console.log('INSTALL_VERIFIED V0.3.4');
