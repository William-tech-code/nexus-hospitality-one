import { db } from '../server/db.js';

function tableExists(name) {
  return Boolean(
    db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type='table'
        AND name=?
    `).get(name)
  );
}

console.log('\n=== CAIXAS ABERTOS ===');

if (tableExists('cash_sessions')) {

  const cashCols = db.prepare(`
    PRAGMA table_info(cash_sessions)
  `).all().map(x => x.name);

  console.log('COLUNAS:', cashCols.join(', '));

  const openCash = db.prepare(`
    SELECT *
    FROM cash_sessions
    WHERE status = 'OPEN'
    ORDER BY id DESC
    LIMIT 5
  `).all();

  console.table(openCash);

  if (openCash.length) {
    console.log('CAIXA_ABERTO_LOCALIZADO');
  } else {
    console.log('NENHUM_CAIXA_ABERTO');
  }

} else {
  console.log('TABELA_CASH_SESSIONS_NAO_EXISTE');
}

console.log('\n=== PRODUTOS ATIVOS COM ESTOQUE ===');

const productCols = db.prepare(`
  PRAGMA table_info(products)
`).all().map(x => x.name);

const wanted = [
  'id',
  'name',
  'category',
  'price',
  'sale_price',
  'cost',
  'stock',
  'active'
].filter(x => productCols.includes(x));

const products = db.prepare(`
  SELECT ${wanted.join(', ')}
  FROM products
  WHERE active = 1
    AND COALESCE(stock,0) > 0
  ORDER BY stock DESC, id
  LIMIT 15
`).all();

console.table(products);

if (products.length) {
  console.log('PRODUTO_PARA_TESTE_LOCALIZADO');
} else {
  console.log('NENHUM_PRODUTO_COM_ESTOQUE');
}

console.log('\n=== ULTIMAS VENDAS ===');

const sales = db.prepare(`
  SELECT
    id,
    total,
    payment_method,
    status,
    created_at,
    release_code,
    released_at
  FROM sales
  ORDER BY id DESC
  LIMIT 5
`).all();

console.table(sales);

console.log('\n============================================');
console.log('PRE-HOMOLOGACAO CONCLUIDA');
console.log('ZERO VENDAS CRIADAS');
console.log('ZERO VENDAS CANCELADAS');
console.log('ZERO ALTERACOES NO BANCO');
console.log('============================================');
