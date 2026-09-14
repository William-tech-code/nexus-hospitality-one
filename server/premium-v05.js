import {db,setting} from './db.js';

const n=v=>Number(v||0);
const round=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

export function registerPremiumV05(app,minRole,audit){
  app.patch('/api/products/:id',minRole(55),(req,res)=>{
    const id=n(req.params.id);
    const current=db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if(!current)return res.status(404).json({error:'PRODUCT_NOT_FOUND'});
    const allowed=['name','category','barcode','image_url','description','unit_type','package_ml','dose_ml','price','cost','minimum_stock','active'];
    const next={...current};
    for(const key of allowed){if(Object.prototype.hasOwnProperty.call(req.body||{},key))next[key]=req.body[key]}
    if(!String(next.name||'').trim())return res.status(400).json({error:'NAME_REQUIRED'});
    db.prepare(`UPDATE products SET name=?,category=?,barcode=?,image_url=?,description=?,unit_type=?,package_ml=?,dose_ml=?,price=?,cost=?,minimum_stock=?,active=? WHERE id=?`).run(
      String(next.name).trim(),String(next.category||'Outros'),next.barcode||null,next.image_url||null,String(next.description||''),String(next.unit_type||'UNIT'),next.package_ml==null?null:n(next.package_ml),next.dose_ml==null?null:n(next.dose_ml),n(next.price),n(next.cost),n(next.minimum_stock),next.active?1:0,id
    );
    audit(req.user.id,'UPDATE','PRODUCT',id,{name:next.name});
    res.json(db.prepare('SELECT * FROM products WHERE id=?').get(id));
  });

  app.get('/api/ai/operations-brief',minRole(40),(_req,res)=>{
    const revenue=n(db.prepare("SELECT COALESCE(SUM(total),0) total FROM sales WHERE status='PAID' AND date(created_at,'localtime')=date('now','localtime')").get()?.total);
    const sales=n(db.prepare("SELECT COUNT(*) n FROM sales WHERE status='PAID' AND date(created_at,'localtime')=date('now','localtime')").get()?.n);
    const low=db.prepare(`SELECT id,name,category,stock,minimum_stock,cost,price FROM products WHERE active=1 AND stock<=minimum_stock ORDER BY (minimum_stock-stock) DESC LIMIT 8`).all();
    const zero=db.prepare(`SELECT id,name FROM products WHERE active=1 AND stock<=0 ORDER BY name LIMIT 8`).all();
    const marginRisk=db.prepare(`SELECT id,name,cost,price,CASE WHEN price>0 THEN ROUND(((price-cost)/price)*100,1) ELSE 0 END margin FROM products WHERE active=1 AND price>0 ORDER BY margin ASC LIMIT 5`).all();
    const openOrders=n(db.prepare("SELECT COUNT(*) n FROM orders WHERE status='OPEN'").get()?.n);
    const kitchen=n(db.prepare("SELECT COUNT(*) n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='OPEN' AND oi.status IN ('NEW','PREPARING','READY')").get()?.n);
    const cash=db.prepare("SELECT id,opening_amount,opened_at FROM cash_sessions WHERE status='OPEN' ORDER BY id DESC LIMIT 1").get()||null;
    const dailyGoal=n(setting('daily_goal','1000'));
    const progress=dailyGoal?round(revenue/dailyGoal*100):0;
    const actions=[];
    if(!cash)actions.push({level:'critical',title:'Caixa fechado',text:'Abra uma sessão antes de iniciar as vendas para manter auditoria e fechamento confiáveis.',action:'caixa'});
    if(zero.length)actions.push({level:'critical',title:`${zero.length} item(ns) sem estoque`,text:`Prioridade de compra: ${zero.slice(0,3).map(x=>x.name).join(', ')}.`,action:'estoque'});
    else if(low.length)actions.push({level:'warning',title:`${low.length} item(ns) em reposição`,text:'Estoque mínimo atingido. Gere cotação antes da ruptura.',action:'compras'});
    if(marginRisk[0]&&n(marginRisk[0].margin)<25)actions.push({level:'warning',title:'Margem sob atenção',text:`${marginRisk[0].name} está com margem estimada de ${marginRisk[0].margin}%. Revise preço ou custo.`,action:'estoque'});
    if(progress<45)actions.push({level:'info',title:'Meta diária ainda distante',text:`Faturamento atual em ${progress.toFixed(0)}% da meta. Priorize itens de maior margem e ticket.`,action:'dashboard'});
    if(kitchen>6)actions.push({level:'warning',title:'Fila de cozinha crescendo',text:`Há ${kitchen} item(ns) aguardando fluxo no KDS. Verifique gargalos.`,action:'cozinha'});
    if(!actions.length)actions.push({level:'success',title:'Operação equilibrada',text:'Nenhum alerta crítico detectado agora. Preserve margem, caixa e nível de estoque.',action:'dashboard'});
    res.json({generated_at:new Date().toISOString(),score:Math.max(0,Math.min(100,100-(zero.length*12)-(low.length*3)-(kitchen>6?8:0)-(cash?0:20))),snapshot:{revenue,sales,average_ticket:sales?round(revenue/sales):0,daily_goal:dailyGoal,goal_progress:progress,open_orders:openOrders,kitchen_pending:kitchen,low_stock:low.length,zero_stock:zero.length,cash_open:!!cash},actions,margin_risk:marginRisk,low_stock:low});
  });
}
