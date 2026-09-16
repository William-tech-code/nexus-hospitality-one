import { db } from '../server/db.js';

try {

  const sale = db.prepare(`
    SELECT
      s.*,
      u.name AS operator_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.id DESC
    LIMIT 1
  `).get();

  if (!sale) {
    console.error('BLOQUEADO: nenhuma venda encontrada.');
    process.exit(10);
  }

  const items = db.prepare(`
    SELECT
      si.*,
      p.name AS product_name,
      p.stock AS current_stock
    FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = ?
    ORDER BY si.id
  `).all(sale.id);

  const payments = db.prepare(`
    SELECT *
    FROM payment_splits
    WHERE sale_id = ?
    ORDER BY id
  `).all(sale.id);

  const ledger = db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id = ?
    ORDER BY id
  `).all(sale.id);

  const movements = db.prepare(`
    SELECT *
    FROM stock_movements
    WHERE reference_id = ?
      AND reference_type LIKE '%SALE%'
    ORDER BY id
  `).all(String(sale.id));

  const audits = db.prepare(`
    SELECT *
    FROM audit_log
    WHERE entity_id = ?
    ORDER BY id DESC
  `).all(String(sale.id));

  console.log('\n=== VENDA MAIS RECENTE ===');
  console.table([{
    id: sale.id,
    status: sale.status,
    total: sale.total,
    pagamento: sale.payment_method,
    recebido: sale.received_amount,
    troco: sale.change_amount,
    retirada: sale.release_code,
    liberada_em: sale.released_at,
    operador: sale.operator_name,
    criada_em: sale.created_at
  }]);

  console.log('\n=== ITENS ===');
  console.table(items.map(i => ({
    sale_item_id: i.id,
    produto_id: i.product_id,
    produto: i.product_name,
    quantidade: i.qty,
    preco: i.unit_price,
    estoque_atual: i.current_stock
  })));

  console.log('\n=== PAGAMENTOS ===');
  console.table(payments.map(p => ({
    id: p.id,
    metodo: p.method,
    valor: p.amount
  })));

  console.log('\n=== LEDGER DE ESTOQUE ===');
  console.table(ledger.map(l => ({
    id: l.id,
    produto_id: l.product_id,
    stock_delta: l.stock_delta,
    closed_delta: l.closed_delta,
    open_delta: l.open_delta
  })));

  console.log('\n=== MOVIMENTOS DE ESTOQUE ===');
  console.table(movements.map(m => ({
    id: m.id,
    produto_id: m.product_id,
    tipo: m.type,
    quantidade: m.qty,
    referencia: m.reference_type,
    usuario: m.user_id
  })));

  console.log('\n=== AUDITORIA ===');
  console.table(audits.slice(0,10).map(a => ({
    id: a.id,
    usuario: a.user_id,
    acao: a.action,
    entidade: a.entity,
    criado_em: a.created_at
  })));

  console.log('\n====================================================');
  console.log('VENDA IDENTIFICADA: #' + sale.id);
  console.log('STATUS:', sale.status);
  console.log('ITENS:', items.length);
  console.log('PAGAMENTOS:', payments.length);
  console.log('LEDGER:', ledger.length);
  console.log('LIBERADA:', sale.released_at ? 'SIM' : 'NAO');
  console.log('====================================================');

  if (sale.status !== 'PAID') {
    console.log('ATENCAO: status esperado antes da liberacao = PAID');
  }

  if (!items.length)
    console.log('ATENCAO: VENDA SEM ITENS.');

  if (!payments.length)
    console.log('ATENCAO: VENDA SEM PAYMENT_SPLIT.');

  if (!ledger.length)
    console.log('ATENCAO: VENDA SEM LEDGER DE ESTOQUE.');

  console.log('\nBANCO ALTERADO: NAO');
  console.log('CANCELAMENTO EXECUTADO: NAO');
  console.log('DEVOLUCAO EXECUTADA: NAO');

} catch (e) {

  console.error('\nERRO NA AUDITORIA:');
  console.error(e);

  process.exit(1);

} finally {

  db.close();
}
