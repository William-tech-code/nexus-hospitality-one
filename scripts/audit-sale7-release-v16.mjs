import { db } from '../server/db.js';

try {

  const sale = db.prepare(`
    SELECT
      s.id,
      s.status,
      s.total,
      s.payment_method,
      s.received_amount,
      s.change_amount,
      s.release_code,
      s.released_at,
      s.released_by,
      creator.name AS operador_venda,
      releaser.name AS operador_entrega
    FROM sales s
    LEFT JOIN users creator
      ON creator.id = s.user_id
    LEFT JOIN users releaser
      ON releaser.id = s.released_by
    WHERE s.id = ?
  `).get(7);

  if (!sale) {
    console.log('BLOQUEADO: VENDA #7 NAO ENCONTRADA');
    process.exitCode = 10;
  } else {

    console.log('\n=== VENDA #7 ===');

    console.table([{
      id: sale.id,
      status: sale.status,
      total: sale.total,
      pagamento: sale.payment_method,
      recebido: sale.received_amount,
      troco: sale.change_amount,
      retirada: sale.release_code,
      entregue_em: sale.released_at,
      entregue_por_id: sale.released_by,
      operador_venda: sale.operador_venda,
      operador_entrega: sale.operador_entrega
    }]);

    console.log('\n=== VALIDACAO ===');

    console.log('STATUS:', sale.status);
    console.log('CODIGO RETIRADA:', sale.release_code);
    console.log('ENTREGUE EM:', sale.released_at);
    console.log('ENTREGUE POR ID:', sale.released_by);
    console.log('ENTREGUE POR:', sale.operador_entrega);

    const pass =
      sale.status === 'PAID' &&
      !!sale.release_code &&
      !!sale.released_at &&
      !!sale.released_by;

    console.log('\n====================================================');

    if (pass) {
      console.log('ENTREGA AUDITAVEL: PASS');
      console.log('VENDA #7: PRONTA PARA CANCELAMENTO OWNER');
    } else {
      console.log('ENTREGA AUDITAVEL: REVISAR');
      console.log('NAO PROSSEGUIR PARA CANCELAMENTO');
    }

    console.log('====================================================');
  }

  console.log('\nBANCO ALTERADO: NAO');
  console.log('VENDA CANCELADA: NAO');
  console.log('DEVOLUCAO: NAO');

} catch (e) {

  console.error('\nERRO NA AUDITORIA:');
  console.error(e);
  process.exitCode = 1;

} finally {

  db.close();

}
