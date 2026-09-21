import { createHospitalityFinalIntelligence } from "./v50c-final-intelligence.js";
import {registerTicketDeliveryV39} from "./ticket-delivery-v39.js";
import registerEventIntelligenceV37 from "./event-intelligence-v37.js";
import registerEventPaymentTrackerV35 from "./event-payment-tracker-v35.js";
import {registerEventAccessV31} from "./event-access-routes-v31.js";
import { registerCustomerWallet } from "./customer-wallet-v26.js";
import {initializeAsaasSecureRuntime} from './asaas-config.js';
import express from 'express';import cors from 'cors';import helmet from 'helmet';import path from 'node:path';import fs from 'node:fs';
import {db,initDb,setting} from './db.js';import {dashboardSnapshot,closingPlan,growthBrief,performanceSnapshot} from './intelligence.js';import {verifyPassword,hashPassword,sessionToken,tokenHash} from './security.js';import {registerOperations} from './operations.js';import {registerRecipeEngine,consumeProduct} from './recipe-engine.js';import {registerPremiumV05} from './premium-v05.js';import {initSuiteV06,registerSuiteV06,smartSalePrice,smartUnitCost} from './suite-v06.js';import {registerOperationalV1} from './operational-v1.js';import {initOperationsV11,registerPublicV11,registerOperationsV11} from './operations-v11.js';
import {registerTicketsV25} from './tickets-v25.js';
import {initGrowthV12,registerGrowthV12} from './growth-v12.js';
import {initBusinessV13,registerBusinessV13} from './business-v13.js';
import {initFinancialIntelligence,registerFinancialIntelligence,registerGrowthIntelligenceV25} from './financial-intelligence-v25.js';
import {initOperationV14,registerOperationV14} from './operation-v14.js';
import {registerPaymentsV15} from './payments-v15.js';
import {initOperationV16,registerOperationV16} from './operation-v16.js';
import './transaction-engine.js';
import {createPrintJobsEngine} from './print-jobs-engine.js';
import { initReturnRoutesV16, registerReturnRoutesV16 } from './return-routes-v16.js';
import {registerNetIntelligenceV25} from "./financial-net-intelligence-v25.js";
import {initInventoryV49A,registerInventoryV49A} from "./inventory-v49a.js";
await initializeAsaasSecureRuntime();
initDb();initSuiteV06();initOperationsV11();initFinancialIntelligence();
initGrowthV12();initBusinessV13();initOperationV14();initOperationV16();
initReturnRoutesV16();initInventoryV49A();
const app=express();
const IS_HOSTED=Boolean(process.env.RAILWAY_ENVIRONMENT||process.env.RAILWAY_PROJECT_ID||process.env.NODE_ENV==='production');
const PORT=Number(process.env.HOSPITALITY_PORT||(IS_HOSTED?process.env.PORT:8989)||8989);
const SESSION_HOURS=12;
app.use(helmet({contentSecurityPolicy:false}));app.use(cors());app.use(express.json({limit:'12mb'}));

function audit(userId,action,entity,entityId=null,details=null){try{db.prepare('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)').run(userId||null,action,entity,entityId==null?null:String(entityId),details?JSON.stringify(details):null)}catch{}}
function auth(req,res,next){const raw=String(req.headers.authorization||'');const token=raw.startsWith('Bearer ')?raw.slice(7):'';if(!token)return res.status(401).json({error:'AUTH_REQUIRED'});const row=db.prepare(`SELECT s.id session_id,s.expires_at,u.id,u.name,u.email,u.role,u.active,u.force_password_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')`).get(tokenHash(token));if(!row||!row.active)return res.status(401).json({error:'SESSION_INVALID'});req.user=row;req.sessionToken=token;next()}
const roles={OWNER:100,MANAGER:80,FINANCE:70,EVENTS:60,STOCK:55,CASHIER:50,WAITER:40,KITCHEN:30};
function minRole(level){return (req,res,next)=>roles[req.user.role]>=level?next():res.status(403).json({error:'FORBIDDEN'})}

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'NEXUS HOSPITALITY ONE API',version:'1.5.0',codename:'PREMIUM POS & TICKETING PAYMENT ENGINE',time:new Date().toISOString()}));registerPublicV11(app);
registerGrowthV12(app,{auth,minRole,audit});
registerBusinessV13(app,{auth,minRole,audit});
registerFinancialIntelligence(app,{auth,minRole,audit});
registerGrowthIntelligenceV25(app,{auth,minRole,audit});
registerNetIntelligenceV25(app,{auth,minRole});
registerOperationV14(app,{auth,minRole,audit});registerPaymentsV15(app,{auth,minRole,audit});registerOperationV16(app,{auth,minRole,audit});
registerReturnRoutesV16(app,{auth,minRole,audit});

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
);

/*
  NEXUS_DESKTOP_PRINT_API_V218G2R2

  SAFE DESKTOP PRINT CONTRACT

  Nenhuma impressao fisica ocorre nesta camada.
  Venda, estoque, caixa e checkout sao independentes da impressao.
*/

app.get(
  '/api/v16/print-jobs/desktop/pending',
  auth,
  minRole(40),
  (req,res)=>{
    try{
      const limit = Math.max(
        1,
        Math.min(Number(req.query?.limit) || 50,200)
      );

      const jobs =
        printJobsEngine.listDesktopPendingJobs({limit});

      return res.json({
        ok:true,
        physical_printing_enabled:false,
        mode:'SAFE_DESKTOP_QUEUE',
        jobs
      });

    }catch(error){
      return res.status(500).json({
        error:error?.message || 'DESKTOP_PRINT_PENDING_ERROR'
      });
    }
  }
);

app.get(
  '/api/v16/print-jobs/:id',
  auth,
  minRole(40),
  (req,res)=>{
    try{
      const id = Number(req.params.id);

      if(!Number.isInteger(id) || id <= 0){
        return res.status(400).json({
          error:'PRINT_JOB_ID_INVALID'
        });
      }

      const job = printJobsEngine.getJob(id);

      if(!job){
        return res.status(404).json({
          error:'PRINT_JOB_NOT_FOUND'
        });
      }

      return res.json({ok:true,job});

    }catch(error){
      return res.status(500).json({
        error:error?.message || 'PRINT_JOB_READ_ERROR'
      });
    }
  }
);

app.post(
  '/api/v16/print-jobs/:id/desktop/begin',
  auth,
  minRole(40),
  (req,res)=>{
    try{
      const id = Number(req.params.id);

      if(!Number.isInteger(id) || id <= 0){
        return res.status(400).json({
          error:'PRINT_JOB_ID_INVALID'
        });
      }

      const printerName =
        String(req.body?.printer_name || '').trim() || null;

      const job =
        printJobsEngine.beginDesktopAttempt(
          id,
          {printerName}
        );

      audit(
        req.user.id,
        'PRINT_JOB_DESKTOP_BEGIN',
        'PRINT_JOB',
        id,
        {
          printer_name:printerName,
          document_type:job?.document_type || null,
          sale_id:job?.sale_id || null
        }
      );

      return res.json({
        ok:true,
        physical_printing_enabled:false,
        job
      });

    }catch(error){
      const message =
        error?.message || 'DESKTOP_PRINT_BEGIN_ERROR';

      return res.status(
        message === 'PRINT_JOB_NOT_FOUND' ? 404 : 409
      ).json({error:message});
    }
  }
);

app.post(
  '/api/v16/print-jobs/:id/desktop/printed',
  auth,
  minRole(40),
  (req,res)=>{
    try{
      const id = Number(req.params.id);

      if(!Number.isInteger(id) || id <= 0){
        return res.status(400).json({
          error:'PRINT_JOB_ID_INVALID'
        });
      }

      const printerName =
        String(req.body?.printer_name || '').trim() || null;

      const job =
        printJobsEngine.markDesktopPrinted(
          id,
          {printerName}
        );

      audit(
        req.user.id,
        'PRINT_JOB_DESKTOP_PRINTED',
        'PRINT_JOB',
        id,
        {
          printer_name:printerName,
          document_type:job?.document_type || null,
          sale_id:job?.sale_id || null
        }
      );

      return res.json({ok:true,job});

    }catch(error){
      const message =
        error?.message || 'DESKTOP_PRINT_CONFIRM_ERROR';

      return res.status(
        message === 'PRINT_JOB_NOT_FOUND' ? 404 : 409
      ).json({error:message});
    }
  }
);

app.post(
  '/api/v16/print-jobs/:id/desktop/failed',
  auth,
  minRole(40),
  (req,res)=>{
    try{
      const id = Number(req.params.id);

      if(!Number.isInteger(id) || id <= 0){
        return res.status(400).json({
          error:'PRINT_JOB_ID_INVALID'
        });
      }

      const printerName =
        String(req.body?.printer_name || '').trim() || null;

      const errorMessage =
        String(
          req.body?.error || 'DESKTOP_PRINT_FAILED'
        ).trim().slice(0,1000);

      const job =
        printJobsEngine.markDesktopFailed(
          id,
          errorMessage,
          {printerName}
        );

      audit(
        req.user.id,
        'PRINT_JOB_DESKTOP_FAILED',
        'PRINT_JOB',
        id,
        {
          printer_name:printerName,
          error:errorMessage,
          document_type:job?.document_type || null,
          sale_id:job?.sale_id || null
        }
      );

      return res.json({ok:true,job});

    }catch(error){
      const message =
        error?.message || 'DESKTOP_PRINT_FAIL_ERROR';

      return res.status(
        message === 'PRINT_JOB_NOT_FOUND' ? 404 : 409
      ).json({error:message});
    }
  }
);

app.post(
  '/api/v16/print-jobs/:id/desktop/retry',
  auth,
  minRole(40),
  (req,res)=>{
    try{
      const id = Number(req.params.id);

      if(!Number.isInteger(id) || id <= 0){
        return res.status(400).json({
          error:'PRINT_JOB_ID_INVALID'
        });
      }

      const job =
        printJobsEngine.retryDesktopJob(id);

      audit(
        req.user.id,
        'PRINT_JOB_DESKTOP_RETRY',
        'PRINT_JOB',
        id,
        {
          document_type:job?.document_type || null,
          sale_id:job?.sale_id || null
        }
      );

      return res.json({ok:true,job});

    }catch(error){
      const message =
        error?.message || 'DESKTOP_PRINT_RETRY_ERROR';

      return res.status(
        message === 'PRINT_JOB_NOT_FOUND' ? 404 : 409
      ).json({error:message});
    }
  }
);
app.post('/api/auth/login',(req,res)=>{const {email,password}=req.body||{};const user=db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(String(email||'').trim());if(!user||!verifyPassword(password,user.password_hash)){audit(user?.id,'LOGIN_FAILED','AUTH',null,{email});return res.status(401).json({error:'INVALID_CREDENTIALS',message:'E-mail ou senha inválidos.'})}const token=sessionToken(),hash=tokenHash(token);db.prepare("DELETE FROM sessions WHERE datetime(expires_at)<=datetime('now') OR revoked_at IS NOT NULL").run();db.prepare(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,datetime('now',?))`).run(user.id,hash,`+${SESSION_HOURS} hours`);db.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').run(user.id);audit(user.id,'LOGIN_SUCCESS','AUTH');res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role,force_password_change:!!user.force_password_change},expires_in_hours:SESSION_HOURS})});
app.post('/api/auth/logout',auth,(req,res)=>{db.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?').run(tokenHash(req.sessionToken));audit(req.user.id,'LOGOUT','AUTH');res.json({ok:true})});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:{id:req.user.id,name:req.user.name,email:req.user.email,role:req.user.role,force_password_change:!!req.user.force_password_change}}));
app.post('/api/auth/change-password',auth,(req,res)=>{const {current_password,new_password}=req.body||{};if(String(new_password||'').length<10)return res.status(400).json({error:'WEAK_PASSWORD',message:'Use pelo menos 10 caracteres.'});const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!verifyPassword(current_password,u.password_hash))return res.status(400).json({error:'CURRENT_PASSWORD_INVALID'});db.prepare('UPDATE users SET password_hash=?,force_password_change=0 WHERE id=?').run(hashPassword(new_password),u.id);audit(u.id,'PASSWORD_CHANGED','USER',u.id);res.json({ok:true})});
app.get('/api/auth/capabilities',auth,(_req,res)=>res.json({passkeys:{prepared:true,registration_enabled:false,message:'Base preparada. Registro WebAuthn será habilitado em camada dedicada.'}}));

/* NEXUS_CUSTOMER_WALLET_V26_PUBLIC_BEFORE_GLOBAL_AUTH */
registerCustomerWallet(app);
registerEventPaymentTrackerV35(app);
registerTicketDeliveryV39(app,{auth,minRole,audit});
registerEventAccessV31(app);

app.use('/api',auth);
app.get('/api/dashboard',(_req,res)=>res.json({businessName:setting('business_name','Meu Bar & Restaurante'),snapshot:dashboardSnapshot(),growth:growthBrief(),performance:performanceSnapshot()}));
app.get('/api/products',(_req,res)=>res.json(db.prepare(`SELECT p.*,ip.base_unit smart_base_unit,ip.content_base smart_content_base,ip.closed_units smart_closed_units,ip.open_base smart_open_base,ip.dose_size smart_dose_size,ip.sale_dose_price smart_dose_price,ip.sale_package_price smart_package_price,ip.sell_dose smart_sell_dose,ip.sell_package smart_sell_package FROM products p LEFT JOIN inventory_profiles ip ON ip.product_id=p.id WHERE p.active=1 ORDER BY p.category,p.name`).all()));
app.post('/api/products',minRole(55),(req,res)=>{const {name,category='Outros',barcode=null,image_url=null,description='',unit_type='UNIT',package_ml=null,dose_ml=null,price=0,cost=0,stock=0,minimum_stock=0}=req.body||{};if(!String(name||'').trim())return res.status(400).json({error:'NAME_REQUIRED'});const info=db.prepare('INSERT INTO products(name,category,barcode,image_url,description,unit_type,package_ml,dose_ml,price,cost,stock,minimum_stock) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(String(name).trim(),category,barcode,image_url,description,unit_type,package_ml?Number(package_ml):null,dose_ml?Number(dose_ml):null,Number(price),Number(cost),Number(stock),Number(minimum_stock));audit(req.user.id,'CREATE','PRODUCT',info.lastInsertRowid,{name});res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid))});

app.get('/api/cash-sessions/current',(req,res)=>res.json(db.prepare("SELECT cs.*,u.name user_name FROM cash_sessions cs JOIN users u ON u.id=cs.user_id WHERE cs.status='OPEN' ORDER BY cs.id DESC LIMIT 1").get()||null));
app.post('/api/cash-sessions/open',minRole(50),(req,res)=>{const existing=db.prepare("SELECT id FROM cash_sessions WHERE status='OPEN'").get();if(existing)return res.status(409).json({error:'CASH_ALREADY_OPEN'});const info=db.prepare("INSERT INTO cash_sessions(user_id,opening_amount,status,notes) VALUES(?,?,'OPEN',?)").run(req.user.id,Number(req.body?.opening_amount||0),String(req.body?.notes||''));audit(req.user.id,'OPEN','CASH_SESSION',info.lastInsertRowid,{opening_amount:req.body?.opening_amount||0});res.status(201).json(db.prepare('SELECT * FROM cash_sessions WHERE id=?').get(info.lastInsertRowid))});
app.post('/api/cash-sessions/:id/close',minRole(50),(req,res)=>{const id=Number(req.params.id);const cs=db.prepare("SELECT * FROM cash_sessions WHERE id=? AND status='OPEN'").get(id);if(!cs)return res.status(404).json({error:'CASH_NOT_OPEN'});const sales=db.prepare("SELECT COALESCE(SUM(total+tip_amount),0) total FROM sales WHERE cash_session_id=? AND status='PAID'").get(id).total;const expected=Number(cs.opening_amount)+Number(sales);const closing=Number(req.body?.closing_amount||0);db.prepare("UPDATE cash_sessions SET status='CLOSED',closing_amount=?,expected_amount=?,closed_at=CURRENT_TIMESTAMP,notes=COALESCE(?,notes) WHERE id=?").run(closing,expected,String(req.body?.notes||''),id);audit(req.user.id,'CLOSE','CASH_SESSION',id,{expected,closing,difference:closing-expected});res.json({...db.prepare('SELECT * FROM cash_sessions WHERE id=?').get(id),difference:closing-expected})});

app.post('/api/sales',minRole(40),(req,res)=>{
  const {items=[],payment_method='DINHEIRO',table_label=null,customer_name=null,employee_id=null,tip_amount=0}=req.body||{};
  if(!Array.isArray(items)||!items.length)return res.status(400).json({error:'ITEMS_REQUIRED'});
  const cs=db.prepare("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get();
  if(!cs)return res.status(409).json({error:'CASH_SESSION_REQUIRED',message:'Abra o caixa antes de registrar vendas.'});
  const productStmt=db.prepare('SELECT * FROM products WHERE id=? AND active=1');
  try{
    const sale=db.transaction(()=>{
      const resolved=items.map(i=>{
        const p=productStmt.get(Number(i.product_id));if(!p)throw new Error(`Produto inválido: ${i.product_id}`);
        const qty=Math.max(.01,Number(i.qty||1));const mode=String(i.mode||'UNIT').toUpperCase();
        const price=smartSalePrice(p.id,mode,p.price);const unitCost=smartUnitCost(p.id,mode,p.cost);
        return{p,qty,mode,price,unitCost};
      });
      const total=resolved.reduce((sum,x)=>sum+x.price*x.qty,0);
      const emp=employee_id?Number(employee_id):(db.prepare('SELECT id FROM employees WHERE user_id=?').get(req.user.id)?.id||null);
      const s=db.prepare("INSERT INTO sales(total,payment_method,status,table_label,customer_name,cash_session_id,user_id,employee_id,tip_amount) VALUES(?,?,'PAID',?,?,?,?,?,?)").run(total,String(payment_method),table_label,customer_name,cs.id,req.user.id,emp,Number(tip_amount||0));
      for(const x of resolved){
        db.prepare('INSERT INTO sale_items(sale_id,product_id,qty,unit_price,unit_cost,sale_mode) VALUES(?,?,?,?,?,?)').run(s.lastInsertRowid,x.p.id,x.qty,x.price,x.unitCost,x.mode);
        consumeProduct(x.p.id,x.qty,req.user.id,'SALE',s.lastInsertRowid,x.mode);
        if(emp){
          const rules=db.prepare(`SELECT * FROM incentive_rules WHERE active=1 AND (start_date IS NULL OR date(start_date)<=date('now')) AND (end_date IS NULL OR date(end_date)>=date('now')) AND (scope='ANY' OR (scope='PRODUCT' AND scope_value=?) OR (scope='CATEGORY' AND scope_value=?))`).all(String(x.p.id),x.p.category);
          for(const r of rules){let amount=0;if(r.reward_type==='FIXED_PER_UNIT')amount=Number(r.reward_value)*x.qty;if(r.reward_type==='PERCENT_SALE')amount=x.price*x.qty*(Number(r.reward_value)/100);if(amount>0)db.prepare("INSERT INTO employee_rewards(employee_id,sale_id,rule_id,type,amount,description) VALUES(?,?,?,'COMMISSION',?,?)").run(emp,s.lastInsertRowid,r.id,amount,r.title)}
        }
      }
      if(emp&&Number(tip_amount)>0)db.prepare("INSERT INTO tips(sale_id,employee_id,amount,method,status) VALUES(?,?,?,'SALE','PENDING')").run(s.lastInsertRowid,emp,Number(tip_amount));
      return db.prepare('SELECT * FROM sales WHERE id=?').get(s.lastInsertRowid)
    })();
    audit(req.user.id,'CREATE','SALE',sale.id,{total:sale.total,payment_method});
    res.status(201).json({sale,dashboard:dashboardSnapshot(),closing:closingPlan(sale.total)})
  }catch(err){res.status(400).json({error:'SALE_ERROR',message:err.message})}
});

app.get('/api/employees',(_req,res)=>res.json(db.prepare('SELECT * FROM employees WHERE active=1 ORDER BY name').all()));
app.post('/api/employees',minRole(80),(req,res)=>{const {name,role_label='Atendimento',phone=''}=req.body||{};if(!String(name||'').trim())return res.status(400).json({error:'NAME_REQUIRED'});const info=db.prepare('INSERT INTO employees(name,role_label,phone) VALUES(?,?,?)').run(String(name).trim(),role_label,phone);audit(req.user.id,'CREATE','EMPLOYEE',info.lastInsertRowid,{name});res.status(201).json(db.prepare('SELECT * FROM employees WHERE id=?').get(info.lastInsertRowid))});
app.get('/api/users',minRole(80),(req,res)=>res.json(db.prepare('SELECT id,name,email,role,active,force_password_change,last_login_at,created_at FROM users ORDER BY name').all()));
app.post('/api/users',minRole(100),(req,res)=>{const {name,email,password,role='CASHIER'}=req.body||{};if(!name||!email||String(password||'').length<10)return res.status(400).json({error:'INVALID_USER_DATA'});try{const info=db.prepare('INSERT INTO users(name,email,password_hash,role,force_password_change) VALUES(?,?,?,?,1)').run(name,String(email).toLowerCase(),hashPassword(password),role);db.prepare('INSERT INTO employees(user_id,name,role_label) VALUES(?,?,?)').run(info.lastInsertRowid,name,role);audit(req.user.id,'CREATE','USER',info.lastInsertRowid,{email,role});res.status(201).json({id:info.lastInsertRowid,name,email,role})}catch(e){res.status(400).json({error:'USER_CREATE_ERROR',message:e.message})}});
app.get('/api/audit',minRole(80),(_req,res)=>res.json(db.prepare(`SELECT a.*,u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 150`).all()));

app.get('/api/performance',(_req,res)=>res.json({employees:performanceSnapshot(),rules:db.prepare('SELECT * FROM incentive_rules WHERE active=1 ORDER BY id DESC').all(),pendingTips:db.prepare("SELECT COALESCE(SUM(amount),0) total FROM tips WHERE status='PENDING'").get().total,pendingRewards:db.prepare("SELECT COALESCE(SUM(amount),0) total FROM employee_rewards WHERE status='PENDING'").get().total}));
app.post('/api/incentive-rules',minRole(80),(req,res)=>{const {title,scope='ANY',scope_value=null,reward_type='FIXED_PER_UNIT',reward_value=0,start_date=null,end_date=null}=req.body||{};if(!String(title||'').trim())return res.status(400).json({error:'TITLE_REQUIRED'});const info=db.prepare('INSERT INTO incentive_rules(title,scope,scope_value,reward_type,reward_value,start_date,end_date) VALUES(?,?,?,?,?,?,?)').run(title,scope,scope_value,reward_type,Number(reward_value),start_date,end_date);audit(req.user.id,'CREATE','INCENTIVE_RULE',info.lastInsertRowid,{title});res.status(201).json(db.prepare('SELECT * FROM incentive_rules WHERE id=?').get(info.lastInsertRowid))});
app.post('/api/tips',minRole(50),(req,res)=>{const {employee_id,amount,method='MANUAL'}=req.body||{};if(!employee_id||Number(amount)<=0)return res.status(400).json({error:'INVALID_TIP'});const info=db.prepare("INSERT INTO tips(employee_id,amount,method,status) VALUES(?,?,?,'PENDING')").run(Number(employee_id),Number(amount),method);audit(req.user.id,'CREATE','TIP',info.lastInsertRowid,{employee_id,amount});res.status(201).json({id:info.lastInsertRowid})});

app.get('/api/orders',(_req,res)=>res.json(db.prepare("SELECT * FROM orders WHERE status='OPEN' ORDER BY updated_at DESC").all()));
app.post('/api/orders',(req,res)=>{const {label,customer_name='',employee_id=null}=req.body||{};if(!String(label||'').trim())return res.status(400).json({error:'LABEL_REQUIRED'});const info=db.prepare("INSERT INTO orders(label,customer_name,status,subtotal,employee_id) VALUES(?,?,'OPEN',0,?)").run(String(label).trim(),String(customer_name||''),employee_id?Number(employee_id):null);audit(req.user.id,'CREATE','ORDER',info.lastInsertRowid,{label});res.status(201).json(db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid))});

/* ============================================================
   NEXUS V5.0C FINANCIAL TRUTH ENGINE
   DEBT INTELLIGENCE + CEO FINANCIAL FOUNDATION
   ============================================================ */

db.exec(`
 CREATE TABLE IF NOT EXISTS financial_debts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creditor TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER',
  original_amount REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  installment_amount REAL,
  installments_total INTEGER,
  installments_paid INTEGER NOT NULL DEFAULT 0,
  interest_rate REAL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  payment_method TEXT,
  document_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT
 );

 CREATE INDEX IF NOT EXISTS idx_financial_debts_status
 ON financial_debts(status);

 CREATE INDEX IF NOT EXISTS idx_financial_debts_due_date
 ON financial_debts(due_date);

 CREATE INDEX IF NOT EXISTS idx_financial_debts_creditor
 ON financial_debts(creditor);
`);

const v50cN=v=>{
 const x=Number(v||0);
 return Number.isFinite(x)?x:0;
};

const v50cRound=v=>
 Math.round(v50cN(v)*100)/100;

const v50cTableExists=name=>
 !!db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type='table'
   AND name=?
 `).get(name);

const v50cColumns=name=>
 v50cTableExists(name)
  ?new Set(
    db.prepare(
     `PRAGMA table_info("${name}")`
    ).all().map(x=>x.name)
   )
  :new Set();

function v50cDebtSnapshot(){

 const rows=db.prepare(`
  SELECT *
  FROM financial_debts
  ORDER BY
   CASE
    WHEN status='OPEN'
     AND due_date IS NOT NULL
     AND date(due_date)<date('now','localtime')
    THEN 0
    WHEN status='OPEN' THEN 1
    ELSE 2
   END,
   COALESCE(due_date,'9999-12-31') ASC,
   id DESC
 `).all();

 const open=rows.filter(
  x=>String(x.status||'OPEN').toUpperCase()==='OPEN'
 );

 const paid=rows.filter(
  x=>String(x.status||'').toUpperCase()==='PAID'
 );

 const balance=list=>
  v50cRound(
   list.reduce(
    (s,x)=>s+v50cN(x.current_balance),
    0
   )
  );

 const original=list=>
  v50cRound(
   list.reduce(
    (s,x)=>s+v50cN(x.original_amount),
    0
   )
  );

 const overdue=open.filter(
  x=>
   x.due_date &&
   db.prepare(`
    SELECT
     date(?)<date('now','localtime') AS yes
   `).get(x.due_date)?.yes
 );

 const dueToday=open.filter(
  x=>
   x.due_date &&
   db.prepare(`
    SELECT
     date(?)=date('now','localtime') AS yes
   `).get(x.due_date)?.yes
 );

 const betweenDays=(from,to)=>
  open.filter(x=>{

   if(!x.due_date) return false;

   const row=db.prepare(`
    SELECT
     date(?)>=date('now','localtime',?)
     AND
     date(?)<=date('now','localtime',?)
     AS yes
   `).get(
    x.due_date,
    `+${from} day`,
    x.due_date,
    `+${to} day`
   );

   return !!row?.yes;
  });

 const due7=betweenDays(1,7);
 const due15=betweenDays(8,15);
 const due30=betweenDays(16,30);

 const future=open.filter(
  x=>
   x.due_date &&
   db.prepare(`
    SELECT
     date(?)>date('now','localtime','+30 day')
     AS yes
   `).get(x.due_date)?.yes
 );

 const noDue=open.filter(
  x=>!x.due_date
 );

 const byCreditor={};

 for(const row of open){

  const key=
   String(row.creditor||'Nao informado').trim()||
   'Nao informado';

  if(!byCreditor[key]){
   byCreditor[key]={
    creditor:key,
    balance:0,
    records:0
   };
  }

  byCreditor[key].balance+=
   v50cN(row.current_balance);

  byCreditor[key].records++;
 }

 const creditors=
  Object.values(byCreditor)
   .map(x=>({
    ...x,
    balance:v50cRound(x.balance)
   }))
   .sort(
    (a,b)=>b.balance-a.balance
   );

 return{
  total_original:original(rows),
  total_debt:balance(open),
  overdue:balance(overdue),
  overdue_count:overdue.length,
  due_today:balance(dueToday),
  due_today_count:dueToday.length,
  due_7_days:balance(due7),
  due_7_days_count:due7.length,
  due_8_15_days:balance(due15),
  due_8_15_days_count:due15.length,
  due_16_30_days:balance(due30),
  due_16_30_days_count:due30.length,
  future_over_30_days:balance(future),
  future_over_30_days_count:future.length,
  without_due_date:balance(noDue),
  without_due_date_count:noDue.length,
  paid_history_original:original(paid),
  open_count:open.length,
  paid_count:paid.length,
  creditors,
  debts:rows
 };
}

function v50cFinancialTruth(){

 let revenue30=0;
 let revenueMonth=0;
 let sales30=0;
 let cmv30=0;

 if(v50cTableExists('sales')){

  const row=db.prepare(`
   SELECT
    COALESCE(SUM(total),0) revenue,
    COUNT(*) sales
   FROM sales
   WHERE status='PAID'
    AND datetime(created_at)>=
        datetime('now','localtime','-30 day')
  `).get();

  revenue30=v50cRound(row?.revenue);
  sales30=v50cN(row?.sales);

  const month=db.prepare(`
   SELECT
    COALESCE(SUM(total),0) revenue
   FROM sales
   WHERE status='PAID'
    AND strftime(
     '%Y-%m',
     created_at,
     'localtime'
    )=
    strftime(
     '%Y-%m',
     'now',
     'localtime'
    )
  `).get();

  revenueMonth=
   v50cRound(month?.revenue);
 }

 if(
  v50cTableExists('sale_items') &&
  v50cTableExists('sales')
 ){

  const cols=v50cColumns('sale_items');

  if(cols.has('unit_cost')){

   const row=db.prepare(`
    SELECT
     COALESCE(
      SUM(si.qty*si.unit_cost),
      0
     ) cmv
    FROM sale_items si
    JOIN sales s
     ON s.id=si.sale_id
    WHERE s.status='PAID'
     AND datetime(s.created_at)>=
         datetime('now','localtime','-30 day')
   `).get();

   cmv30=v50cRound(row?.cmv);
  }
 }

 let operatingExpenses30=0;
 let investments30=0;
 let renovations30=0;
 let adhocPurchases30=0;

 let operatingExpensesMonth=0;

 let expensesPending=0;
 let expensesOverdue=0;

 if(v50cTableExists('expenses')){

  const c=v50cColumns('expenses');

  const hasEntryType=
   c.has('entry_type');

  const typeExpr=
   hasEntryType
    ?"UPPER(COALESCE(entry_type,'EXPENSE'))"
    :"'EXPENSE'";

  const period=db.prepare(`
   SELECT
    ${typeExpr} entry_type,
    COALESCE(SUM(amount),0) total
   FROM expenses
   WHERE datetime(created_at)>=
         datetime('now','localtime','-30 day')
   GROUP BY ${typeExpr}
  `).all();

  for(const row of period){

   const type=
    String(row.entry_type||'EXPENSE')
     .toUpperCase();

   const value=
    v50cN(row.total);

   if(type==='EXPENSE'){
    operatingExpenses30+=value;
   }

   if(type==='INVESTMENT'){
    investments30+=value;
   }

   if(type==='RENOVATION'){
    renovations30+=value;
   }

   if(type==='PURCHASE'){
    adhocPurchases30+=value;
   }
  }

  const month=db.prepare(`
   SELECT
    COALESCE(SUM(amount),0) total
   FROM expenses
   WHERE ${typeExpr}='EXPENSE'
    AND strftime(
     '%Y-%m',
     created_at,
     'localtime'
    )=
    strftime(
     '%Y-%m',
     'now',
     'localtime'
    )
  `).get();

  operatingExpensesMonth=
   v50cRound(month?.total);

  if(c.has('paid')){

   const pending=db.prepare(`
    SELECT
     COALESCE(SUM(amount),0) total
    FROM expenses
    WHERE COALESCE(paid,0)=0
   `).get();

   expensesPending=
    v50cRound(pending?.total);

   if(c.has('due_date')){

    const overdue=db.prepare(`
     SELECT
      COALESCE(SUM(amount),0) total
     FROM expenses
     WHERE COALESCE(paid,0)=0
      AND due_date IS NOT NULL
      AND date(due_date)<
          date('now','localtime')
    `).get();

    expensesOverdue=
     v50cRound(overdue?.total);
   }
  }
 }

 operatingExpenses30=
  v50cRound(operatingExpenses30);

 investments30=
  v50cRound(investments30);

 renovations30=
  v50cRound(renovations30);

 adhocPurchases30=
  v50cRound(adhocPurchases30);

 let openObligations=0;

 if(v50cTableExists('financial_obligations')){

  const c=
   v50cColumns('financial_obligations');

  if(
   c.has('amount') &&
   c.has('status')
  ){

   const row=db.prepare(`
    SELECT
     COALESCE(SUM(amount),0) total
    FROM financial_obligations
    WHERE UPPER(COALESCE(status,'OPEN'))
          NOT IN(
           'PAID',
           'CANCELLED',
           'CANCELED',
           'CLOSED'
          )
   `).get();

   openObligations=
    v50cRound(row?.total);
  }
 }

 const grossProfit30=
  v50cRound(
   revenue30-cmv30
  );

 const operatingResult30=
  v50cRound(
   grossProfit30-
   operatingExpenses30
  );

 const resultAfterInvestments30=
  v50cRound(
   operatingResult30-
   investments30-
   renovations30-
   adhocPurchases30
  );

 const debt=
  v50cDebtSnapshot();

 const avgDailyRevenue=
  v50cRound(
   revenue30/30
  );

 const debtRevenueRatio=
  revenue30>0
   ?v50cRound(
     debt.total_debt/
     revenue30*100
    )
   :null;

 const overdueRevenueRatio=
  revenue30>0
   ?v50cRound(
     debt.overdue/
     revenue30*100
    )
   :null;

 const daysRevenueToCoverDebt=
  avgDailyRevenue>0
   ?v50cRound(
     debt.total_debt/
     avgDailyRevenue
    )
   :null;

 const pressure30=
  v50cRound(
   debt.due_today+
   debt.due_7_days+
   debt.due_8_15_days+
   debt.due_16_30_days+
   expensesPending+
   openObligations
  );

 const dailyRevenueRequiredForPressure=
  v50cRound(
   pressure30/30
  );

 const debtStatus=
  debt.overdue>0
   ?'OVERDUE'
   :debt.total_debt<=0
    ?'DEBT_FREE'
    :debtRevenueRatio!==null &&
      debtRevenueRatio>=100
     ?'HIGH_PRESSURE'
     :debtRevenueRatio!==null &&
       debtRevenueRatio>=50
      ?'ATTENTION'
      :'CONTROLLED';

 const ceoSignals=[];

 if(debt.overdue>0){
  ceoSignals.push({
   type:'OVERDUE_DEBT',
   severity:'HIGH',
   title:'Dividas vencidas',
   value:debt.overdue,
   message:
    'Existem dividas vencidas. Priorize negociacao e regularizacao antes de ampliar compromissos.'
  });
 }

 if(
  debtRevenueRatio!==null &&
  debtRevenueRatio>=100
 ){
  ceoSignals.push({
   type:'DEBT_REVENUE_PRESSURE',
   severity:'HIGH',
   title:'Pressao de endividamento',
   value:debtRevenueRatio,
   message:
    'A divida aberta equivale a pelo menos 100% da receita registrada nos ultimos 30 dias.'
  });
 }

 if(
  operatingResult30>0 &&
  resultAfterInvestments30<0
 ){
  ceoSignals.push({
   type:'INVESTMENT_PRESSURE',
   severity:'MEDIUM',
   title:'Operacao positiva, caixa pressionado',
   value:resultAfterInvestments30,
   message:
    'A operacao gera resultado positivo antes de investimentos e saidas extraordinarias, mas essas saidas pressionam o resultado financeiro.'
  });
 }

 if(
  operatingResult30>0 &&
  debt.overdue<=0 &&
  (
   debtRevenueRatio===null ||
   debtRevenueRatio<50
  )
 ){
  ceoSignals.push({
   type:'FINANCIAL_DISCIPLINE',
   severity:'INFO',
   title:'Base financeira controlada',
   value:operatingResult30,
   message:
    'O resultado operacional de 30 dias esta positivo e nao ha divida vencida registrada.'
  });
 }

 return{
  generated_at:
   new Date().toISOString(),

  mode:
   'MANAGEMENT_FINANCIAL_TRUTH',

  revenue:{
   last_30_days:revenue30,
   current_month:revenueMonth,
   sales_30_days:sales30,
   average_daily_30_days:
    avgDailyRevenue
  },

  operations:{
   cmv_30_days:cmv30,
   gross_profit_30_days:
    grossProfit30,
   operating_expenses_30_days:
    operatingExpenses30,
   operating_expenses_current_month:
    operatingExpensesMonth,
   operating_result_30_days:
    operatingResult30
  },

  extraordinary:{
   investments_30_days:
    investments30,
   renovations_30_days:
    renovations30,
   adhoc_purchases_30_days:
    adhocPurchases30,
   result_after_extraordinary_30_days:
    resultAfterInvestments30
  },

  commitments:{
   unpaid_expenses:
    expensesPending,
   overdue_expenses:
    expensesOverdue,
   open_financial_obligations:
    openObligations,
   pressure_30_days:
    pressure30,
   daily_revenue_required_for_pressure:
    dailyRevenueRequiredForPressure
  },

  debt,

  ratios:{
   debt_to_revenue_30d_percent:
    debtRevenueRatio,
   overdue_to_revenue_30d_percent:
    overdueRevenueRatio,
   revenue_days_to_cover_debt:
    daysRevenueToCoverDebt
  },

  ceo:{
   debt_status:debtStatus,
   signals:ceoSignals
  },

  accounting_notice:
   'Indicadores gerenciais. Nao substituem demonstracoes contabeis ou fiscais elaboradas por profissional habilitado.'
 };
}

app.get(
 '/api/v50c/financial-truth',
 minRole(55),
 (_req,res)=>{
  try{
   res.json(
    v50cFinancialTruth()
   );
  }catch(e){
   console.error(
    'V50C_FINANCIAL_TRUTH',
    e
   );
   res.status(500).json({
    error:
     'FINANCIAL_TRUTH_FAILED'
   });
  }
 }
);

app.get(
 '/api/v50c/debts',
 minRole(55),
 (_req,res)=>{
  try{
   res.json(
    v50cDebtSnapshot()
   );
  }catch(e){
   console.error(
    'V50C_DEBT_LIST',
    e
   );
   res.status(500).json({
    error:
     'DEBT_LIST_FAILED'
   });
  }
 }
);

app.post(
 '/api/v50c/debts',
 minRole(70),
 (req,res)=>{
  try{

   const b=req.body||{};

   const creditor=
    String(
     b.creditor||''
    ).trim();

   const description=
    String(
     b.description||''
    ).trim();

   const originalAmount=
    v50cN(
     b.original_amount
    );

   const currentBalance=
    b.current_balance===undefined ||
    b.current_balance===null ||
    b.current_balance===''
     ?originalAmount
     :v50cN(
       b.current_balance
      );

   if(!creditor){
    return res.status(400).json({
     error:'CREDITOR_REQUIRED'
    });
   }

   if(!description){
    return res.status(400).json({
     error:'DESCRIPTION_REQUIRED'
    });
   }

   if(originalAmount<=0){
    return res.status(400).json({
     error:'INVALID_ORIGINAL_AMOUNT'
    });
   }

   if(currentBalance<0){
    return res.status(400).json({
     error:'INVALID_CURRENT_BALANCE'
    });
   }

   const category=
    String(
     b.category||'OTHER'
    ).trim().toUpperCase();

   const priority=
    ['LOW','NORMAL','HIGH','CRITICAL']
     .includes(
      String(
       b.priority||'NORMAL'
      ).toUpperCase()
     )
     ?String(
       b.priority||'NORMAL'
      ).toUpperCase()
     :'NORMAL';

   const status=
    currentBalance<=0
     ?'PAID'
     :'OPEN';

   const info=db.prepare(`
    INSERT INTO financial_debts(
     creditor,
     description,
     category,
     original_amount,
     current_balance,
     installment_amount,
     installments_total,
     installments_paid,
     interest_rate,
     due_date,
     status,
     priority,
     payment_method,
     document_number,
     notes,
     paid_at
    )
    VALUES(
     ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
   `).run(
    creditor,
    description,
    category,
    v50cRound(originalAmount),
    v50cRound(currentBalance),
    b.installment_amount
     ?v50cRound(b.installment_amount)
     :null,
    b.installments_total
     ?Math.max(
       0,
       Math.trunc(
        v50cN(
         b.installments_total
        )
       )
      )
     :null,
    Math.max(
     0,
     Math.trunc(
      v50cN(
       b.installments_paid
      )
     )
    ),
    b.interest_rate
     ?v50cRound(b.interest_rate)
     :null,
    b.due_date||null,
    status,
    priority,
    String(
     b.payment_method||''
    ).trim()||null,
    String(
     b.document_number||''
    ).trim()||null,
    String(
     b.notes||''
    ).trim()||null,
    status==='PAID'
     ?new Date().toISOString()
     :null
   );

   const row=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE id=?
   `).get(
    info.lastInsertRowid
   );

   if(
    typeof audit==='function'
   ){
    audit(
     req.user?.id||null,
     'CREATE',
     'FINANCIAL_DEBT',
     row.id,
     {
      creditor:row.creditor,
      original_amount:
       row.original_amount,
      current_balance:
       row.current_balance
     }
    );
   }

   res.status(201).json(row);

  }catch(e){

   console.error(
    'V50C_CREATE_DEBT',
    e
   );

   res.status(500).json({
    error:
     'CREATE_DEBT_FAILED'
   });
  }
 }
);

app.post(
 '/api/v50c/debts/:id/payment',
 minRole(70),
 (req,res)=>{
  try{

   const id=
    Math.trunc(
     v50cN(
      req.params.id
     )
    );

   const amount=
    v50cRound(
     req.body?.amount
    );

   if(amount<=0){
    return res.status(400).json({
     error:'INVALID_PAYMENT_AMOUNT'
    });
   }

   const debt=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE id=?
   `).get(id);

   if(!debt){
    return res.status(404).json({
     error:'DEBT_NOT_FOUND'
    });
   }

   if(
    String(debt.status).toUpperCase()==='PAID'
   ){
    return res.status(409).json({
     error:'DEBT_ALREADY_PAID'
    });
   }

   if(
    amount>
    v50cN(debt.current_balance)
   ){
    return res.status(400).json({
     error:'PAYMENT_EXCEEDS_BALANCE'
    });
   }

   const newBalance=
    v50cRound(
     v50cN(debt.current_balance)-
     amount
    );

   const newStatus=
    newBalance<=0
     ?'PAID'
     :'OPEN';

   db.prepare(`
    UPDATE financial_debts
    SET
     current_balance=?,
     installments_paid=
      CASE
       WHEN installments_total IS NOT NULL
        AND installments_paid<
            installments_total
       THEN installments_paid+1
       ELSE installments_paid
      END,
     status=?,
     paid_at=
      CASE
       WHEN ?='PAID'
       THEN CURRENT_TIMESTAMP
       ELSE paid_at
      END,
     updated_at=CURRENT_TIMESTAMP
    WHERE id=?
   `).run(
    newBalance,
    newStatus,
    newStatus,
    id
   );

   const updated=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE id=?
   `).get(id);

   if(
    typeof audit==='function'
   ){
    audit(
     req.user?.id||null,
     'PAYMENT',
     'FINANCIAL_DEBT',
     id,
     {
      amount,
      previous_balance:
       debt.current_balance,
      current_balance:
       updated.current_balance,
      status:
       updated.status
     }
    );
   }

   res.json({
    ok:true,
    payment_amount:amount,
    debt:updated
   });

  }catch(e){

   console.error(
    'V50C_DEBT_PAYMENT',
    e
   );

   res.status(500).json({
    error:
     'DEBT_PAYMENT_FAILED'
   });
  }
 }
);

/* NEXUS V5.0C FINANCIAL TRUTH ENGINE END */

/* ============================================================
   NEXUS V5.0C-R3 DEBT MANAGEMENT
   PAYMENT HISTORY + EDIT + PAYOFF STRATEGY
   ============================================================ */

db.exec(`
 CREATE TABLE IF NOT EXISTS financial_debt_payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  previous_balance REAL NOT NULL,
  new_balance REAL NOT NULL,
  payment_method TEXT,
  notes TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
 );

 CREATE INDEX IF NOT EXISTS idx_financial_debt_payments_debt
 ON financial_debt_payments(debt_id);

 CREATE INDEX IF NOT EXISTS idx_financial_debt_payments_created
 ON financial_debt_payments(created_at);
`);

app.put(
 '/api/v50c/debts/:id',
 minRole(70),
 (req,res)=>{
  try{

   const id=Math.trunc(
    v50cN(req.params.id)
   );

   const current=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE id=?
   `).get(id);

   if(!current){
    return res.status(404).json({
     error:'DEBT_NOT_FOUND'
    });
   }

   const b=req.body||{};

   const creditor=String(
    b.creditor ??
    current.creditor ??
    ''
   ).trim();

   const description=String(
    b.description ??
    current.description ??
    ''
   ).trim();

   if(!creditor){
    return res.status(400).json({
     error:'CREDITOR_REQUIRED'
    });
   }

   if(!description){
    return res.status(400).json({
     error:'DESCRIPTION_REQUIRED'
    });
   }

   const category=String(
    b.category ??
    current.category ??
    'OTHER'
   ).trim().toUpperCase();

   const priorityRaw=String(
    b.priority ??
    current.priority ??
    'NORMAL'
   ).toUpperCase();

   const priority=[
    'LOW',
    'NORMAL',
    'HIGH',
    'CRITICAL'
   ].includes(priorityRaw)
    ?priorityRaw
    :'NORMAL';

   const originalAmount=
    b.original_amount===undefined
     ?v50cN(current.original_amount)
     :v50cN(b.original_amount);

   const currentBalance=
    b.current_balance===undefined
     ?v50cN(current.current_balance)
     :v50cN(b.current_balance);

   if(originalAmount<=0){
    return res.status(400).json({
     error:'INVALID_ORIGINAL_AMOUNT'
    });
   }

   if(currentBalance<0){
    return res.status(400).json({
     error:'INVALID_CURRENT_BALANCE'
    });
   }

   const status=
    currentBalance<=0
     ?'PAID'
     :'OPEN';

   db.prepare(`
    UPDATE financial_debts
    SET
     creditor=?,
     description=?,
     category=?,
     original_amount=?,
     current_balance=?,
     installment_amount=?,
     installments_total=?,
     installments_paid=?,
     interest_rate=?,
     due_date=?,
     status=?,
     priority=?,
     payment_method=?,
     document_number=?,
     notes=?,
     paid_at=
      CASE
       WHEN ?='PAID'
       THEN COALESCE(
        paid_at,
        CURRENT_TIMESTAMP
       )
       ELSE NULL
      END,
     updated_at=CURRENT_TIMESTAMP
    WHERE id=?
   `).run(
    creditor,
    description,
    category,
    v50cRound(originalAmount),
    v50cRound(currentBalance),

    b.installment_amount===undefined
     ?current.installment_amount
     :(
       b.installment_amount==='' ||
       b.installment_amount===null
        ?null
        :v50cRound(
          b.installment_amount
         )
      ),

    b.installments_total===undefined
     ?current.installments_total
     :(
       b.installments_total==='' ||
       b.installments_total===null
        ?null
        :Math.max(
          0,
          Math.trunc(
           v50cN(
            b.installments_total
           )
          )
         )
      ),

    b.installments_paid===undefined
     ?v50cN(current.installments_paid)
     :Math.max(
       0,
       Math.trunc(
        v50cN(
         b.installments_paid
        )
       )
      ),

    b.interest_rate===undefined
     ?current.interest_rate
     :(
       b.interest_rate==='' ||
       b.interest_rate===null
        ?null
        :v50cRound(
          b.interest_rate
         )
      ),

    b.due_date===undefined
     ?current.due_date
     :(b.due_date||null),

    status,
    priority,

    b.payment_method===undefined
     ?current.payment_method
     :(
       String(
        b.payment_method||''
       ).trim()||null
      ),

    b.document_number===undefined
     ?current.document_number
     :(
       String(
        b.document_number||''
       ).trim()||null
      ),

    b.notes===undefined
     ?current.notes
     :(
       String(
        b.notes||''
       ).trim()||null
      ),

    status,
    id
   );

   const updated=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE id=?
   `).get(id);

   if(typeof audit==='function'){
    audit(
     req.user?.id||null,
     'UPDATE',
     'FINANCIAL_DEBT',
     id,
     {
      previous_balance:
       current.current_balance,
      current_balance:
       updated.current_balance
     }
    );
   }

   res.json(updated);

  }catch(e){

   console.error(
    'V50C_R3_UPDATE_DEBT',
    e
   );

   res.status(500).json({
    error:'UPDATE_DEBT_FAILED'
   });
  }
 }
);

app.get(
 '/api/v50c/debts/:id/payments',
 minRole(55),
 (req,res)=>{
  try{

   const id=Math.trunc(
    v50cN(req.params.id)
   );

   const debt=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE id=?
   `).get(id);

   if(!debt){
    return res.status(404).json({
     error:'DEBT_NOT_FOUND'
    });
   }

   const payments=db.prepare(`
    SELECT *
    FROM financial_debt_payments
    WHERE debt_id=?
    ORDER BY id DESC
   `).all(id);

   res.json({
    debt,
    payments
   });

  }catch(e){

   console.error(
    'V50C_R3_PAYMENT_HISTORY',
    e
   );

   res.status(500).json({
    error:'PAYMENT_HISTORY_FAILED'
   });
  }
 }
);

app.post(
 '/api/v50c/debts/:id/pay',
 minRole(70),
 (req,res)=>{
  try{

   const id=Math.trunc(
    v50cN(req.params.id)
   );

   const amount=v50cRound(
    req.body?.amount
   );

   if(amount<=0){
    return res.status(400).json({
     error:'INVALID_PAYMENT_AMOUNT'
    });
   }

   const result=db.transaction(()=>{

    const debt=db.prepare(`
     SELECT *
     FROM financial_debts
     WHERE id=?
    `).get(id);

    if(!debt){
     throw new Error(
      'DEBT_NOT_FOUND'
     );
    }

    if(
     String(
      debt.status||''
     ).toUpperCase()==='PAID'
    ){
     throw new Error(
      'DEBT_ALREADY_PAID'
     );
    }

    const previousBalance=
     v50cRound(
      debt.current_balance
     );

    if(amount>previousBalance){
     throw new Error(
      'PAYMENT_EXCEEDS_BALANCE'
     );
    }

    const newBalance=
     v50cRound(
      previousBalance-amount
     );

    const status=
     newBalance<=0
      ?'PAID'
      :'OPEN';

    db.prepare(`
     UPDATE financial_debts
     SET
      current_balance=?,
      installments_paid=
       CASE
        WHEN installments_total IS NOT NULL
         AND installments_paid<
             installments_total
        THEN installments_paid+1
        ELSE installments_paid
       END,
      status=?,
      paid_at=
       CASE
        WHEN ?='PAID'
        THEN CURRENT_TIMESTAMP
        ELSE paid_at
       END,
      updated_at=CURRENT_TIMESTAMP
     WHERE id=?
    `).run(
     newBalance,
     status,
     status,
     id
    );

    const payment=db.prepare(`
     INSERT INTO financial_debt_payments(
      debt_id,
      amount,
      previous_balance,
      new_balance,
      payment_method,
      notes,
      user_id
     )
     VALUES(?,?,?,?,?,?,?)
    `).run(
     id,
     amount,
     previousBalance,
     newBalance,
     String(
      req.body?.payment_method||''
     ).trim()||null,
     String(
      req.body?.notes||''
     ).trim()||null,
     req.user?.id||null
    );

    return{
     debt:db.prepare(`
      SELECT *
      FROM financial_debts
      WHERE id=?
     `).get(id),

     payment:db.prepare(`
      SELECT *
      FROM financial_debt_payments
      WHERE id=?
     `).get(
      payment.lastInsertRowid
     )
    };

   })();

   if(typeof audit==='function'){
    audit(
     req.user?.id||null,
     'PAYMENT',
     'FINANCIAL_DEBT',
     id,
     {
      amount,
      payment_id:
       result.payment.id,
      new_balance:
       result.debt.current_balance
     }
    );
   }

   res.json({
    ok:true,
    ...result
   });

  }catch(e){

   const known=[
    'DEBT_NOT_FOUND',
    'DEBT_ALREADY_PAID',
    'PAYMENT_EXCEEDS_BALANCE'
   ];

   if(known.includes(e.message)){

    const code=
     e.message==='DEBT_NOT_FOUND'
      ?404
      :409;

    return res.status(code).json({
     error:e.message
    });
   }

   console.error(
    'V50C_R3_PAY_DEBT',
    e
   );

   res.status(500).json({
    error:'DEBT_PAYMENT_FAILED'
   });
  }
 }
);

app.get(
 '/api/v50c/payoff-strategy',
 minRole(55),
 (_req,res)=>{
  try{

   const truth=
    v50cFinancialTruth();

   const debts=db.prepare(`
    SELECT *
    FROM financial_debts
    WHERE status='OPEN'
     AND current_balance>0
    ORDER BY
     CASE
      WHEN due_date IS NOT NULL
       AND date(due_date)<
           date('now','localtime')
      THEN 0
      WHEN priority='CRITICAL'
      THEN 1
      WHEN priority='HIGH'
      THEN 2
      WHEN due_date IS NOT NULL
      THEN 3
      ELSE 4
     END,
     COALESCE(
      due_date,
      '9999-12-31'
     ) ASC,
     current_balance ASC
   `).all();

   const revenue30=v50cN(
    truth?.revenue?.last_30_days
   );

   const operatingResult=v50cN(
    truth
     ?.operations
     ?.operating_result_30_days
   );

   const overdue=v50cN(
    truth?.debt?.overdue
   );

   const totalDebt=v50cN(
    truth?.debt?.total_debt
   );

   const averageDailyRevenue=v50cN(
    truth
     ?.revenue
     ?.average_daily_30_days
   );

   const suggestedMonthlyCapacity=
    operatingResult>0
     ?v50cRound(
       operatingResult*.35
      )
     :0;

   const suggestedWeeklyCapacity=
    v50cRound(
     suggestedMonthlyCapacity/4.345
    );

   let accumulated=0;

   const plan=debts.map(
    (debt,index)=>{

     const balance=v50cN(
      debt.current_balance
     );

     const overdueFlag=!!(
      debt.due_date &&
      db.prepare(`
       SELECT
        date(?)<
        date('now','localtime')
        AS yes
      `).get(
       debt.due_date
      )?.yes
     );

     let reason=
      'Menor vencimento e prioridade registrada.';

     if(overdueFlag){
      reason=
       'Divida vencida: prioridade de regularizacao.';
     }
     else if(
      debt.priority==='CRITICAL'
     ){
      reason=
       'Prioridade critica definida no cadastro.';
     }
     else if(
      debt.priority==='HIGH'
     ){
      reason=
       'Prioridade alta definida no cadastro.';
     }

     accumulated+=balance;

     return{
      position:index+1,
      debt_id:debt.id,
      creditor:debt.creditor,
      description:debt.description,
      balance:v50cRound(balance),
      due_date:debt.due_date,
      priority:debt.priority,
      overdue:overdueFlag,
      reason,
      accumulated_balance:
       v50cRound(accumulated)
     };
    }
   );

   res.json({
    generated_at:
     new Date().toISOString(),

    strategy:
     'LIQUIDITY_FIRST',

    debt_total:
     v50cRound(totalDebt),

    overdue:
     v50cRound(overdue),

    revenue_30_days:
     v50cRound(revenue30),

    operating_result_30_days:
     v50cRound(operatingResult),

    average_daily_revenue:
     v50cRound(
      averageDailyRevenue
     ),

    suggested_monthly_capacity:
     suggestedMonthlyCapacity,

    suggested_weekly_capacity:
     suggestedWeeklyCapacity,

    plan,

    notice:
     'Plano gerencial indicativo. A capacidade sugerida usa 35% do resultado operacional positivo registrado e nao autoriza pagamentos automaticos.'
   });

  }catch(e){

   console.error(
    'V50C_R3_PAYOFF_STRATEGY',
    e
   );

   res.status(500).json({
    error:'PAYOFF_STRATEGY_FAILED'
   });
  }
 }
);

/* NEXUS V5.0C-R3 DEBT MANAGEMENT END */

/* ============================================================
   NEXUS V5.0C-R4 FINANCIAL CALENDAR ENGINE
   Scheduled exposure + cash pressure intelligence.
   Explicit sources prevent false consolidation.
   ============================================================ */

app.get(
  '/api/v50c/financial-calendar',
  auth,
  minRole(55),
  (req,res)=>{

    try{

      const r4n=value=>{
        const x=Number(value);
        return Number.isFinite(x)?x:0;
      };

      const r4round=value=>
        Math.round(
          (r4n(value)+Number.EPSILON)*100
        )/100;

      const r4Table=name=>
        !!db.prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type='table'
            AND name=?
        `).get(name);

      const today=
        db.prepare(`
          SELECT date(
            'now',
            'localtime'
          ) AS d
        `).get().d;

      const items=[];

      // ------------------------------------------------------
      // DEBTS
      // ------------------------------------------------------

      if(r4Table('financial_debts')){

        const rows=db.prepare(`
          SELECT
            id,
            creditor,
            description,
            category,
            current_balance AS amount,
            due_date,
            priority,
            payment_method,
            status
          FROM financial_debts
          WHERE status='OPEN'
            AND current_balance>0
        `).all();

        for(const x of rows){

          items.push({
            key:'DEBT:'+x.id,
            source:'DEBT',
            source_label:'Divida',
            source_id:x.id,
            title:x.description,
            counterparty:x.creditor,
            category:x.category,
            amount:r4round(x.amount),
            due_date:x.due_date||null,
            priority:x.priority||'NORMAL',
            recurring:false,
            payment_method:x.payment_method||null,
            possible_overlap:true
          });
        }
      }

      // ------------------------------------------------------
      // EXPENSES
      // ------------------------------------------------------

      if(r4Table('expenses')){

        const rows=db.prepare(`
          SELECT
            id,
            description,
            category,
            amount,
            due_date,
            recurring,
            entry_type,
            payment_method,
            supplier_name
          FROM expenses
          WHERE COALESCE(paid,0)=0
            AND amount>0
        `).all();

        for(const x of rows){

          items.push({
            key:'EXPENSE:'+x.id,
            source:'EXPENSE',
            source_label:
              x.entry_type||'Despesa',
            source_id:x.id,
            title:x.description,
            counterparty:
              x.supplier_name||null,
            category:x.category,
            amount:r4round(x.amount),
            due_date:x.due_date||null,
            priority:'NORMAL',
            recurring:
              Number(x.recurring||0)===1,
            payment_method:
              x.payment_method||null,
            possible_overlap:true
          });
        }
      }

      // ------------------------------------------------------
      // FINANCIAL OBLIGATIONS
      // ------------------------------------------------------

      if(r4Table('financial_obligations')){

        const rows=db.prepare(`
          SELECT
            id,
            title,
            category,
            amount,
            due_date,
            essential,
            status
          FROM financial_obligations
          WHERE status='OPEN'
            AND amount>0
        `).all();

        for(const x of rows){

          items.push({
            key:'OBLIGATION:'+x.id,
            source:'OBLIGATION',
            source_label:'Obrigacao',
            source_id:x.id,
            title:x.title,
            counterparty:null,
            category:x.category,
            amount:r4round(x.amount),
            due_date:x.due_date||null,
            priority:
              Number(x.essential||0)===1
                ?'HIGH'
                :'NORMAL',
            recurring:false,
            payment_method:null,
            possible_overlap:true
          });
        }
      }

      // ------------------------------------------------------
      // PROCUREMENT
      //
      // ORDERED = active procurement commitment.
      // expected_at remains an operational expected date,
      // not a guaranteed contractual payment due date.
      // ------------------------------------------------------

      if(r4Table('purchase_orders')){

        const rows=db.prepare(`
          SELECT
            po.id,
            po.total,
            po.expected_at,
            po.status,
            po.notes,
            s.name AS supplier_name
          FROM purchase_orders po
          LEFT JOIN suppliers s
            ON s.id=po.supplier_id
          WHERE po.status='ORDERED'
            AND po.total>0
        `).all();

        for(const x of rows){

          items.push({
            key:'PROCUREMENT:'+x.id,
            source:'PROCUREMENT',
            source_label:'Compra ORDERED',
            source_id:x.id,
            title:
              x.notes||
              ('Pedido de compra #'+x.id),
            counterparty:
              x.supplier_name||null,
            category:'PROCUREMENT',
            amount:r4round(x.total),
            due_date:x.expected_at||null,
            priority:'NORMAL',
            recurring:false,
            payment_method:null,
            possible_overlap:true,
            date_semantics:'EXPECTED_AT'
          });
        }
      }

      // ------------------------------------------------------
      // CALENDAR CLASSIFICATION
      // ------------------------------------------------------

      const parseDate=value=>{

        if(!value){
          return null;
        }

        const date=new Date(
          String(value).slice(0,10)+
          'T12:00:00'
        );

        return Number.isNaN(
          date.getTime()
        )
          ?null
          :date;
      };

      const base=parseDate(today);

      const diffDays=value=>{

        const date=parseDate(value);

        if(!date||!base){
          return null;
        }

        return Math.round(
          (date-base)/86400000
        );
      };

      for(const item of items){

        const days=
          diffDays(item.due_date);

        item.days_until_due=days;

        if(days===null){
          item.bucket='NO_DATE';
        }
        else if(days<0){
          item.bucket='OVERDUE';
        }
        else if(days===0){
          item.bucket='TODAY';
        }
        else if(days<=7){
          item.bucket='D1_7';
        }
        else if(days<=15){
          item.bucket='D8_15';
        }
        else if(days<=30){
          item.bucket='D16_30';
        }
        else if(days<=60){
          item.bucket='D31_60';
        }
        else if(days<=90){
          item.bucket='D61_90';
        }
        else{
          item.bucket='AFTER_90';
        }
      }

      const sum=list=>
        r4round(
          list.reduce(
            (total,item)=>
              total+r4n(item.amount),
            0
          )
        );

      // ------------------------------------------------------
      // SOURCE ANALYSIS
      // ------------------------------------------------------

      const bySource={};

      for(const source of [
        'DEBT',
        'EXPENSE',
        'OBLIGATION',
        'PROCUREMENT'
      ]){

        const list=
          items.filter(
            item=>item.source===source
          );

        bySource[source]={
          count:list.length,

          amount:
            sum(list),

          overdue:
            sum(
              list.filter(
                item=>
                  item.bucket==='OVERDUE'
              )
            ),

          due_30:
            sum(
              list.filter(
                item=>
                  item.days_until_due!==null &&
                  item.days_until_due>=0 &&
                  item.days_until_due<=30
              )
            ),

          due_90:
            sum(
              list.filter(
                item=>
                  item.days_until_due!==null &&
                  item.days_until_due>=0 &&
                  item.days_until_due<=90
              )
            ),

          without_date:
            sum(
              list.filter(
                item=>
                  item.bucket==='NO_DATE'
              )
            )
        };
      }

      // ------------------------------------------------------
      // HORIZONS
      // ------------------------------------------------------

      const overdue=
        items.filter(
          item=>
            item.bucket==='OVERDUE'
        );

      const noDate=
        items.filter(
          item=>
            item.bucket==='NO_DATE'
        );

      const recurring=
        items.filter(
          item=>item.recurring
        );

      const horizon={};

      for(const days of [
        7,
        15,
        30,
        60,
        90
      ]){

        const list=
          items.filter(
            item=>
              item.days_until_due!==null &&
              item.days_until_due>=0 &&
              item.days_until_due<=days
          );

        horizon[days]={
          days,
          count:list.length,
          scheduled_exposure:
            sum(list),
          overdue_excluded:
            sum(overdue)
        };
      }

      // ------------------------------------------------------
      // HISTORICAL REVENUE PACE
      //
      // Gross paid sales pace.
      // NOT cash on hand.
      // NOT guaranteed forecast.
      // ------------------------------------------------------

      let revenue30=0;

      if(r4Table('sales')){

        revenue30=r4round(
          db.prepare(`
            SELECT
              COALESCE(
                SUM(total),
                0
              ) AS value
            FROM sales
            WHERE status='PAID'
              AND date(created_at)>=
                  date(
                    'now',
                    'localtime',
                    '-29 days'
                  )
          `).get()?.value
        );
      }

      const dailyRevenuePace=
        r4round(
          revenue30/30
        );

      // ------------------------------------------------------
      // CASH PRESSURE
      // ------------------------------------------------------

      const pressure={};

      for(const days of [
        7,
        15,
        30,
        60,
        90
      ]){

        const exposure=
          horizon[days]
            .scheduled_exposure;

        const requiredDaily=
          r4round(
            exposure/days
          );

        const revenueAtPace=
          r4round(
            dailyRevenuePace*days
          );

        pressure[days]={
          horizon_days:days,

          scheduled_exposure:
            exposure,

          required_daily_revenue:
            requiredDaily,

          historical_daily_revenue_pace:
            dailyRevenuePace,

          revenue_at_current_pace:
            revenueAtPace,

          exposure_vs_revenue_pace:
            revenueAtPace>0
              ?r4round(
                  exposure/
                  revenueAtPace*
                  100
                )
              :null,

          gap_vs_revenue_pace:
            r4round(
              Math.max(
                0,
                exposure-
                revenueAtPace
              )
            )
        };
      }

      // ------------------------------------------------------
      // CALENDAR ORDER
      // ------------------------------------------------------

      const calendar=
        [...items].sort((a,b)=>{

          if(
            a.bucket==='OVERDUE' &&
            b.bucket!=='OVERDUE'
          ){
            return -1;
          }

          if(
            b.bucket==='OVERDUE' &&
            a.bucket!=='OVERDUE'
          ){
            return 1;
          }

          if(!a.due_date&&b.due_date){
            return 1;
          }

          if(a.due_date&&!b.due_date){
            return -1;
          }

          if(a.due_date&&b.due_date){

            const cmp=
              String(a.due_date)
                .localeCompare(
                  String(b.due_date)
                );

            if(cmp!==0){
              return cmp;
            }
          }

          return (
            r4n(b.amount)-
            r4n(a.amount)
          );
        });

      // ------------------------------------------------------
      // EXECUTIVE SIGNALS
      // ------------------------------------------------------

      const alerts=[];

      if(overdue.length){

        alerts.push({
          level:'CRITICAL',
          code:'OVERDUE_EXPOSURE',
          message:
            overdue.length+
            ' compromisso(s) registrado(s) vencido(s).'
        });
      }

      if(noDate.length){

        alerts.push({
          level:'ATTENTION',
          code:'WITHOUT_DATE',
          message:
            noDate.length+
            ' compromisso(s) sem data definida.'
        });
      }

      if(recurring.length){

        alerts.push({
          level:'INFO',
          code:'RECURRING_REGISTERED',
          message:
            recurring.length+
            ' lancamento(s) marcado(s) como recorrente(s). Futuras ocorrencias nao foram geradas automaticamente.'
        });
      }

      if(
        pressure[30]
          .gap_vs_revenue_pace>0
      ){

        alerts.push({
          level:'ATTENTION',
          code:'PRESSURE_30D',
          message:
            'A exposicao registrada para os proximos 30 dias supera a receita estimada pelo ritmo bruto historico registrado.'
        });
      }

      // ------------------------------------------------------
      // RESPONSE
      // ------------------------------------------------------

      res.json({

        engine:
          'NEXUS V5.0C-R4 FINANCIAL CALENDAR',

        generated_at:
          new Date().toISOString(),

        today,

        semantics:{
          consolidated_unique_liabilities:false,
          gross_exposure_may_overlap:true,
          cash_balance_projection:false,
          revenue_forecast_guarantee:false,
          recurring_future_entries_generated:false,
          procurement_expected_at_is_payment_due:false,

          note:
            'As fontes permanecem identificadas. A exposicao bruta pode conter sobreposicoes entre registros.'
        },

        revenue:{
          gross_paid_sales_30_days:
            revenue30,

          historical_daily_pace_30_days:
            dailyRevenuePace
        },

        totals:{
          records:
            items.length,

          gross_registered_exposure:
            sum(items),

          overdue:
            sum(overdue),

          overdue_count:
            overdue.length,

          without_date:
            sum(noDate),

          without_date_count:
            noDate.length,

          recurring_registered:
            sum(recurring),

          recurring_count:
            recurring.length
        },

        by_source:
          bySource,

        horizon,
        pressure,
        alerts,
        calendar
      });

    }catch(error){

      console.error(
        '[V5.0C-R4]',
        error
      );

      res.status(500).json({
        error:
          'FINANCIAL_CALENDAR_ERROR',
        message:
          error.message
      });
    }
  }
);

/* ============================================================
   NEXUS V5.0C-R5 CASH FLOW + DRE
   Managerial financial intelligence.
   Revenue, DRE, actual cash flow and commitments are kept
   semantically separated.
============================================================ */

function v50cR5Num(value){
  const x=Number(value);
  return Number.isFinite(x)?x:0;
}

function v50cR5Round(value){
  return Math.round(
    (v50cR5Num(value)+Number.EPSILON)*100
  )/100;
}

function v50cR5Table(name){
  try{
    return !!db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type='table'
        AND name=?
    `).get(name);
  }catch{
    return false;
  }
}

function v50cR5Columns(name){
  try{
    if(!v50cR5Table(name)) return [];
    return db.prepare(
      `PRAGMA table_info("${name}")`
    ).all().map(x=>x.name);
  }catch{
    return [];
  }
}

function v50cR5Has(name,column){
  return v50cR5Columns(name).includes(column);
}

function v50cR5Scalar(sql,key='value'){
  try{
    const row=db.prepare(sql).get();
    return row ? v50cR5Num(row[key]) : 0;
  }catch{
    return 0;
  }
}

function v50cR5Rows(sql){
  try{
    return db.prepare(sql).all();
  }catch{
    return [];
  }
}

function v50cR5FinancialIntelligence(){

  const today=new Date();
  const generatedAt=today.toISOString();

  // ----------------------------------------------------------
  // REVENUE
  // ----------------------------------------------------------

  const salesReady=
    v50cR5Table('sales') &&
    v50cR5Has('sales','total') &&
    v50cR5Has('sales','status') &&
    v50cR5Has('sales','created_at');

  const revenue30=salesReady
    ?v50cR5Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)>=date('now','localtime','-29 days')
     `)
    :0;

  const revenueMonth=salesReady
    ?v50cR5Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND strftime('%Y-%m',created_at)=
             strftime('%Y-%m','now','localtime')
     `)
    :0;

  const revenueToday=salesReady
    ?v50cR5Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)=date('now','localtime')
     `)
    :0;

  // ----------------------------------------------------------
  // CMV
  // ----------------------------------------------------------

  const cmvReady=
    salesReady &&
    v50cR5Table('sale_items') &&
    v50cR5Has('sale_items','sale_id') &&
    v50cR5Has('sale_items','qty') &&
    v50cR5Has('sale_items','unit_cost');

  const cmv30=cmvReady
    ?v50cR5Scalar(`
       SELECT
         COALESCE(SUM(si.qty * si.unit_cost),0) value
       FROM sale_items si
       JOIN sales s ON s.id=si.sale_id
       WHERE s.status='PAID'
         AND date(s.created_at)>=date('now','localtime','-29 days')
     `)
    :0;

  const cmvMonth=cmvReady
    ?v50cR5Scalar(`
       SELECT
         COALESCE(SUM(si.qty * si.unit_cost),0) value
       FROM sale_items si
       JOIN sales s ON s.id=si.sale_id
       WHERE s.status='PAID'
         AND strftime('%Y-%m',s.created_at)=
             strftime('%Y-%m','now','localtime')
     `)
    :0;

  // ----------------------------------------------------------
  // MANAGERIAL DRE
  //
  // There is no dedicated competence_date in expenses.
  // due_date is used when available; created_at is fallback.
  // ----------------------------------------------------------

  const expenseReady=
    v50cR5Table('expenses') &&
    v50cR5Has('expenses','amount') &&
    v50cR5Has('expenses','entry_type');

  const competenceExpr=
    v50cR5Has('expenses','due_date')
      ?"COALESCE(NULLIF(due_date,''),created_at)"
      :"created_at";

  function expenseByType30(type){
    if(!expenseReady) return 0;

    return v50cR5Scalar(`
      SELECT COALESCE(SUM(amount),0) value
      FROM expenses
      WHERE UPPER(COALESCE(entry_type,'EXPENSE'))='${type}'
        AND date(${competenceExpr})>=
            date('now','localtime','-29 days')
    `);
  }

  function expenseByTypeMonth(type){
    if(!expenseReady) return 0;

    return v50cR5Scalar(`
      SELECT COALESCE(SUM(amount),0) value
      FROM expenses
      WHERE UPPER(COALESCE(entry_type,'EXPENSE'))='${type}'
        AND strftime('%Y-%m',${competenceExpr})=
            strftime('%Y-%m','now','localtime')
    `);
  }

  const opExpense30=expenseByType30('EXPENSE');
  const investment30=expenseByType30('INVESTMENT');
  const renovation30=expenseByType30('RENOVATION');
  const adhocPurchase30=expenseByType30('PURCHASE');

  const opExpenseMonth=expenseByTypeMonth('EXPENSE');
  const investmentMonth=expenseByTypeMonth('INVESTMENT');
  const renovationMonth=expenseByTypeMonth('RENOVATION');
  const adhocPurchaseMonth=expenseByTypeMonth('PURCHASE');

  const grossProfit30=
    revenue30-cmv30;

  const operatingResult30=
    grossProfit30-opExpense30;

  const extraordinary30=
    investment30+
    renovation30+
    adhocPurchase30;

  const managerialResult30=
    operatingResult30-
    extraordinary30;

  const grossProfitMonth=
    revenueMonth-cmvMonth;

  const operatingResultMonth=
    grossProfitMonth-opExpenseMonth;

  const extraordinaryMonth=
    investmentMonth+
    renovationMonth+
    adhocPurchaseMonth;

  const managerialResultMonth=
    operatingResultMonth-
    extraordinaryMonth;

  // ----------------------------------------------------------
  // ACTUAL CASH OUTFLOW - EXPENSES
  // ----------------------------------------------------------

  const paidExpenseReady=
    expenseReady &&
    v50cR5Has('expenses','paid') &&
    v50cR5Has('expenses','paid_at');

  function paidExpenseByType30(type){
    if(!paidExpenseReady) return 0;

    return v50cR5Scalar(`
      SELECT COALESCE(SUM(amount),0) value
      FROM expenses
      WHERE COALESCE(paid,0)=1
        AND paid_at IS NOT NULL
        AND UPPER(COALESCE(entry_type,'EXPENSE'))='${type}'
        AND date(paid_at)>=date('now','localtime','-29 days')
    `);
  }

  function paidExpenseByTypeMonth(type){
    if(!paidExpenseReady) return 0;

    return v50cR5Scalar(`
      SELECT COALESCE(SUM(amount),0) value
      FROM expenses
      WHERE COALESCE(paid,0)=1
        AND paid_at IS NOT NULL
        AND UPPER(COALESCE(entry_type,'EXPENSE'))='${type}'
        AND strftime('%Y-%m',paid_at)=
            strftime('%Y-%m','now','localtime')
    `);
  }

  const paidOperating30=
    paidExpenseByType30('EXPENSE');

  const paidInvestment30=
    paidExpenseByType30('INVESTMENT');

  const paidRenovation30=
    paidExpenseByType30('RENOVATION');

  const paidPurchase30=
    paidExpenseByType30('PURCHASE');

  const paidOperatingMonth=
    paidExpenseByTypeMonth('EXPENSE');

  const paidInvestmentMonth=
    paidExpenseByTypeMonth('INVESTMENT');

  const paidRenovationMonth=
    paidExpenseByTypeMonth('RENOVATION');

  const paidPurchaseMonth=
    paidExpenseByTypeMonth('PURCHASE');

  // ----------------------------------------------------------
  // DEBT PAYMENT CASH OUTFLOW
  // ----------------------------------------------------------

  const debtLedgerReady=
    v50cR5Table('financial_debt_payments') &&
    v50cR5Has('financial_debt_payments','amount') &&
    v50cR5Has('financial_debt_payments','created_at');

  const debtPaid30=debtLedgerReady
    ?v50cR5Scalar(`
       SELECT COALESCE(SUM(amount),0) value
       FROM financial_debt_payments
       WHERE date(created_at)>=date('now','localtime','-29 days')
     `)
    :0;

  const debtPaidMonth=debtLedgerReady
    ?v50cR5Scalar(`
       SELECT COALESCE(SUM(amount),0) value
       FROM financial_debt_payments
       WHERE strftime('%Y-%m',created_at)=
             strftime('%Y-%m','now','localtime')
     `)
    :0;

  // ----------------------------------------------------------
  // CASH FLOW
  //
  // Revenue is counted ONCE from PAID sales.
  // payment_splits only explain settlement composition.
  // ----------------------------------------------------------

  const actualExpenseOut30=
    paidOperating30+
    paidInvestment30+
    paidRenovation30+
    paidPurchase30;

  const actualExpenseOutMonth=
    paidOperatingMonth+
    paidInvestmentMonth+
    paidRenovationMonth+
    paidPurchaseMonth;

  const actualOutflow30=
    actualExpenseOut30+
    debtPaid30;

  const actualOutflowMonth=
    actualExpenseOutMonth+
    debtPaidMonth;

  const netCashFlow30=
    revenue30-
    actualOutflow30;

  const netCashFlowMonth=
    revenueMonth-
    actualOutflowMonth;

  // ----------------------------------------------------------
  // PAYMENT METHOD SETTLEMENT
  // payment_splits do NOT add revenue.
  // For a paid sale with splits, split rows describe allocation.
  // Otherwise sales.payment_method is fallback.
  // ----------------------------------------------------------

  let paymentMethods30=[];

  const splitReady=
    v50cR5Table('payment_splits') &&
    v50cR5Has('payment_splits','sale_id') &&
    v50cR5Has('payment_splits','method') &&
    v50cR5Has('payment_splits','amount');

  if(salesReady){

    if(splitReady){

      paymentMethods30=v50cR5Rows(`
        WITH paid_sales AS (
          SELECT id,total,payment_method,created_at
          FROM sales
          WHERE status='PAID'
            AND date(created_at)>=date('now','localtime','-29 days')
        ),
        split_sales AS (
          SELECT DISTINCT sale_id
          FROM payment_splits
        ),
        settlement AS (
          SELECT
            ps.method method,
            ps.amount amount
          FROM payment_splits ps
          JOIN paid_sales s ON s.id=ps.sale_id

          UNION ALL

          SELECT
            COALESCE(s.payment_method,'UNSPECIFIED') method,
            s.total amount
          FROM paid_sales s
          LEFT JOIN split_sales x ON x.sale_id=s.id
          WHERE x.sale_id IS NULL
        )
        SELECT
          method,
          COUNT(*) entries,
          ROUND(COALESCE(SUM(amount),0),2) amount
        FROM settlement
        GROUP BY method
        ORDER BY amount DESC
      `);

    }else{

      paymentMethods30=v50cR5Rows(`
        SELECT
          COALESCE(payment_method,'UNSPECIFIED') method,
          COUNT(*) entries,
          ROUND(COALESCE(SUM(total),0),2) amount
        FROM sales
        WHERE status='PAID'
          AND date(created_at)>=date('now','localtime','-29 days')
        GROUP BY payment_method
        ORDER BY amount DESC
      `);
    }
  }

  // ----------------------------------------------------------
  // PHYSICAL CASH ADJUSTMENTS
  // Not automatically classified as revenue/expense.
  // ----------------------------------------------------------

  let cashAdjustments={
    supply_30_days:0,
    withdrawal_30_days:0,
    net_adjustment_30_days:0
  };

  if(
    v50cR5Table('cash_movements') &&
    v50cR5Has('cash_movements','type') &&
    v50cR5Has('cash_movements','amount') &&
    v50cR5Has('cash_movements','created_at')
  ){

    const supply=v50cR5Scalar(`
      SELECT COALESCE(SUM(amount),0) value
      FROM cash_movements
      WHERE UPPER(type)='SUPRIMENTO'
        AND date(created_at)>=date('now','localtime','-29 days')
    `);

    const withdrawal=v50cR5Scalar(`
      SELECT COALESCE(SUM(amount),0) value
      FROM cash_movements
      WHERE UPPER(type)='SANGRIA'
        AND date(created_at)>=date('now','localtime','-29 days')
    `);

    cashAdjustments={
      supply_30_days:v50cR5Round(supply),
      withdrawal_30_days:v50cR5Round(withdrawal),
      net_adjustment_30_days:v50cR5Round(supply-withdrawal)
    };
  }

  // ----------------------------------------------------------
  // OPEN CASH SESSIONS
  // Do not manufacture "cash on hand".
  // ----------------------------------------------------------

  const openCashSessions=
    v50cR5Table('cash_sessions')
      ?v50cR5Rows(`
         SELECT
           id,
           user_id,
           status,
           opening_amount,
           closing_amount,
           expected_amount,
           opened_at,
           closed_at
         FROM cash_sessions
         WHERE status='OPEN'
         ORDER BY id DESC
       `)
      :[];

  // ----------------------------------------------------------
  // COMMITMENTS - NOT ACTUAL CASH OUTFLOW
  // ----------------------------------------------------------

  const procurementOrdered=
    v50cR5Table('purchase_orders') &&
    v50cR5Has('purchase_orders','status') &&
    v50cR5Has('purchase_orders','total')
      ?v50cR5Scalar(`
         SELECT COALESCE(SUM(total),0) value
         FROM purchase_orders
         WHERE status='ORDERED'
       `)
      :0;

  const obligationsOpen=
    v50cR5Table('financial_obligations') &&
    v50cR5Has('financial_obligations','status') &&
    v50cR5Has('financial_obligations','amount')
      ?v50cR5Scalar(`
         SELECT COALESCE(SUM(amount),0) value
         FROM financial_obligations
         WHERE status='OPEN'
       `)
      :0;

  const debtOpen=
    v50cR5Table('financial_debts') &&
    v50cR5Has('financial_debts','status') &&
    v50cR5Has('financial_debts','current_balance')
      ?v50cR5Scalar(`
         SELECT COALESCE(SUM(current_balance),0) value
         FROM financial_debts
         WHERE status='OPEN'
       `)
      :0;

  const unpaidExpenses=
    expenseReady &&
    v50cR5Has('expenses','paid')
      ?v50cR5Scalar(`
         SELECT COALESCE(SUM(amount),0) value
         FROM expenses
         WHERE COALESCE(paid,0)=0
       `)
      :0;

  // ----------------------------------------------------------
  // RESERVES
  // Reserve is management allocation, not cash balance.
  // ----------------------------------------------------------

  let reserveTarget=0;
  let reservedAmount=0;

  if(
    v50cR5Table('financial_intelligence_reserves') &&
    v50cR5Has('financial_intelligence_reserves','target_amount') &&
    v50cR5Has('financial_intelligence_reserves','reserved_amount')
  ){

    reserveTarget=v50cR5Scalar(`
      SELECT COALESCE(SUM(target_amount),0) value
      FROM financial_intelligence_reserves
      WHERE UPPER(COALESCE(status,'ACTIVE')) NOT IN ('CANCELLED','CANCELED')
    `);

    reservedAmount=v50cR5Scalar(`
      SELECT COALESCE(SUM(reserved_amount),0) value
      FROM financial_intelligence_reserves
      WHERE UPPER(COALESCE(status,'ACTIVE')) NOT IN ('CANCELLED','CANCELED')
    `);
  }

  // ----------------------------------------------------------
  // TRENDS
  // ----------------------------------------------------------

  const avgDailyRevenue30=
    revenue30/30;

  const operatingMargin30=
    revenue30>0
      ?(operatingResult30/revenue30)*100
      :0;

  const managerialMargin30=
    revenue30>0
      ?(managerialResult30/revenue30)*100
      :0;

  const cmvPercent30=
    revenue30>0
      ?(cmv30/revenue30)*100
      :0;

  const actualOutflowPercent30=
    revenue30>0
      ?(actualOutflow30/revenue30)*100
      :0;

  let cashPressure='NO_ACTIVITY';

  if(revenue30>0 || actualOutflow30>0){

    if(netCashFlow30<0){
      cashPressure='NEGATIVE';
    }
    else if(actualOutflowPercent30>=90){
      cashPressure='CRITICAL';
    }
    else if(actualOutflowPercent30>=75){
      cashPressure='HIGH';
    }
    else if(actualOutflowPercent30>=55){
      cashPressure='ATTENTION';
    }
    else{
      cashPressure='CONTROLLED';
    }
  }

  const notes=[
    'Receita gerencial considera somente vendas com status PAID.',
    'payment_splits representa composicao do recebimento e nao e somado novamente a receita.',
    'CMV usa sale_items.qty x sale_items.unit_cost.',
    'Na ausencia de competence_date, a DRE gerencial usa due_date da despesa e created_at como fallback.',
    'INVESTMENT, RENOVATION e PURCHASE ficam fora da despesa operacional e aparecem como extraordinarios gerenciais.',
    'Pagamento de divida e saida de caixa, mas nao e automaticamente despesa operacional.',
    'Divida em aberto, obrigacoes e Procurement ORDERED sao compromissos, nao saidas de caixa realizadas.',
    'SUPRIMENTO e SANGRIA sao ajustes de caixa fisico e nao sao classificados automaticamente como receita ou despesa.',
    'Reserva gerencial nao representa saldo bancario nem caixa disponivel.',
    'Historico de pagamentos de divida cobre somente registros existentes em financial_debt_payments.',
    'Nao existe tabela dedicada payments, returns ou refunds na base mapeada pela R5.'
  ];

  return {

    version:'V5.0C-R5',
    generated_at:generatedAt,

    semantics:{
      model:'MANAGERIAL',
      revenue_basis:'PAID_SALES',
      expense_competence_basis:
        'DUE_DATE_WITH_CREATED_AT_FALLBACK',
      cash_inflow_basis:
        'PAID_SALES_WITH_PAYMENT_SPLIT_AS_SETTLEMENT_DETAIL',
      cash_expense_basis:
        'PAID_EXPENSE_PAID_AT',
      debt_cash_basis:
        'FINANCIAL_DEBT_PAYMENTS',
      procurement_basis:
        'ORDERED_IS_COMMITMENT_NOT_PAYMENT',
      cash_balance:
        'NOT_INFERRED'
    },

    dre_30_days:{
      revenue:v50cR5Round(revenue30),
      cmv:v50cR5Round(cmv30),
      gross_profit:v50cR5Round(grossProfit30),
      operating_expenses:v50cR5Round(opExpense30),
      operating_result:v50cR5Round(operatingResult30),
      investments:v50cR5Round(investment30),
      renovations:v50cR5Round(renovation30),
      adhoc_purchases:v50cR5Round(adhocPurchase30),
      extraordinary:v50cR5Round(extraordinary30),
      managerial_result:v50cR5Round(managerialResult30),
      cmv_percent:v50cR5Round(cmvPercent30),
      operating_margin_percent:v50cR5Round(operatingMargin30),
      managerial_margin_percent:v50cR5Round(managerialMargin30)
    },

    dre_current_month:{
      revenue:v50cR5Round(revenueMonth),
      cmv:v50cR5Round(cmvMonth),
      gross_profit:v50cR5Round(grossProfitMonth),
      operating_expenses:v50cR5Round(opExpenseMonth),
      operating_result:v50cR5Round(operatingResultMonth),
      investments:v50cR5Round(investmentMonth),
      renovations:v50cR5Round(renovationMonth),
      adhoc_purchases:v50cR5Round(adhocPurchaseMonth),
      extraordinary:v50cR5Round(extraordinaryMonth),
      managerial_result:v50cR5Round(managerialResultMonth)
    },

    cash_flow_30_days:{
      inflow_paid_sales:v50cR5Round(revenue30),
      paid_operating_expenses:v50cR5Round(paidOperating30),
      paid_investments:v50cR5Round(paidInvestment30),
      paid_renovations:v50cR5Round(paidRenovation30),
      paid_adhoc_purchases:v50cR5Round(paidPurchase30),
      debt_payments:v50cR5Round(debtPaid30),
      actual_outflow:v50cR5Round(actualOutflow30),
      net_flow:v50cR5Round(netCashFlow30),
      outflow_to_revenue_percent:v50cR5Round(actualOutflowPercent30),
      pressure:cashPressure
    },

    cash_flow_current_month:{
      inflow_paid_sales:v50cR5Round(revenueMonth),
      paid_operating_expenses:v50cR5Round(paidOperatingMonth),
      paid_investments:v50cR5Round(paidInvestmentMonth),
      paid_renovations:v50cR5Round(paidRenovationMonth),
      paid_adhoc_purchases:v50cR5Round(paidPurchaseMonth),
      debt_payments:v50cR5Round(debtPaidMonth),
      actual_outflow:v50cR5Round(actualOutflowMonth),
      net_flow:v50cR5Round(netCashFlowMonth)
    },

    revenue:{
      today:v50cR5Round(revenueToday),
      current_month:v50cR5Round(revenueMonth),
      last_30_days:v50cR5Round(revenue30),
      average_daily_30_days:v50cR5Round(avgDailyRevenue30)
    },

    settlement:{
      payment_methods_30_days:paymentMethods30,
      split_is_additional_revenue:false
    },

    physical_cash:{
      open_sessions:openCashSessions,
      open_session_count:openCashSessions.length,
      adjustments:cashAdjustments,
      cash_on_hand:null,
      cash_on_hand_reason:
        'NOT_INFERRED_FROM_REVENUE_OR_CASH_SESSION'
    },

    commitments:{
      open_debt:v50cR5Round(debtOpen),
      unpaid_expenses:v50cR5Round(unpaidExpenses),
      open_legacy_obligations:v50cR5Round(obligationsOpen),
      procurement_ordered:v50cR5Round(procurementOrdered),
      consolidated_total:null,
      possible_overlap:true,
      warning:
        'Sources are intentionally not blindly consolidated because semantic overlap may exist.'
    },

    reserves:{
      target:v50cR5Round(reserveTarget),
      reserved:v50cR5Round(reservedAmount),
      is_cash_balance:false
    },

    limitations:{
      dedicated_payments_table:v50cR5Table('payments'),
      dedicated_returns_table:v50cR5Table('returns'),
      dedicated_refunds_table:v50cR5Table('refunds'),
      debt_payment_history:
        'PROSPECTIVE_LEDGER_ONLY_WHERE_RECORDED',
      true_bank_balance:false
    },

    notes
  };
}

app.get(
  '/api/v50c/cash-flow-dre',
  auth,
  minRole(55),
  (req,res)=>{
    try{
      res.json(
        v50cR5FinancialIntelligence()
      );
    }catch(error){
      console.error(
        'V5.0C-R5 CASH FLOW DRE ERROR',
        error
      );

      res.status(500).json({
        error:'R5_FINANCIAL_INTELLIGENCE_FAILED'
      });
    }
  }
);

/* END NEXUS V5.0C-R5 CASH FLOW + DRE */


/* ============================================================
   NEXUS V5.0C-R6 FINANCIAL FORECAST ENGINE

   Deterministic managerial scenario engine.

   IMPORTANT:
   - projected revenue is not guaranteed revenue
   - projected net movement is not bank balance
   - commitments remain source-separated
   - no automatic investment or borrowing decision
============================================================ */

function v50cR6Num(value){
  const x=Number(value);
  return Number.isFinite(x)?x:0;
}

function v50cR6Round(value){
  return Math.round(
    (v50cR6Num(value)+Number.EPSILON)*100
  )/100;
}

function v50cR6Table(name){
  try{
    return !!db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type='table'
        AND name=?
    `).get(name);
  }catch{
    return false;
  }
}

function v50cR6Columns(name){
  try{
    if(!v50cR6Table(name)) return [];

    return db.prepare(
      `PRAGMA table_info("${name}")`
    ).all().map(x=>x.name);
  }catch{
    return [];
  }
}

function v50cR6Has(name,column){
  return v50cR6Columns(name).includes(column);
}

function v50cR6Scalar(sql){
  try{
    const row=db.prepare(sql).get();
    return row ? v50cR6Num(row.value) : 0;
  }catch{
    return 0;
  }
}

function v50cR6Rows(sql){
  try{
    return db.prepare(sql).all();
  }catch{
    return [];
  }
}

function v50cR6DateOnly(value){

  if(!value) return null;

  const text=String(value).slice(0,10);

  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return null;
  }

  return text;
}

function v50cR6LocalDate(){

  const now=new Date();

  const year=now.getFullYear();
  const month=String(
    now.getMonth()+1
  ).padStart(2,'0');

  const day=String(
    now.getDate()
  ).padStart(2,'0');

  return `${year}-${month}-${day}`;
}

function v50cR6AddDays(dateText,days){

  const parts=dateText
    .split('-')
    .map(Number);

  const d=new Date(
    parts[0],
    parts[1]-1,
    parts[2]
  );

  d.setDate(
    d.getDate()+days
  );

  const y=d.getFullYear();
  const m=String(
    d.getMonth()+1
  ).padStart(2,'0');

  const day=String(
    d.getDate()
  ).padStart(2,'0');

  return `${y}-${m}-${day}`;
}

function v50cR6DiffDays(a,b){

  const pa=a.split('-').map(Number);
  const pb=b.split('-').map(Number);

  const da=Date.UTC(
    pa[0],
    pa[1]-1,
    pa[2]
  );

  const dbb=Date.UTC(
    pb[0],
    pb[1]-1,
    pb[2]
  );

  return Math.round(
    (dbb-da)/86400000
  );
}

function v50cR6FinancialForecast(){

  const today=v50cR6LocalDate();

  const horizons=[
    7,
    15,
    30,
    60,
    90
  ];

  // ----------------------------------------------------------
  // HISTORICAL SALES
  // ----------------------------------------------------------

  const salesReady=
    v50cR6Table('sales') &&
    v50cR6Has('sales','total') &&
    v50cR6Has('sales','status') &&
    v50cR6Has('sales','created_at');

  let dailyHistory=[];

  if(salesReady){

    dailyHistory=v50cR6Rows(`
      SELECT
        date(created_at) day,
        ROUND(
          COALESCE(SUM(total),0),
          2
        ) revenue
      FROM sales
      WHERE status='PAID'
        AND date(created_at)>=
            date('now','localtime','-89 days')
      GROUP BY date(created_at)
      ORDER BY day
    `);
  }

  const activeSalesDays=
    dailyHistory.length;

  const revenue7=salesReady
    ?v50cR6Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)>=
             date('now','localtime','-6 days')
     `)
    :0;

  const revenue30=salesReady
    ?v50cR6Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)>=
             date('now','localtime','-29 days')
     `)
    :0;

  const revenue90=salesReady
    ?v50cR6Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)>=
             date('now','localtime','-89 days')
     `)
    :0;

  const average7=
    revenue7/7;

  const average30=
    revenue30/30;

  const average90=
    revenue90/90;

  // ----------------------------------------------------------
  // DATA DEPTH
  // ----------------------------------------------------------

  let historyClass='NO_HISTORY';

  if(activeSalesDays>=60){
    historyClass='STRONGER_HISTORY';
  }
  else if(activeSalesDays>=30){
    historyClass='MODERATE_HISTORY';
  }
  else if(activeSalesDays>=14){
    historyClass='LIMITED_HISTORY';
  }
  else if(activeSalesDays>=7){
    historyClass='VERY_LIMITED_HISTORY';
  }

  // ----------------------------------------------------------
  // BASE DAILY PACE
  //
  // Uses available historical pace.
  // Recent history receives more weight when data exists.
  // ----------------------------------------------------------

  let baseDaily=0;

  if(revenue30>0){

    if(revenue7>0){
      baseDaily=
        (average30*0.65)+
        (average7*0.35);
    }
    else{
      baseDaily=average30;
    }
  }
  else if(revenue90>0){
    baseDaily=average90;
  }

  // ----------------------------------------------------------
  // WEEKDAY PROFILE
  //
  // Missing weekdays remain neutral (factor 1).
  // ----------------------------------------------------------

  const weekdayStats=salesReady
    ?v50cR6Rows(`
       WITH daily AS (
         SELECT
           date(created_at) day,
           CAST(
             strftime('%w',created_at)
             AS INTEGER
           ) weekday,
           SUM(total) revenue
         FROM sales
         WHERE status='PAID'
           AND date(created_at)>=
               date('now','localtime','-89 days')
         GROUP BY date(created_at)
       )
       SELECT
         weekday,
         COUNT(*) observed_days,
         AVG(revenue) avg_revenue
       FROM daily
       GROUP BY weekday
       ORDER BY weekday
     `)
    :[];

  const weekdayMap={};

  for(const row of weekdayStats){

    const avg=v50cR6Num(
      row.avg_revenue
    );

    weekdayMap[
      Number(row.weekday)
    ]={
      observed_days:Number(
        row.observed_days||0
      ),
      average:v50cR6Round(avg),
      factor:
        baseDaily>0
          ?Math.max(
             0.35,
             Math.min(
               2.25,
               avg/baseDaily
             )
           )
          :1
    };
  }

  // ----------------------------------------------------------
  // HISTORICAL CMV RATIO
  // ----------------------------------------------------------

  let cmv30=0;

  const qtyColumn=
    v50cR6Has('sale_items','qty')
      ?'qty'
      :(
        v50cR6Has(
          'sale_items',
          'quantity'
        )
          ?'quantity'
          :null
      );

  const cmvReady=
    salesReady &&
    v50cR6Table('sale_items') &&
    v50cR6Has('sale_items','sale_id') &&
    v50cR6Has('sale_items','unit_cost') &&
    !!qtyColumn;

  if(cmvReady){

    cmv30=v50cR6Scalar(`
      SELECT
        COALESCE(
          SUM(
            si.${qtyColumn} *
            si.unit_cost
          ),
          0
        ) value
      FROM sale_items si
      JOIN sales s
        ON s.id=si.sale_id
      WHERE s.status='PAID'
        AND date(s.created_at)>=
            date('now','localtime','-29 days')
    `);
  }

  const cmvRatio=
    revenue30>0
      ?Math.max(
         0,
         cmv30/revenue30
       )
      :0;

  // ----------------------------------------------------------
  // COMMITMENT EVENTS
  // ----------------------------------------------------------

  const events=[];

  function addEvent({
    source,
    label,
    amount,
    dueDate,
    possibleOverlap=true,
    dateSemantics='DUE_DATE'
  }){

    const value=v50cR6Num(amount);
    const date=v50cR6DateOnly(dueDate);

    if(value<=0) return;

    events.push({
      source,
      label,
      amount:v50cR6Round(value),
      due_date:date,
      possible_overlap:possibleOverlap,
      date_semantics:dateSemantics
    });
  }

  // DEBTS
  if(
    v50cR6Table('financial_debts')
  ){

    const debts=v50cR6Rows(`
      SELECT
        id,
        creditor,
        description,
        current_balance,
        installment_amount,
        due_date,
        priority
      FROM financial_debts
      WHERE status='OPEN'
        AND current_balance>0
    `);

    for(const item of debts){

      addEvent({
        source:'DEBT',
        label:
          item.creditor ||
          item.description ||
          `Debt #${item.id}`,
        amount:item.current_balance,
        dueDate:item.due_date,
        possibleOverlap:true
      });
    }
  }

  // EXPENSES
  if(
    v50cR6Table('expenses') &&
    v50cR6Has('expenses','amount')
  ){

    const expenses=v50cR6Rows(`
      SELECT
        id,
        description,
        amount,
        due_date,
        recurring,
        entry_type
      FROM expenses
      WHERE COALESCE(paid,0)=0
        AND amount>0
    `);

    for(const item of expenses){

      addEvent({
        source:'EXPENSE',
        label:
          item.description ||
          item.entry_type ||
          `Expense #${item.id}`,
        amount:item.amount,
        dueDate:item.due_date,
        possibleOverlap:true
      });
    }
  }

  // LEGACY OBLIGATIONS
  if(
    v50cR6Table(
      'financial_obligations'
    )
  ){

    const obligations=v50cR6Rows(`
      SELECT
        id,
        title,
        amount,
        due_date
      FROM financial_obligations
      WHERE status='OPEN'
        AND amount>0
    `);

    for(const item of obligations){

      addEvent({
        source:'OBLIGATION',
        label:
          item.title ||
          `Obligation #${item.id}`,
        amount:item.amount,
        dueDate:item.due_date,
        possibleOverlap:true
      });
    }
  }

  // PROCUREMENT
  if(
    v50cR6Table(
      'purchase_orders'
    )
  ){

    const orders=v50cR6Rows(`
      SELECT
        po.id,
        po.total,
        po.expected_at,
        po.supplier_id
      FROM purchase_orders po
      WHERE po.status='ORDERED'
        AND po.total>0
    `);

    for(const item of orders){

      addEvent({
        source:'PROCUREMENT',
        label:
          `Purchase Order #${item.id}`,
        amount:item.total,
        dueDate:item.expected_at,
        possibleOverlap:true,
        dateSemantics:'EXPECTED_AT_NOT_PAYMENT_DUE'
      });
    }
  }

  // ----------------------------------------------------------
  // RECURRING EXPENSE SIGNAL
  //
  // IMPORTANT:
  // Existing recurring rows are identified.
  // Future occurrences are NOT fabricated.
  // ----------------------------------------------------------

  let recurringRegistered=0;

  if(
    v50cR6Table('expenses') &&
    v50cR6Has('expenses','recurring')
  ){

    recurringRegistered=
      v50cR6Scalar(`
        SELECT COUNT(*) value
        FROM expenses
        WHERE COALESCE(recurring,0)=1
      `);
  }

  // ----------------------------------------------------------
  // SCENARIOS
  // ----------------------------------------------------------

  const scenarioConfig={
    CONSERVATIVE:{
      revenue_factor:0.85
    },
    BASE:{
      revenue_factor:1
    },
    GROWTH:{
      revenue_factor:1.15
    }
  };

  function projectedRevenue(days,factor){

    if(baseDaily<=0){
      return 0;
    }

    let total=0;

    for(let i=1;i<=days;i++){

      const dateText=
        v50cR6AddDays(
          today,
          i
        );

      const parts=
        dateText
          .split('-')
          .map(Number);

      const date=
        new Date(
          parts[0],
          parts[1]-1,
          parts[2]
        );

      const weekday=
        date.getDay();

      const weekdayFactor=
        weekdayMap[weekday]?.factor || 1;

      total+=
        baseDaily *
        weekdayFactor *
        factor;
    }

    return v50cR6Round(total);
  }

  function commitmentForHorizon(days){

    let dated=0;
    let overdue=0;
    let noDate=0;

    const end=
      v50cR6AddDays(
        today,
        days
      );

    const bySource={};

    for(const event of events){

      if(!bySource[event.source]){
        bySource[event.source]={
          scheduled:0,
          overdue:0,
          without_date:0,
          count:0
        };
      }

      const target=
        bySource[event.source];

      target.count++;

      if(!event.due_date){

        noDate+=event.amount;
        target.without_date+=
          event.amount;

        continue;
      }

      const diff=
        v50cR6DiffDays(
          today,
          event.due_date
        );

      if(diff<0){

        overdue+=event.amount;
        target.overdue+=
          event.amount;

        continue;
      }

      if(event.due_date<=end){

        dated+=event.amount;
        target.scheduled+=
          event.amount;
      }
    }

    for(const key of Object.keys(bySource)){

      bySource[key]={
        scheduled:
          v50cR6Round(
            bySource[key].scheduled
          ),

        overdue:
          v50cR6Round(
            bySource[key].overdue
          ),

        without_date:
          v50cR6Round(
            bySource[key].without_date
          ),

        count:
          bySource[key].count
      };
    }

    return {
      scheduled:v50cR6Round(dated),
      overdue:v50cR6Round(overdue),
      without_date:v50cR6Round(noDate),
      by_source:bySource
    };
  }

  const forecast=[];

  for(const days of horizons){

    const commitments=
      commitmentForHorizon(days);

    const scenarios={};

    for(
      const [
        name,
        config
      ]
      of Object.entries(
        scenarioConfig
      )
    ){

      const revenue=
        projectedRevenue(
          days,
          config.revenue_factor
        );

      const projectedCmv=
        v50cR6Round(
          revenue*cmvRatio
        );

      const contributionAfterCmv=
        v50cR6Round(
          revenue-projectedCmv
        );

      // Scheduled exposure remains source-aware.
      // It is intentionally NOT called a consolidated unique liability.
      const pressure=
        commitments.scheduled+
        commitments.overdue;

      const movementAfterRegisteredPressure=
        v50cR6Round(
          contributionAfterCmv-
          pressure
        );

      const requiredDailyRevenue=
        days>0
          ?v50cR6Round(
             pressure/days
           )
          :0;

      const coverageRatio=
        pressure>0
          ?v50cR6Round(
             contributionAfterCmv/
             pressure
           )
          :null;

      scenarios[name]={
        projected_revenue:
          revenue,

        projected_cmv:
          projectedCmv,

        projected_contribution_after_cmv:
          contributionAfterCmv,

        registered_pressure:
          v50cR6Round(pressure),

        projected_net_movement:
          movementAfterRegisteredPressure,

        required_daily_revenue_for_registered_pressure:
          requiredDailyRevenue,

        contribution_to_pressure_ratio:
          coverageRatio,

        is_future_cash_balance:false,

        is_guaranteed:false
      };
    }

    forecast.push({
      days,
      commitments,
      scenarios
    });
  }

  // ----------------------------------------------------------
  // TREND
  // ----------------------------------------------------------

  const previous7=salesReady
    ?v50cR6Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at) BETWEEN
             date('now','localtime','-13 days')
             AND
             date('now','localtime','-7 days')
     `)
    :0;

  const previous30=salesReady
    ?v50cR6Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at) BETWEEN
             date('now','localtime','-59 days')
             AND
             date('now','localtime','-30 days')
     `)
    :0;

  const trend7=
    previous7>0
      ?((revenue7-previous7)/previous7)*100
      :null;

  const trend30=
    previous30>0
      ?((revenue30-previous30)/previous30)*100
      :null;

  // ----------------------------------------------------------
  // EXECUTIVE SIGNALS
  // ----------------------------------------------------------

  const signals=[];

  if(activeSalesDays<7){

    signals.push({
      severity:'INFO',
      code:'LOW_HISTORY',
      title:'Histórico insuficiente',
      message:
        'Os cenários possuem pouca base histórica. Use-os como sensibilidade gerencial.'
    });
  }
  else if(activeSalesDays<30){

    signals.push({
      severity:'ATTENTION',
      code:'LIMITED_HISTORY',
      title:'Histórico ainda limitado',
      message:
        'Horizontes de 60 e 90 dias exigem cautela porque o histórico disponível ainda é curto.'
    });
  }

  const h30=
    forecast.find(
      item=>item.days===30
    );

  if(
    h30 &&
    h30.scenarios.BASE
      .projected_net_movement<0
  ){

    signals.push({
      severity:'CRITICAL',
      code:'BASE_30D_PRESSURE_GAP',
      title:'Pressão superior ao cenário-base',
      message:
        'No horizonte de 30 dias, a contribuição projetada após CMV não cobre a exposição registrada no cenário-base.'
    });
  }

  if(recurringRegistered>0){

    signals.push({
      severity:'INFO',
      code:'RECURRING_SIGNAL',
      title:'Despesas recorrentes identificadas',
      message:
        `${recurringRegistered} registro(s) recorrente(s) existem, mas ocorrências futuras não foram fabricadas.`
    });
  }

  const noDateTotal=
    events
      .filter(x=>!x.due_date)
      .reduce(
        (sum,x)=>sum+x.amount,
        0
      );

  if(noDateTotal>0){

    signals.push({
      severity:'ATTENTION',
      code:'WITHOUT_DATE',
      title:'Compromissos sem data',
      message:
        `${v50cR6Round(noDateTotal)} em exposição registrada não possui data e fica fora da janela futura datada.`
    });
  }

  // ----------------------------------------------------------
  // FINAL RESPONSE
  // ----------------------------------------------------------

  return {

    version:'V5.0C-R6',

    generated_at:
      new Date().toISOString(),

    engine:{
      type:
        'DETERMINISTIC_MANAGERIAL_SCENARIO_ENGINE',

      horizons,

      scenarios:[
        'CONSERVATIVE',
        'BASE',
        'GROWTH'
      ],

      scenario_factors:{
        CONSERVATIVE:0.85,
        BASE:1,
        GROWTH:1.15
      }
    },

    history:{
      active_sales_days:
        activeSalesDays,

      classification:
        historyClass,

      revenue_7_days:
        v50cR6Round(revenue7),

      revenue_30_days:
        v50cR6Round(revenue30),

      revenue_90_days:
        v50cR6Round(revenue90),

      average_daily_7_days:
        v50cR6Round(average7),

      average_daily_30_days:
        v50cR6Round(average30),

      average_daily_90_days:
        v50cR6Round(average90),

      weighted_base_daily:
        v50cR6Round(baseDaily),

      trend_7_days_percent:
        trend7===null
          ?null
          :v50cR6Round(trend7),

      trend_30_days_percent:
        trend30===null
          ?null
          :v50cR6Round(trend30)
    },

    weekday_profile:
      weekdayMap,

    cost_basis:{
      cmv_30_days:
        v50cR6Round(cmv30),

      cmv_ratio:
        v50cR6Round(
          cmvRatio*100
        ),

      cmv_projection_available:
        cmvReady
    },

    forecast,

    registered_commitments:{
      events_count:
        events.length,

      recurring_expense_records:
        recurringRegistered,

      possible_overlap:true,

      unique_consolidated_liability:false,

      sources:[
        'DEBT',
        'EXPENSE',
        'OBLIGATION',
        'PROCUREMENT'
      ]
    },

    signals,

    semantics:{
      projected_revenue_is_guaranteed:false,

      projected_net_movement_is_cash_balance:false,

      bank_balance_projected:false,

      verified_starting_bank_balance:false,

      automatic_investment_capacity:false,

      automatic_borrowing_capacity:false,

      future_recurring_occurrences_generated:false,

      procurement_expected_at_is_payment_due:false,

      payment_splits_added_to_revenue:false,

      reserves_are_cash_balance:false,

      commitment_sources_are_blindly_consolidated:false,

      projection_name:
        'PROJECTED_NET_MOVEMENT'
    },

    methodology:[
      'Cenário BASE usa ritmo histórico ponderado entre os últimos 30 e 7 dias quando há dados.',
      'CONSERVATIVE aplica sensibilidade de -15% sobre o ritmo-base.',
      'GROWTH aplica sensibilidade de +15% sobre o ritmo-base.',
      'O perfil histórico por dia da semana ajusta o ritmo diário quando existem observações.',
      'CMV projetado usa a relação histórica entre CMV e vendas PAID.',
      'Dívidas, despesas, obrigações e Procurement permanecem identificados por origem.',
      'Compromissos vencidos entram na pressão, mas permanecem separados dos compromissos futuros.',
      'Compromissos sem data são informados separadamente.',
      'Despesas recorrentes existentes são identificadas, mas o motor não fabrica parcelas futuras.',
      'Procurement ORDERED representa compromisso; expected_at não é tratado como vencimento contratual de pagamento.',
      'Projected Net Movement é cenário gerencial e não saldo bancário futuro.',
      'Nenhum cenário representa garantia de receita, lucro, liquidez ou capacidade de investimento.'
    ]
  };
}

app.get(
  '/api/v50c/financial-forecast',
  auth,
  minRole(55),
  (req,res)=>{

    try{

      res.json(
        v50cR6FinancialForecast()
      );

    }catch(error){

      console.error(
        'V5.0C-R6 FINANCIAL FORECAST ERROR',
        error
      );

      res.status(500).json({
        error:
          'R6_FINANCIAL_FORECAST_FAILED'
      });
    }
  }
);

/* END NEXUS V5.0C-R6 FINANCIAL FORECAST ENGINE */


/* ============================================================
   NEXUS V5.0C-R7 FINANCIAL MENTOR + DECISION INTELLIGENCE

   Deterministic management guidance.

   RULES:
   - evidence first
   - source separation
   - no fabricated cash balance
   - no guaranteed forecast
   - no autonomous high-impact financial execution
============================================================ */

function v50cR7Num(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function v50cR7Round(value){
  return Math.round(
    (v50cR7Num(value)+Number.EPSILON)*100
  )/100;
}

function v50cR7Table(name){
  try{
    return !!db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type='table'
        AND name=?
    `).get(name);
  }catch{
    return false;
  }
}

function v50cR7Columns(name){

  if(!v50cR7Table(name)){
    return [];
  }

  try{
    return db.prepare(
      `PRAGMA table_info("${name}")`
    ).all().map(x=>x.name);
  }catch{
    return [];
  }
}

function v50cR7Has(name,column){
  return v50cR7Columns(name).includes(column);
}

function v50cR7Scalar(sql){

  try{

    const row=db.prepare(sql).get();

    return row
      ?v50cR7Num(row.value)
      :0;

  }catch{
    return 0;
  }
}

function v50cR7Rows(sql){

  try{
    return db.prepare(sql).all();
  }catch{
    return [];
  }
}

function v50cR7MoneyEvidence(label,value,source){

  return {
    label,
    value:v50cR7Round(value),
    unit:'BRL',
    source
  };
}

function v50cR7PercentEvidence(label,value,source){

  return {
    label,
    value:
      value===null
        ?null
        :v50cR7Round(value),
    unit:'PERCENT',
    source
  };
}

function v50cR7FinancialMentor(){

  // ----------------------------------------------------------
  // REVENUE
  // ----------------------------------------------------------

  const salesReady=
    v50cR7Table('sales') &&
    v50cR7Has('sales','total') &&
    v50cR7Has('sales','status') &&
    v50cR7Has('sales','created_at');

  const revenue7=salesReady
    ?v50cR7Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)>=
             date('now','localtime','-6 days')
     `)
    :0;

  const previous7=salesReady
    ?v50cR7Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at) BETWEEN
             date('now','localtime','-13 days')
             AND
             date('now','localtime','-7 days')
     `)
    :0;

  const revenue30=salesReady
    ?v50cR7Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at)>=
             date('now','localtime','-29 days')
     `)
    :0;

  const previous30=salesReady
    ?v50cR7Scalar(`
       SELECT COALESCE(SUM(total),0) value
       FROM sales
       WHERE status='PAID'
         AND date(created_at) BETWEEN
             date('now','localtime','-59 days')
             AND
             date('now','localtime','-30 days')
     `)
    :0;

  const activeSalesDays=salesReady
    ?v50cR7Scalar(`
       SELECT
         COUNT(DISTINCT date(created_at)) value
       FROM sales
       WHERE status='PAID'
     `)
    :0;

  const trend7=
    previous7>0
      ?((revenue7-previous7)/previous7)*100
      :null;

  const trend30=
    previous30>0
      ?((revenue30-previous30)/previous30)*100
      :null;

  const avgDaily30=
    revenue30/30;

  // ----------------------------------------------------------
  // CMV
  // ----------------------------------------------------------

  let cmv30=0;

  const qtyColumn=
    v50cR7Has('sale_items','qty')
      ?'qty'
      :(
        v50cR7Has('sale_items','quantity')
          ?'quantity'
          :null
      );

  const cmvReady=
    salesReady &&
    v50cR7Table('sale_items') &&
    v50cR7Has('sale_items','sale_id') &&
    v50cR7Has('sale_items','unit_cost') &&
    !!qtyColumn;

  if(cmvReady){

    cmv30=v50cR7Scalar(`
      SELECT
        COALESCE(
          SUM(
            si.${qtyColumn} *
            si.unit_cost
          ),
          0
        ) value
      FROM sale_items si
      JOIN sales s
        ON s.id=si.sale_id
      WHERE s.status='PAID'
        AND date(s.created_at)>=
            date('now','localtime','-29 days')
    `);
  }

  const cmvRatio=
    revenue30>0
      ?(cmv30/revenue30)*100
      :null;

  // ----------------------------------------------------------
  // DEBT
  // ----------------------------------------------------------

  const debtReady=
    v50cR7Table('financial_debts');

  const openDebt=debtReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(current_balance),0) value
       FROM financial_debts
       WHERE status='OPEN'
     `)
    :0;

  const overdueDebt=debtReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(current_balance),0) value
       FROM financial_debts
       WHERE status='OPEN'
         AND due_date IS NOT NULL
         AND date(due_date)<
             date('now','localtime')
     `)
    :0;

  const debt7=debtReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(current_balance),0) value
       FROM financial_debts
       WHERE status='OPEN'
         AND due_date IS NOT NULL
         AND date(due_date) BETWEEN
             date('now','localtime')
             AND
             date('now','localtime','+7 days')
     `)
    :0;

  const debt15=debtReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(current_balance),0) value
       FROM financial_debts
       WHERE status='OPEN'
         AND due_date IS NOT NULL
         AND date(due_date) BETWEEN
             date('now','localtime')
             AND
             date('now','localtime','+15 days')
     `)
    :0;

  const debt30=debtReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(current_balance),0) value
       FROM financial_debts
       WHERE status='OPEN'
         AND due_date IS NOT NULL
         AND date(due_date) BETWEEN
             date('now','localtime')
             AND
             date('now','localtime','+30 days')
     `)
    :0;

  const debtPayments30=
    v50cR7Table('financial_debt_payments')
      ?v50cR7Scalar(`
         SELECT
           COALESCE(SUM(amount),0) value
         FROM financial_debt_payments
         WHERE date(created_at)>=
               date('now','localtime','-29 days')
       `)
      :0;

  // ----------------------------------------------------------
  // EXPENSES
  // ----------------------------------------------------------

  const expenseReady=
    v50cR7Table('expenses');

  const overdueExpenses=expenseReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(amount),0) value
       FROM expenses
       WHERE COALESCE(paid,0)=0
         AND due_date IS NOT NULL
         AND date(due_date)<
             date('now','localtime')
     `)
    :0;

  function expenseDue(days){

    if(!expenseReady){
      return 0;
    }

    return v50cR7Scalar(`
      SELECT
        COALESCE(SUM(amount),0) value
      FROM expenses
      WHERE COALESCE(paid,0)=0
        AND due_date IS NOT NULL
        AND date(due_date) BETWEEN
            date('now','localtime')
            AND
            date('now','localtime','+${days} days')
    `);
  }

  const expense7=expenseDue(7);
  const expense15=expenseDue(15);
  const expense30=expenseDue(30);

  const recurringCount=
    expenseReady &&
    v50cR7Has('expenses','recurring')
      ?v50cR7Scalar(`
         SELECT COUNT(*) value
         FROM expenses
         WHERE COALESCE(recurring,0)=1
       `)
      :0;

  // ----------------------------------------------------------
  // OBLIGATIONS
  // ----------------------------------------------------------

  const obligationReady=
    v50cR7Table('financial_obligations');

  const openObligations=obligationReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(amount),0) value
       FROM financial_obligations
       WHERE status='OPEN'
     `)
    :0;

  function obligationsDue(days){

    if(!obligationReady){
      return 0;
    }

    return v50cR7Scalar(`
      SELECT
        COALESCE(SUM(amount),0) value
      FROM financial_obligations
      WHERE status='OPEN'
        AND due_date IS NOT NULL
        AND date(due_date) BETWEEN
            date('now','localtime')
            AND
            date('now','localtime','+${days} days')
    `);
  }

  const obligation7=obligationsDue(7);
  const obligation15=obligationsDue(15);
  const obligation30=obligationsDue(30);

  // ----------------------------------------------------------
  // PROCUREMENT
  // expected_at remains operational expectation,
  // not contractual payment due date.
  // ----------------------------------------------------------

  const procurementReady=
    v50cR7Table('purchase_orders');

  const orderedProcurement=procurementReady
    ?v50cR7Scalar(`
       SELECT
         COALESCE(SUM(total),0) value
       FROM purchase_orders
       WHERE status='ORDERED'
     `)
    :0;

  function procurementDue(days){

    if(!procurementReady){
      return 0;
    }

    return v50cR7Scalar(`
      SELECT
        COALESCE(SUM(total),0) value
      FROM purchase_orders
      WHERE status='ORDERED'
        AND expected_at IS NOT NULL
        AND date(expected_at) BETWEEN
            date('now','localtime')
            AND
            date('now','localtime','+${days} days')
    `);
  }

  const procurement7=procurementDue(7);
  const procurement15=procurementDue(15);
  const procurement30=procurementDue(30);

  // ----------------------------------------------------------
  // REGISTERED PRESSURE
  //
  // This is gross source exposure.
  // Sources may overlap.
  // ----------------------------------------------------------

  const overduePressure=
    overdueDebt+
    overdueExpenses;

  const pressure7=
    overduePressure+
    debt7+
    expense7+
    obligation7+
    procurement7;

  const pressure15=
    overduePressure+
    debt15+
    expense15+
    obligation15+
    procurement15;

  const pressure30=
    overduePressure+
    debt30+
    expense30+
    obligation30+
    procurement30;

  const requiredDaily7=
    pressure7/7;

  const requiredDaily15=
    pressure15/15;

  const requiredDaily30=
    pressure30/30;

  // ----------------------------------------------------------
  // DATA QUALITY
  // ----------------------------------------------------------

  let dataQuality='NO_HISTORY';

  if(activeSalesDays>=60){
    dataQuality='STRONGER_HISTORY';
  }
  else if(activeSalesDays>=30){
    dataQuality='MODERATE_HISTORY';
  }
  else if(activeSalesDays>=14){
    dataQuality='LIMITED_HISTORY';
  }
  else if(activeSalesDays>=7){
    dataQuality='VERY_LIMITED_HISTORY';
  }

  // ----------------------------------------------------------
  // RECOMMENDATION ENGINE
  // ----------------------------------------------------------

  const recommendations=[];

  function addRecommendation({
    id,
    priority,
    category,
    title,
    reason,
    evidence=[],
    recommendedAction,
    horizon,
    sourceModules=[],
    authorization=false
  }){

    recommendations.push({
      id,
      priority,
      category,
      title,
      reason,
      evidence,
      recommended_action:
        recommendedAction,
      time_horizon:
        horizon,
      source_modules:
        sourceModules,
      human_authorization_required:
        authorization,
      execution_status:
        authorization
          ?'RECOMMENDATION_ONLY'
          :'MANAGEMENT_GUIDANCE'
    });
  }

  // P0 - OVERDUE
  if(overduePressure>0){

    addRecommendation({
      id:'R7-OVERDUE-PRESSURE',
      priority:'P0',
      category:'FINANCIAL_PRESSURE',
      title:'Revisar compromissos vencidos imediatamente',
      reason:
        'Existem compromissos financeiros registrados com data já vencida.',
      evidence:[
        v50cR7MoneyEvidence(
          'Dívidas vencidas',
          overdueDebt,
          'R3_DEBT_INTELLIGENCE'
        ),
        v50cR7MoneyEvidence(
          'Despesas vencidas',
          overdueExpenses,
          'R4_FINANCIAL_CALENDAR'
        )
      ],
      recommendedAction:
        'Revisar cada obrigação vencida, confirmar se permanece exigível, eliminar duplicidades e definir manualmente a ordem de tratamento.',
      horizon:'IMMEDIATE',
      sourceModules:[
        'R3_DEBT_INTELLIGENCE',
        'R4_FINANCIAL_CALENDAR'
      ],
      authorization:true
    });
  }

  // P0/P1 - 7 DAY PRESSURE
  if(
    pressure7>0 &&
    avgDaily30>0 &&
    requiredDaily7>avgDaily30
  ){

    addRecommendation({
      id:'R7-7D-CASH-PRESSURE',
      priority:'P0',
      category:'CASH_PRESSURE',
      title:'Pressão financeira elevada nos próximos 7 dias',
      reason:
        'A receita diária necessária para a exposição registrada de curto prazo está acima do ritmo médio recente de vendas.',
      evidence:[
        v50cR7MoneyEvidence(
          'Pressão registrada 7 dias',
          pressure7,
          'R4_FINANCIAL_CALENDAR'
        ),
        v50cR7MoneyEvidence(
          'Necessário por dia',
          requiredDaily7,
          'R7_DECISION_ENGINE'
        ),
        v50cR7MoneyEvidence(
          'Média diária 30 dias',
          avgDaily30,
          'R1_FINANCIAL_TRUTH'
        )
      ],
      recommendedAction:
        'Priorizar revisão do calendário financeiro, reduzir saídas adiáveis e definir uma meta operacional diária compatível com os compromissos confirmados.',
      horizon:'7_DAYS',
      sourceModules:[
        'R1_FINANCIAL_TRUTH',
        'R4_FINANCIAL_CALENDAR',
        'R6_FORECAST'
      ],
      authorization:false
    });
  }
  else if(pressure7>0){

    addRecommendation({
      id:'R7-7D-COMMITMENTS',
      priority:'P1',
      category:'FINANCIAL_CALENDAR',
      title:'Acompanhar compromissos dos próximos 7 dias',
      reason:
        'Há exposição financeira registrada para o curto prazo.',
      evidence:[
        v50cR7MoneyEvidence(
          'Pressão registrada 7 dias',
          pressure7,
          'R4_FINANCIAL_CALENDAR'
        ),
        v50cR7MoneyEvidence(
          'Necessário por dia',
          requiredDaily7,
          'R7_DECISION_ENGINE'
        )
      ],
      recommendedAction:
        'Conferir vencimentos, origem de cada compromisso e cobertura operacional antes de autorizar novas saídas relevantes.',
      horizon:'7_DAYS',
      sourceModules:[
        'R4_FINANCIAL_CALENDAR'
      ],
      authorization:false
    });
  }

  // REVENUE DECLINE
  if(
    trend7!==null &&
    trend7<=-15
  ){

    addRecommendation({
      id:'R7-REVENUE-DECLINE',
      priority:'P1',
      category:'REVENUE',
      title:'Investigar queda recente de receita',
      reason:
        'A receita dos últimos 7 dias está materialmente abaixo dos 7 dias anteriores.',
      evidence:[
        v50cR7MoneyEvidence(
          'Receita últimos 7 dias',
          revenue7,
          'R1_FINANCIAL_TRUTH'
        ),
        v50cR7MoneyEvidence(
          'Receita 7 dias anteriores',
          previous7,
          'R1_FINANCIAL_TRUTH'
        ),
        v50cR7PercentEvidence(
          'Variação',
          trend7,
          'R7_DECISION_ENGINE'
        )
      ],
      recommendedAction:
        'Revisar dias e horários de menor movimento, ticket médio, mix de produtos e eventos recentes antes de definir uma ação comercial.',
      horizon:'7_DAYS',
      sourceModules:[
        'R1_FINANCIAL_TRUTH',
        'R6_FORECAST'
      ],
      authorization:false
    });
  }

  // CMV SIGNAL
  if(
    cmvRatio!==null &&
    cmvRatio>=45
  ){

    addRecommendation({
      id:'R7-CMV-PRESSURE',
      priority:
        cmvRatio>=60
          ?'P1'
          :'P2',
      category:'MARGIN',
      title:'Revisar pressão de CMV',
      reason:
        'O custo histórico dos itens vendidos representa parcela relevante da receita registrada.',
      evidence:[
        v50cR7MoneyEvidence(
          'CMV 30 dias',
          cmv30,
          'R5_CASH_FLOW_DRE'
        ),
        v50cR7PercentEvidence(
          'CMV sobre receita',
          cmvRatio,
          'R5_CASH_FLOW_DRE'
        )
      ],
      recommendedAction:
        'Revisar custos cadastrados, perdas, porcionamento e margem dos itens com maior impacto antes de alterar preços.',
      horizon:'15_DAYS',
      sourceModules:[
        'R5_CASH_FLOW_DRE'
      ],
      authorization:false
    });
  }

  // DEBT
  if(openDebt>0){

    const debtRevenueRatio=
      revenue30>0
        ?(openDebt/revenue30)*100
        :null;

    addRecommendation({
      id:'R7-DEBT-REDUCTION',
      priority:
        overdueDebt>0
          ?'P0'
          :'P1',
      category:'DEBT',
      title:'Executar plano de redução de dívida',
      reason:
        'Há saldo de dívida em aberto registrado no sistema.',
      evidence:[
        v50cR7MoneyEvidence(
          'Dívida total em aberto',
          openDebt,
          'R3_DEBT_INTELLIGENCE'
        ),
        v50cR7MoneyEvidence(
          'Pagamentos registrados em 30 dias',
          debtPayments30,
          'R3_DEBT_INTELLIGENCE'
        ),
        v50cR7PercentEvidence(
          'Dívida / receita 30 dias',
          debtRevenueRatio,
          'R7_DECISION_ENGINE'
        )
      ],
      recommendedAction:
        'Usar a estratégia de quitação para revisar prioridades, vencimentos e capacidade operacional antes de efetuar qualquer pagamento.',
      horizon:'30_DAYS',
      sourceModules:[
        'R3_DEBT_INTELLIGENCE',
        'R6_FORECAST'
      ],
      authorization:true
    });
  }

  // RECURRING EXPENSES
  if(recurringCount>0){

    addRecommendation({
      id:'R7-RECURRING-REVIEW',
      priority:'P2',
      category:'EXPENSES',
      title:'Revisar despesas recorrentes cadastradas',
      reason:
        'O sistema identificou despesas marcadas como recorrentes.',
      evidence:[
        {
          label:'Registros recorrentes',
          value:recurringCount,
          unit:'COUNT',
          source:'R4_FINANCIAL_CALENDAR'
        }
      ],
      recommendedAction:
        'Confirmar necessidade, valor, periodicidade e data de cada compromisso recorrente. O NEXUS não cria automaticamente ocorrências futuras.',
      horizon:'30_DAYS',
      sourceModules:[
        'R4_FINANCIAL_CALENDAR'
      ],
      authorization:false
    });
  }

  // PROCUREMENT
  if(orderedProcurement>0){

    addRecommendation({
      id:'R7-PROCUREMENT-REVIEW',
      priority:
        procurement7>0
          ?'P1'
          :'P2',
      category:'PROCUREMENT',
      title:'Revisar compras já ordenadas',
      reason:
        'Existem pedidos de compra ORDERED que representam compromissos operacionais.',
      evidence:[
        v50cR7MoneyEvidence(
          'Procurement ORDERED',
          orderedProcurement,
          'PROCUREMENT'
        ),
        v50cR7MoneyEvidence(
          'Expected within 7 days',
          procurement7,
          'PROCUREMENT'
        )
      ],
      recommendedAction:
        'Conferir necessidade, entrega e condição financeira antes de novas aprovações. expected_at não é tratado como vencimento contratual.',
      horizon:
        procurement7>0
          ?'7_DAYS'
          :'30_DAYS',
      sourceModules:[
        'PROCUREMENT',
        'R4_FINANCIAL_CALENDAR'
      ],
      authorization:true
    });
  }

  // DATA QUALITY
  if(activeSalesDays<14){

    addRecommendation({
      id:'R7-DATA-DEPTH',
      priority:'P2',
      category:'DATA_QUALITY',
      title:'Aumentar profundidade do histórico operacional',
      reason:
        'A base de dias com vendas ainda é limitada para decisões de horizonte mais longo.',
      evidence:[
        {
          label:'Dias com vendas',
          value:activeSalesDays,
          unit:'DAYS',
          source:'R6_FORECAST'
        }
      ],
      recommendedAction:
        'Continuar registrando vendas, custos e compromissos de forma consistente e interpretar projeções longas como cenários de sensibilidade.',
      horizon:'30_DAYS',
      sourceModules:[
        'R6_FORECAST'
      ],
      authorization:false
    });
  }

  // POSITIVE SIGNAL
  if(
    trend7!==null &&
    trend7>=15 &&
    pressure30<=revenue30 &&
    revenue30>0
  ){

    addRecommendation({
      id:'R7-POSITIVE-MOMENTUM',
      priority:'P3',
      category:'OPPORTUNITY',
      title:'Momento operacional merece acompanhamento',
      reason:
        'A receita recente apresenta melhora e a exposição registrada de 30 dias não supera a receita histórica de 30 dias.',
      evidence:[
        v50cR7PercentEvidence(
          'Tendência 7 dias',
          trend7,
          'R7_DECISION_ENGINE'
        ),
        v50cR7MoneyEvidence(
          'Receita 30 dias',
          revenue30,
          'R1_FINANCIAL_TRUTH'
        ),
        v50cR7MoneyEvidence(
          'Pressão registrada 30 dias',
          pressure30,
          'R4_FINANCIAL_CALENDAR'
        )
      ],
      recommendedAction:
        'Preservar margem, acompanhar caixa e validar a continuidade da tendência antes de considerar expansão ou investimento.',
      horizon:'30_DAYS',
      sourceModules:[
        'R1_FINANCIAL_TRUTH',
        'R4_FINANCIAL_CALENDAR',
        'R6_FORECAST'
      ],
      authorization:false
    });
  }

  // ----------------------------------------------------------
  // SORT PRIORITIES
  // ----------------------------------------------------------

  const priorityWeight={
    P0:0,
    P1:1,
    P2:2,
    P3:3
  };

  recommendations.sort(
    (a,b)=>
      (
        priorityWeight[a.priority]??9
      )-
      (
        priorityWeight[b.priority]??9
      )
  );

  // ----------------------------------------------------------
  // ACTION PLAN
  // ----------------------------------------------------------

  function actionsFor(horizon){

    const order={
      IMMEDIATE:0,
      '7_DAYS':7,
      '15_DAYS':15,
      '30_DAYS':30
    };

    const max=
      order[horizon];

    return recommendations
      .filter(item=>{

        const itemDays=
          order[
            item.time_horizon
          ];

        return (
          itemDays!==undefined &&
          itemDays<=max
        );
      })
      .slice(0,8)
      .map(item=>({
        recommendation_id:item.id,
        priority:item.priority,
        title:item.title,
        action:item.recommended_action,
        authorization_required:
          item.human_authorization_required
      }));
  }

  const plans={
    days_7:{
      horizon:7,
      registered_pressure:
        v50cR7Round(pressure7),
      required_daily_revenue:
        v50cR7Round(requiredDaily7),
      actions:
        actionsFor('7_DAYS')
    },

    days_15:{
      horizon:15,
      registered_pressure:
        v50cR7Round(pressure15),
      required_daily_revenue:
        v50cR7Round(requiredDaily15),
      actions:
        actionsFor('15_DAYS')
    },

    days_30:{
      horizon:30,
      registered_pressure:
        v50cR7Round(pressure30),
      required_daily_revenue:
        v50cR7Round(requiredDaily30),
      actions:
        actionsFor('30_DAYS')
    }
  };

  // ----------------------------------------------------------
  // EXECUTIVE PRIORITY
  // ----------------------------------------------------------

  const top=
    recommendations[0] || null;

  let managementState='MONITOR';

  if(top?.priority==='P0'){
    managementState='ACT_NOW';
  }
  else if(top?.priority==='P1'){
    managementState='PRIORITIZE';
  }
  else if(top?.priority==='P2'){
    managementState='OPTIMIZE';
  }
  else if(top?.priority==='P3'){
    managementState='OPPORTUNITY';
  }

  // ----------------------------------------------------------
  // FINAL
  // ----------------------------------------------------------

  return {

    version:'V5.0C-R7',

    generated_at:
      new Date().toISOString(),

    engine:{
      type:
        'DETERMINISTIC_FINANCIAL_MENTOR',
      ai_required:false,
      automatic_high_impact_execution:false,
      human_authorization_required:true
    },

    executive:{
      management_state:
        managementState,

      top_priority:
        top
          ?{
             id:top.id,
             priority:top.priority,
             title:top.title
           }
          :null,

      recommendation_count:
        recommendations.length,

      data_quality:
        dataQuality
    },

    snapshot:{
      revenue_7_days:
        v50cR7Round(revenue7),

      revenue_30_days:
        v50cR7Round(revenue30),

      average_daily_revenue_30_days:
        v50cR7Round(avgDaily30),

      trend_7_days_percent:
        trend7===null
          ?null
          :v50cR7Round(trend7),

      trend_30_days_percent:
        trend30===null
          ?null
          :v50cR7Round(trend30),

      cmv_30_days:
        v50cR7Round(cmv30),

      cmv_ratio_percent:
        cmvRatio===null
          ?null
          :v50cR7Round(cmvRatio),

      open_debt:
        v50cR7Round(openDebt),

      overdue_debt:
        v50cR7Round(overdueDebt),

      debt_payments_30_days:
        v50cR7Round(debtPayments30),

      overdue_expenses:
        v50cR7Round(overdueExpenses),

      open_obligations:
        v50cR7Round(openObligations),

      ordered_procurement:
        v50cR7Round(orderedProcurement),

      pressure_7_days:
        v50cR7Round(pressure7),

      pressure_15_days:
        v50cR7Round(pressure15),

      pressure_30_days:
        v50cR7Round(pressure30),

      required_daily_revenue_7_days:
        v50cR7Round(requiredDaily7),

      required_daily_revenue_15_days:
        v50cR7Round(requiredDaily15),

      required_daily_revenue_30_days:
        v50cR7Round(requiredDaily30)
    },

    recommendations,

    plans,

    cycle:{
      model:
        'ACTION -> RESULT -> LEARN -> RECALCULATE -> NEW ACTION',

      persistence:
        false,

      learning_definition:
        'Recalculation from updated operational and financial data; no autonomous model training.'
    },

    safety:{
      source_overlap_possible:true,
      consolidated_unique_liability:false,
      bank_balance_fabricated:false,
      guaranteed_revenue:false,
      guaranteed_profit:false,
      guaranteed_liquidity:false,
      automatic_investment_capacity:false,
      automatic_borrowing_capacity:false,

      high_impact_actions:[
        'PAY_DEBT',
        'TRANSFER_MONEY',
        'CREATE_LOAN',
        'TAKE_CREDIT',
        'APPROVE_PURCHASE',
        'MAKE_INVESTMENT',
        'OPEN_NEW_UNIT',
        'HIRE_EMPLOYEE',
        'DISMISS_EMPLOYEE'
      ],

      high_impact_execution:
        'HUMAN_AUTHORIZATION_REQUIRED'
    },

    disclaimer:
      'Orientação gerencial baseada nos dados registrados no NEXUS. Não representa saldo bancário, garantia de resultado, certificação contábil ou autorização automática para movimentação financeira.'
  };
}

app.get(
  '/api/v50c/financial-mentor',
  auth,
  minRole(55),
  (req,res)=>{

    try{

      res.json(
        v50cR7FinancialMentor()
      );

    }catch(error){

      console.error(
        'V5.0C-R7 FINANCIAL MENTOR ERROR',
        error
      );

      res.status(500).json({
        error:
          'R7_FINANCIAL_MENTOR_FAILED'
      });
    }
  }
);

/* END NEXUS V5.0C-R7 FINANCIAL MENTOR */

app.get('/api/expenses',(_req,res)=>res.json(db.prepare('SELECT * FROM expenses ORDER BY paid ASC,COALESCE(due_date,created_at) ASC').all()));
/* NEXUS V5.0B FINANCIAL ENTRY */
app.post('/api/expenses',minRole(70),(req,res)=>{
 const b=req.body||{};

 const description=
  String(b.description||'').trim();

 const amount=
  Number(b.amount||0);

 const allowedTypes=[
  'EXPENSE',
  'INVESTMENT',
  'RENOVATION',
  'PURCHASE'
 ];

 const entryType=
  allowedTypes.includes(
   String(b.entry_type||'EXPENSE').toUpperCase()
  )
   ?String(b.entry_type||'EXPENSE').toUpperCase()
   :'EXPENSE';

 if(!description){
  return res.status(400).json({
   error:'DESCRIPTION_REQUIRED'
  });
 }

 if(
  !Number.isFinite(amount) ||
  amount<=0
 ){
  return res.status(400).json({
   error:'AMOUNT_INVALID'
  });
 }

 const paid=b.paid?1:0;
 const recurring=b.recurring?1:0;

 const info=db.prepare(`
  INSERT INTO expenses(
   description,
   category,
   amount,
   due_date,
   paid,
   paid_at,
   recurring,
   entry_type,
   payment_method,
   supplier_name,
   document_number,
   notes,
   investment_area,
   updated_at
  )
  VALUES(
   ?,?,?,?,?,
   CASE
    WHEN ?=1 THEN CURRENT_TIMESTAMP
    ELSE NULL
   END,
   ?,?,?,?,?,?,?,CURRENT_TIMESTAMP
  )
 `).run(
  description,
  String(b.category||'Geral').trim()||'Geral',
  amount,
  b.due_date||null,
  paid,
  paid,
  recurring,
  entryType,
  String(b.payment_method||'').trim()||null,
  String(b.supplier_name||'').trim()||null,
  String(b.document_number||'').trim()||null,
  String(b.notes||'').trim()||null,
  String(b.investment_area||'').trim()||null
 );

 audit(
  req.user.id,
  'CREATE',
  'FINANCIAL_ENTRY',
  info.lastInsertRowid,
  {
   description,
   amount,
   entry_type:entryType,
   category:b.category||'Geral',
   paid:Boolean(paid)
  }
 );

 res.status(201).json(
  db.prepare(
   'SELECT * FROM expenses WHERE id=?'
  ).get(info.lastInsertRowid)
 );
});
app.get('/api/goals',(_req,res)=>res.json(db.prepare('SELECT * FROM goals WHERE active=1 ORDER BY created_at DESC').all()));
app.post('/api/goals',(req,res)=>{const {title,type='BUSINESS',target_value=0,current_value=0,deadline=null,employee_id=null}=req.body||{};if(!String(title||'').trim())return res.status(400).json({error:'TITLE_REQUIRED'});const info=db.prepare('INSERT INTO goals(title,type,target_value,current_value,deadline,employee_id) VALUES(?,?,?,?,?,?)').run(title,type,Number(target_value),Number(current_value),deadline,employee_id?Number(employee_id):null);audit(req.user.id,'CREATE','GOAL',info.lastInsertRowid,{title});res.status(201).json(db.prepare('SELECT * FROM goals WHERE id=?').get(info.lastInsertRowid))});
app.get('/api/closing-plan',(req,res)=>res.json(closingPlan(Number(req.query.revenue||dashboardSnapshot().todayRevenue||0))));
app.get('/api/settings',(_req,res)=>{const rows=db.prepare('SELECT key,value FROM settings ORDER BY key').all();res.json(Object.fromEntries(rows.map(r=>[r.key,r.value]))) });
app.put('/api/settings',minRole(80),(req,res)=>{const allowed=new Set(['business_name','reserve_percent','tax_percent','salary_percent','owner_percent','reinvest_percent','daily_goal']);const upsert=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');db.transaction(()=>{for(const [k,v] of Object.entries(req.body||{}))if(allowed.has(k))upsert.run(k,String(v))})();audit(req.user.id,'UPDATE','SETTINGS');res.json({ok:true})});

registerOperations(app,{minRole,audit});registerRecipeEngine(app,minRole,audit);registerPremiumV05(app,minRole,audit);registerSuiteV06(app,minRole,audit);registerOperationalV1(app,{minRole,audit});registerOperationsV11(app,{minRole,audit});
registerTicketsV25(app,{minRole,audit});
registerInventoryV49A(app,{minRole,audit});
registerEventIntelligenceV37(app,{minRole});

app.use('/api',(req,res)=>res.status(404).json({error:'API_ROUTE_NOT_FOUND',message:`Rota API não encontrada: ${req.method} ${req.originalUrl}`,version:'1.5.0'}));

const dist=path.resolve(process.cwd(),'dist');if(fs.existsSync(dist)){app.use(express.static(dist));app.get(/.*/,(_req,res)=>res.sendFile(path.join(dist,'index.html')))}


app.listen(PORT,'0.0.0.0',()=>console.log(`NEXUS HOSPITALITY ONE | API em 0.0.0.0:${PORT}`));

















/* NEXUS V5.0C MASTER FINAL R8-R18 ROUTE */
app.get(
  "/api/v50c/final-intelligence",
  auth,
  minRole(55),
  (req,res)=>{
    try{

      const engine=
        createHospitalityFinalIntelligence({db});

      return res.json(
        engine.ownerCockpit()
      );

    }catch(error){

      console.error(
        "V5.0C FINAL INTELLIGENCE ERROR",
        error
      );

      return res.status(500).json({
        ok:false,
        error:"FINAL_INTELLIGENCE_FAILED"
      });
    }
  }
);

