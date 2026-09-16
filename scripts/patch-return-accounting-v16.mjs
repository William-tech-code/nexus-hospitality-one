import fs from 'node:fs';

const file =
  './server/transaction-engine.js';

const backup =
  process.argv[2];

let src =
  fs.readFileSync(file,'utf8');

if (!backup) {
  console.error('BACKUP_PATH_REQUIRED');
  process.exit(20);
}

/*
 * A função antiga é compactada em uma única linha.
 * Não fazemos replace cego de SQL isolado.
 * Substituímos exclusivamente o corpo exportado de cashSummary.
 */

const start =
  src.indexOf('export function cashSummary(id){');

if (start < 0) {
  console.error('CASH_SUMMARY_NOT_FOUND');
  process.exit(21);
}

const nextMarker =
  src.indexOf(
    'if(!globalThis.__NEXUS_TX__)',
    start
  );

if (nextMarker < 0) {
  console.error('CASH_SUMMARY_END_NOT_FOUND');
  process.exit(22);
}

const oldSection =
  src.slice(start,nextMarker);

if (
  oldSection.includes(
    'sale_return_payment_reversals'
  )
) {
  console.log(
    'CASH SUMMARY JA POSSUI RETURN ACCOUNTING.'
  );
  process.exit(0);
}

const newFunction = `
export function cashSummary(id){
  const cs=db.prepare(
    'SELECT * FROM cash_sessions WHERE id=?'
  ).get(n(id));

  if(!cs)return null;

  /*
   * PAGAMENTOS LIQUIDOS
   *
   * Vendas CANCELLED continuam excluidas pela condicao PAID.
   * Para vendas PAID com devolucao V1.6, subtraimos somente
   * as reversoes registradas em sale_return_payment_reversals.
   *
   * Dessa forma:
   * - cancelamento total nao sofre dupla subtracao;
   * - devolucao reduz o metodo de pagamento correto;
   * - DINHEIRO reduz caixa fisico esperado;
   * - PIX/CARTAO reduzem seus respectivos totais.
   */

  const grossMethods=db.prepare(\`
    SELECT
      ps.method,
      COALESCE(SUM(ps.amount),0) amount
    FROM payment_splits ps
    JOIN sales s
      ON s.id=ps.sale_id
    WHERE s.cash_session_id=?
      AND s.status='PAID'
    GROUP BY ps.method
  \`).all(cs.id);

  const returnMethods=db.prepare(\`
    SELECT
      rpr.method,
      COALESCE(SUM(rpr.amount),0) amount
    FROM sale_return_payment_reversals rpr
    JOIN sales s
      ON s.id=rpr.sale_id
    WHERE s.cash_session_id=?
      AND s.status='PAID'
      AND rpr.status='RECORDED'
    GROUP BY rpr.method
  \`).all(cs.id);

  const map={};

  for(const x of grossMethods){
    map[x.method]=n(x.amount);
  }

  for(const x of returnMethods){
    map[x.method]=
      n(map[x.method])-n(x.amount);
  }

  /*
   * Evita residuos negativos de ponto flutuante.
   */

  for(const method of Object.keys(map)){
    if(
      map[method]<0 &&
      Math.abs(map[method])<0.01
    ){
      map[method]=0;
    }
  }

  const mv=db.prepare(\`
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN type='SUPRIMENTO'
            THEN amount
            ELSE 0
          END
        ),0
      ) supplies,

      COALESCE(
        SUM(
          CASE
            WHEN type='SANGRIA'
            THEN amount
            ELSE 0
          END
        ),0
      ) withdrawals

    FROM cash_movements
    WHERE cash_session_id=?
  \`).get(cs.id);

  /*
   * Receita bruta PAID.
   */

  const grossSales=db.prepare(\`
    SELECT
      COUNT(*) count,
      COALESCE(SUM(total),0) revenue,
      COALESCE(SUM(tip_amount),0) tips
    FROM sales
    WHERE cash_session_id=?
      AND status='PAID'
  \`).get(cs.id);

  /*
   * Somente devolucoes de vendas ainda PAID.
   * CANCELLED nao entra aqui para impedir dupla deducao.
   */

  const returned=db.prepare(\`
    SELECT
      COALESCE(SUM(sr.total),0) amount
    FROM sale_returns sr
    JOIN sales s
      ON s.id=sr.sale_id
    WHERE s.cash_session_id=?
      AND s.status='PAID'
  \`).get(cs.id);

  const returnedAmount=
    n(returned?.amount);

  const netRevenue=
    Math.max(
      0,
      n(grossSales.revenue)-returnedAmount
    );

  /*
   * Mantemos count como numero de vendas PAID.
   * Uma devolucao parcial nao apaga a venda.
   */

  const sales={
    ...grossSales,
    gross_revenue:n(grossSales.revenue),
    returns:returnedAmount,
    revenue:netRevenue
  };

  const cashSales=
    n(map.DINHEIRO);

  const expectedCash=
    n(cs.opening_amount)+
    cashSales+
    n(mv.supplies)-
    n(mv.withdrawals);

  return{
    session:cs,
    sales,
    methods:map,
    supplies:n(mv.supplies),
    withdrawals:n(mv.withdrawals),
    expected_cash:expectedCash
  };
}

`;

const next =
  src.slice(0,start)+
  newFunction+
  src.slice(nextMarker);

if (
  !next.includes(
    'sale_return_payment_reversals'
  )
) {
  console.error('PATCH_VALIDATION_FAILED');
  process.exit(23);
}

if (
  !next.includes(
    "s.status='PAID'"
  )
) {
  console.error('PAID_FILTER_LOST');
  process.exit(24);
}

fs.writeFileSync(
  file,
  next,
  'utf8'
);

console.log('CASH SUMMARY PATCH: APPLIED');
console.log('BACKUP:',backup);
