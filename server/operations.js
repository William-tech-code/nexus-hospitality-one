import {db} from './db.js';
import {consumeProduct} from './recipe-engine.js';
import {tenantId} from './tenant-guard.js';

const n=v=>Number(v||0);
function rowOrder(id,tenant){
 return db.prepare(`
  SELECT o.*,dt.label table_name,e.name employee_name
  FROM orders o
  LEFT JOIN dining_tables dt ON dt.id=o.table_id AND dt.tenant_id=o.tenant_id
  LEFT JOIN employees e ON e.id=o.employee_id AND e.tenant_id=o.tenant_id
  WHERE o.id=? AND o.tenant_id=?
 `).get(id,tenant);
}
function recalcOrder(id,tenant){
 const subtotal=n(db.prepare(`
  SELECT COALESCE(SUM(oi.qty*oi.unit_price),0) total
  FROM order_items oi
  JOIN orders o ON o.id=oi.order_id
  WHERE oi.order_id=? AND o.tenant_id=?
 `).get(id,tenant).total);
 db.prepare(`
  UPDATE orders
  SET subtotal=?,updated_at=CURRENT_TIMESTAMP
  WHERE id=? AND tenant_id=?
 `).run(subtotal,id,tenant);
 return subtotal;
}
function orderFull(id,tenant){
 const order=rowOrder(id,tenant);
 if(!order)return null;
 return {
  ...order,
  items:db.prepare(`
   SELECT oi.*,p.name product_name,p.category,p.unit_type,p.dose_ml
   FROM order_items oi
   JOIN products p ON p.id=oi.product_id
   WHERE oi.order_id=?
     AND p.tenant_id=?
   ORDER BY oi.id
  `).all(id,tenant),
  payments:db.prepare(`
   SELECT op.*
   FROM order_payments op
   JOIN orders o ON o.id=op.order_id
   WHERE op.order_id=? AND o.tenant_id=?
   ORDER BY op.id
  `).all(id,tenant)
 };
}
export function registerOperations(app,{minRole,audit}){

 app.get('/api/operations/summary',(req,res)=>{
  const t=tenantId(req);
  const tables=db.prepare("SELECT COUNT(*) total,SUM(status='OCCUPIED') occupied FROM dining_tables WHERE active=1 AND tenant_id=?").get(t);
  const orders=db.prepare("SELECT COUNT(*) open_orders,COALESCE(SUM(subtotal),0) open_value FROM orders WHERE status='OPEN' AND tenant_id=?").get(t);
  const kitchen=db.prepare(`
   SELECT COUNT(*) pending
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   WHERE o.status='OPEN'
     AND o.tenant_id=?
     AND oi.status IN ('NEW','PREPARING','READY')
  `).get(t);
  const low=db.prepare('SELECT COUNT(*) n FROM products WHERE active=1 AND stock<=minimum_stock AND tenant_id=?').get(t).n;
  res.json({
   tables:{total:n(tables.total),occupied:n(tables.occupied)},
   orders:{count:n(orders.open_orders),value:n(orders.open_value)},
   kitchen:n(kitchen.pending),
   lowStock:n(low)
  });
 });

 app.get('/api/tables',(req,res)=>{
  const t=tenantId(req);
  res.json(db.prepare(`
   SELECT dt.*,o.id order_id,o.customer_name,o.subtotal,o.employee_id,e.name employee_name
   FROM dining_tables dt
   LEFT JOIN orders o
     ON o.table_id=dt.id AND o.status='OPEN' AND o.tenant_id=dt.tenant_id
   LEFT JOIN employees e
     ON e.id=o.employee_id AND e.tenant_id=dt.tenant_id
   WHERE dt.active=1 AND dt.tenant_id=?
   ORDER BY dt.id
  `).all(t));
 });

 app.post('/api/tables',minRole(80),(req,res)=>{
  const t=tenantId(req);
  const {label,area='',capacity=4}=req.body||{};
  if(!String(label||'').trim())return res.status(400).json({error:'LABEL_REQUIRED'});
  try{
   const info=db.prepare(
    'INSERT INTO dining_tables(label,area,capacity,tenant_id) VALUES(?,?,?,?)'
   ).run(String(label).trim(),String(area||''),Math.max(1,n(capacity)),t);
   audit(req.user.id,'CREATE','TABLE',info.lastInsertRowid,{label});
   res.status(201).json(
    db.prepare('SELECT * FROM dining_tables WHERE id=? AND tenant_id=?').get(info.lastInsertRowid,t)
   );
  }catch(e){
   res.status(400).json({error:'TABLE_CREATE_ERROR',message:e.message});
  }
 });

 app.post('/api/tables/:id/open',minRole(40),(req,res)=>{
  const t=tenantId(req);
  const table=db.prepare(
   'SELECT * FROM dining_tables WHERE id=? AND active=1 AND tenant_id=?'
  ).get(n(req.params.id),t);

  if(!table)return res.status(404).json({error:'TABLE_NOT_FOUND'});

  const existing=db.prepare(
   "SELECT id FROM orders WHERE table_id=? AND status='OPEN' AND tenant_id=?"
  ).get(table.id,t);

  if(existing)return res.status(409).json({
   error:'TABLE_ALREADY_OPEN',
   order:orderFull(existing.id,t)
  });

  let emp=null;
  if(req.body?.employee_id){
   emp=db.prepare(
    'SELECT id FROM employees WHERE id=? AND tenant_id=?'
   ).get(n(req.body.employee_id),t)?.id||null;
   if(!emp)return res.status(404).json({error:'EMPLOYEE_NOT_FOUND'});
  }else{
   emp=db.prepare(
    'SELECT id FROM employees WHERE user_id=? AND tenant_id=?'
   ).get(req.user.id,t)?.id||null;
  }

  const info=db.prepare(`
   INSERT INTO orders(
    label,customer_name,status,subtotal,
    employee_id,table_id,notes,tenant_id
   )
   VALUES(?,?,'OPEN',0,?,?,?,?)
  `).run(
   table.label,
   String(req.body?.customer_name||''),
   emp,
   table.id,
   String(req.body?.notes||''),
   t
  );

  db.prepare(
   "UPDATE dining_tables SET status='OCCUPIED' WHERE id=? AND tenant_id=?"
  ).run(table.id,t);

  audit(req.user.id,'OPEN','TABLE',table.id,{order_id:info.lastInsertRowid});
  res.status(201).json(orderFull(info.lastInsertRowid,t));
 });

 app.get('/api/orders-v03',(req,res)=>{
  const t=tenantId(req);
  res.json(db.prepare(`
   SELECT o.*,dt.label table_name,e.name employee_name,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) item_count
   FROM orders o
   LEFT JOIN dining_tables dt ON dt.id=o.table_id AND dt.tenant_id=o.tenant_id
   LEFT JOIN employees e ON e.id=o.employee_id AND e.tenant_id=o.tenant_id
   WHERE o.status='OPEN' AND o.tenant_id=?
   ORDER BY o.updated_at DESC
  `).all(t));
 });

 app.get('/api/orders-v03/:id',(req,res)=>{
  const o=orderFull(n(req.params.id),tenantId(req));
  return o?res.json(o):res.status(404).json({error:'ORDER_NOT_FOUND'});
 });

 app.post('/api/orders-v03/:id/items',minRole(30),(req,res)=>{
  const t=tenantId(req);
  const id=n(req.params.id);
  const order=rowOrder(id,t);

  if(!order||order.status!=='OPEN')
   return res.status(404).json({error:'ORDER_NOT_FOUND'});

  const p=db.prepare(
   'SELECT * FROM products WHERE id=? AND active=1 AND tenant_id=?'
  ).get(n(req.body?.product_id),t);

  if(!p)return res.status(404).json({error:'PRODUCT_NOT_FOUND'});

  const qty=Math.max(.01,n(req.body?.qty||1));
  const factor=Math.max(.0001,n(p.stock_factor||1));

  const reserved=n(db.prepare(`
   SELECT COALESCE(SUM(oi.qty*COALESCE(p.stock_factor,1)),0) total
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   JOIN products p ON p.id=oi.product_id
   WHERE o.status='OPEN'
     AND o.tenant_id=?
     AND p.tenant_id=?
     AND oi.product_id=?
  `).get(t,t,p.id).total);

  if(n(p.stock)<reserved+qty*factor)
   return res.status(409).json({
    error:'STOCK_INSUFFICIENT',
    message:`Estoque insuficiente para ${p.name}.`
   });

  let emp=order.employee_id||null;
  if(req.body?.employee_id){
   emp=db.prepare(
    'SELECT id FROM employees WHERE id=? AND tenant_id=?'
   ).get(n(req.body.employee_id),t)?.id||null;
   if(!emp)return res.status(404).json({error:'EMPLOYEE_NOT_FOUND'});
  }

  const info=db.prepare(`
   INSERT INTO order_items(
    order_id,product_id,qty,unit_price,
    notes,status,employee_id
   )
   VALUES(?,?,?,?,?,'NEW',?)
  `).run(id,p.id,qty,n(p.price),String(req.body?.notes||''),emp);

  recalcOrder(id,t);
  audit(req.user.id,'ADD_ITEM','ORDER',id,{
   item_id:info.lastInsertRowid,
   product:p.name,
   qty
  });

  res.status(201).json(orderFull(id,t));
 });

 app.patch('/api/order-items/:id/status',minRole(30),(req,res)=>{
  const t=tenantId(req);
  const allowed=['NEW','PREPARING','READY','SERVED','CANCELLED'];
  const status=String(req.body?.status||'').toUpperCase();

  if(!allowed.includes(status))
   return res.status(400).json({error:'INVALID_STATUS'});

  const item=db.prepare(`
   SELECT oi.*
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   WHERE oi.id=? AND o.tenant_id=?
  `).get(n(req.params.id),t);

  if(!item)return res.status(404).json({error:'ITEM_NOT_FOUND'});

  db.prepare(`
   UPDATE order_items
   SET status=?
   WHERE id=?
     AND EXISTS(
      SELECT 1 FROM orders o
      WHERE o.id=order_items.order_id AND o.tenant_id=?
     )
  `).run(status,item.id,t);

  audit(req.user.id,'STATUS','ORDER_ITEM',item.id,{status});

  res.json(db.prepare(`
   SELECT oi.*
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   WHERE oi.id=? AND o.tenant_id=?
  `).get(item.id,t));
 });

 app.delete('/api/order-items/:id',minRole(40),(req,res)=>{
  const t=tenantId(req);
  const item=db.prepare(`
   SELECT oi.*
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   WHERE oi.id=? AND o.tenant_id=?
  `).get(n(req.params.id),t);

  if(!item)return res.status(404).json({error:'ITEM_NOT_FOUND'});

  db.prepare('DELETE FROM order_items WHERE id=?').run(item.id);
  recalcOrder(item.order_id,t);

  audit(req.user.id,'DELETE','ORDER_ITEM',item.id);
  res.json(orderFull(item.order_id,t));
 });

 app.post('/api/orders-v03/:id/transfer',minRole(40),(req,res)=>{
  const t=tenantId(req);
  const id=n(req.params.id);
  const to=n(req.body?.table_id);
  const order=rowOrder(id,t);
  const target=db.prepare(
   'SELECT * FROM dining_tables WHERE id=? AND active=1 AND tenant_id=?'
  ).get(to,t);

  if(!order||!target)return res.status(404).json({error:'NOT_FOUND'});

  const busy=db.prepare(
   "SELECT id FROM orders WHERE table_id=? AND status='OPEN' AND id<>? AND tenant_id=?"
  ).get(to,id,t);

  if(busy)return res.status(409).json({error:'TARGET_TABLE_BUSY'});

  if(order.table_id)
   db.prepare(
    "UPDATE dining_tables SET status='FREE' WHERE id=? AND tenant_id=?"
   ).run(order.table_id,t);

  db.prepare(
   "UPDATE dining_tables SET status='OCCUPIED' WHERE id=? AND tenant_id=?"
  ).run(to,t);

  db.prepare(`
   UPDATE orders
   SET table_id=?,label=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=? AND tenant_id=?
  `).run(to,target.label,id,t);

  audit(req.user.id,'TRANSFER','ORDER',id,{to_table:to});
  res.json(orderFull(id,t));
 });

 app.post('/api/orders-v03/:id/split',minRole(40),(req,res)=>{
  const t=tenantId(req);
  const id=n(req.params.id);
  const itemIds=(req.body?.item_ids||[]).map(n).filter(Boolean);

  if(!itemIds.length)
   return res.status(400).json({error:'ITEMS_REQUIRED'});

  const source=rowOrder(id,t);
  if(!source)return res.status(404).json({error:'ORDER_NOT_FOUND'});

  const q=itemIds.map(()=>'?').join(',');

  const valid=db.prepare(`
   SELECT COUNT(*) n
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   WHERE oi.order_id=?
     AND o.tenant_id=?
     AND oi.id IN (${q})
  `).get(id,t,...itemIds).n;

  if(n(valid)!==itemIds.length)
   return res.status(404).json({error:'ORDER_ITEM_NOT_FOUND'});

  const info=db.prepare(`
   INSERT INTO orders(
    label,customer_name,status,subtotal,
    employee_id,notes,tenant_id
   )
   VALUES(?,?,'OPEN',0,?,?,?)
  `).run(
   String(req.body?.label||`${source.label} - Divisão`),
   String(req.body?.customer_name||''),
   source.employee_id,
   'Conta dividida',
   t
  );

  db.prepare(`
   UPDATE order_items
   SET order_id=?
   WHERE order_id=? AND id IN (${q})
  `).run(info.lastInsertRowid,id,...itemIds);

  recalcOrder(id,t);
  recalcOrder(info.lastInsertRowid,t);

  audit(req.user.id,'SPLIT','ORDER',id,{
   new_order_id:info.lastInsertRowid
  });

  res.json({
   source:orderFull(id,t),
   created:orderFull(info.lastInsertRowid,t)
  });
 });

 app.post('/api/orders-v03/:id/close',minRole(40),(req,res)=>{
  const t=tenantId(req);
  const id=n(req.params.id);
  const order=orderFull(id,t);

  if(!order||order.status!=='OPEN')
   return res.status(404).json({error:'ORDER_NOT_FOUND'});

  if(!order.items.length)
   return res.status(400).json({error:'EMPTY_ORDER'});

  const cs=db.prepare(`
   SELECT *
   FROM cash_sessions
   WHERE status='OPEN' AND tenant_id=?
   ORDER BY id DESC LIMIT 1
  `).get(t);

  if(!cs)return res.status(409).json({
   error:'CASH_SESSION_REQUIRED',
   message:'Abra o caixa antes de fechar a comanda.'
  });

  const payment=String(req.body?.payment_method||'DINHEIRO');
  const tip=n(req.body?.tip_amount);

  try{
   const sale=db.transaction(()=>{
    const active=order.items.filter(i=>i.status!=='CANCELLED');
    const total=active.reduce((a,i)=>a+n(i.qty)*n(i.unit_price),0);

    const s=db.prepare(`
     INSERT INTO sales(
      total,payment_method,status,table_label,
      customer_name,cash_session_id,user_id,
      employee_id,tip_amount,tenant_id
     )
     VALUES(?,?,'PAID',?,?,?,?,?,?,?)
    `).run(
     total,payment,
     order.table_name||order.label,
     order.customer_name,
     cs.id,
     req.user.id,
     order.employee_id,
     tip,
     t
    );

    for(const item of active){
     const p=db.prepare(
      'SELECT * FROM products WHERE id=? AND tenant_id=?'
     ).get(item.product_id,t);

     if(!p)throw new Error('TENANT_PRODUCT_NOT_FOUND');

     db.prepare(`
      INSERT INTO sale_items(
       sale_id,product_id,qty,unit_price,unit_cost
      )
      VALUES(?,?,?,?,?)
     `).run(
      s.lastInsertRowid,
      p.id,
      item.qty,
      item.unit_price,
      p.cost
     );

     consumeProduct(
      p.id,
      item.qty,
      req.user.id,
      'ORDER',
      id,
      'UNIT',
      t
     );
    }

    if(order.employee_id&&tip>0)
     db.prepare(`
      INSERT INTO tips(
       sale_id,employee_id,amount,method,status
      )
      VALUES(?,?,?,'ORDER','PENDING')
     `).run(s.lastInsertRowid,order.employee_id,tip);

    db.prepare(`
     UPDATE orders
     SET status='CLOSED',
         closed_at=CURRENT_TIMESTAMP,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND tenant_id=?
    `).run(id,t);

    if(order.table_id)
     db.prepare(
      "UPDATE dining_tables SET status='FREE' WHERE id=? AND tenant_id=?"
     ).run(order.table_id,t);

    return db.prepare(
     'SELECT * FROM sales WHERE id=? AND tenant_id=?'
    ).get(s.lastInsertRowid,t);
   })();

   audit(req.user.id,'CLOSE','ORDER',id,{
    sale_id:sale.id,total:sale.total,payment
   });

   res.json({sale,order:orderFull(id,t)});
  }catch(e){
   res.status(409).json({error:'ORDER_CLOSE_ERROR',message:e.message});
  }
 });

 app.get('/api/kitchen',minRole(30),(req,res)=>{
  const t=tenantId(req);
  res.json(db.prepare(`
   SELECT oi.id,oi.order_id,oi.qty,oi.notes,oi.status,oi.created_at,
          p.name product_name,p.category,o.label order_label,
          dt.label table_name,e.name employee_name
   FROM order_items oi
   JOIN orders o ON o.id=oi.order_id
   JOIN products p ON p.id=oi.product_id AND p.tenant_id=o.tenant_id
   LEFT JOIN dining_tables dt ON dt.id=o.table_id AND dt.tenant_id=o.tenant_id
   LEFT JOIN employees e ON e.id=oi.employee_id AND e.tenant_id=o.tenant_id
   WHERE o.status='OPEN'
     AND o.tenant_id=?
     AND oi.status NOT IN ('SERVED','CANCELLED')
   ORDER BY CASE oi.status
     WHEN 'NEW' THEN 1
     WHEN 'PREPARING' THEN 2
     WHEN 'READY' THEN 3
     ELSE 4 END,oi.id
  `).all(t));
 });

 app.get('/api/beverage-control',minRole(55),(req,res)=>{
  res.json(db.prepare(`
   SELECT id,name,category,unit_type,stock,stock_unit,
          package_ml,dose_ml,stock_factor,price,cost,minimum_stock,
          CASE
           WHEN dose_ml>0 AND stock_unit='ML' THEN stock/dose_ml
           ELSE stock
          END theoretical_servings
   FROM products
   WHERE active=1
     AND tenant_id=?
     AND (
      dose_ml IS NOT NULL OR
      unit_type IN ('DOSE','ML','BOTTLE','KEG')
     )
   ORDER BY category,name
  `).all(tenantId(req)));
 });

 app.patch('/api/products/:id/beverage',minRole(55),(req,res)=>{
  const t=tenantId(req);
  const id=n(req.params.id);
  const p=db.prepare(
   'SELECT * FROM products WHERE id=? AND tenant_id=?'
  ).get(id,t);

  if(!p)return res.status(404).json({error:'PRODUCT_NOT_FOUND'});

  const dose=n(req.body?.dose_ml||p.dose_ml||1);
  const stockUnit=String(req.body?.stock_unit||'ML').toUpperCase();
  const factor=stockUnit==='ML'
   ? dose
   : n(req.body?.stock_factor||1);

  db.prepare(`
   UPDATE products
   SET unit_type=?,package_ml=?,dose_ml=?,stock_unit=?,stock_factor=?
   WHERE id=? AND tenant_id=?
  `).run(
   String(req.body?.unit_type||'DOSE'),
   n(req.body?.package_ml||p.package_ml),
   dose,stockUnit,factor,id,t
  );

  audit(req.user.id,'UPDATE','BEVERAGE',id,{dose,stockUnit,factor});

  res.json(
   db.prepare('SELECT * FROM products WHERE id=? AND tenant_id=?').get(id,t)
  );
 });

 app.post('/api/products/:id/stock-adjust',minRole(55),(req,res)=>{
  const t=tenantId(req);
  const id=n(req.params.id);
  const qty=n(req.body?.qty);
  const p=db.prepare(
   'SELECT * FROM products WHERE id=? AND tenant_id=?'
  ).get(id,t);

  if(!p)return res.status(404).json({error:'PRODUCT_NOT_FOUND'});
  if(!qty)return res.status(400).json({error:'QTY_REQUIRED'});
  if(n(p.stock)+qty<0)return res.status(409).json({error:'NEGATIVE_STOCK'});

  db.prepare(
   'UPDATE products SET stock=stock+? WHERE id=? AND tenant_id=?'
  ).run(qty,id,t);

  db.prepare(`
   INSERT INTO stock_movements(
    product_id,type,qty,reference_type,
    reference_id,user_id,notes
   )
   VALUES(?,'ADJUSTMENT',?,'MANUAL',NULL,?,?)
  `).run(id,qty,req.user.id,String(req.body?.notes||'Ajuste manual'));

  audit(req.user.id,'ADJUST','STOCK',id,{qty});

  res.json(
   db.prepare('SELECT * FROM products WHERE id=? AND tenant_id=?').get(id,t)
  );
 });

 app.get('/api/suppliers-v03',minRole(55),(req,res)=>{
  res.json(
   db.prepare(
    'SELECT * FROM suppliers WHERE active=1 AND tenant_id=? ORDER BY name'
   ).all(tenantId(req))
  );
 });

 app.post('/api/suppliers-v03',minRole(55),(req,res)=>{
  const t=tenantId(req);
  const {name,contact='',phone='',email=''}=req.body||{};

  if(!String(name||'').trim())
   return res.status(400).json({error:'NAME_REQUIRED'});

  const info=db.prepare(`
   INSERT INTO suppliers(name,contact,phone,email,tenant_id)
   VALUES(?,?,?,?,?)
  `).run(String(name).trim(),contact,phone,email,t);

  audit(req.user.id,'CREATE','SUPPLIER',info.lastInsertRowid,{name});

  res.status(201).json(
   db.prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
    .get(info.lastInsertRowid,t)
  );
 });

 app.get('/api/quotes-v03',minRole(55),(req,res)=>{
  const t=tenantId(req);
  res.json(db.prepare(`
   SELECT q.*,COUNT(qi.id) offers,MIN(qi.unit_price) best_unit_price
   FROM purchase_quotes q
   LEFT JOIN quote_items qi ON qi.quote_id=q.id
   WHERE q.tenant_id=?
   GROUP BY q.id
   ORDER BY q.id DESC
  `).all(t));
 });

 app.post('/api/quotes-v03',minRole(55),(req,res)=>{
  const t=tenantId(req);
  const title=String(req.body?.title||'').trim();

  if(!title)return res.status(400).json({error:'TITLE_REQUIRED'});

  const info=db.prepare(
   "INSERT INTO purchase_quotes(title,status,tenant_id) VALUES(?,'OPEN',?)"
  ).run(title,t);

  audit(req.user.id,'CREATE','QUOTE',info.lastInsertRowid,{title});

  res.status(201).json(
   db.prepare('SELECT * FROM purchase_quotes WHERE id=? AND tenant_id=?')
    .get(info.lastInsertRowid,t)
  );
 });

 app.get('/api/quotes-v03/:id',(req,res)=>{
  const t=tenantId(req);
  const q=db.prepare(
   'SELECT * FROM purchase_quotes WHERE id=? AND tenant_id=?'
  ).get(n(req.params.id),t);

  if(!q)return res.status(404).json({error:'QUOTE_NOT_FOUND'});

  const items=db.prepare(`
   SELECT qi.*,s.name supplier_name,p.name product_name,
          (qi.qty*qi.unit_price+qi.freight) total_offer
   FROM quote_items qi
   JOIN suppliers s
     ON s.id=qi.supplier_id AND s.tenant_id=?
   LEFT JOIN products p
     ON p.id=qi.product_id AND p.tenant_id=?
   WHERE qi.quote_id=?
   ORDER BY description,total_offer
  `).all(t,t,q.id);

  res.json({...q,items});
 });

 app.post('/api/quotes-v03/:id/items',minRole(55),(req,res)=>{
  const t=tenantId(req);
  const q=db.prepare(
   'SELECT * FROM purchase_quotes WHERE id=? AND tenant_id=?'
  ).get(n(req.params.id),t);

  if(!q)return res.status(404).json({error:'QUOTE_NOT_FOUND'});

  const {
   supplier_id,
   product_id=null,
   description='',
   qty=1,
   unit_price=0,
   freight=0,
   lead_days=null,
   notes=''
  }=req.body||{};

  if(!supplier_id||!String(description||'').trim())
   return res.status(400).json({error:'INVALID_QUOTE_ITEM'});

  const supplier=db.prepare(
   'SELECT id FROM suppliers WHERE id=? AND tenant_id=?'
  ).get(n(supplier_id),t);

  if(!supplier)return res.status(404).json({error:'SUPPLIER_NOT_FOUND'});

  if(product_id){
   const product=db.prepare(
    'SELECT id FROM products WHERE id=? AND tenant_id=?'
   ).get(n(product_id),t);

   if(!product)return res.status(404).json({error:'PRODUCT_NOT_FOUND'});
  }

  const info=db.prepare(`
   INSERT INTO quote_items(
    quote_id,supplier_id,product_id,description,
    qty,unit_price,freight,lead_days,notes
   )
   VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
   q.id,
   supplier.id,
   product_id?n(product_id):null,
   description,
   n(qty),
   n(unit_price),
   n(freight),
   lead_days==null?null:n(lead_days),
   notes
  );

  audit(req.user.id,'ADD_OFFER','QUOTE',q.id,{
   item_id:info.lastInsertRowid
  });

  res.status(201).json({id:info.lastInsertRowid});
 });

 app.get('/api/quotes-v03/:id/best',minRole(55),(req,res)=>{
  const t=tenantId(req);
  const q=db.prepare(
   'SELECT id FROM purchase_quotes WHERE id=? AND tenant_id=?'
  ).get(n(req.params.id),t);

  if(!q)return res.status(404).json({error:'QUOTE_NOT_FOUND'});

  res.json(db.prepare(`
   SELECT *
   FROM (
    SELECT qi.*,s.name supplier_name,
           (qi.qty*qi.unit_price+qi.freight) total_offer,
           ROW_NUMBER() OVER(
            PARTITION BY lower(qi.description)
            ORDER BY
             (qi.qty*qi.unit_price+qi.freight),
             COALESCE(qi.lead_days,999)
           ) rn
    FROM quote_items qi
    JOIN suppliers s
      ON s.id=qi.supplier_id
     AND s.tenant_id=?
    WHERE qi.quote_id=?
   )
   WHERE rn=1
   ORDER BY description
  `).all(t,q.id));
 });
}