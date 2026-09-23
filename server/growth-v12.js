import {connectPaidTicketOrder} from "./event-experience-v30.js";
import {asaasRequest,asaasWebhookToken} from './asaas-config.js';
import crypto from 'node:crypto';
import {db} from './db.js';import QRCode from 'qrcode';
import { tenantContext } from './tenant-guard.js';
const n=v=>Number(v||0);const txt=v=>String(v||'').trim();
const uid=(p='NX')=>`${p}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
const add=(t,c,d)=>{const cols=db.prepare(`PRAGMA table_info(${t})`).all().map(x=>x.name);if(!cols.includes(c))db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`)};
export function initGrowthV12(){
 db.exec(`
 CREATE TABLE IF NOT EXISTS asaas_webhook_events(event_id TEXT PRIMARY KEY,event_type TEXT,payment_id TEXT,external_reference TEXT,received_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS public_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,public_code TEXT NOT NULL UNIQUE,customer_name TEXT NOT NULL,phone TEXT,email TEXT,cpf_cnpj TEXT,order_type TEXT NOT NULL DEFAULT 'PICKUP',address TEXT,notes TEXT,items_total REAL NOT NULL DEFAULT 0,delivery_fee REAL NOT NULL DEFAULT 0,total REAL NOT NULL DEFAULT 0,payment_method TEXT NOT NULL DEFAULT 'PIX',payment_status TEXT NOT NULL DEFAULT 'PENDING',asaas_customer_id TEXT,asaas_payment_id TEXT,invoice_url TEXT,pix_payload TEXT,pix_image TEXT,delivery_id INTEGER,status TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS public_order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,name TEXT NOT NULL,qty REAL NOT NULL DEFAULT 1,unit_price REAL NOT NULL DEFAULT 0,notes TEXT,FOREIGN KEY(order_id) REFERENCES public_orders(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS ticket_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_code TEXT NOT NULL UNIQUE,event_id INTEGER NOT NULL,lot_id INTEGER NOT NULL,buyer_name TEXT NOT NULL,buyer_phone TEXT,buyer_email TEXT,buyer_document TEXT,quantity INTEGER NOT NULL DEFAULT 1,total REAL NOT NULL DEFAULT 0,payment_status TEXT NOT NULL DEFAULT 'PENDING',asaas_customer_id TEXT,asaas_payment_id TEXT,invoice_url TEXT,pix_payload TEXT,pix_image TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES events(id),FOREIGN KEY(lot_id) REFERENCES ticket_lots(id));
 CREATE TABLE IF NOT EXISTS growth_actions(id INTEGER PRIMARY KEY AUTOINCREMENT,action_date TEXT NOT NULL,title TEXT NOT NULL,reason TEXT,expected_impact REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'SUGGESTED',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 `);
 add('events','public_sales','INTEGER NOT NULL DEFAULT 1');add('events','sales_starts_at','TEXT');add('events','sales_ends_at','TEXT');add('events','description','TEXT');add('events','public_slug','TEXT');
 add('delivery_orders','payment_status',"TEXT NOT NULL DEFAULT 'PENDING'");add('delivery_orders','public_order_id','INTEGER');
 add('tickets','qr_payload','TEXT');add('tickets','buyer_email','TEXT');add('tickets','buyer_document','TEXT');add('tickets','ticket_order_id','INTEGER');

 add('ticket_orders','ticket_portal_token_hash','TEXT');
 add('ticket_orders','ticket_portal_created_at','TEXT');

 db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_delivery_outbox(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   ticket_order_id INTEGER NOT NULL,
   ticket_id INTEGER,
   channel TEXT NOT NULL,
   destination TEXT,
   status TEXT NOT NULL DEFAULT 'QUEUED',
   attempts INTEGER NOT NULL DEFAULT 0,
   last_error TEXT,
   provider_message_id TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   sent_at TEXT,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(ticket_order_id) REFERENCES ticket_orders(id),
   FOREIGN KEY(ticket_id) REFERENCES tickets(id)
  );
 `);
}

async function asaas(path,options={}){try{return await asaasRequest(path,options)}catch(e){if(e.message==='ASAAS_API_KEY_NOT_CONFIGURED')e.code='ASAAS_NOT_CONFIGURED';throw e}}
async function charge({name,phone,email,document,value,description,externalReference}){const customer=await asaas('/customers',{method:'POST',body:{name,cpfCnpj:document||undefined,mobilePhone:phone||undefined,email:email||undefined,externalReference:`NEXUS-${externalReference}`,notificationDisabled:false}});const due=new Date();due.setDate(due.getDate()+1);const dueDate=due.toISOString().slice(0,10);const payment=await asaas('/payments',{method:'POST',body:{customer:customer.id,billingType:'UNDEFINED',value:Number(value.toFixed(2)),dueDate,description,externalReference}});const pix=await asaas(`/payments/${payment.id}/pixQrCode`);return{customer,payment,pix}}
function publicMenu(){const business=db.prepare("SELECT value FROM settings WHERE key='business_name'").get()?.value||'NEXUS Hospitality';const products=db.prepare(`SELECT id,name,category,description,image_url,price,stock,menu_featured FROM products WHERE active=1 AND menu_visible=1 ORDER BY menu_featured DESC,category,name`).all().map(x=>({...x,available:n(x.stock)>0}));return{business,products}}
function eventPublic(id){return db.prepare(`SELECT e.*,COALESCE((SELECT SUM(CASE WHEN t.payment_status='PAID' THEN 1 ELSE 0 END) FROM tickets t WHERE t.event_id=e.id),0) sold FROM events e WHERE e.id=? AND e.public_sales=1`).get(n(id))}
function parseTime(v,fallback){if(!v)return fallback;const t=new Date(v).getTime();return Number.isFinite(t)?t:fallback}
function lotState(l){
 const now=Date.now(),start=parseTime(l.starts_at,0),end=parseTime(l.ends_at,Infinity);
 const status=String(l.status||'ACTIVE').trim().toUpperCase();
 const capacity=n(l.quantity),sold=n(l.sold),unlimited=capacity<=0,remaining=unlimited?null:Math.max(0,capacity-sold);
 if(status!=='ACTIVE')return{available:false,state:'INACTIVE',label:'INDISPONÃVEL',remaining,unlimited};
 if(now<start)return{available:false,state:'UPCOMING',label:'EM BREVE',remaining,unlimited};
 if(now>end)return{available:false,state:'ENDED',label:'VENDAS ENCERRADAS',remaining,unlimited};
 if(!unlimited&&sold>=capacity)return{available:false,state:'SOLD_OUT',label:'ESGOTADO',remaining:0,unlimited};
 if(!unlimited&&remaining<=10)return{available:true,state:'LAST_UNITS',label:'ÃšLTIMAS UNIDADES',remaining,unlimited};
 return{available:true,state:'ON_SALE',label:'Ã€ VENDA',remaining,unlimited};
}
function lotAvailable(l){return lotState(l).available}

function ticketPortalToken(){
 return crypto.randomBytes(32).toString('hex');
}

function ticketPortalHash(value){
 return crypto
  .createHash('sha256')
  .update(String(value||''))
  .digest('hex');
}

function queueTicketDelivery(order,tickets){
 const rows=Array.isArray(tickets)?tickets:[];
 const email=txt(order?.buyer_email);
 const phone=txt(order?.buyer_phone);

 const exists=db.prepare(`
  SELECT id
  FROM ticket_delivery_outbox
  WHERE ticket_order_id=?
    AND ticket_id=?
    AND channel=?
 `);

 const insert=db.prepare(`
  INSERT INTO ticket_delivery_outbox(
   ticket_order_id,
   ticket_id,
   channel,
   destination,
   status
  )
  VALUES(?,?,?,?,?)
 `);

 for(const ticket of rows){

  if(email){

   const current=exists.get(
    order.id,
    ticket.id,
    'EMAIL'
   );

   if(!current){
    insert.run(
     order.id,
     ticket.id,
     'EMAIL',
     email,
     'QUEUED'
    );
   }
  }

  if(phone){

   const current=exists.get(
    order.id,
    ticket.id,
    'SMS'
   );

   if(!current){
    insert.run(
     order.id,
     ticket.id,
     'SMS',
     phone,
     'QUEUED'
    );
   }
  }
 }
}
function activatePublicOrder(orderId){const o=db.prepare('SELECT * FROM public_orders WHERE id=?').get(orderId);if(!o||o.delivery_id)return;const items=db.prepare('SELECT * FROM public_order_items WHERE order_id=?').all(orderId);const info=db.prepare(`INSERT INTO delivery_orders(customer_name,phone,order_type,address,status,total,payment_method,notes,delivery_fee,payment_status,public_order_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(o.customer_name,o.phone,o.order_type,o.address,'NEW',o.total,o.payment_method,o.notes,o.delivery_fee,'PAID',o.id);for(const x of items)db.prepare('INSERT INTO delivery_items(delivery_id,product_id,qty,unit_price,sale_mode,notes) VALUES(?,?,?,?,?,?)').run(info.lastInsertRowid,x.product_id,x.qty,x.unit_price,'UNIT',x.notes||null);db.prepare("UPDATE public_orders SET payment_status='PAID',status='RECEIVED',delivery_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(info.lastInsertRowid,o.id)}
function activateTicketOrder(orderId){
 const o=db.prepare(
  'SELECT * FROM ticket_orders WHERE id=?'
 ).get(orderId);

 if(!o||o.payment_status==='PAID'){
  return;
 }

 const lot=db.prepare(
  'SELECT * FROM ticket_lots WHERE id=?'
 ).get(o.lot_id);

 if(
  !lot ||
  (
   n(lot.quantity)>0 &&
   n(lot.sold)+n(o.quantity)>n(lot.quantity)
  )
 ){
  throw new Error('LOT_CAPACITY_EXCEEDED');
 }

 const portalToken=ticketPortalToken();
 const portalHash=ticketPortalHash(portalToken);

 const transaction=db.transaction(()=>{

  for(let i=0;i<n(o.quantity);i++){

   const ticketCode=uid('NX');

   db.prepare(`
    INSERT INTO tickets(
     event_id,
     lot_id,
     attendee_name,
     attendee_phone,
     ticket_code,
     ticket_type,
     price,
     payment_status,
     payment_method,
     qr_payload,
     buyer_email,
     buyer_document,
     ticket_order_id
    )
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
   `).run(
    o.event_id,
    o.lot_id,
    o.buyer_name,
    o.buyer_phone,
    ticketCode,
    lot.name,
    n(lot.price),
    'PAID',
    'PIX',
    ticketCode,
    o.buyer_email,
    o.buyer_document,
    o.id
   );
  }

  db.prepare(
   'UPDATE ticket_lots SET sold=sold+? WHERE id=?'
  ).run(
   o.quantity,
   o.lot_id
  );

  db.prepare(`
   UPDATE ticket_orders
   SET payment_status='PAID',
       ticket_portal_token_hash=?,
       ticket_portal_created_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP
   WHERE id=?
  `).run(
   portalHash,
   o.id
  );
 });

 transaction();

 const currentOrder=db.prepare(
  'SELECT * FROM ticket_orders WHERE id=?'
 ).get(o.id);

 const issued=db.prepare(
  'SELECT * FROM tickets WHERE ticket_order_id=? ORDER BY id'
 ).all(o.id);

 queueTicketDelivery(
  currentOrder,
  issued
 );

 let experience=null;

 try{
  experience=connectPaidTicketOrder(
   o.id
  );
 }catch(error){
  console.error(
   "[NEXUS_EVENT_EXPERIENCE]",
   error?.message||error
  );
 }

 return{
  portal_token:portalToken,
  tickets:issued,
  experience
 };
}
export function registerGrowthV12(app,{auth,minRole,audit}){
 app.get('/api/public/store',(_q,res)=>res.json(publicMenu()));
 app.post('/api/public/orders',async(req,res)=>{try{const b=req.body||{},items=Array.isArray(b.items)?b.items:[];if(!txt(b.customer_name)||!txt(b.phone)||!items.length)return res.status(400).json({error:'DADOS_DO_PEDIDO_OBRIGATORIOS'});const resolved=items.map(x=>{const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1 AND menu_visible=1').get(n(x.product_id));if(!p||n(p.stock)<=0)throw new Error('PRODUTO_INDISPONIVEL');return{p,qty:Math.max(1,n(x.qty))}});const itemsTotal=resolved.reduce((s,x)=>s+x.qty*n(x.p.price),0),fee=b.order_type==='DELIVERY'?Math.max(0,n(b.delivery_fee)):0,total=itemsTotal+fee,publicCode=uid('PED');const info=db.prepare(`INSERT INTO public_orders(public_code,customer_name,phone,email,cpf_cnpj,order_type,address,notes,items_total,delivery_fee,total,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,'PIX')`).run(publicCode,txt(b.customer_name),txt(b.phone),txt(b.email)||null,txt(b.cpf_cnpj)||null,b.order_type==='DELIVERY'?'DELIVERY':'PICKUP',txt(b.address)||null,txt(b.notes)||null,itemsTotal,fee,total);for(const x of resolved)db.prepare('INSERT INTO public_order_items(order_id,product_id,name,qty,unit_price,notes) VALUES(?,?,?,?,?,?)').run(info.lastInsertRowid,x.p.id,x.p.name,x.qty,x.p.price,null);let pay=null;try{pay=await charge({name:txt(b.customer_name),phone:txt(b.phone),email:txt(b.email),document:txt(b.cpf_cnpj),value:total,description:`Pedido ${publicCode}`,externalReference:`ORDER:${info.lastInsertRowid}`});db.prepare('UPDATE public_orders SET asaas_customer_id=?,asaas_payment_id=?,invoice_url=?,pix_payload=?,pix_image=? WHERE id=?').run(pay.customer.id,pay.payment.id,pay.payment.invoiceUrl||null,pay.pix.payload||null,pay.pix.encodedImage||null,info.lastInsertRowid)}catch(e){if(e.code!=='ASAAS_NOT_CONFIGURED')throw e}const out=db.prepare('SELECT * FROM public_orders WHERE id=?').get(info.lastInsertRowid);res.status(201).json({...out,paymentConfigured:!!pay})}catch(e){res.status(400).json({error:e.message})}});
 app.get('/api/public/orders/:code',(req,res)=>{const o=db.prepare('SELECT * FROM public_orders WHERE public_code=?').get(txt(req.params.code));if(!o)return res.status(404).json({error:'PEDIDO_NAO_ENCONTRADO'});res.json({...o,items:db.prepare('SELECT * FROM public_order_items WHERE order_id=?').all(o.id)})});
 app.get('/api/public/my-ticket/:token',async(req,res)=>{
 try{
  const token=txt(req.params.token);

  if(
   !token ||
   !/^[a-f0-9]{64}$/i.test(token)
  ){
   return res.status(404).json({
    error:'INGRESSO_NAO_ENCONTRADO'
   });
  }

  const hash=ticketPortalHash(token);

  const order=db.prepare(`
   SELECT
    o.id,
    o.order_code,
    o.event_id,
    o.lot_id,
    o.buyer_name,
    o.quantity,
    o.total,
    o.payment_status,
    e.title AS event_title,
    e.event_type,
    e.artist_name,
    e.venue_name,
    e.starts_at,
    e.ends_at,
    e.image_url,
    l.name AS lot_name
   FROM ticket_orders o
   JOIN events e
    ON e.id=o.event_id
   JOIN ticket_lots l
    ON l.id=o.lot_id
   WHERE o.ticket_portal_token_hash=?
     AND o.payment_status='PAID'
  `).get(hash);

  if(!order){
   return res.status(404).json({
    error:'INGRESSO_NAO_ENCONTRADO'
   });
  }

  const rawTickets=db.prepare(`
   SELECT
    id,
    ticket_code,
    attendee_name,
    attendee_phone,
    ticket_type,
    price,
    payment_status,
    checkin_at
   FROM tickets
   WHERE ticket_order_id=?
   ORDER BY id
  `).all(order.id);

  const tickets=await Promise.all(
   rawTickets.map(async ticket=>({
    ...ticket,

    access_status:
     ticket.checkin_at
      ? 'USED'
      : 'VALID',

    qr_image:
     await QRCode.toDataURL(
      ticket.ticket_code,
      {
       width:520,
       margin:2,
       errorCorrectionLevel:'M'
      }
     )
   }))
  );

  return res.json({
   order:{
    order_code:order.order_code,
    buyer_name:order.buyer_name,
    quantity:order.quantity,
    total:order.total,
    payment_status:order.payment_status
   },

   event:{
    id:order.event_id,
    title:order.event_title,
    event_type:order.event_type,
    artist_name:order.artist_name,
    venue_name:order.venue_name,
    starts_at:order.starts_at,
    ends_at:order.ends_at,
    image_url:order.image_url
   },

   lot:{
    id:order.lot_id,
    name:order.lot_name
   },

   tickets
  });

 }catch(e){

  console.error(
   '[TICKET_PORTAL]',
   e
  );

  return res.status(500).json({
   error:'TICKET_PORTAL_INTERNAL_ERROR'
  });
 }
});
app.get('/api/public/events',(_q,res)=>res.json(db.prepare(`SELECT e.*,COALESCE((SELECT SUM(CASE WHEN t.payment_status='PAID' THEN 1 ELSE 0 END) FROM tickets t WHERE t.event_id=e.id),0) sold FROM events e WHERE e.public_sales=1 AND COALESCE(e.status,'') NOT IN ('CANCELLED','DRAFT') ORDER BY datetime(e.starts_at) ASC`).all()));
 /*
 * NEXUS_SMART_LOTS_PUBLIC_V1
 *
 * O administrativo continua recebendo todos os lotes
 * pelas rotas autenticadas.
 *
 * Na experiencia publica apenas o primeiro lote
 * realmente disponivel e exibido.
 *
 * Quando o lote atual esgota, expira ou e desativado,
 * o proximo lote elegivel assume automaticamente.
 */
app.get('/api/public/events/:id',(req,res)=>{

 const e=eventPublic(req.params.id);

 if(!e){
  return res.status(404).json({
   error:'EVENTO_NAO_ENCONTRADO'
  });
 }

 const allLots=db.prepare(
  'SELECT * FROM ticket_lots WHERE event_id=? ORDER BY id'
 ).all(e.id);

 const evaluated=
  allLots.map(lot=>({
   ...lot,
   ...lotState(lot)
  }));

 /*
  * Ordem de prioridade:
  * primeiro lote criado que esteja efetivamente
  * disponivel para venda.
  */
 const currentLot=
  evaluated.find(lot=>lot.available) || null;

 /*
  * A experiencia publica recebe no maximo um lote.
  * O frontend existente continua compativel,
  * pois ainda recebe a propriedade "lots".
  */
 const lots=currentLot
  ? [currentLot]
  : [];

 return res.json({
  ...e,
  lots,

  smart_lot:{
   enabled:true,
   current_lot_id:currentLot?.id || null,
   state:currentLot?.state || 'NO_LOT_AVAILABLE'
  }
 });
});
 app.post('/api/public/events/:id/buy',async(req,res)=>{
 try{
  /* CUSTOMER_LINKED_PUBLIC_BUY_V26 */

  const b=req.body||{};
  const e=eventPublic(req.params.id);
  const lot=db.prepare(
   'SELECT * FROM ticket_lots WHERE id=? AND event_id=?'
  ).get(
   n(b.lot_id),
   n(req.params.id)
  );

  if(!e||!lot){
   return res.status(404).json({
    error:'EVENTO_OU_LOTE_NAO_ENCONTRADO'
   });
  }

  const now=Date.now();
  const salesStart=e.sales_starts_at
   ?new Date(e.sales_starts_at).getTime()
   :0;

  const salesEnd=e.sales_ends_at
   ?new Date(e.sales_ends_at).getTime()
   :(e.starts_at
      ?new Date(e.starts_at).getTime()
      :Infinity);

  if(now<salesStart){
   return res.status(409).json({
    error:'VENDAS_AINDA_NAO_INICIADAS'
   });
  }

  if(now>salesEnd){
   return res.status(409).json({
    error:'VENDAS_ENCERRADAS'
   });
  }

  const qty=Math.max(
   1,
   Math.min(
    10,
    Math.floor(n(b.quantity)||1)
   )
  );

  const ls=lotState(lot);

  if(
   !ls.available ||
   (
    !ls.unlimited &&
    n(lot.sold)+qty>n(lot.quantity)
   )
  ){
   return res.status(409).json({
    error:'LOTE_INDISPONIVEL',
    lot_state:ls.state
   });
  }

  let ticketCustomer=null;

  const rawCustomerSession=
   txt(req.headers['x-nexus-customer-session']);

  if(/^[a-f0-9]{64}$/i.test(rawCustomerSession)){

   const customerSessionHash=
    crypto
     .createHash('sha256')
     .update(rawCustomerSession)
     .digest('hex');

   ticketCustomer=db.prepare(`
    SELECT c.*
    FROM ticket_customer_sessions s
    JOIN ticket_customers c
     ON c.id=s.customer_id
    WHERE s.token_hash=?
      AND s.revoked_at IS NULL
      AND datetime(s.expires_at)>CURRENT_TIMESTAMP
      AND c.status='ACTIVE'
   `).get(customerSessionHash)||null;
  }

  const buyerName=
   ticketCustomer?.full_name ||
   txt(b.name);

  const buyerPhone=
   ticketCustomer?.phone ||
   txt(b.phone);

  const buyerEmail=
   ticketCustomer?.email ||
   txt(b.email);

  const buyerDocument=
   ticketCustomer?.document ||
   txt(b.document);

  if(!buyerName||!buyerPhone){
   return res.status(400).json({
    error:'DADOS_DO_COMPRADOR_OBRIGATORIOS'
   });
  }

  /*
   * Age enforcement for authenticated wallet customers.
   */
  if(ticketCustomer && e.starts_at){

   const eventDate=
    new Date(e.starts_at);

   const birth=
    new Date(
     ticketCustomer.birth_date+'T12:00:00'
    );

   let age=
    eventDate.getFullYear()-
    birth.getFullYear();

   const month=
    eventDate.getMonth()-
    birth.getMonth();

   if(
    month<0 ||
    (
     month===0 &&
     eventDate.getDate()<birth.getDate()
    )
   ){
    age--;
   }

   const minimumAge=
    Number(e.minimum_age||0);

   const minorPolicy=
    String(
     e.minor_policy||'UNRESTRICTED'
    ).toUpperCase();

   if(
    minimumAge>0 &&
    age<minimumAge &&
    minorPolicy==='BLOCK'
   ){
    return res.status(403).json({
     error:'IDADE_MINIMA_NAO_ATENDIDA',
     age,
     minimum_age:minimumAge
    });
   }
  }

  /* NEXUS SAFE TICKET CHECKOUT */
  if(!String(process.env.ASAAS_API_KEY||'').trim()){
   return res.status(503).json({
    error:'PAYMENT_GATEWAY_NOT_CONFIGURED',
    message:'Pagamento online temporariamente indisponivel.'
   });
  }

  const total=n(lot.price)*qty;
  const orderCode=uid('ING');

  const info=db.prepare(`
   INSERT INTO ticket_orders(
    order_code,
    event_id,
    lot_id,
    buyer_name,
    buyer_phone,
    buyer_email,
    buyer_document,
    quantity,
    total,
    ticket_customer_id
   )
   VALUES(?,?,?,?,?,?,?,?,?,?)
  `).run(
   orderCode,
   e.id,
   lot.id,
   buyerName,
   buyerPhone,
   buyerEmail||null,
   buyerDocument||null,
   qty,
   total,
   ticketCustomer?.id||null
  );

  let pay=null;

  try{
   pay=await charge({
    name:buyerName,
    phone:buyerPhone,
    email:buyerEmail,
    document:buyerDocument,
    value:total,
    description:
     `${e.title} - ${lot.name} - ${qty} ingresso(s)`,
    externalReference:
     `TICKET:${info.lastInsertRowid}`
   });

   db.prepare(`
    UPDATE ticket_orders
    SET
     asaas_customer_id=?,
     asaas_payment_id=?,
     invoice_url=?,
     pix_payload=?,
     pix_image=?
    WHERE id=?
   `).run(
    pay.customer.id,
    pay.payment.id,
    pay.payment.invoiceUrl||null,
    pay.pix.payload||null,
    pay.pix.encodedImage||null,
    info.lastInsertRowid
   );

   }catch(err){

    /*
     * NEXUS TICKET PAYMENT FAILURE PROTECTION
     *
     * O ticket_order PENDING existe antes da chamada externa
     * porque seu ID compoe o externalReference TICKET:<id>.
     *
     * Em falha de inicializacao do pagamento, removemos apenas
     * esse pedido PENDING para impedir pedido local orfao.
     */

    try{
     db.prepare(`
      DELETE FROM ticket_orders
      WHERE id=?
        AND payment_status='PENDING'
     `).run(info.lastInsertRowid);
    }catch(cleanupError){
     console.error(
      'TICKET_PAYMENT_FAILURE_CLEANUP_ERROR',
      cleanupError
     );
    }

    if(err.code==='ASAAS_NOT_CONFIGURED'){
     return res.status(503).json({
      error:'PAYMENT_GATEWAY_NOT_CONFIGURED',
      message:'Pagamento online temporariamente indisponivel.'
     });
    }

    console.error(
     'TICKET_PAYMENT_GATEWAY_ERROR',
     err
    );

    return res.status(502).json({
     error:'PAYMENT_GATEWAY_ERROR',
     message:'Nao foi possivel iniciar o pagamento.'
    });
   }

  return res.status(201).json({
   ...db.prepare(`
    SELECT *
    FROM ticket_orders
    WHERE id=?
   `).get(info.lastInsertRowid),
   paymentConfigured:!!pay
  });

 }catch(e){
  console.error(
   'CUSTOMER_LINKED_PUBLIC_BUY_ERROR',
   e
  );

  res.status(400).json({
   error:e.message
  });
 }
});
 app.get('/api/public/ticket-orders/:code',async(req,res)=>{const o=db.prepare('SELECT * FROM ticket_orders WHERE order_code=?').get(txt(req.params.code));if(!o)return res.status(404).json({error:'COMPRA_NAO_ENCONTRADA'});let tickets=o.payment_status==='PAID'?db.prepare('SELECT ticket_code,attendee_name,ticket_type,price,checkin_at FROM tickets WHERE ticket_order_id=?').all(o.id):[];tickets=await Promise.all(tickets.map(async t=>({...t,qr_image:await QRCode.toDataURL(t.ticket_code,{width:360,margin:2,errorCorrectionLevel:'M'})})));res.json({...o,tickets})});
 app.post('/api/webhooks/asaas',(req,res)=>{try{const expected=asaasWebhookToken(),received=req.headers['asaas-access-token'];if(!expected)return res.status(503).json({error:'WEBHOOK_TOKEN_NOT_CONFIGURED'});if(received!==expected)return res.status(401).json({error:'INVALID_WEBHOOK_TOKEN'});const ev=txt(req.body?.event),p=req.body?.payment||{},ref=txt(p.externalReference),eventId=txt(req.body?.id)||`${ev}:${txt(p.id)}:${txt(p.status)}`;const seen=db.prepare('SELECT event_id FROM asaas_webhook_events WHERE event_id=?').get(eventId);if(seen)return res.json({received:true,duplicate:true});db.prepare('INSERT INTO asaas_webhook_events(event_id,event_type,payment_id,external_reference) VALUES(?,?,?,?)').run(eventId,ev,txt(p.id)||null,ref||null);if(['PAYMENT_RECEIVED','PAYMENT_CONFIRMED'].includes(ev)){if(ref.startsWith('ORDER:'))activatePublicOrder(n(ref.split(':')[1]));if(ref.startsWith('TICKET:'))activateTicketOrder(n(ref.split(':')[1]))}res.json({received:true})}catch(e){res.status(500).json({error:e.message})}});
 app.get('/api/v12/growth',auth,tenantContext,minRole(55),(req,res)=>{const days=db.prepare(`SELECT strftime('%w',s.created_at,'localtime') dow,COUNT(*) sales,COALESCE(SUM(s.total),0) revenue FROM sales s WHERE s.status='PAID' AND s.tenant_id=? AND datetime(s.created_at)>=datetime('now','-56 days') GROUP BY dow`).all(req.tenantId);const products=db.prepare(`SELECT p.id,p.name,p.category,p.stock,p.minimum_stock,p.cost,p.price,p.target_margin,p.suggested_price,p.unit_type,p.package_ml,p.dose_ml,p.stock_factor,p.stock_unit,COALESCE(SUM(CASE WHEN datetime(s.created_at)>=datetime('now','-30 days') THEN si.qty ELSE 0 END),0) qty30,COALESCE(SUM(CASE WHEN datetime(s.created_at)>=datetime('now','-30 days') THEN si.qty*si.unit_price ELSE 0 END),0) revenue30 FROM products p LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.status='PAID' AND s.tenant_id=? WHERE p.active=1 AND p.tenant_id=? GROUP BY p.id ORDER BY qty30 DESC`).all(req.tenantId,req.tenantId);const pricingPolicy=db.prepare('SELECT * FROM tenant_pricing_policies WHERE tenant_id=?').get(req.tenantId)||{tenant_id:req.tenantId,default_margin:55,min_margin:35,rounding:.5};
const growthPriceSuggestion=(cost,margin,rounding=.5)=>{cost=n(cost);margin=Math.min(95,Math.max(1,n(margin)));if(cost<=0)return 0;let price=cost/(1-margin/100);rounding=Math.max(.01,n(rounding));return Math.round((Math.ceil(price/rounding)*rounding)*100)/100};
const recommendations=products.map(p=>{
const packageMl=n(p.package_ml),doseMl=n(p.dose_ml),factor=n(p.stock_factor)||1;
const fractionConfigured=packageMl>0&&doseMl>0&&packageMl>=doseMl;
const dosesPerPackage=fractionConfigured?(packageMl/doseMl)*factor:1;
const effectiveCost=fractionConfigured&&dosesPerPackage>0?n(p.cost)/dosesPerPackage:n(p.cost);
const targetMargin=n(p.target_margin)||n(pricingPolicy.default_margin)||55;
const suggestedPrice=growthPriceSuggestion(effectiveCost,targetMargin,pricingPolicy.rounding);
const currentMargin=n(p.price)>0?Math.round(((n(p.price)-effectiveCost)/n(p.price)*100)*100)/100:0;
const priceGap=Math.round((suggestedPrice-n(p.price))*100)/100;
const pricingMode=fractionConfigured?'FRACTION':'UNIT';
const fractionNeedsConfig=!fractionConfigured&&n(p.cost)>n(p.price)*2;
const daily=n(p.qty30)/30,cover=daily>0?n(p.stock)/daily:999,target=Math.max(n(p.minimum_stock),daily*7),buy=Math.max(0,Math.ceil(target-n(p.stock)));let action='MANTER';if(daily===0&&n(p.stock)>0)action='NAO_COMPRAR';else if(cover<3)action='COMPRAR_URGENTE';else if(cover<7)action='COMPRAR';else if(cover>21)action='REDUZIR_COMPRA';return{...p,effective_cost:Math.round(effectiveCost*100)/100,pricing_mode:pricingMode,fraction_configured:fractionConfigured,fraction_needs_config:fractionNeedsConfig,doses_per_package:Math.round(dosesPerPackage*100)/100,target_margin:targetMargin,current_margin:currentMargin,suggested_price:suggestedPrice,price_gap:priceGap,daily_avg:daily,coverage_days:cover===999?null:cover,recommended_stock:target,recommended_buy:buy,action}});const names=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];const week=Array.from({length:7},(_,i)=>{const r=days.find(x=>n(x.dow)===i)||{sales:0,revenue:0};return{dow:i,day:names[i],sales:n(r.sales),revenue:n(r.revenue)}});const avg=week.reduce((s,x)=>s+x.revenue,0)/7;const weak=week.filter(x=>x.revenue<avg*.75).map(x=>({...x,idea:`Dia abaixo da média: criar ação com produto de boa margem e estoque disponível para ${x.day}.`}));res.json({generated_at:new Date().toISOString(),week,weekly_average:avg,weak_days:weak,top:products.slice(0,8),low:[...products].sort((a,b)=>n(a.qty30)-n(b.qty30)).slice(0,8),purchasing:recommendations.sort((a,b)=>n(b.recommended_buy)-n(a.recommended_buy))})});
 app.patch('/api/v12/events/:id',auth,tenantContext,minRole(60),(req,res)=>{const b=req.body||{};db.prepare(`UPDATE events SET public_sales=COALESCE(?,public_sales),sales_starts_at=COALESCE(?,sales_starts_at),sales_ends_at=COALESCE(?,sales_ends_at),description=COALESCE(?,description),image_url=COALESCE(?,image_url),status=COALESCE(?,status),ends_at=COALESCE(?,ends_at) WHERE id=?`).run(b.public_sales==null?null:(b.public_sales?1:0),b.sales_starts_at??null,b.sales_ends_at??null,b.description??null,b.image_url??null,b.status??null,b.ends_at??null,n(req.params.id));audit(req.user.id,'UPDATE','EVENT_PUBLIC',req.params.id,b);res.json({ok:true})});
}


