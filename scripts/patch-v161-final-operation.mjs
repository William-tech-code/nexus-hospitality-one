import fs from 'node:fs';

const file='./server/operation-v14.js';

let s=
  fs.readFileSync(
    file,
    'utf8'
  );

/*
 * ===========================================================
 * A. CORRECAO DE TROCO
 * ===========================================================
 *
 * A rota antiga calculava:
 *
 * received - total da venda
 *
 * Isso estava errado em pagamento misto.
 *
 * Agora:
 * - localiza somente a parcela DINHEIRO;
 * - exige que received cubra essa parcela;
 * - troco = received - cashDue;
 * - impede correção de troco quando não houve dinheiro.
 */

const oldChange=
` app.post('/api/v14/sales/:id/change-correction',auth,minRole(80),(req,res)=>{const id=n(req.params.id),reason=t(req.body?.reason),received=n(req.body?.received_amount),s=db.prepare("SELECT * FROM sales WHERE id=? AND status='PAID'").get(id);if(!s)return res.status(404).json({error:'VENDA_NAO_ENCONTRADA'});if(!reason)return res.status(400).json({error:'MOTIVO_OBRIGATORIO'});const due=n(s.total)+n(s.tip_amount),change=Math.max(0,r(received-due));db.transaction(()=>{db.prepare('INSERT INTO change_corrections(sale_id,old_received,old_change,new_received,new_change,reason,user_id) VALUES(?,?,?,?,?,?,?)').run(id,n(s.received_amount),n(s.change_amount),received,change,reason,req.user.id);db.prepare('UPDATE sales SET received_amount=?,change_amount=? WHERE id=?').run(received,change,id)})();audit(req.user.id,'CHANGE_CORRECTION','SALE',id,{reason,received,change});res.json(detail(id))});`;

const newChange=` app.post('/api/v14/sales/:id/change-correction',auth,minRole(80),(req,res)=>{
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

  const cash=db.prepare(\`
    SELECT COALESCE(SUM(amount),0) AS amount
    FROM payment_splits
    WHERE sale_id=?
      AND UPPER(method)='DINHEIRO'
  \`).get(id);

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

    db.prepare(\`
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
    \`).run(
      id,
      n(s.received_amount),
      n(s.change_amount),
      received,
      change,
      reason,
      req.user.id
    );

    db.prepare(\`
      UPDATE sales
      SET
        received_amount=?,
        change_amount=?
      WHERE id=?
    \`).run(
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
});`;

if(s.includes(oldChange)){
  s=s.replace(
    oldChange,
    newChange
  );
}
else if(
  !s.includes(
    "VENDA_SEM_PAGAMENTO_EM_DINHEIRO"
  )
){
  throw new Error(
    'CHANGE_CORRECTION_MARKER_NOT_FOUND'
  );
}

/*
 * ===========================================================
 * B. RELEASE
 * ===========================================================
 *
 * Já havia:
 * - venda PAID
 * - pagamento completo
 * - release_code
 *
 * Agora também exige:
 * - PICKUP registrado antes da liberação.
 */

const releaseMarker=
`  if(!t(s.release_code)){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_GERADA'
    });
  }`;

const releaseReplacement=
`  if(!t(s.release_code)){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_GERADA'
    });
  }

  const pickup=db.prepare(\`
    SELECT id
    FROM print_log
    WHERE sale_id=?
      AND document_type='PICKUP'
    ORDER BY id DESC
    LIMIT 1
  \`).get(id);

  if(!pickup){
    return res.status(409).json({
      error:'FICHA_RETIRADA_NAO_IMPRESSA'
    });
  }`;

if(
  s.includes(releaseMarker) &&
  !s.includes(
    "FICHA_RETIRADA_NAO_IMPRESSA"
  )
){
  s=s.replace(
    releaseMarker,
    releaseReplacement
  );
}

if(
  !s.includes(
    "FICHA_RETIRADA_NAO_IMPRESSA"
  )
){
  throw new Error(
    'RELEASE_PICKUP_GUARD_NOT_INSTALLED'
  );
}

/*
 * ===========================================================
 * C. DESATIVA DEVOLUCAO LEGADA V14
 * ===========================================================
 *
 * A V14 antiga devolvia diretamente products.stock.
 * Isso não pode coexistir com o Return Engine V1.6.
 */

const oldReturnRegex=
/ app\.post\('\/api\/v14\/sales\/:id\/return',auth,minRole\(80\),\(req,res\)=>\{try\{[\s\S]*?\}\}\);\r?\n(?= app\.post\('\/api\/v14\/sales\/:id\/print')/;

if(oldReturnRegex.test(s)){

  s=s.replace(
    oldReturnRegex,
` app.post('/api/v14/sales/:id/return',auth,minRole(80),(_req,res)=>{
  return res.status(410).json({
    error:'DEVOLUCAO_LEGADA_DESATIVADA_USE_V16'
  });
});
`
  );
}

if(
  !s.includes(
    'DEVOLUCAO_LEGADA_DESATIVADA_USE_V16'
  )
){
  throw new Error(
    'LEGACY_RETURN_NOT_DISABLED'
  );
}

/*
 * ===========================================================
 * D. IMPRESSAO SEGURA
 * ===========================================================
 *
 * Regras:
 *
 * PICKUP:
 * - venda precisa estar PAID;
 * - precisa possuir release_code.
 *
 * RECEIPT:
 * - venda precisa estar PAID;
 * - exige PICKUP anterior.
 *
 * Isso garante a sequência:
 *
 * pagamento -> ficha -> cupom/liberação.
 */

const oldPrint=
` app.post('/api/v14/sales/:id/print',auth,minRole(40),(req,res)=>{const id=n(req.params.id),type=t(req.body?.type).toUpperCase();if(!['PICKUP','RECEIPT'].includes(type))return res.status(400).json({error:'TIPO_INVALIDO'});const s=detail(id);if(!s)return res.status(404).json({error:'VENDA_NAO_ENCONTRADA'});db.prepare('INSERT INTO print_log(sale_id,document_type,user_id) VALUES(?,?,?)').run(id,type,req.user.id);res.json({type,sale:s})});`;

const newPrint=` app.post('/api/v14/sales/:id/print',auth,minRole(40),(req,res)=>{
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

  const pickup=db.prepare(\`
    SELECT id
    FROM print_log
    WHERE sale_id=?
      AND document_type='PICKUP'
    ORDER BY id DESC
    LIMIT 1
  \`).get(id);

  if(type==='RECEIPT' && !pickup){
    return res.status(409).json({
      error:'IMPRIMA_FICHA_RETIRADA_ANTES_DO_CUPOM'
    });
  }

  const result=db.prepare(\`
    INSERT INTO print_log(
      sale_id,
      document_type,
      user_id
    )
    VALUES(?,?,?)
  \`).run(
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
});`;

if(s.includes(oldPrint)){
  s=s.replace(
    oldPrint,
    newPrint
  );
}
else if(
  !s.includes(
    'IMPRIMA_FICHA_RETIRADA_ANTES_DO_CUPOM'
  )
){
  throw new Error(
    'PRINT_ROUTE_MARKER_NOT_FOUND'
  );
}

if(
  !s.includes(
    'IMPRIMA_FICHA_RETIRADA_ANTES_DO_CUPOM'
  )
){
  throw new Error(
    'PRINT_ORDER_GUARD_NOT_INSTALLED'
  );
}

fs.writeFileSync(
  file,
  s,
  'utf8'
);

console.log(
  'OPERATION V14 FINAL HARDENING: PASS'
);
