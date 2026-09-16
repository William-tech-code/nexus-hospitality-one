import { db } from '../server/db.js';

try {

  const sale = db.prepare(`
    SELECT
      s.*,
      u.name AS cancelled_by_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.cancelled_by
    WHERE s.id = ?
  `).get(7);

  const product = db.prepare(`
    SELECT id, name, stock
    FROM products
    WHERE id = ?
  `).get(3);

  const ledger = db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id = ?
    ORDER BY id
  `).all(7);

  const cancellation = db.prepare(`
    SELECT *
    FROM sale_cancellations
    WHERE sale_id = ?
    ORDER BY id DESC
  `).all(7);

  const reversals = db.prepare(`
    SELECT *
    FROM sale_payment_reversals
    WHERE sale_id = ?
    ORDER BY id
  `).all(7);

  const tips = db.prepare(`
    SELECT *
    FROM tips
    WHERE sale_id = ?
    ORDER BY id
  `).all(7);

  const rewards = db.prepare(`
    SELECT *
    FROM employee_rewards
    WHERE sale_id = ?
    ORDER BY id
  `).all(7);

  const audits = db.prepare(`
    SELECT *
    FROM audit_log
    WHERE entity = 'SALE'
      AND entity_id = ?
    ORDER BY id DESC
  `).all(String(7));

  console.log('\n=== VENDA #7 ===');
  console.table([{
    id: sale?.id,
    status: sale?.status,
    total: sale?.total,
    cancelada_em: sale?.cancelled_at,
    motivo: sale?.cancel_reason,
    cancelada_por_id: sale?.cancelled_by,
    cancelada_por: sale?.cancelled_by_name,
    entregue_em: sale?.released_at,
    entregue_por: sale?.released_by,
    release_code_atual: sale?.release_code
  }]);

  console.log('\n=== PRODUTO #3 ===');
  console.table([product]);

  console.log('\n=== LEDGER ORIGINAL ===');
  console.table(ledger.map(x => ({
    id: x.id,
    produto: x.product_id,
    stock_delta: x.stock_delta,
    closed_delta: x.closed_delta,
    open_delta: x.open_delta
  })));

  console.log('\n=== REGISTRO DE CANCELAMENTO ===');
  console.table(cancellation.map(x => ({
    id: x.id,
    sale_id: x.sale_id,
    tipo: x.cancel_type,
    motivo: x.reason,
    refund_total: x.refund_total,
    total: x.total,
    usuario: x.user_id,
    entregue_antes: x.released_before_cancel,
    criado_em: x.created_at
  })));

  console.log('\n=== REVERSOES DE PAGAMENTO ===');
  console.table(reversals.map(x => ({
    id: x.id,
    sale_id: x.sale_id,
    payment_split_id: x.payment_split_id,
    metodo: x.method,
    valor: x.amount,
    status: x.status,
    usuario: x.user_id,
    motivo: x.reason
  })));

  console.log('\n=== TIPS ===');
  console.table(tips);

  console.log('\n=== REWARDS ===');
  console.table(rewards);

  console.log('\n=== AUDITORIA ===');
  console.table(audits.slice(0,10).map(x => ({
    id: x.id,
    usuario: x.user_id,
    acao: x.action,
    entidade: x.entity,
    entidade_id: x.entity_id,
    criado_em: x.created_at
  })));

  const cancelRow = cancellation[0];
  const reversalTotal = reversals.reduce(
    (sum,x) => sum + Number(x.amount || 0), 0
  );

  const auditCancel = audits.find(
    x => x.action === 'SALE_CANCELLED_V16'
  );

  const checks = {
    STATUS_CANCELLED:
      sale?.status === 'CANCELLED',

    OWNER_REGISTRADO:
      Number(sale?.cancelled_by) === 1,

    MOTIVO_REGISTRADO:
      String(sale?.cancel_reason || '').includes('HOMOLOGACAO FINAL V1.6'),

    HISTORICO_ENTREGA_PRESERVADO:
      !!sale?.released_at && !!sale?.released_by,

    ESTOQUE_RESTAURADO:
      Number(product?.stock) === 35,

    CANCELAMENTO_REGISTRADO:
      !!cancelRow,

    CANCELAMENTO_TOTAL:
      cancelRow?.cancel_type === 'TOTAL',

    VENDA_HAVIA_SIDO_ENTREGUE:
      Number(cancelRow?.released_before_cancel) === 1,

    REFUND_R7:
      Number(cancelRow?.refund_total) === 7,

    REVERSAO_PAGAMENTO_R7:
      Math.abs(reversalTotal - 7) < 0.0001,

    AUDITORIA_V16:
      !!auditCancel
  };

  console.log('\n====================================================');
  console.log(' RESULTADO FINAL');
  console.log('====================================================');

  let pass = true;

  for (const [name,ok] of Object.entries(checks)) {
    console.log(
      name.padEnd(34),
      ok ? 'PASS' : 'FAIL'
    );

    if (!ok) pass = false;
  }

  console.log('====================================================');

  if (pass) {
    console.log('NEXUS V1.6 - CANCELAMENTO VIA INTERFACE: PASS');
    console.log('REVERSAO TRANSACIONAL: PASS');
    console.log('VENDA ENTREGUE + CANCELAMENTO OWNER: HOMOLOGADO');
  } else {
    console.log('NEXUS V1.6: EXISTEM ITENS PARA REVISAO');
    console.log('NAO ALTERAR A VENDA #7.');
  }

  console.log('====================================================');
  console.log('BANCO ALTERADO PELO DIAGNOSTICO: NAO');

} catch (e) {

  console.error('\nERRO NA AUDITORIA FINAL:');
  console.error(e);
  process.exitCode = 1;

} finally {

  db.close();

}
