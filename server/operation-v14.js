import crypto from 'node:crypto';
import {db} from './db.js';
const n=v=>Number(v||0), t=v=>String(v||'').trim(), r=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
const add=(table,col,def)=>{const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);if(!cols.includes(col))db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)};
export function initOperationV14(){
 add('sales','received_amount','REAL NOT NULL DEFAULT 0');add('sales','change_amount','REAL NOT NULL DEFAULT 0');add('sales','release_code','TEXT');add('sales','released_at','TEXT');add('sales','released_by','INTEGER');
 db.exec(`
 CREATE TABLE IF NOT EXISTS sale_returns(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,reason TEXT NOT NULL,total REAL NOT NULL DEFAULT 0,user_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS sale_return_items(id INTEGER PRIMARY KEY AUTOINCREMENT,return_id INTEGER NOT NULL,sale_item_id INTEGER NOT NULL,product_id INTEGER NOT NULL,qty REAL NOT NULL,amount REAL NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS change_corrections(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,old_received REAL NOT NULL,old_change REAL NOT NULL,new_received REAL NOT NULL,new_change REAL NOT NULL,reason TEXT NOT NULL,user_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS print_log(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,document_type TEXT NOT NULL,user_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 `);
}
function detail(id){const s=db.prepare(`SELECT s.*,u.name operator_name,e.name employee_name FROM sales s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN employees e ON e.id=s.employee_id WHERE s.id=?`).get(id);if(!s)return null;return{...s,items:db.prepare(`SELECT si.*,p.name FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?`).all(id),payments:db.prepare('SELECT method,amount FROM payment_splits WHERE sale_id=?').all(id),returns:db.prepare('SELECT * FROM sale_returns WHERE sale_id=? ORDER BY id DESC').all(id)}}
export function registerOperationV14(app,{auth,minRole,audit}){
 app.get('/api/v14/sales/recent',auth,minRole(50),(req,res)=>res.json(db.prepare(`SELECT s.*,u.name operator_name,(SELECT group_concat(method||' '||printf('%.2f',amount),' + ') FROM payment_splits WHERE sale_id=s.id) payments FROM sales s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 100`).all()));
 app.get('/api/v14/sales/:id',auth,minRole(40),(req,res)=>{const x=detail(n(req.params.id));x?res.json(x):res.status(404).json({error:'VENDA_NAO_ENCONTRADA'})});
 app.post('/api/v14/sales',auth,minRole(50),(req,res)=>{
  try{
    const b=req.body||{};
    const items=b.items||[];

    const payments=(b.payments||[])
      .filter(x=>n(x.amount)>0)
      .map(x=>({
        method:String(x.method||'DINHEIRO').toUpperCase(),
        amount:r(x.amount)
      }));

    if(!items.length){
      return res.status(400).json({
        error:'VENDA_SEM_ITENS'
      });
    }

    /*
     * O frontend calcula o total, mas o backend nao confia nele.
     * createUnifiedSale valida novamente os splits contra o
     * valor real calculado dos produtos.
     */
    if(!payments.length){
      return res.status(400).json({
        error:'PAGAMENTO_NAO_CONFIRMADO'
      });
    }

    const {createUnifiedSale}=
      globalThis.__NEXUS_TX__||{};

    if(!createUnifiedSale){
      throw new Error(
        'TRANSACTION_ENGINE_UNAVAILABLE'
      );
    }

    /*
     * Para dinheiro, received_amount precisa existir e cobrir
     * especificamente a parcela em dinheiro.
     */
    const cashDue=r(
      payments
        .filter(x=>x.method==='DINHEIRO')
        .reduce((a,x)=>a+n(x.amount),0)
    );

    const received=r(b.received_amount);

    if(cashDue>0 && received+0.001<cashDue){
      return res.status(400).json({
        error:'VALOR_RECEBIDO_INSUFICIENTE',
        cash_due:cashDue,
        received
      });
    }

    const sale=createUnifiedSale({
      items,
      payments,
      payment_method:
        payments.length>1
          ? 'MISTO'
          : payments[0].method,
      employee_id:b.employee_id||null,
      customer_name:b.customer_name||null,
      customer_id:b.customer_id||null,
      tip_amount:n(b.tip_amount),
      user_id:req.user.id,
      source:'POS_V161'
    });

    const due=r(
      n(sale.total)+n(sale.tip_amount)
    );

    const paid=r(
      payments.reduce(
        (a,x)=>a+n(x.amount),
        0
      )
    );

    if(Math.abs(paid-due)>.01){
      /*
       * Em condicao normal isto ja foi bloqueado dentro
       * de createUnifiedSale e a transacao revertida.
       */
      throw new Error('PAYMENT_SPLIT_MISMATCH');
    }

    const effectiveReceived=
      cashDue>0
         ? received
        : paid;

    const change=
      cashDue>0
         ? Math.max(
            0,
            r(effectiveReceived-cashDue)
          )
        : 0;

    const code=
      `R${String(sale.id).padStart(5,'0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    db.prepare(`
      UPDATE sales
      SET
        received_amount=?,
        change_amount=?,
        release_code=?
      WHERE id=?
    `).run(
      effectiveReceived,
      change,
      code,
      sale.id
    );

    audit(
      req.user.id,
      'SALE_COMPLETED',
      'SALE',
      sale.id,
      {
        payments,
        payment_confirmed:true,
        received:effectiveReceived,
        cash_due:cashDue,
        change,
        release_code:code,
        engine:'V1.6.1'
      }
    );

    res.status(201).json(
      detail(sale.id)
    );

  }catch(e){
    res.status(400).json({
      error:e.message
    });
  }
});
 app.post('/api/v14/sales/:id/release',auth,minRole(40),(req,res)=>{
  const id=n(req.params.id);

  const s=db.prepare(
    "SELECT * FROM sales WHERE id=? AND status='PAID'"
  ).get(id);

  if(!s){
    return res.status(409).json({
      error:'VENDA_NAO_LIBERAVEL'
    });
  }

  if(s.released_at){
    return res.status(409).json({
      error:'VENDA_JA_LIBERADA'
    });
  }

  const payment=db.prepare(`
    SELECT COALESCE(SUM(amount),0) total
    FROM payment_splits
    WHERE sale_id=?
  `).get(id);

  const due=r(
    n(s.total)+n(s.tip_amount)
  );

  const paid=r(
    n(payment?.total)
  );

  if(Math.abs(paid-due)>.01){
    return res.status(409).json({
      error:'PAGAMENTO_NAO_CONFIRMADO',
      due,
      paid
    });
  }

  if(!t(s.release_code)){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_GERADA'
    });
  }

  const pickup=db.prepare(`
    SELECT id
    FROM print_log
    WHERE sale_id=?
      AND document_type='PICKUP'
    ORDER BY id DESC
    LIMIT 1
  `).get(id);

  if(!pickup){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_IMPRESSA'
    });
  }

  db.prepare(`
    UPDATE sales
    SET
      released_at=CURRENT_TIMESTAMP,
      released_by=?
    WHERE id=?
  `).run(
    req.user.id,
    id
  );

  audit(
    req.user.id,
    'RELEASE',
    'SALE',
    id,
    {
      payment_confirmed:true,
      release_code:s.release_code,
      engine:'V1.6.1'
    }
  );

  res.json(
    detail(id)
  );
});
 app.post('/api/v14/sales/:id/change-correction',auth,minRole(80),(req,res)=>{
  const id=n(req.params.id);
  const reason=t(req.body?.reason);
  const received=r(req.body?.received_amount);

  const s=db.prepare(
    "SELECT * FROM sales WHERE id=? AND status='PAID'"
  ).get(id);

  if(!s){
    return res.status(404).json({
      error:'VENDA_NAO_ENCONTRADA'
    });
  }

  if(!reason){
    return res.status(400).json({
      error:'MOTIVO_OBRIGATORIO'
    });
  }

  const cash=db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS amount
    FROM payment_splits
    WHERE sale_id=?
      AND UPPER(method)='DINHEIRO'
  `).get(id);

  const cashDue=r(cash?.amount);

  if(cashDue<=0){
    return res.status(409).json({
      error:'VENDA_SEM_PAGAMENTO_EM_DINHEIRO'
    });
  }

  if(received+0.001<cashDue){
    return res.status(400).json({
      error:'VALOR_RECEBIDO_INSUFICIENTE',
      cash_due:cashDue,
      received
    });
  }

  const change=
    Math.max(
      0,
      r(received-cashDue)
    );

  db.transaction(()=>{

    db.prepare(`
      INSERT INTO change_corrections(
        sale_id,
        old_received,
        old_change,
        new_received,
        new_change,
        reason,
        user_id
      )
      VALUES(?,?,?,?,?,?,?)
    `).run(
      id,
      n(s.received_amount),
      n(s.change_amount),
      received,
      change,
      reason,
      req.user.id
    );

    db.prepare(`
      UPDATE sales
      SET
        received_amount=?,
        change_amount=?
      WHERE id=?
    `).run(
      received,
      change,
      id
    );

  })();

  audit(
    req.user.id,
    'CHANGE_CORRECTION',
    'SALE',
    id,
    {
      reason,
      received,
      cash_due:cashDue,
      change,
      engine:'V1.6.1'
    }
  );

  res.json(detail(id));
});
 app.post('/api/v14/sales/:id/return',auth,minRole(80),(_req,res)=>{
  return res.status(410).json({
    error:'DEVOLUCAO_LEGADA_DESATIVADA_USE_V16'
  });
});
 app.post('/api/v14/sales/:id/print',auth,minRole(40),(req,res)=>{
  const id=n(req.params.id);
  const type=t(req.body?.type).toUpperCase();

  if(!['PICKUP','RECEIPT'].includes(type)){
    return res.status(400).json({
      error:'TIPO_INVALIDO'
    });
  }

  const sale=db.prepare(
    'SELECT * FROM sales WHERE id=?'
  ).get(id);

  if(!sale){
    return res.status(404).json({
      error:'VENDA_NAO_ENCONTRADA'
    });
  }

  if(sale.status!=='PAID'){
    return res.status(409).json({
      error:'VENDA_NAO_PAGA'
    });
  }

  if(!t(sale.release_code)){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_GERADA'
    });
  }

  const pickup=db.prepare(`
    SELECT id
    FROM print_log
    WHERE sale_id=?
      AND document_type='PICKUP'
    ORDER BY id DESC
    LIMIT 1
  `).get(id);

  if(type==='RECEIPT' && !pickup){
    return res.status(409).json({
      error:'IMPRIMA_FICHA_RETIRADA_ANTES_DO_CUPOM'
    });
  }

  const result=db.prepare(`
    INSERT INTO print_log(
      sale_id,
      document_type,
      user_id
    )
    VALUES(?,?,?)
  `).run(
    id,
    type,
    req.user.id
  );

  audit(
    req.user.id,
    'DOCUMENT_PRINTED',
    'SALE',
    id,
    {
      document_type:type,
      print_log_id:Number(result.lastInsertRowid),
      release_code:sale.release_code,
      engine:'V1.6.1'
    }
  );

  res.json({
    type,
    print_log_id:Number(result.lastInsertRowid),
    sale:detail(id)
  });
});
 app.get('/api/v14/payment-config',auth,minRole(80),(_req,res)=>res.json({asaas:{configured:Boolean(process.env.ASAAS_API_KEY),webhook_configured:Boolean(process.env.ASAAS_WEBHOOK_TOKEN),base_url:process.env.ASAAS_BASE_URL||'https://api.asaas.com/v3'},methods:['DINHEIRO','PIX','DEBITO','CREDITO','MISTO']}));
}
