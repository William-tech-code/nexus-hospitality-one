import {db} from './db.js';
import {consumeSmartInventory} from './suite-v06.js';
import {tenantId,tenantProduct,tenantOpenCash} from './tenant-guard.js';

const n=v=>Number(v||0);

function recipe(id,tenant){
 const r=db.prepare(`
   SELECT r.*,p.name product_name,p.price product_price
   FROM recipes r
   JOIN products p ON p.id=r.product_id
   WHERE r.id=? AND p.tenant_id=?
 `).get(n(id),n(tenant));

 if(!r)return null;

 r.items=db.prepare(`
   SELECT ri.*,p.name ingredient_name,p.cost ingredient_cost,
          p.stock,p.stock_unit,p.dose_ml
   FROM recipe_items ri
   JOIN products p ON p.id=ri.ingredient_product_id
   WHERE ri.recipe_id=? AND p.tenant_id=?
   ORDER BY ri.id
 `).all(r.id,n(tenant));

 r.cost=r.items.reduce(
   (a,i)=>a+n(i.qty)*(1+n(i.waste_percent)/100)*n(i.ingredient_cost),0
 )/Math.max(.0001,n(r.yield_qty));

 r.margin=n(r.product_price)-r.cost;
 r.margin_percent=n(r.product_price)
   ? r.margin/n(r.product_price)*100
   : 0;

 return r;
}

/*
 * tenant is mandatory.
 * No inventory consumption is allowed without server-resolved tenant context.
 */
export function consumeProduct(
 productId,
 qty,
 userId,
 refType,
 refId,
 mode='UNIT',
 tenant=null
){
 const tenantValue=n(tenant);

 if(!tenantValue){
   throw new Error('TENANT_CONTEXT_REQUIRED');
 }

 const p=db.prepare(
   'SELECT * FROM products WHERE id=? AND tenant_id=?'
 ).get(n(productId),tenantValue);

 if(!p)throw new Error('Produto não encontrado');

 const r=db.prepare(`
   SELECT r.id,r.yield_qty
   FROM recipes r
   JOIN products rp ON rp.id=r.product_id
   WHERE r.product_id=?
     AND r.active=1
     AND rp.tenant_id=?
 `).get(p.id,tenantValue);

 if(!r){
   /*
    * Smart inventory receives a product already proven to belong
    * to this tenant. The fallback UPDATE is tenant-scoped as well.
    */
   if(consumeSmartInventory(
     p.id,qty,userId,refType,refId,mode,tenantValue
   )) return;

   const use=n(qty)*Math.max(.0001,n(p.stock_factor||1));

   if(n(p.stock)<use)
     throw new Error(`Estoque insuficiente: ${p.name}`);

   const changed=db.prepare(`
     UPDATE products
     SET stock=stock-?
     WHERE id=? AND tenant_id=?
   `).run(use,p.id,tenantValue);

   if(changed.changes!==1)
     throw new Error('TENANT_PRODUCT_UPDATE_BLOCKED');

   db.prepare(`
     INSERT INTO stock_movements(
       product_id,type,qty,reference_type,
       reference_id,user_id,notes
     )
     VALUES(?,'SALE',?,?,?,?,'Baixa automática')
   `).run(
     p.id,-use,refType,String(refId),userId
   );

   return;
 }

 const items=db.prepare(`
   SELECT ri.*,p.name,p.stock,p.tenant_id
   FROM recipe_items ri
   JOIN products p ON p.id=ri.ingredient_product_id
   WHERE ri.recipe_id=?
     AND p.tenant_id=?
 `).all(r.id,tenantValue);

 const mult=n(qty)/Math.max(.0001,n(r.yield_qty));

 for(const i of items){
   const use=n(i.qty)*mult*(1+n(i.waste_percent)/100);

   const prof=db.prepare(`
     SELECT ip.product_id
     FROM inventory_profiles ip
     JOIN products p ON p.id=ip.product_id
     WHERE ip.product_id=?
       AND p.tenant_id=?
   `).get(i.ingredient_product_id,tenantValue);

   if(!prof&&n(i.stock)<use)
     throw new Error(`Ingrediente insuficiente: ${i.name}`);
 }

 for(const i of items){
   const use=n(i.qty)*mult*(1+n(i.waste_percent)/100);

   if(consumeSmartInventory(
      i.ingredient_product_id,
      use,
      userId,
      refType,
      refId,
      'BASE',
      tenantValue
    )) continue;

   const changed=db.prepare(`
     UPDATE products
     SET stock=stock-?
     WHERE id=? AND tenant_id=?
   `).run(
     use,
     i.ingredient_product_id,
     tenantValue
   );

   if(changed.changes!==1)
     throw new Error('TENANT_INGREDIENT_UPDATE_BLOCKED');

   db.prepare(`
     INSERT INTO stock_movements(
       product_id,type,qty,reference_type,
       reference_id,user_id,notes
     )
     VALUES(
       ?,'RECIPE_CONSUMPTION',?,?,?,?,
       'Consumo por ficha técnica'
     )
   `).run(
     i.ingredient_product_id,
     -use,
     refType,
     String(refId),
     userId
   );
 }
}

export function registerRecipeEngine(app,minRole,audit){

 app.get('/api/recipes',minRole(40),(req,res)=>{
   const tenant=tenantId(req);

   res.json(db.prepare(`
     SELECT
       r.id,r.product_id,r.title,r.recipe_type,r.yield_qty,
       p.name product_name,p.price product_price,
       (
         SELECT COUNT(*)
         FROM recipe_items x
         WHERE x.recipe_id=r.id
       ) ingredients
     FROM recipes r
     JOIN products p ON p.id=r.product_id
     WHERE r.active=1
       AND p.tenant_id=?
     ORDER BY r.title
   `).all(tenant));
 });

 app.get('/api/recipes/:id',minRole(40),(req,res)=>{
   const r=recipe(req.params.id,tenantId(req));

   return r
     ? res.json(r)
     : res.status(404).json({error:'RECIPE_NOT_FOUND'});
 });

 app.post('/api/recipes',minRole(55),(req,res)=>{
   const tenant=tenantId(req);
   const {
     product_id,
     title,
     recipe_type='FOOD',
     yield_qty=1,
     instructions=''
   }=req.body||{};

   if(!product_id||!title)
     return res.status(400).json({error:'INVALID_RECIPE'});

   const product=tenantProduct(req,product_id);

   if(!product)
     return res.status(404).json({error:'PRODUCT_NOT_FOUND'});

   const info=db.prepare(`
     INSERT INTO recipes(
       product_id,title,recipe_type,yield_qty,instructions
     )
     VALUES(?,?,?,?,?)
     ON CONFLICT(product_id)
     DO UPDATE SET
       title=excluded.title,
       recipe_type=excluded.recipe_type,
       yield_qty=excluded.yield_qty,
       instructions=excluded.instructions,
       updated_at=CURRENT_TIMESTAMP
     RETURNING id
   `).get(
     product.id,
     String(title),
     String(recipe_type),
     n(yield_qty)||1,
     String(instructions)
   );

   audit(req.user.id,'UPSERT','RECIPE',info.id,{title});

   res.status(201).json(recipe(info.id,tenant));
 });

 app.post('/api/recipes/:id/items',minRole(55),(req,res)=>{
   const tenant=tenantId(req);
   const recipeRow=recipe(req.params.id,tenant);

   if(!recipeRow)
     return res.status(404).json({error:'RECIPE_NOT_FOUND'});

   const {
     ingredient_product_id,
     qty,
     unit='UNIT',
     waste_percent=0,
     notes=''
   }=req.body||{};

   if(!ingredient_product_id||n(qty)<=0)
     return res.status(400).json({error:'INVALID_INGREDIENT'});

   const ingredient=tenantProduct(req,ingredient_product_id);

   if(!ingredient)
     return res.status(404).json({error:'PRODUCT_NOT_FOUND'});

   const info=db.prepare(`
     INSERT INTO recipe_items(
       recipe_id,ingredient_product_id,qty,
       unit,waste_percent,notes
     )
     VALUES(?,?,?,?,?,?)
   `).run(
     recipeRow.id,
     ingredient.id,
     n(qty),
     String(unit),
     n(waste_percent),
     String(notes)
   );

   audit(
     req.user.id,
     'ADD_INGREDIENT',
     'RECIPE',
     recipeRow.id,
     {item_id:info.lastInsertRowid}
   );

   res.status(201).json(recipe(recipeRow.id,tenant));
 });

 app.delete('/api/recipes/:id/items/:itemId',minRole(55),(req,res)=>{
   const tenant=tenantId(req);
   const r=recipe(req.params.id,tenant);

   if(!r)
     return res.status(404).json({error:'RECIPE_NOT_FOUND'});

   const item=db.prepare(`
     SELECT ri.id
     FROM recipe_items ri
     JOIN recipes r ON r.id=ri.recipe_id
     JOIN products p ON p.id=r.product_id
     WHERE ri.id=?
       AND ri.recipe_id=?
       AND p.tenant_id=?
   `).get(
     n(req.params.itemId),
     r.id,
     tenant
   );

   if(!item)
     return res.status(404).json({error:'RECIPE_ITEM_NOT_FOUND'});

   db.prepare(
     'DELETE FROM recipe_items WHERE id=? AND recipe_id=?'
   ).run(item.id,r.id);

   audit(req.user.id,'DELETE_INGREDIENT','RECIPE',r.id);

   res.json(recipe(r.id,tenant));
 });

 app.post('/api/stock-counts',minRole(55),(req,res)=>{
   const tenant=tenantId(req);
   const {
     product_id,
     counted_qty,
     reason='Conferência física'
   }=req.body||{};

   const p=tenantProduct(req,product_id);

   if(!p)
     return res.status(404).json({error:'PRODUCT_NOT_FOUND'});

   const variance=n(counted_qty)-n(p.stock);

   const info=db.prepare(`
     INSERT INTO stock_counts(
       product_id,expected_qty,counted_qty,
       variance_qty,reason,user_id,tenant_id
     )
     VALUES(?,?,?,?,?,?,?)
   `).run(
     p.id,p.stock,n(counted_qty),
     variance,String(reason),req.user.id,tenant
   );

   db.prepare(`
     UPDATE products
     SET stock=?
     WHERE id=? AND tenant_id=?
   `).run(n(counted_qty),p.id,tenant);

   db.prepare(`
     INSERT INTO stock_movements(
       product_id,type,qty,reference_type,
       reference_id,user_id,notes
     )
     VALUES(
       ?,'COUNT_VARIANCE',?,'STOCK_COUNT',?,?,?
     )
   `).run(
     p.id,
     variance,
     String(info.lastInsertRowid),
     req.user.id,
     String(reason)
   );

   audit(req.user.id,'COUNT','STOCK',p.id,{variance});

   res.status(201).json({
     id:info.lastInsertRowid,
     expected:p.stock,
     counted:n(counted_qty),
     variance
   });
 });

 app.get('/api/smart-closing',minRole(50),(req,res)=>{
   const tenant=tenantId(req);
   const cs=tenantOpenCash(req);

   const sales=cs
     ? db.prepare(`
         SELECT COALESCE(SUM(total),0) revenue
         FROM sales
         WHERE cash_session_id=?
           AND tenant_id=?
           AND status='PAID'
       `).get(cs.id,tenant)
     : {revenue:0};

   const cogs=cs
     ? db.prepare(`
         SELECT COALESCE(SUM(si.qty*si.unit_cost),0) v
         FROM sale_items si
         JOIN sales s ON s.id=si.sale_id
         WHERE s.cash_session_id=?
           AND s.tenant_id=?
           AND s.status='PAID'
       `).get(cs.id,tenant).v
     : 0;

   const exp=db.prepare(`
     SELECT COALESCE(SUM(amount),0) v
     FROM expenses
     WHERE tenant_id=?
       AND date(created_at)=date('now')
   `).get(tenant).v;

   const revenue=n(sales.revenue);
   const gross=Math.max(0,revenue-n(cogs)-n(exp));
   const reserve=gross*.20;
   const reinvest=gross*.15;
   const buffer=Math.max(revenue*.10,100);
   const safe=Math.max(0,gross-reserve-reinvest-buffer);
   const risk=safe<=0?'HIGH':safe<revenue*.1?'MEDIUM':'LOW';

   res.json({
     cash_session_id:cs?.id||null,
     revenue,
     cogs:n(cogs),
     expenses:n(exp),
     gross_after_costs:gross,
     safety_reserve:reserve,
     reinvestment:reinvest,
     operating_buffer:buffer,
     safe_owner_withdrawal:safe,
     risk_level:risk,
     rationale:risk==='HIGH'
       ? 'Não retirar: custos e reserva operacional consomem o caixa disponível.'
       : 'Retirada limitada após custos, reserva de segurança, reinvestimento e capital operacional.'
   });
 });
}