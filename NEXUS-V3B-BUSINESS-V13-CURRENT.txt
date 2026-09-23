import crypto from 'node:crypto';
import {db} from './db.js';
const n=v=>Number(v||0), txt=v=>String(v||'').trim(), round=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
const token=(p='NX')=>`${p}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
const add=(t,c,d)=>{const cols=db.prepare(`PRAGMA table_info(${t})`).all().map(x=>x.name);if(!cols.includes(c))db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`)};
export function initBusinessV13(){db.exec(`
CREATE TABLE IF NOT EXISTS sale_inventory_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,product_id INTEGER NOT NULL,stock_delta REAL NOT NULL DEFAULT 0,closed_delta REAL NOT NULL DEFAULT 0,open_delta REAL NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sale_cancellations(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL UNIQUE,reason TEXT NOT NULL,user_id INTEGER NOT NULL,cancel_type TEXT NOT NULL DEFAULT 'TOTAL',refund_total REAL NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sale_participants(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,participant_no INTEGER NOT NULL,label TEXT,payment_total REAL NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sale_participant_payments(id INTEGER PRIMARY KEY AUTOINCREMENT,participant_id INTEGER NOT NULL,method TEXT NOT NULL,amount REAL NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS supplier_portal_users(id INTEGER PRIMARY KEY AUTOINCREMENT,supplier_id INTEGER NOT NULL UNIQUE,access_token TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,last_access_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS quote_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,public_code TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'OPEN',deadline_at TEXT,notes TEXT,created_by INTEGER,selected_supplier_id INTEGER,selected_total REAL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,finalized_at TEXT);
CREATE TABLE IF NOT EXISTS quote_request_items(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER NOT NULL,product_id INTEGER NOT NULL,qty REAL NOT NULL DEFAULT 1,unit TEXT DEFAULT 'UN',target_price REAL,FOREIGN KEY(request_id) REFERENCES quote_requests(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS quote_invitations(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER NOT NULL,supplier_id INTEGER NOT NULL,invite_token TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'INVITED',submitted_at TEXT,freight REAL NOT NULL DEFAULT 0,delivery_days INTEGER,validity_days INTEGER,notes TEXT,UNIQUE(request_id,supplier_id));
CREATE TABLE IF NOT EXISTS quote_supplier_prices(id INTEGER PRIMARY KEY AUTOINCREMENT,invitation_id INTEGER NOT NULL,item_id INTEGER NOT NULL,unit_price REAL NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 1,brand TEXT,notes TEXT,UNIQUE(invitation_id,item_id));
CREATE TABLE IF NOT EXISTS supplier_dispatches(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id INTEGER,supplier_id INTEGER,purchase_order_id INTEGER,status TEXT NOT NULL DEFAULT 'READY',payload TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,sent_at TEXT);
CREATE TABLE IF NOT EXISTS financial_obligations(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'OUTROS',amount REAL NOT NULL,due_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',essential INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pricing_policies(id INTEGER PRIMARY KEY CHECK(id=1),default_margin REAL NOT NULL DEFAULT 55,min_margin REAL NOT NULL DEFAULT 35,rounding REAL NOT NULL DEFAULT 0.5,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO pricing_policies(id,default_margin,min_margin,rounding) VALUES(1,55,35,0.5);
`);add('products','target_margin','REAL');add('products','suggested_price','REAL');add('sales','cancelled_at','TEXT');add('sales','cancel_reason','TEXT');}
function fractionCost(p){
 const packageMl=n(p.package_ml);
 const doseMl=n(p.dose_ml);
 const factor=n(p.stock_factor)||1;
 const rawCost=n(p.cost);

 const fractionConfigured=
   packageMl>0 &&
   doseMl>0 &&
   packageMl>=doseMl;

 if(fractionConfigured){
   const dosesPerPackage=packageMl/doseMl;
   const effectiveDoses=dosesPerPackage*factor;

   return{
     mode:'FRACTION',
     configured:true,
     package_cost:rawCost,
     package_ml:packageMl,
     dose_ml:doseMl,
     doses_per_package:round(effectiveDoses),
     unit_cost:effectiveDoses>0?round(rawCost/effectiveDoses):rawCost
   };
 }

 return{
   mode:'UNIT',
   configured:false,
   package_cost:rawCost,
   package_ml:packageMl||null,
   dose_ml:doseMl||null,
   doses_per_package:1,
   unit_cost:rawCost
 };
}

function priceSuggestion(cost,margin,rounding=.5){
 cost=n(cost);
 margin=Math.min(95,Math.max(1,n(margin)));
 if(cost<=0)return 0;
 let p=cost/(1-margin/100);
 rounding=Math.max(.01,n(rounding));
 return round(Math.ceil(p/rounding)*rounding)
}
export function registerBusinessV13(app,{auth,minRole,audit}){
 app.get('/api/public/supplier-quote/:token',(req,res)=>{const inv=db.prepare(`SELECT qi.*,qr.title,qr.deadline_at,qr.notes request_notes,s.name supplier_name FROM quote_invitations qi JOIN quote_requests qr ON qr.id=qi.request_id JOIN suppliers s ON s.id=qi.supplier_id WHERE qi.invite_token=? AND qr.status='OPEN'`).get(txt(req.params.token));if(!inv)return res.status(404).json({error:'COTACAO_INDISPONIVEL'});db.prepare('UPDATE supplier_portal_users SET last_access_at=CURRENT_TIMESTAMP WHERE supplier_id=?').run(inv.supplier_id);const items=db.prepare(`SELECT qri.id item_id,qri.qty,qri.unit,p.name,p.category,qsp.unit_price,qsp.available,qsp.brand,qsp.notes FROM quote_request_items qri JOIN products p ON p.id=qri.product_id LEFT JOIN quote_supplier_prices qsp ON qsp.item_id=qri.id AND qsp.invitation_id=? WHERE qri.request_id=?`).all(inv.id,inv.request_id);res.json({...inv,items})});
 app.post('/api/public/supplier-quote/:token',(req,res)=>{try{const inv=db.prepare(`SELECT qi.*,qr.status request_status,qr.deadline_at FROM quote_invitations qi JOIN quote_requests qr ON qr.id=qi.request_id WHERE qi.invite_token=?`).get(txt(req.params.token));if(!inv||inv.request_status!=='OPEN')return res.status(404).json({error:'COTACAO_INDISPONIVEL'});if(inv.deadline_at&&Date.now()>new Date(inv.deadline_at).getTime())return res.status(409).json({error:'PRAZO_ENCERRADO'});const b=req.body||{},items=Array.isArray(b.items)?b.items:[];db.transaction(()=>{for(const x of items)db.prepare(`INSERT INTO quote_supplier_prices(invitation_id,item_id,unit_price,available,brand,notes) VALUES(?,?,?,?,?,?) ON CONFLICT(invitation_id,item_id) DO UPDATE SET unit_price=excluded.unit_price,available=excluded.available,brand=excluded.brand,notes=excluded.notes`).run(inv.id,n(x.item_id),n(x.unit_price),x.available===false?0:1,txt(x.brand)||null,txt(x.notes)||null);db.prepare("UPDATE quote_invitations SET status='SUBMITTED',submitted_at=CURRENT_TIMESTAMP,freight=?,delivery_days=?,validity_days=?,notes=? WHERE id=?").run(n(b.freight),n(b.delivery_days),n(b.validity_days),txt(b.notes)||null,inv.id)})();res.json({ok:true,message:'Cotação enviada com sucesso.'})}catch(e){res.status(400).json({error:e.message})}});
 app.get('/api/v13/pricing',auth,minRole(55),(_req,res)=>{const policy=db.prepare('SELECT * FROM pricing_policies WHERE id=1').get();const products=db.prepare('SELECT id,name,category,cost,price,target_margin,suggested_price,unit_type,package_ml,dose_ml,stock_factor,stock_unit FROM products WHERE active=1 ORDER BY category,name').all().map(p=>{
 const margin=n(p.target_margin)||n(policy.default_margin);
 const fraction=fractionCost(p);
 const effectiveCost=fraction.unit_cost;
 const suggested=priceSuggestion(effectiveCost,margin,policy.rounding);
 const currentMargin=n(p.price)>0
   ?round((n(p.price)-effectiveCost)/n(p.price)*100)
   :0;

 return{
   ...p,
   target_margin:margin,
   effective_cost:effectiveCost,
   pricing_mode:fraction.mode,
   fraction_configured:fraction.configured,
   doses_per_package:fraction.doses_per_package,
   package_cost:fraction.package_cost,
   suggested_price:suggested,
   current_margin:currentMargin
 };
});res.json({policy,products})});
 app.put('/api/v13/pricing/policy',auth,minRole(80),(req,res)=>{const b=req.body||{};db.prepare('UPDATE pricing_policies SET default_margin=?,min_margin=?,rounding=?,updated_at=CURRENT_TIMESTAMP WHERE id=1').run(n(b.default_margin),n(b.min_margin),n(b.rounding)||.5);audit(req.user.id,'UPDATE','PRICING_POLICY',1,b);res.json({ok:true})});
 app.patch('/api/v13/pricing/product/:id',auth,minRole(55),(req,res)=>{const b=req.body||{},p=db.prepare('SELECT * FROM products WHERE id=?').get(n(req.params.id)),policy=db.prepare('SELECT * FROM pricing_policies WHERE id=1').get();if(!p)return res.status(404).json({error:'PRODUCT_NOT_FOUND'});const margin=n(b.target_margin)||n(policy.default_margin),suggested=priceSuggestion(p.cost,margin,policy.rounding);db.prepare('UPDATE products SET target_margin=?,suggested_price=?,price=CASE WHEN ?=1 THEN ? ELSE price END WHERE id=?').run(margin,suggested,b.apply?1:0,suggested,p.id);audit(req.user.id,'PRICE_SUGGESTION','PRODUCT',p.id,{margin,suggested,apply:!!b.apply});res.json({ok:true,suggested_price:suggested})});
 app.get('/api/v13/sales/recent',auth,minRole(50),(_req,res)=>res.json(db.prepare(`SELECT s.*,u.name user_name,(SELECT group_concat(method||': '||printf('%.2f',amount),' | ') FROM payment_splits WHERE sale_id=s.id) payments FROM sales s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 100`).all()));
 app.post('/api/v13/sales/:id/cancel',auth,minRole(80),(req,res)=>{try{const id=n(req.params.id),reason=txt(req.body?.reason);if(reason.length<4)return res.status(400).json({error:'MOTIVO_OBRIGATORIO'});const out=db.transaction(()=>{const s=db.prepare('SELECT * FROM sales WHERE id=?').get(id);if(!s)throw new Error('VENDA_NAO_ENCONTRADA');if(s.status==='CANCELLED')throw new Error('VENDA_JA_CANCELADA');const led=db.prepare('SELECT * FROM sale_inventory_ledger WHERE sale_id=?').all(id);for(const l of led){db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(n(l.stock_delta),l.product_id);const ip=db.prepare('SELECT product_id FROM inventory_profiles WHERE product_id=?').get(l.product_id);if(ip)db.prepare('UPDATE inventory_profiles SET closed_units=closed_units-?,open_base=open_base-?,updated_at=CURRENT_TIMESTAMP WHERE product_id=?').run(n(l.closed_delta),n(l.open_delta),l.product_id);db.prepare("INSERT INTO stock_movements(product_id,type,qty,reference_type,reference_id,user_id,notes) VALUES(?,'SALE_CANCEL',?,'SALE_CANCEL',?,?,?)").run(l.product_id,-n(l.stock_delta),String(id),req.user.id,reason)}db.prepare("UPDATE sales SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,cancel_reason=? WHERE id=?").run(reason,id);db.prepare('INSERT INTO sale_cancellations(sale_id,reason,user_id,refund_total) VALUES(?,?,?,?)').run(id,reason,req.user.id,n(s.total)+n(s.tip_amount));if(s.customer_name){/* histórico preservado */}return{sale_id:id,refund_total:round(n(s.total)+n(s.tip_amount)),payments:db.prepare('SELECT method,amount FROM payment_splits WHERE sale_id=?').all(id)}})();audit(req.user.id,'CANCEL','SALE',id,{reason,...out});res.json({ok:true,...out})}catch(e){res.status(409).json({error:e.message})}});
 app.post('/api/v13/sales/split-payment',auth,minRole(50),(req,res)=>{try{const b=req.body||{},parts=Array.isArray(b.participants)?b.participants:[],items=Array.isArray(b.items)?b.items:[];if(parts.length<2||parts.length>6)return res.status(400).json({error:'DIVISAO_DEVE_TER_2_A_6_PESSOAS'});const payments=parts.flatMap((p,i)=>(p.payments||[]).map(x=>({...x,participant_no:i+1})));const totalPay=round(payments.reduce((s,x)=>s+n(x.amount),0));const tip=n(b.tip_amount);const resolvedTotal=round(items.reduce((s,x)=>{const p=db.prepare('SELECT price FROM products WHERE id=?').get(n(x.product_id));return s+n(p?.price)*n(x.qty||1)},0)+tip);if(Math.abs(totalPay-resolvedTotal)>.01)return res.status(400).json({error:'VALORES_NAO_FECHAM',expected:resolvedTotal,received:totalPay});const {createUnifiedSale}=globalThis.__NEXUS_TX__||{};if(!createUnifiedSale)throw new Error('TRANSACTION_ENGINE_UNAVAILABLE');const sale=createUnifiedSale({items,payments:payments.map(({method,amount})=>({method,amount})),customer_name:b.customer_name||null,tip_amount:tip,user_id:req.user.id,source:'POS_SPLIT'});db.transaction(()=>{for(let i=0;i<parts.length;i++){const p=parts[i],pt=(p.payments||[]).reduce((s,x)=>s+n(x.amount),0),pi=db.prepare('INSERT INTO sale_participants(sale_id,participant_no,label,payment_total) VALUES(?,?,?,?)').run(sale.id,i+1,txt(p.label)||`Pessoa ${i+1}`,pt);for(const x of p.payments||[])db.prepare('INSERT INTO sale_participant_payments(participant_id,method,amount) VALUES(?,?,?)').run(pi.lastInsertRowid,txt(x.method).toUpperCase(),n(x.amount))}})();res.status(201).json({sale,participants:parts.length})}catch(e){res.status(400).json({error:e.message})}});
 app.get('/api/v13/cash/withdrawal-advice',auth,minRole(70),(_req,res)=>{const cash=db.prepare("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get();if(!cash)return res.status(409).json({error:'CAIXA_FECHADO'});const cashSales=n(db.prepare(`SELECT COALESCE(SUM(ps.amount),0) v FROM payment_splits ps JOIN sales s ON s.id=ps.sale_id WHERE s.cash_session_id=? AND s.status='PAID' AND ps.method='DINHEIRO'`).get(cash.id)?.v);const mov=db.prepare(`SELECT COALESCE(SUM(CASE WHEN type='SUPRIMENTO' THEN amount ELSE 0 END),0) sup,COALESCE(SUM(CASE WHEN type='SANGRIA' THEN amount ELSE 0 END),0) sang FROM cash_movements WHERE cash_session_id=?`).get(cash.id);const physical=round(n(cash.opening_amount)+cashSales+n(mov.sup)-n(mov.sang));const obligations=n(db.prepare("SELECT COALESCE(SUM(amount),0) v FROM financial_obligations WHERE status='OPEN' AND date(due_date)<=date('now','+14 days')").get()?.v);const exp=n(db.prepare("SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE date(due_date)>=date('now') AND date(due_date)<=date('now','+14 days')").get()?.v);const avg=n(db.prepare("SELECT COALESCE(AVG(day_total),0) v FROM (SELECT date(created_at) d,SUM(total) day_total FROM sales WHERE status='PAID' AND date(created_at)>=date('now','-30 days') GROUP BY date(created_at))").get()?.v);const reserve=round(Math.max(avg*3,(obligations+exp)*.2));const safe=round(Math.max(0,physical-obligations-exp-reserve));res.json({question:'Posso tirar dinheiro do caixa hoje?',recommendation:safe>0?'SIM_COM_LIMITE':'NAO_RECOMENDADO',safe_withdrawal:safe,physical_cash:physical,obligations_14d:round(obligations),planned_expenses_14d:round(exp),safety_reserve:reserve,rationale:safe>0?`Retirada máxima sugerida de R$ ${safe.toFixed(2)}, preservando compromissos e reserva operacional.`:'O caixa disponível deve ser preservado para compromissos e capital de giro.'})});
 app.get('/api/v13/obligations',auth,minRole(70),(_req,res)=>res.json(db.prepare("SELECT * FROM financial_obligations WHERE status='OPEN' ORDER BY due_date").all()));
 app.post('/api/v13/obligations',auth,minRole(70),(req,res)=>{const b=req.body||{};if(!txt(b.title)||n(b.amount)<=0||!b.due_date)return res.status(400).json({error:'DADOS_OBRIGATORIOS'});const i=db.prepare('INSERT INTO financial_obligations(title,category,amount,due_date,essential) VALUES(?,?,?,?,?)').run(txt(b.title),txt(b.category)||'OUTROS',n(b.amount),b.due_date,b.essential===false?0:1);res.status(201).json({id:i.lastInsertRowid})});
 
  // ==========================================================
  // NEXUS V4.9B - SMART PROCUREMENT
  // ==========================================================

  app.get('/api/v49b/procurement/need',auth,minRole(55),(req,res)=>{
    try{
      const rows=db.prepare(`
        SELECT
          p.id product_id,
          p.name,
          p.category,
          p.stock,
          p.minimum_stock,
          p.stock_unit,
          p.cost,
          CASE
            WHEN p.minimum_stock > p.stock
            THEN p.minimum_stock-p.stock
            ELSE 0
          END suggested_qty
        FROM products p
        WHERE p.active=1
        ORDER BY
          CASE WHEN p.stock<=p.minimum_stock THEN 0 ELSE 1 END,
          p.category,
          p.name
      `).all();

      const low=rows.filter(x=>n(x.suggested_qty)>0);

      res.json({
        generated_at:new Date().toISOString(),
        low_stock_count:low.length,
        items:rows
      });
    }catch(e){
      res.status(400).json({error:e.message});
    }
  });

  app.get('/api/v49b/quotes/:id/smart-analysis',auth,minRole(55),(req,res)=>{
    try{
      const id=n(req.params.id);

      const request=db.prepare(
        'SELECT * FROM quote_requests WHERE id=?'
      ).get(id);

      if(!request)
        return res.status(404).json({error:'COTACAO_NAO_ENCONTRADA'});

      const items=db.prepare(`
        SELECT
          qri.id item_id,
          qri.product_id,
          qri.qty,
          qri.unit,
          qri.target_price,
          p.name product_name,
          p.category
        FROM quote_request_items qri
        JOIN products p ON p.id=qri.product_id
        WHERE qri.request_id=?
        ORDER BY qri.id
      `).all(id);

      const proposals=db.prepare(`
        SELECT
          qri.id item_id,
          qri.product_id,
          qri.qty,
          qri.unit,
          p.name product_name,
          qi.id invitation_id,
          qi.supplier_id,
          s.name supplier_name,
          qi.status invitation_status,
          qi.freight,
          qi.delivery_days,
          qi.validity_days,
          qsp.unit_price,
          qsp.available,
          qsp.brand,
          qsp.notes
        FROM quote_request_items qri
        JOIN products p
          ON p.id=qri.product_id
        JOIN quote_invitations qi
          ON qi.request_id=qri.request_id
        JOIN suppliers s
          ON s.id=qi.supplier_id
        LEFT JOIN quote_supplier_prices qsp
          ON qsp.item_id=qri.id
         AND qsp.invitation_id=qi.id
        WHERE qri.request_id=?
        ORDER BY qri.id,s.name
      `).all(id);

      const comparison=items.map(item=>{
        const offers=proposals
          .filter(x=>
            n(x.item_id)===n(item.item_id) &&
            x.invitation_status==='SUBMITTED' &&
            n(x.available)===1 &&
            n(x.unit_price)>0
          )
          .map(x=>({
            supplier_id:n(x.supplier_id),
            supplier_name:x.supplier_name,
            invitation_id:n(x.invitation_id),
            unit_price:round(n(x.unit_price)),
            qty:n(item.qty),
            subtotal:round(n(x.unit_price)*n(item.qty)),
            freight:round(n(x.freight)),
            delivery_days:x.delivery_days,
            validity_days:x.validity_days,
            brand:x.brand||null,
            notes:x.notes||null
          }))
          .sort((a,b)=>{
            if(a.unit_price!==b.unit_price)
              return a.unit_price-b.unit_price;

            return (
              a.delivery_days===null ||
              a.delivery_days===undefined ||
              a.delivery_days===''
                ?Number.MAX_SAFE_INTEGER
                :n(a.delivery_days)
            )-(
              b.delivery_days===null ||
              b.delivery_days===undefined ||
              b.delivery_days===''
                ?Number.MAX_SAFE_INTEGER
                :n(b.delivery_days)
            );
          });

        return {
          ...item,
          offers,
          best:offers[0]||null
        };
      });

      const uncovered=comparison
        .filter(x=>!x.best)
        .map(x=>({
          item_id:x.item_id,
          product_id:x.product_id,
          product_name:x.product_name
        }));

      const winners={};

      for(const item of comparison){
        if(!item.best) continue;

        const sid=item.best.supplier_id;

        if(!winners[sid]){
          winners[sid]={
            supplier_id:sid,
            supplier_name:item.best.supplier_name,
            items:[],
            subtotal:0
          };
        }

        winners[sid].items.push({
          item_id:item.item_id,
          product_id:item.product_id,
          product_name:item.product_name,
          qty:n(item.qty),
          unit:item.unit,
          unit_price:item.best.unit_price,
          brand:item.best.brand,
          subtotal:item.best.subtotal
        });

        winners[sid].subtotal+=item.best.subtotal;
      }

      const supplierOrders=Object.values(winners).map(group=>{
        const invitation=proposals.find(x=>
          n(x.supplier_id)===n(group.supplier_id) &&
          x.invitation_status==='SUBMITTED'
        );

        const freight=round(n(invitation?.freight));

        return {
          ...group,
          subtotal:round(group.subtotal),
          freight,
          total:round(group.subtotal+freight),
          delivery_days:invitation?.delivery_days??null
        };
      });

      const grandTotal=round(
        supplierOrders.reduce((s,x)=>s+n(x.total),0)
      );

      res.json({
        request,
        strategy:'LOWEST_VALID_UNIT_PRICE_PER_ITEM',
        comparison,
        supplier_orders:supplierOrders,
        uncovered_items:uncovered,
        grand_total:grandTotal,
        ready_to_finalize:
          comparison.length>0 &&
          uncovered.length===0 &&
          supplierOrders.length>0
      });

    }catch(e){
      res.status(400).json({error:e.message});
    }
  });

  app.post('/api/v49b/quotes/:id/finalize-smart',auth,minRole(80),(req,res)=>{
    try{
      const id=n(req.params.id);

      const request=db.prepare(
        'SELECT * FROM quote_requests WHERE id=?'
      ).get(id);

      if(!request)
        return res.status(404).json({error:'COTACAO_NAO_ENCONTRADA'});

      if(request.status!=='OPEN')
        return res.status(409).json({error:'COTACAO_NAO_ESTA_ABERTA'});

      const items=db.prepare(`
        SELECT
          qri.id item_id,
          qri.product_id,
          qri.qty,
          qri.unit,
          p.name product_name
        FROM quote_request_items qri
        JOIN products p ON p.id=qri.product_id
        WHERE qri.request_id=?
        ORDER BY qri.id
      `).all(id);

      if(!items.length)
        return res.status(400).json({error:'COTACAO_SEM_ITENS'});

      const offers=db.prepare(`
        SELECT
          qri.id item_id,
          qri.product_id,
          qri.qty,
          qi.id invitation_id,
          qi.supplier_id,
          qi.freight,
          qi.delivery_days,
          s.name supplier_name,
          qsp.unit_price,
          qsp.available,
          qsp.brand
        FROM quote_request_items qri
        JOIN quote_invitations qi
          ON qi.request_id=qri.request_id
         AND qi.status='SUBMITTED'
        JOIN suppliers s
          ON s.id=qi.supplier_id
        JOIN quote_supplier_prices qsp
          ON qsp.item_id=qri.id
         AND qsp.invitation_id=qi.id
        WHERE qri.request_id=?
          AND qsp.available=1
          AND qsp.unit_price>0
        ORDER BY
          qri.id,
          qsp.unit_price ASC,
          CASE
            WHEN qi.delivery_days IS NULL THEN 1
            ELSE 0
          END ASC,
          qi.delivery_days ASC
      `).all(id);

      const selected=[];

      for(const item of items){
        const candidates=offers
          .filter(x=>n(x.item_id)===n(item.item_id))
          .sort((a,b)=>{
            if(n(a.unit_price)!==n(b.unit_price))
              return n(a.unit_price)-n(b.unit_price);

            return (
              a.delivery_days===null ||
              a.delivery_days===undefined ||
              a.delivery_days===''
                ?Number.MAX_SAFE_INTEGER
                :n(a.delivery_days)
            )-(
              b.delivery_days===null ||
              b.delivery_days===undefined ||
              b.delivery_days===''
                ?Number.MAX_SAFE_INTEGER
                :n(b.delivery_days)
            );
          });

        if(!candidates.length){
          return res.status(409).json({
            error:'ITEM_SEM_PROPOSTA_VALIDA',
            item_id:item.item_id,
            product_id:item.product_id,
            product_name:item.product_name
          });
        }

        selected.push({
          ...item,
          ...candidates[0]
        });
      }

      const out=db.transaction(()=>{

        const groups={};

        for(const x of selected){
          const sid=n(x.supplier_id);

          if(!groups[sid]){
            groups[sid]={
              supplier_id:sid,
              supplier_name:x.supplier_name,
              freight:round(n(x.freight)),
              delivery_days:x.delivery_days,
              items:[]
            };
          }

          groups[sid].items.push(x);
        }

        const orders=[];
        let grandTotal=0;

        for(const group of Object.values(groups)){

          const subtotal=round(
            group.items.reduce(
              (sum,x)=>sum+(n(x.qty)*n(x.unit_price)),
              0
            )
          );

          const total=round(subtotal+n(group.freight));

          const po=db.prepare(`
            INSERT INTO purchase_orders(
              supplier_id,
              status,
              total,
              expected_at,
              notes
            )
            VALUES(
              ?,
              'ORDERED',
              ?,
              CASE
                WHEN ?>0
                THEN datetime('now','+' || ? || ' days')
                ELSE NULL
              END,
              ?
            )
          `).run(
            group.supplier_id,
            total,
            n(group.delivery_days),
            n(group.delivery_days),
            'NEXUS V4.9B - compra inteligente por menor preco valido por item'
          );

          for(const x of group.items){
            db.prepare(`
              INSERT INTO purchase_items(
                purchase_order_id,
                product_id,
                qty,
                unit_cost
              )
              VALUES(?,?,?,?)
            `).run(
              po.lastInsertRowid,
              x.product_id,
              x.qty,
              x.unit_price
            );
          }

          const payload={
            strategy:'LOWEST_VALID_UNIT_PRICE_PER_ITEM',
            quote_request_id:id,
            purchase_order_id:po.lastInsertRowid,
            supplier_id:group.supplier_id,
            supplier_name:group.supplier_name,
            subtotal,
            freight:group.freight,
            total,
            items:group.items.map(x=>({
              item_id:x.item_id,
              product_id:x.product_id,
              product_name:x.product_name,
              qty:n(x.qty),
              unit_price:round(n(x.unit_price)),
              brand:x.brand||null
            }))
          };

          db.prepare(`
            INSERT INTO supplier_dispatches(
              request_id,
              supplier_id,
              purchase_order_id,
              status,
              payload,
              sent_at
            )
            VALUES(?,?,?,'READY',?,NULL)
          `).run(
            id,
            group.supplier_id,
            po.lastInsertRowid,
            JSON.stringify(payload)
          );

          orders.push({
            purchase_order_id:po.lastInsertRowid,
            supplier_id:group.supplier_id,
            supplier_name:group.supplier_name,
            subtotal,
            freight:group.freight,
            total,
            item_count:group.items.length,
            dispatch_status:'READY'
          });

          grandTotal+=total;
        }

        grandTotal=round(grandTotal);

        db.prepare(`
          UPDATE quote_requests
          SET
            status='FINALIZED',
            selected_supplier_id=NULL,
            selected_total=?,
            finalized_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(grandTotal,id);

        return {
          quote_request_id:id,
          strategy:'LOWEST_VALID_UNIT_PRICE_PER_ITEM',
          supplier_count:orders.length,
          order_count:orders.length,
          grand_total:grandTotal,
          orders
        };
      })();

      audit(
        req.user.id,
        'FINALIZE_SMART',
        'QUOTE_REQUEST',
        id,
        out
      );

      res.json({
        ok:true,
        ...out
      });

    }catch(e){
      res.status(400).json({
        error:'SMART_FINALIZE_ERROR',
        message:e.message
      });
    }
  });

/* ============================================================
   NEXUS HOSPITALITY ONE
   V4.9C PURCHASE RECEIVING BRIDGE
   ============================================================ */

app.get('/api/v49c/purchase-orders',auth,minRole(55),(req,res)=>{
  try{

    const orders=db.prepare(`
      SELECT
        po.id,
        po.supplier_id,
        po.status,
        po.total,
        po.expected_at,
        po.received_at,
        po.notes,
        po.created_at,
        s.name supplier_name,
        COUNT(pi.id) item_count,
        COALESCE(SUM(pi.qty),0) ordered_qty,
        COALESCE(SUM(pi.received_qty),0) received_qty,
        COALESCE(SUM(
          CASE
            WHEN pi.received_qty < pi.qty THEN 1
            ELSE 0
          END
        ),0) pending_items
      FROM purchase_orders po
      JOIN suppliers s
        ON s.id=po.supplier_id
      LEFT JOIN purchase_items pi
        ON pi.purchase_order_id=po.id
      GROUP BY po.id
      ORDER BY
        CASE
          WHEN po.status='ORDERED' THEN 0
          WHEN po.status='PARTIALLY_RECEIVED' THEN 1
          WHEN po.status='RECEIVED' THEN 2
          ELSE 3
        END,
        po.id DESC
    `).all();

    res.json(orders);

  }catch(e){
    res.status(400).json({error:e.message});
  }
});

app.get('/api/v49c/purchase-orders/:id',auth,minRole(55),(req,res)=>{
  try{

    const id=Number(req.params.id)||0;

    const order=db.prepare(`
      SELECT
        po.*,
        s.name supplier_name,
        s.contact supplier_contact,
        s.phone supplier_phone,
        s.email supplier_email
      FROM purchase_orders po
      JOIN suppliers s
        ON s.id=po.supplier_id
      WHERE po.id=?
    `).get(id);

    if(!order){
      return res.status(404).json({
        error:'PURCHASE_ORDER_NOT_FOUND'
      });
    }

    const items=db.prepare(`
      SELECT
        pi.id,
        pi.purchase_order_id,
        pi.product_id,
        pi.qty,
        pi.unit_cost,
        pi.received_qty,
        p.name product_name,
        p.stock current_stock,
        p.stock_unit,
        p.cost current_cost,
        CASE
          WHEN (pi.qty-pi.received_qty)>0
          THEN (pi.qty-pi.received_qty)
          ELSE 0
        END pending_qty
      FROM purchase_items pi
      JOIN products p
        ON p.id=pi.product_id
      WHERE pi.purchase_order_id=?
      ORDER BY pi.id
    `).all(id);

    const batches=db.prepare(`
      SELECT
        b.id,
        b.product_id,
        p.name product_name,
        b.batch_code,
        b.initial_qty,
        b.remaining_qty,
        b.unit_cost,
        b.manufactured_at,
        b.expires_at,
        b.supplier_id,
        b.purchase_order_id,
        b.notes,
        b.created_at
      FROM inventory_batches b
      JOIN products p
        ON p.id=b.product_id
      WHERE b.purchase_order_id=?
      ORDER BY b.id DESC
    `).all(id);

    res.json({
      order,
      items,
      batches
    });

  }catch(e){
    res.status(400).json({error:e.message});
  }
});

app.post('/api/v49c/purchase-orders/:id/receive',auth,minRole(55),(req,res)=>{
  try{

    const id=Number(req.params.id)||0;
    const body=req.body||{};
    const incoming=Array.isArray(body.items)
      ?body.items
      :[];

    if(!incoming.length){
      return res.status(400).json({
        error:'NO_RECEIVING_ITEMS'
      });
    }

    const order=db.prepare(`
      SELECT *
      FROM purchase_orders
      WHERE id=?
    `).get(id);

    if(!order){
      return res.status(404).json({
        error:'PURCHASE_ORDER_NOT_FOUND'
      });
    }

    if(String(order.status||'').toUpperCase()==='RECEIVED'){
      return res.status(400).json({
        error:'PURCHASE_ORDER_ALREADY_RECEIVED'
      });
    }

    const purchaseItems=db.prepare(`
      SELECT
        pi.*,
        p.name product_name,
        p.stock current_stock,
        p.cost current_cost,
        p.stock_unit
      FROM purchase_items pi
      JOIN products p
        ON p.id=pi.product_id
      WHERE pi.purchase_order_id=?
    `).all(id);

    const byId=new Map(
      purchaseItems.map(x=>[
        Number(x.id),
        x
      ])
    );

    const normalized=[];

    for(const raw of incoming){

      const itemId=Number(raw.purchase_item_id)||0;
      const qty=Number(raw.qty)||0;

      if(qty<=0)continue;

      const item=byId.get(itemId);

      if(!item){
        throw new Error(
          'PURCHASE_ITEM_INVALID:'+itemId
        );
      }

      const pending=
        Number(item.qty||0)-
        Number(item.received_qty||0);

      if(qty>pending+0.000001){
        throw new Error(
          'RECEIVING_QTY_EXCEEDS_PENDING:'+itemId
        );
      }

      normalized.push({
        item,
        qty,

        batchCode:
          String(raw.batch_code||'').trim() ||
          `PO-${id}-ITEM-${itemId}-${Date.now()}`,

        manufacturedAt:
          String(raw.manufactured_at||'').trim() || null,

        expiresAt:
          String(raw.expires_at||'').trim() || null,

        notes:
          String(raw.notes||'').trim() || null
      });
    }

    if(!normalized.length){
      return res.status(400).json({
        error:'NO_POSITIVE_RECEIVING_QTY'
      });
    }

    const result=db.transaction(()=>{

      const received=[];

      for(const row of normalized){

        const item=row.item;
        const qty=row.qty;
        const unitCost=Number(item.unit_cost||0);

        db.prepare(`
          UPDATE products
          SET
            stock=stock+?,
            cost=?
          WHERE id=?
        `).run(
          qty,
          unitCost,
          item.product_id
        );

        const movement=db.prepare(`
          INSERT INTO stock_movements(
            product_id,
            type,
            qty,
            reference_type,
            reference_id,
            user_id,
            notes,
            display_unit
          )
          VALUES(
            ?,
            'PURCHASE',
            ?,
            'PURCHASE_ORDER',
            ?,
            ?,
            ?,
            ?
          )
        `).run(
          item.product_id,
          qty,
          String(id),
          req.user.id,
          `V4.9C purchase order #${id}`,
          item.stock_unit||'UN'
        );

        const batch=db.prepare(`
          INSERT INTO inventory_batches(
            product_id,
            batch_code,
            initial_qty,
            remaining_qty,
            unit_cost,
            manufactured_at,
            expires_at,
            supplier_id,
            purchase_order_id,
            notes,
            active,
            created_by
          )
          VALUES(
            ?,?,?,?,?,?,?,?,?,?,1,?
          )
        `).run(
          item.product_id,
          row.batchCode,
          qty,
          qty,
          unitCost,
          row.manufacturedAt,
          row.expiresAt,
          order.supplier_id,
          id,
          row.notes,
          req.user.id
        );

        db.prepare(`
          INSERT INTO inventory_batch_movements(
            batch_id,
            product_id,
            movement_type,
            qty,
            stock_movement_id,
            user_id,
            notes
          )
          VALUES(
            ?,?,'ENTRY',?,?,?,?
          )
        `).run(
          batch.lastInsertRowid,
          item.product_id,
          qty,
          movement.lastInsertRowid,
          req.user.id,
          `PURCHASE_ORDER:${id}`
        );

        db.prepare(`
          UPDATE purchase_items
          SET received_qty=received_qty+?
          WHERE id=?
        `).run(
          qty,
          item.id
        );

        received.push({
          purchase_item_id:item.id,
          product_id:item.product_id,
          product_name:item.product_name,
          qty,
          unit_cost:unitCost,
          batch_id:Number(batch.lastInsertRowid),
          batch_code:row.batchCode,
          expires_at:row.expiresAt
        });
      }

      const remaining=db.prepare(`
        SELECT COUNT(*) n
        FROM purchase_items
        WHERE purchase_order_id=?
          AND received_qty+0.000001 < qty
      `).get(id).n;

      const receivedAny=db.prepare(`
        SELECT COUNT(*) n
        FROM purchase_items
        WHERE purchase_order_id=?
          AND received_qty>0
      `).get(id).n;

      let status='ORDERED';

      if(Number(remaining)===0){

        status='RECEIVED';

        db.prepare(`
          UPDATE purchase_orders
          SET
            status='RECEIVED',
            received_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(id);

      }else if(Number(receivedAny)>0){

        status='PARTIALLY_RECEIVED';

        db.prepare(`
          UPDATE purchase_orders
          SET
            status='PARTIALLY_RECEIVED',
            received_at=NULL
          WHERE id=?
        `).run(id);
      }

      const updatedItems=db.prepare(`
        SELECT
          pi.id,
          pi.product_id,
          p.name product_name,
          pi.qty,
          pi.received_qty,
          pi.unit_cost,
          CASE
            WHEN (pi.qty-pi.received_qty)>0
            THEN (pi.qty-pi.received_qty)
            ELSE 0
          END pending_qty
        FROM purchase_items pi
        JOIN products p
          ON p.id=pi.product_id
        WHERE pi.purchase_order_id=?
        ORDER BY pi.id
      `).all(id);

      return{
        purchase_order_id:id,
        status,
        received,
        items:updatedItems
      };
    })();

    audit(
      req.user.id,
      'RECEIVE_PURCHASE_ORDER',
      'PURCHASE_ORDER',
      id,
      result
    );

    res.json({
      ok:true,
      ...result
    });

  }catch(e){

    res.status(400).json({
      error:e.message
    });
  }
});

/* END NEXUS V4.9C */


/* ============================================================
   NEXUS HOSPITALITY ONE
   NEXUS SUPPLIER DISPATCH V4.9D
   ============================================================ */

app.get('/api/v49d/dispatches',auth,minRole(55),(req,res)=>{
  try{

    const rows=db.prepare(`
      SELECT
        sd.id,
        sd.request_id,
        sd.supplier_id,
        sd.purchase_order_id,
        sd.status,
        sd.payload,
        sd.created_at,
        sd.sent_at,

        s.name supplier_name,
        s.contact supplier_contact,
        s.phone supplier_phone,
        s.email supplier_email,

        po.status purchase_status,
        po.total purchase_total,
        po.expected_at,
        po.received_at,

        qr.title quote_title,
        qr.public_code quote_code

      FROM supplier_dispatches sd

      LEFT JOIN suppliers s
        ON s.id=sd.supplier_id

      LEFT JOIN purchase_orders po
        ON po.id=sd.purchase_order_id

      LEFT JOIN quote_requests qr
        ON qr.id=sd.request_id

      ORDER BY
        CASE
          WHEN sd.status='READY' THEN 0
          WHEN sd.status='SENT' THEN 1
          ELSE 2
        END,
        sd.id DESC
    `).all();

    const data=rows.map(row=>{

      let parsed_payload=null;

      try{
        parsed_payload=row.payload
          ?JSON.parse(row.payload)
          :null;
      }catch{}

      return{
        ...row,
        parsed_payload
      };
    });

    res.json(data);

  }catch(e){

    res.status(400).json({
      error:e.message
    });
  }
});

app.get('/api/v49d/dispatches/:id',auth,minRole(55),(req,res)=>{
  try{

    const id=n(req.params.id);

    const dispatch=db.prepare(`
      SELECT
        sd.*,

        s.name supplier_name,
        s.contact supplier_contact,
        s.phone supplier_phone,
        s.email supplier_email,

        po.status purchase_status,
        po.total purchase_total,
        po.expected_at,
        po.received_at,

        qr.title quote_title,
        qr.public_code quote_code

      FROM supplier_dispatches sd

      LEFT JOIN suppliers s
        ON s.id=sd.supplier_id

      LEFT JOIN purchase_orders po
        ON po.id=sd.purchase_order_id

      LEFT JOIN quote_requests qr
        ON qr.id=sd.request_id

      WHERE sd.id=?
    `).get(id);

    if(!dispatch){

      return res.status(404).json({
        error:'DISPATCH_NOT_FOUND'
      });
    }

    const items=db.prepare(`
      SELECT
        pi.id,
        pi.product_id,
        p.name product_name,
        pi.qty,
        pi.unit_cost,
        pi.received_qty,
        ROUND(pi.qty*pi.unit_cost,2) item_total

      FROM purchase_items pi

      JOIN products p
        ON p.id=pi.product_id

      WHERE pi.purchase_order_id=?

      ORDER BY pi.id
    `).all(dispatch.purchase_order_id);

    let parsed_payload=null;

    try{
      parsed_payload=dispatch.payload
        ?JSON.parse(dispatch.payload)
        :null;
    }catch{}

    res.json({
      dispatch:{
        ...dispatch,
        parsed_payload
      },
      items
    });

  }catch(e){

    res.status(400).json({
      error:e.message
    });
  }
});

app.post('/api/v49d/dispatches/:id/sent',auth,minRole(80),(req,res)=>{
  try{

    const id=n(req.params.id);
    const body=req.body||{};

    const dispatch=db.prepare(`
      SELECT *
      FROM supplier_dispatches
      WHERE id=?
    `).get(id);

    if(!dispatch){

      return res.status(404).json({
        error:'DISPATCH_NOT_FOUND'
      });
    }

    if(dispatch.status==='SENT'){

      return res.json({
        ok:true,
        id,
        status:'SENT',
        sent_at:dispatch.sent_at,
        already_sent:true
      });
    }

    if(dispatch.status!=='READY'){

      return res.status(409).json({
        error:'DISPATCH_NOT_READY',
        status:dispatch.status
      });
    }

    const channel=
      txt(body.channel||'MANUAL')
      .toUpperCase();

    const validChannels=[
      'MANUAL',
      'WHATSAPP',
      'EMAIL',
      'PHONE',
      'OTHER'
    ];

    if(!validChannels.includes(channel)){

      return res.status(400).json({
        error:'INVALID_DISPATCH_CHANNEL'
      });
    }

    const supplier=db.prepare(`
      SELECT
        id,
        name,
        contact,
        phone,
        email
      FROM suppliers
      WHERE id=?
    `).get(dispatch.supplier_id);

    const purchaseOrder=db.prepare(`
      SELECT *
      FROM purchase_orders
      WHERE id=?
    `).get(dispatch.purchase_order_id);

    const items=db.prepare(`
      SELECT
        pi.product_id,
        p.name product_name,
        pi.qty,
        pi.unit_cost,
        ROUND(pi.qty*pi.unit_cost,2) total

      FROM purchase_items pi

      JOIN products p
        ON p.id=pi.product_id

      WHERE pi.purchase_order_id=?

      ORDER BY pi.id
    `).all(dispatch.purchase_order_id);

    let oldPayload={};

    try{
      oldPayload=dispatch.payload
        ?JSON.parse(dispatch.payload)
        :{};
    }catch{}

    const newPayload={
      ...oldPayload,

      dispatch:{
        channel,
        destination:txt(body.destination)||null,
        notes:txt(body.notes)||null,
        marked_by:req.user.id,
        marked_at:new Date().toISOString()
      },

      supplier:{
        id:supplier?.id||null,
        name:supplier?.name||null,
        contact:supplier?.contact||null,
        phone:supplier?.phone||null,
        email:supplier?.email||null
      },

      purchase_order:{
        id:purchaseOrder?.id||null,
        status:purchaseOrder?.status||null,
        total:n(purchaseOrder?.total)
      },

      items
    };

    const result=db.prepare(`
      UPDATE supplier_dispatches
      SET
        status='SENT',
        payload=?,
        sent_at=CURRENT_TIMESTAMP
      WHERE id=?
        AND status='READY'
    `).run(
      JSON.stringify(newPayload),
      id
    );

    if(!result.changes){

      return res.status(409).json({
        error:'DISPATCH_STATE_CHANGED'
      });
    }

    const updated=db.prepare(`
      SELECT *
      FROM supplier_dispatches
      WHERE id=?
    `).get(id);

    audit(
      req.user.id,
      'DISPATCH_PURCHASE_ORDER',
      'SUPPLIER_DISPATCH',
      id,
      {
        dispatch_id:id,
        purchase_order_id:dispatch.purchase_order_id,
        supplier_id:dispatch.supplier_id,
        channel,
        destination:txt(body.destination)||null,
        notes:txt(body.notes)||null
      }
    );

    res.json({
      ok:true,
      id,
      purchase_order_id:dispatch.purchase_order_id,
      supplier_id:dispatch.supplier_id,
      channel,
      status:'SENT',
      sent_at:updated.sent_at
    });

  }catch(e){

    res.status(400).json({
      error:e.message
    });
  }
});

/* END NEXUS SUPPLIER DISPATCH V4.9D */

app.get('/api/v13/quotes',auth,minRole(55),(_req,res)=>res.json(db.prepare(`SELECT qr.*,(SELECT COUNT(*) FROM quote_invitations qi WHERE qi.request_id=qr.id) invited,(SELECT COUNT(*) FROM quote_invitations qi WHERE qi.request_id=qr.id AND qi.status='SUBMITTED') submitted FROM quote_requests qr ORDER BY qr.id DESC`).all()));
 app.post('/api/v13/quotes',auth,minRole(55),(req,res)=>{try{const b=req.body||{},items=b.items||[],suppliers=b.supplier_ids||[];if(!txt(b.title)||!items.length||!suppliers.length)return res.status(400).json({error:'COTACAO_REQUER_ITENS_E_FORNECEDORES'});const out=db.transaction(()=>{const code=token('COT'),q=db.prepare('INSERT INTO quote_requests(title,public_code,deadline_at,notes,created_by) VALUES(?,?,?,?,?)').run(txt(b.title),code,b.deadline_at||null,txt(b.notes)||null,req.user.id);for(const x of items)db.prepare('INSERT INTO quote_request_items(request_id,product_id,qty,unit,target_price) VALUES(?,?,?,?,?)').run(q.lastInsertRowid,n(x.product_id),n(x.qty),txt(x.unit)||'UN',x.target_price==null?null:n(x.target_price));const links=[];for(const sid of suppliers){const t=token('FORN');db.prepare('INSERT INTO quote_invitations(request_id,supplier_id,invite_token) VALUES(?,?,?)').run(q.lastInsertRowid,n(sid),t);db.prepare(`INSERT INTO supplier_portal_users(supplier_id,access_token) VALUES(?,?) ON CONFLICT(supplier_id) DO UPDATE SET active=1`).run(n(sid),token('LOGIN'));links.push({supplier_id:n(sid),token:t,path:`/fornecedor/cotacao/${t}`})}return{id:q.lastInsertRowid,code,links}})();audit(req.user.id,'CREATE','QUOTE_REQUEST',out.id,out);res.status(201).json(out)}catch(e){res.status(400).json({error:e.message})}});
 app.get('/api/v13/quotes/:id/analysis',auth,minRole(55),(req,res)=>{const id=n(req.params.id),invs=db.prepare(`SELECT qi.*,s.name supplier_name FROM quote_invitations qi JOIN suppliers s ON s.id=qi.supplier_id WHERE qi.request_id=?`).all(id);const result=invs.map(i=>{const subtotal=n(db.prepare(`SELECT COALESCE(SUM(qsp.unit_price*qri.qty),0) v FROM quote_supplier_prices qsp JOIN quote_request_items qri ON qri.id=qsp.item_id WHERE qsp.invitation_id=? AND qsp.available=1`).get(i.id)?.v);return{...i,subtotal:round(subtotal),total:round(subtotal+n(i.freight)),score:round(subtotal+n(i.freight)+n(i.delivery_days)*.25)}}).sort((a,b)=>a.score-b.score);res.json({request:db.prepare('SELECT * FROM quote_requests WHERE id=?').get(id),ranking:result,best:result.find(x=>x.status==='SUBMITTED')||null})});
 app.post('/api/v13/quotes/:id/finalize',auth,minRole(80),(req,res)=>{try{const id=n(req.params.id),sid=n(req.body?.supplier_id),analysis=db.prepare(`SELECT qi.id invitation_id,qi.freight,s.id supplier_id,s.name FROM quote_invitations qi JOIN suppliers s ON s.id=qi.supplier_id WHERE qi.request_id=? AND qi.supplier_id=? AND qi.status='SUBMITTED'`).get(id,sid);if(!analysis)return res.status(400).json({error:'PROPOSTA_INVALIDA'});const out=db.transaction(()=>{const items=db.prepare(`SELECT qri.product_id,qri.qty,qsp.unit_price FROM quote_request_items qri JOIN quote_supplier_prices qsp ON qsp.item_id=qri.id AND qsp.invitation_id=? WHERE qri.request_id=? AND qsp.available=1`).all(analysis.invitation_id,id);const subtotal=items.reduce((s,x)=>s+n(x.qty)*n(x.unit_price),0),total=round(subtotal+n(analysis.freight));const po=db.prepare("INSERT INTO purchase_orders(supplier_id,status,total) VALUES(?,'ORDERED',?)").run(sid,total);for(const x of items)db.prepare('INSERT INTO purchase_items(purchase_order_id,product_id,qty,unit_cost) VALUES(?,?,?,?)').run(po.lastInsertRowid,x.product_id,x.qty,x.unit_price);const payload=JSON.stringify({purchase_order_id:po.lastInsertRowid,total,items});db.prepare("INSERT INTO supplier_dispatches(request_id,supplier_id,purchase_order_id,status,payload,sent_at) VALUES(?,?,?,'SENT',?,CURRENT_TIMESTAMP)").run(id,sid,po.lastInsertRowid,payload);db.prepare("UPDATE quote_requests SET status='FINALIZED',selected_supplier_id=?,selected_total=?,finalized_at=CURRENT_TIMESTAMP WHERE id=?").run(sid,total,id);return{purchase_order_id:po.lastInsertRowid,total,supplier:analysis.name,dispatch_status:'SENT'}})();audit(req.user.id,'FINALIZE','QUOTE_REQUEST',id,out);res.json({ok:true,...out})}catch(e){res.status(400).json({error:e.message})}});
}

