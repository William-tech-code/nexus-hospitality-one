import {db} from './db.js';

const n=v=>Number(v||0);
const round=(v,d=2)=>{const p=10**d;return Math.round((n(v)+Number.EPSILON)*p)/p};
function addColumn(table,name,definition){try{db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run()}catch(e){if(!String(e.message).includes('duplicate column name'))throw e}}

export function initSuiteV06(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_profiles(
      product_id INTEGER PRIMARY KEY,
      purchase_unit TEXT NOT NULL DEFAULT 'UNIDADE',
      base_unit TEXT NOT NULL DEFAULT 'UNIT',
      content_base REAL NOT NULL DEFAULT 1,
      purchase_qty REAL NOT NULL DEFAULT 0,
      purchase_total REAL NOT NULL DEFAULT 0,
      closed_units REAL NOT NULL DEFAULT 0,
      open_base REAL NOT NULL DEFAULT 0,
      dose_size REAL NOT NULL DEFAULT 0,
      sale_dose_price REAL NOT NULL DEFAULT 0,
      sale_package_price REAL NOT NULL DEFAULT 0,
      sell_dose INTEGER NOT NULL DEFAULT 0,
      sell_package INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cash_movements(
      id INTEGER PRIMARY KEY AUTOINCREMENT,cash_session_id INTEGER NOT NULL,user_id INTEGER,
      type TEXT NOT NULL,amount REAL NOT NULL,description TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(cash_session_id) REFERENCES cash_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS customers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT,email TEXT,birthday TEXT,
      notes TEXT,total_spent REAL NOT NULL DEFAULT 0,visits INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reservations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,customer_id INTEGER,customer_name TEXT NOT NULL,phone TEXT,
      reserved_at TEXT NOT NULL,party_size INTEGER NOT NULL DEFAULT 2,table_id INTEGER,status TEXT NOT NULL DEFAULT 'CONFIRMED',
      notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id),FOREIGN KEY(table_id) REFERENCES dining_tables(id)
    );
    CREATE TABLE IF NOT EXISTS delivery_orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,phone TEXT,order_type TEXT NOT NULL DEFAULT 'DELIVERY',
      address TEXT,status TEXT NOT NULL DEFAULT 'NEW',total REAL NOT NULL DEFAULT 0,payment_method TEXT,notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS fiscal_captures(
      id INTEGER PRIMARY KEY AUTOINCREMENT,supplier TEXT,document_number TEXT,document_type TEXT NOT NULL DEFAULT 'NOTA',
      issue_date TEXT,total REAL NOT NULL DEFAULT 0,image_url TEXT,status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS event_costs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'GERAL',
      amount REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS social_actions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,event_date TEXT,goal_amount REAL NOT NULL DEFAULT 0,
      received_amount REAL NOT NULL DEFAULT 0,spent_amount REAL NOT NULL DEFAULT 0,beneficiaries INTEGER NOT NULL DEFAULT 0,
      notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  addColumn('sale_items','sale_mode',"TEXT NOT NULL DEFAULT 'UNIT'");
  addColumn('stock_movements','display_unit',"TEXT");
  addColumn('events','revenue_actual',"REAL NOT NULL DEFAULT 0");
  addColumn('events','audience_actual',"INTEGER NOT NULL DEFAULT 0");
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','0.7.0')").run();
}

export function smartProfile(productId){return db.prepare('SELECT * FROM inventory_profiles WHERE product_id=?').get(n(productId))||null}

export function smartSalePrice(productId,mode='UNIT',fallback=0){
  const p=smartProfile(productId);if(!p)return n(fallback);
  const m=String(mode||'UNIT').toUpperCase();
  if(m==='DOSE'&&p.sell_dose)return n(p.sale_dose_price);
  if((m==='BOTTLE'||m==='PACKAGE')&&p.sell_package)return n(p.sale_package_price);
  return n(fallback)||n(p.sale_package_price)||n(p.sale_dose_price);
}

export function smartUnitCost(productId,mode='UNIT',fallback=0){
  const p=smartProfile(productId);if(!p)return n(fallback);
  const packageCost=p.purchase_qty>0?n(p.purchase_total)/n(p.purchase_qty):n(fallback);
  if(String(mode).toUpperCase()==='DOSE'&&n(p.dose_size)>0&&n(p.content_base)>0)return packageCost*(n(p.dose_size)/n(p.content_base));
  return packageCost;
}

function syncProductStock(productId,p){
  const equivalent=n(p.closed_units)+(n(p.content_base)>0?n(p.open_base)/n(p.content_base):0);
  db.prepare('UPDATE products SET stock=?,cost=? WHERE id=?').run(round(equivalent,4),round(p.purchase_qty>0?n(p.purchase_total)/n(p.purchase_qty):0,4),productId);
}

export function consumeSmartInventory(productId,qty,userId,refType,refId,mode='UNIT'){
  const p=smartProfile(productId);if(!p)return false;
  const q=Math.max(0,n(qty));const m=String(mode||'UNIT').toUpperCase();
  let closed=n(p.closed_units),open=n(p.open_base);const content=Math.max(.0001,n(p.content_base));
  if(m==='BOTTLE'||m==='PACKAGE'){
    if(closed<q)throw new Error('Estoque insuficiente de embalagens fechadas.');
    closed-=q;
  }else{
    let use=m==='DOSE'?n(p.dose_size)*q:q;
    if(use<=0)throw new Error('Quantidade de consumo inválida.');
    while(open+1e-9<use&&closed>0){closed-=1;open+=content}
    if(open+1e-9<use)throw new Error(`Estoque insuficiente: faltam ${round(use-open,2)} ${p.base_unit}.`);
    open-=use;
  }
  db.prepare('UPDATE inventory_profiles SET closed_units=?,open_base=?,updated_at=CURRENT_TIMESTAMP WHERE product_id=?').run(round(closed,4),round(open,4),productId);
  const next={...p,closed_units:closed,open_base:open};syncProductStock(productId,next);
  try{db.prepare("INSERT INTO stock_movements(product_id,type,qty,reference_type,reference_id,user_id,notes,display_unit) VALUES(?,'SMART_SALE',?,?,?,?,?,?)").run(productId,-q,refType,String(refId),userId,`Baixa inteligente ${m}`,m==='DOSE'?'DOSE':p.base_unit)}catch{}
  return true;
}

export function registerSuiteV06(app,minRole,audit){
  app.get('/api/inventory/smart',minRole(40),(_req,res)=>{
    const rows=db.prepare(`SELECT p.*,ip.purchase_unit,ip.base_unit,ip.content_base,ip.purchase_qty,ip.purchase_total,ip.closed_units,ip.open_base,ip.dose_size,ip.sale_dose_price,ip.sale_package_price,ip.sell_dose,ip.sell_package
      FROM products p LEFT JOIN inventory_profiles ip ON ip.product_id=p.id WHERE p.active=1 ORDER BY p.category,p.name`).all();
    res.json(rows.map(x=>{
      const packageCost=n(x.purchase_qty)>0?n(x.purchase_total)/n(x.purchase_qty):n(x.cost);
      const totalBase=n(x.closed_units)*n(x.content_base)+n(x.open_base);
      return {...x,package_cost:round(packageCost),cost_per_base:n(x.content_base)>0?round(packageCost/n(x.content_base),4):packageCost,total_base:round(totalBase,2),doses_available:n(x.dose_size)>0?Math.floor(totalBase/n(x.dose_size)):0,cost_per_dose:n(x.dose_size)>0&&n(x.content_base)>0?round(packageCost/n(x.content_base)*n(x.dose_size)):0};
    }));
  });

  app.post('/api/inventory/smart-product',minRole(55),(req,res)=>{
    const b=req.body||{};const name=String(b.name||'').trim();if(!name)return res.status(400).json({error:'NAME_REQUIRED'});
    const purchaseQty=Math.max(0,n(b.purchase_qty));const purchaseTotal=Math.max(0,n(b.purchase_total));
    const unit=String(b.package_unit||'ML').toUpperCase();let content=n(b.package_size)||1;let baseUnit='UNIT';
    if(unit==='L'){content*=1000;baseUnit='ML'}else if(unit==='ML')baseUnit='ML';else if(unit==='KG'){content*=1000;baseUnit='G'}else if(unit==='G')baseUnit='G';
    const dose=n(b.dose_size);const packageCost=purchaseQty>0?purchaseTotal/purchaseQty:0;
    const stockUnit=baseUnit==='ML'?'GARRAFA':baseUnit==='G'?'EMBALAGEM':'UN';
    const info=db.prepare(`INSERT INTO products(name,category,barcode,image_url,description,unit_type,package_ml,dose_ml,price,cost,stock,minimum_stock,stock_unit)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(name,String(b.category||'Bebidas'),b.barcode||null,b.image_url||null,String(b.description||''),baseUnit==='ML'?'BOTTLE':'UNIT',baseUnit==='ML'?content:null,dose||null,n(b.sale_dose_price)||n(b.sale_package_price),packageCost,purchaseQty,n(b.minimum_stock||0),stockUnit);
    db.prepare(`INSERT INTO inventory_profiles(product_id,purchase_unit,base_unit,content_base,purchase_qty,purchase_total,closed_units,open_base,dose_size,sale_dose_price,sale_package_price,sell_dose,sell_package)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(info.lastInsertRowid,String(b.purchase_unit||'GARRAFA'),baseUnit,content,purchaseQty,purchaseTotal,purchaseQty,0,dose,n(b.sale_dose_price),n(b.sale_package_price),b.sell_dose?1:0,b.sell_package===false?0:1);
    audit(req.user.id,'CREATE','SMART_PRODUCT',info.lastInsertRowid,{name,purchaseQty,purchaseTotal});
    res.status(201).json({id:info.lastInsertRowid,ok:true});
  });

  app.patch('/api/inventory/:id/profile',minRole(55),(req,res)=>{
    const id=n(req.params.id),cur=smartProfile(id);if(!cur)return res.status(404).json({error:'SMART_PROFILE_NOT_FOUND'});const b=req.body||{};
    const next={...cur,...b};db.prepare(`UPDATE inventory_profiles SET purchase_unit=?,base_unit=?,content_base=?,purchase_qty=?,purchase_total=?,closed_units=?,open_base=?,dose_size=?,sale_dose_price=?,sale_package_price=?,sell_dose=?,sell_package=?,updated_at=CURRENT_TIMESTAMP WHERE product_id=?`).run(String(next.purchase_unit),String(next.base_unit),n(next.content_base),n(next.purchase_qty),n(next.purchase_total),n(next.closed_units),n(next.open_base),n(next.dose_size),n(next.sale_dose_price),n(next.sale_package_price),next.sell_dose?1:0,next.sell_package?1:0,id);syncProductStock(id,next);audit(req.user.id,'UPDATE','SMART_INVENTORY',id);res.json({ok:true});
  });

  app.post('/api/cash-movements',minRole(50),(req,res)=>{const cs=db.prepare("SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get();if(!cs)return res.status(409).json({error:'CASH_SESSION_REQUIRED'});const type=String(req.body?.type||'').toUpperCase();if(!['SUPRIMENTO','SANGRIA'].includes(type))return res.status(400).json({error:'INVALID_CASH_MOVEMENT'});const amount=Math.max(0,n(req.body?.amount));if(!amount)return res.status(400).json({error:'AMOUNT_REQUIRED'});const info=db.prepare('INSERT INTO cash_movements(cash_session_id,user_id,type,amount,description) VALUES(?,?,?,?,?)').run(cs.id,req.user.id,type,amount,String(req.body?.description||''));audit(req.user.id,'CREATE',type,info.lastInsertRowid,{amount});res.status(201).json({id:info.lastInsertRowid,ok:true})});
  app.get('/api/cash-movements/current',minRole(50),(_req,res)=>{const cs=db.prepare("SELECT id FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get();res.json(cs?db.prepare('SELECT * FROM cash_movements WHERE cash_session_id=? ORDER BY id DESC').all(cs.id):[])});

  app.get('/api/customers',minRole(40),(_req,res)=>res.json(db.prepare('SELECT * FROM customers WHERE active=1 ORDER BY total_spent DESC,name').all()));
  app.post('/api/customers',minRole(40),(req,res)=>{const b=req.body||{};if(!String(b.name||'').trim())return res.status(400).json({error:'NAME_REQUIRED'});const i=db.prepare('INSERT INTO customers(name,phone,email,birthday,notes) VALUES(?,?,?,?,?)').run(String(b.name).trim(),b.phone||null,b.email||null,b.birthday||null,b.notes||null);audit(req.user.id,'CREATE','CUSTOMER',i.lastInsertRowid);res.status(201).json(db.prepare('SELECT * FROM customers WHERE id=?').get(i.lastInsertRowid))});

  app.get('/api/reservations',minRole(40),(_req,res)=>res.json(db.prepare(`SELECT r.*,t.label table_label FROM reservations r LEFT JOIN dining_tables t ON t.id=r.table_id ORDER BY datetime(r.reserved_at) ASC`).all()));
  app.post('/api/reservations',minRole(40),(req,res)=>{const b=req.body||{};if(!b.customer_name||!b.reserved_at)return res.status(400).json({error:'RESERVATION_DATA_REQUIRED'});const i=db.prepare('INSERT INTO reservations(customer_id,customer_name,phone,reserved_at,party_size,table_id,status,notes) VALUES(?,?,?,?,?,?,?,?)').run(b.customer_id||null,String(b.customer_name),b.phone||null,b.reserved_at,n(b.party_size)||2,b.table_id||null,String(b.status||'CONFIRMED'),b.notes||null);audit(req.user.id,'CREATE','RESERVATION',i.lastInsertRowid);res.status(201).json({id:i.lastInsertRowid,ok:true})});
  app.patch('/api/reservations/:id/status',minRole(40),(req,res)=>{db.prepare('UPDATE reservations SET status=? WHERE id=?').run(String(req.body?.status||'CONFIRMED'),n(req.params.id));audit(req.user.id,'UPDATE_STATUS','RESERVATION',req.params.id,{status:req.body?.status});res.json({ok:true})});

  app.get('/api/delivery',minRole(40),(_req,res)=>res.json(db.prepare('SELECT * FROM delivery_orders ORDER BY id DESC LIMIT 100').all()));
  app.post('/api/delivery',minRole(40),(req,res)=>{const b=req.body||{};if(!b.customer_name)return res.status(400).json({error:'CUSTOMER_REQUIRED'});const i=db.prepare('INSERT INTO delivery_orders(customer_name,phone,order_type,address,status,total,payment_method,notes) VALUES(?,?,?,?,?,?,?,?)').run(String(b.customer_name),b.phone||null,String(b.order_type||'DELIVERY'),b.address||null,'NEW',n(b.total),b.payment_method||null,b.notes||null);audit(req.user.id,'CREATE','DELIVERY_ORDER',i.lastInsertRowid);res.status(201).json({id:i.lastInsertRowid,ok:true})});
  app.patch('/api/delivery/:id/status',minRole(40),(req,res)=>{db.prepare('UPDATE delivery_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(req.body?.status||'NEW'),n(req.params.id));audit(req.user.id,'UPDATE_STATUS','DELIVERY_ORDER',req.params.id,{status:req.body?.status});res.json({ok:true})});

  app.get('/api/events-v06',minRole(40),(_req,res)=>res.json(db.prepare(`SELECT e.*,COALESCE((SELECT SUM(amount) FROM event_costs c WHERE c.event_id=e.id),0) costs FROM events e ORDER BY COALESCE(starts_at,created_at) DESC`).all()));
  app.post('/api/events-v06',minRole(60),(req,res)=>{const b=req.body||{};if(!b.title)return res.status(400).json({error:'TITLE_REQUIRED'});const i=db.prepare('INSERT INTO events(title,event_type,venue_name,starts_at,status,artist_name,capacity,cost_estimate) VALUES(?,?,?,?,?,?,?,?)').run(String(b.title),String(b.event_type||'SHOW'),b.venue_name||null,b.starts_at||null,String(b.status||'PLANNED'),b.artist_name||null,n(b.capacity),n(b.cost_estimate));audit(req.user.id,'CREATE','EVENT',i.lastInsertRowid);res.status(201).json({id:i.lastInsertRowid,ok:true})});
  app.post('/api/events-v06/:id/costs',minRole(60),(req,res)=>{const b=req.body||{},i=db.prepare('INSERT INTO event_costs(event_id,description,category,amount) VALUES(?,?,?,?)').run(n(req.params.id),String(b.description||'Custo'),String(b.category||'GERAL'),n(b.amount));audit(req.user.id,'CREATE','EVENT_COST',i.lastInsertRowid);res.status(201).json({id:i.lastInsertRowid,ok:true})});

  app.get('/api/fiscal-captures',minRole(70),(_req,res)=>res.json(db.prepare('SELECT * FROM fiscal_captures ORDER BY id DESC LIMIT 100').all()));
  app.post('/api/fiscal-captures',minRole(70),(req,res)=>{const b=req.body||{},i=db.prepare('INSERT INTO fiscal_captures(supplier,document_number,document_type,issue_date,total,image_url,status,notes) VALUES(?,?,?,?,?,?,?,?)').run(b.supplier||null,b.document_number||null,String(b.document_type||'NOTA'),b.issue_date||null,n(b.total),b.image_url||null,'PENDING_CONFIRMATION',b.notes||null);audit(req.user.id,'CREATE','FISCAL_CAPTURE',i.lastInsertRowid);res.status(201).json({id:i.lastInsertRowid,ok:true})});

  app.get('/api/reports/executive',minRole(50),(_req,res)=>{
    const today=db.prepare("SELECT COALESCE(SUM(total),0) revenue,COUNT(*) sales FROM sales WHERE status='PAID' AND date(created_at,'localtime')=date('now','localtime')").get();
    const month=db.prepare("SELECT COALESCE(SUM(total),0) revenue,COUNT(*) sales FROM sales WHERE status='PAID' AND strftime('%Y-%m',created_at,'localtime')=strftime('%Y-%m','now','localtime')").get();
    const expenses=db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE strftime('%Y-%m',created_at,'localtime')=strftime('%Y-%m','now','localtime')").get().total;
    const stock=db.prepare('SELECT COALESCE(SUM(stock*cost),0) capital,COUNT(*) products FROM products WHERE active=1').get();
    const top=db.prepare(`SELECT p.name,SUM(si.qty) qty,SUM(si.qty*si.unit_price) revenue FROM sale_items si JOIN products p ON p.id=si.product_id JOIN sales s ON s.id=si.sale_id WHERE s.status='PAID' GROUP BY p.id ORDER BY revenue DESC LIMIT 8`).all();
    res.json({today:{...today,average_ticket:n(today.sales)?n(today.revenue)/n(today.sales):0},month:{...month,average_ticket:n(month.sales)?n(month.revenue)/n(month.sales):0},expenses:n(expenses),stock,estimated_result:n(month.revenue)-n(expenses),top});
  });
}
