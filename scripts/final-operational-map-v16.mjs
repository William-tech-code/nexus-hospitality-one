import fs from 'node:fs';
import { db } from '../server/db.js';

const read=file=>
    fs.readFileSync(file,'utf8');

const files={
    transaction:
        read('./server/transaction-engine.js'),

    smart:
        read('./server/suite-v06.js'),

    recipe:
        read('./server/recipe-engine.js'),

    op14:
        read('./server/operation-v14.js'),

    op16:
        read('./server/operation-v16.js'),

    returnEngine:
        read('./server/return-engine-v16.js'),

    returnRoutes:
        read('./server/return-routes-v16.js'),

    index:
        read('./server/index.js'),

    pos:
        read('./src/SmartPOSV16.jsx'),

    recent:
        read('./src/RecentSalesV16.jsx'),

    business:
        read('./src/BusinessV15.jsx'),

    api:
        read('./src/api.js')
};

const out=[];

function log(...args){
    const s=args
        .map(x=>
            typeof x==='string'
                ? x
                : JSON.stringify(x,null,2)
        )
        .join(' ');

    console.log(s);
    out.push(s);
}

function section(name){
    log('');
    log(
        '============================================================'
    );
    log(name);
    log(
        '============================================================'
    );
}

function context(label,text,patterns,radius=8){

    section(label);

    const lines=text.split(/\r?\n/);
    const printed=new Set();

    for(let i=0;i<lines.length;i++){

        if(
            patterns.some(
                p=>
                  typeof p==='string'
                    ? lines[i].includes(p)
                    : p.test(lines[i])
            )
        ){

            const start=Math.max(0,i-radius);
            const end=Math.min(
                lines.length,
                i+radius+1
            );

            for(let x=start;x<end;x++){

                if(printed.has(x))continue;
                printed.add(x);

                log(
                    String(x+1).padStart(5,' ') +
                    ' | ' +
                    lines[x]
                );
            }

            log('-----');
        }
    }
}

/*
 * ==========================================================
 * TRANSACTION ENGINE
 * ==========================================================
 */

context(
    '1. CREATE UNIFIED SALE + LEDGER',
    files.transaction,
    [
        'inventorySnapshot',
        'ledgerDiff',
        'createUnifiedSale',
        'consumeProduct',
        'sale_items',
        'cashSummary'
    ],
    10
);

/*
 * ==========================================================
 * SMART INVENTORY
 * ==========================================================
 */

context(
    '2. SMART INVENTORY - CONSUMO REAL',
    files.smart,
    [
        'consumeSmartInventory',
        'closed_units',
        'open_base',
        'inventory_profiles',
        'stock_movements'
    ],
    15
);

/*
 * ==========================================================
 * RECIPE ENGINE
 * ==========================================================
 */

context(
    '3. RECIPE ENGINE',
    files.recipe,
    [
        'consumeProduct',
        'consumeSmartInventory',
        'RECIPE_CONSUMPTION',
        'recipe_items'
    ],
    15
);

/*
 * ==========================================================
 * RETURN
 * ==========================================================
 */

context(
    '4. RETURN ENGINE V1.6',
    files.returnEngine,
    [
        'validateReturnRequest',
        'buildInventoryReturnPlan',
        'applyInventoryReturnPlan',
        'DEVOLUCAO_MULTITEM',
        'sale_inventory_ledger'
    ],
    15
);

context(
    '5. RETURN ROUTES V1.6',
    files.returnRoutes,
    [
        'return-preview',
        '/return',
        'sale_return_payment_reversals',
        'VENDA_ENTREGUE_EXIGE_PROPRIETARIO',
        'SALE_RETURNED_V16'
    ],
    12
);

/*
 * ==========================================================
 * PAGAMENTO / TROCO / LIBERACAO
 * ==========================================================
 */

context(
    '6. OPERATION V14 - RECEBIMENTO TROCO LIBERACAO',
    files.op14,
    [
        'received_amount',
        'change_amount',
        '/release',
        'release_code',
        'print',
        'payment'
    ],
    12
);

context(
    '7. OPERATION V16 - CANCELAMENTO E AUDITORIA',
    files.op16,
    [
        '/cancel',
        'released_at',
        'cancelled_by',
        'sale_payment_reversals',
        'SALE_CANCELLED_V16'
    ],
    10
);

/*
 * ==========================================================
 * SMART POS
 * ==========================================================
 */

context(
    '8. SMART POS V16',
    files.pos,
    [
        'createSaleV14',
        'received',
        'change',
        'releaseSaleV14',
        'printSaleV14',
        'last.id',
        'payment',
        'DINHEIRO'
    ],
    12
);

/*
 * ==========================================================
 * ULTIMAS VENDAS
 * ==========================================================
 */

context(
    '9. RECENT SALES V16',
    files.recent,
    [
        'release',
        'cancel',
        'return',
        'payment',
        'change',
        'operator'
    ],
    10
);

context(
    '10. BUSINESS V15',
    files.business,
    [
        'salesRecentV16',
        'saleV16',
        'cancelSaleV16',
        'returnSaleV16',
        'changeCorrectionV14',
        'printSaleV14'
    ],
    10
);

/*
 * ==========================================================
 * API CLIENT
 * ==========================================================
 */

context(
    '11. FRONTEND API',
    files.api,
    [
        'createSaleV14',
        'releaseSaleV14',
        'returnSaleV16',
        'returnPreviewV16',
        'changeCorrectionV14',
        'printSaleV14'
    ],
    8
);

/*
 * ==========================================================
 * BANCO
 * ==========================================================
 */

section('12. SCHEMA OPERACIONAL');

const tables=[
    'sales',
    'sale_items',
    'sale_inventory_ledger',
    'inventory_profiles',
    'stock_movements',
    'payment_splits',
    'sale_returns',
    'sale_return_items',
    'sale_return_payment_reversals',
    'sale_cancellations',
    'sale_payment_reversals',
    'print_log',
    'change_corrections',
    'audit_log'
];

for(const table of tables){

    const exists=db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type='table'
          AND name=?
    `).get(table);

    log('');
    log('TABLE:',table);

    if(!exists){
        log('NAO EXISTE');
        continue;
    }

    const cols=db.prepare(
        `PRAGMA table_info(${table})`
    ).all();

    for(const c of cols){
        log(
            `  ${c.name} | ${c.type} | ` +
            `NOTNULL=${c.notnull} | DEFAULT=${c.dflt_value}`
        );
    }
}

/*
 * ==========================================================
 * ESTADO DE HOMOLOGACAO
 * ==========================================================
 */

section('13. VENDAS DE HOMOLOGACAO');

const homolog=db.prepare(`
    SELECT
        id,
        total,
        payment_method,
        status,
        customer_name,
        created_at,
        released_at,
        cancelled_at
    FROM sales
    WHERE
        customer_name LIKE 'HOMOLOGACAO%'
        OR id IN(6,7,8,9)
    ORDER BY id
`).all();

for(const x of homolog){
    log(x);
}

section('14. DEVOLUCOES');

const returns=db.prepare(`
    SELECT
        sr.*,
        s.customer_name,
        s.status sale_status
    FROM sale_returns sr
    JOIN sales s
      ON s.id=sr.sale_id
    ORDER BY sr.id
`).all();

for(const x of returns){
    log(x);
}

section('15. CHECK VENDA #8');

const sale8=db.prepare(`
    SELECT *
    FROM sales
    WHERE id=8
`).get();

log('SALE8:',sale8 || null);

if(sale8){

    log(
        'SALE8 ITEMS:',
        db.prepare(`
            SELECT *
            FROM sale_items
            WHERE sale_id=8
        `).all()
    );

    log(
        'SALE8 RETURNS:',
        db.prepare(`
            SELECT *
            FROM sale_returns
            WHERE sale_id=8
        `).all()
    );
}

/*
 * ==========================================================
 * CHECKS ARQUITETURAIS
 * ==========================================================
 */

section('16. CHECKS');

const checks={

    SALE_LEDGER_EXISTS:
        files.transaction.includes(
            'sale_inventory_ledger'
        ),

    ITEM_LEDGER_EXISTS:
        files.transaction.includes(
            'sale_item_inventory_ledger'
        ),

    SMART_INVENTORY:
        files.smart.includes(
            'consumeSmartInventory'
        ),

    RETURN_MULTI_BLOCK:
        files.returnEngine.includes(
            'DEVOLUCAO_MULTITEM_REQUER_LEDGER_POR_ITEM'
        ),

    RETURN_V16_UI:
        files.business.includes(
            'returnSaleV16'
        ),

    PAYMENT_RECEIVED_DB:
        files.op14.includes(
            'received_amount'
        ),

    CHANGE_DB:
        files.op14.includes(
            'change_amount'
        ),

    RELEASE_CODE:
        files.op14.includes(
            'release_code'
        ),

    RELEASE_ROUTE:
        files.op14.includes(
            '/release'
        ),

    PRINT_ROUTE:
        files.op14.includes(
            '/print'
        ),

    CHANGE_CORRECTION:
        files.op14.includes(
            'change_corrections'
        )
};

for(const [k,v] of Object.entries(checks)){
    log(`${k}: ${v ? 'SIM' : 'NAO'}`);
}

/*
 * ==========================================================
 * INTEGRIDADE
 * ==========================================================
 */

section('17. INTEGRIDADE');

const integrity=
    db.prepare(
        'PRAGMA integrity_check'
    ).get();

log('SQLITE:',integrity);

const sale7=db.prepare(`
    SELECT status
    FROM sales
    WHERE id=7
`).get();

const return7=db.prepare(`
    SELECT COUNT(*) c
    FROM sale_returns
    WHERE sale_id=7
`).get();

log(
    'VENDA #7 PRESERVADA:',
    Boolean(
        sale7 &&
        sale7.status==='CANCELLED' &&
        Number(return7.c)===0
    )
);

const sale9=db.prepare(`
    SELECT status,released_at
    FROM sales
    WHERE id=9
`).get();

const return9=db.prepare(`
    SELECT COUNT(*) c
    FROM sale_returns
    WHERE sale_id=9
`).get();

log(
    'VENDA #9 RETURN EVIDENCE:',
    {
        sale:sale9,
        returns:Number(return9.c)
    }
);

section('18. RESULTADO');

log('MAPEAMENTO OPERACIONAL: CONCLUIDO');
log('BANCO ALTERADO: NAO');
log('VENDA CRIADA: NAO');
log('DEVOLUCAO EXECUTADA: NAO');
log('CANCELAMENTO EXECUTADO: NAO');
log('ESTOQUE ALTERADO: NAO');

fs.writeFileSync(
    './FINAL-OPERATIONAL-MAP-V16.txt',
    out.join('\n'),
    'utf8'
);
