import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { cashSummary } from '../server/transaction-engine.js';

const cash=db.prepare(`
    SELECT *
    FROM cash_sessions
    WHERE status='OPEN'
    ORDER BY id DESC
    LIMIT 1
`).get();

if(!cash){
    console.error('CAIXA_NAO_ABERTO');
    process.exit(20);
}

/*
 * Para a primeira homologacao real:
 * produto ativo, estoque > 0 e preco > 0.
 *
 * Preferimos produto sem receita e sem inventory_profile,
 * porque fornece a homologacao inicial mais simples e inequívoca.
 */

let product=db.prepare(`
    SELECT
        p.id,
        p.name,
        p.price,
        p.stock
    FROM products p
    LEFT JOIN recipes r
        ON r.product_id=p.id
       AND r.active=1
    LEFT JOIN inventory_profiles ip
        ON ip.product_id=p.id
    WHERE p.active=1
      AND p.stock>0
      AND p.price>0
      AND r.id IS NULL
      AND ip.product_id IS NULL
    ORDER BY p.id
    LIMIT 1
`).get();

/*
 * Se não houver produto simples, ainda podemos homologar
 * uma devolucao INTEGRAL de 1 unidade usando o ledger exato.
 */

if(!product){
    product=db.prepare(`
        SELECT
            p.id,
            p.name,
            p.price,
            p.stock
        FROM products p
        WHERE p.active=1
          AND p.stock>0
          AND p.price>0
        ORDER BY p.id
        LIMIT 1
    `).get();
}

if(!product){
    console.error('SEM_PRODUTO_PARA_HOMOLOGACAO');
    process.exit(21);
}

const sale7=db.prepare(`
    SELECT
        id,
        status,
        released_at,
        cancelled_at
    FROM sales
    WHERE id=7
`).get();

const return7=db.prepare(`
    SELECT COUNT(*) AS c
    FROM sale_returns
    WHERE sale_id=7
`).get().c;

if(sale7 && sale7.status!=='CANCELLED'){
    console.error('VENDA_7_ALTERADA');
    process.exit(22);
}

if(Number(return7)!==0){
    console.error('VENDA_7_POSSUI_RETURN');
    process.exit(23);
}

const backupDir=
    path.resolve('./database-backups');

fs.mkdirSync(
    backupDir,
    {recursive:true}
);

const stamp=
    new Date()
        .toISOString()
        .replace(/[:.]/g,'-');

const backup=
    path.join(
        backupDir,
        `hospitality-pre-real-return-v16-${stamp}.sqlite`
    );

await db.backup(backup);

const integrity=
    db.prepare(
        'PRAGMA integrity_check'
    ).get();

const summary=
    cashSummary(cash.id);

const state={
    cash_session_id:cash.id,
    product,
    backup,
    sale7,
    return7:Number(return7),
    before_summary:summary
};

fs.writeFileSync(
    './scripts/real-return-v16-state.json',
    JSON.stringify(state,null,2),
    'utf8'
);

console.log('');
console.log('CAIXA:',cash.id);
console.log('PRODUTO ESCOLHIDO:',product);
console.log('BACKUP:',backup);
console.log('SQLITE:',integrity);
console.log('VENDA #7: PRESERVADA');
console.log('');
console.log('PREPARACAO: PASS');
