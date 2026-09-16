import {db} from './db.js';

const n=v=>Number(v||0);
const EPS=0.000001;
const round=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

function itemLedgerTableExists(){
  return !!db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type='table'
      AND name='sale_item_inventory_ledger'
  `).get();
}

export function returnedQtyForSaleItem(saleItemId){
  const row=db.prepare(`
    SELECT COALESCE(SUM(sri.qty),0) qty
    FROM sale_return_items sri
    JOIN sale_returns sr ON sr.id=sri.return_id
    WHERE sri.sale_item_id=?
  `).get(saleItemId);

  return n(row?.qty);
}

function itemRows(saleId){
  return db.prepare(`
    SELECT
      si.*,
      p.name,
      p.stock,
      COALESCE(ip.closed_units,0) closed_units,
      COALESCE(ip.open_base,0) open_base
    FROM sale_items si
    JOIN products p ON p.id=si.product_id
    LEFT JOIN inventory_profiles ip
      ON ip.product_id=si.product_id
    WHERE si.sale_id=?
    ORDER BY si.id
  `).all(saleId);
}

function itemLedger(saleItemId){
  if(!itemLedgerTableExists())return [];

  return db.prepare(`
    SELECT *
    FROM sale_item_inventory_ledger
    WHERE sale_item_id=?
    ORDER BY id
  `).all(saleItemId);
}

function legacyLedger(saleId){
  return db.prepare(`
    SELECT *
    FROM sale_inventory_ledger
    WHERE sale_id=?
    ORDER BY id
  `).all(saleId);
}

export function returnableItems(saleId){
  return itemRows(saleId).map(item=>{
    const returned=returnedQtyForSaleItem(item.id);
    const available=Math.max(0,n(item.qty)-returned);
    const ledger=itemLedger(item.id);

    return {
      ...item,
      returned_qty:returned,
      returnable_qty:available,
      item_ledger:ledger.length>0,
      ledger_rows:ledger.length
    };
  });
}

function validateQty(item,qty){
  qty=n(qty);

  if(qty<=EPS){
    throw new Error('QUANTIDADE_DEVOLUCAO_INVALIDA');
  }

  if(qty-n(item.returnable_qty)>EPS){
    throw new Error(
      `DEVOLUCAO_EXCEDE_SALDO_ITEM_${item.id}`
    );
  }

  return qty;
}

export function validateReturnRequest(saleId,requested){
  const sale=db.prepare(`
    SELECT *
    FROM sales
    WHERE id=?
  `).get(saleId);

  if(!sale){
    throw new Error('VENDA_NAO_ENCONTRADA');
  }

  if(sale.status!=='PAID'){
    throw new Error('VENDA_NAO_ESTA_PAGA');
  }

  const all=returnableItems(saleId);

  if(!all.length){
    throw new Error('VENDA_SEM_ITENS');
  }

  if(!Array.isArray(requested)||!requested.length){
    throw new Error('DEVOLUCAO_SEM_ITENS');
  }

  const seen=new Set();

  const normalized=requested.map(req=>{
    const id=n(req.sale_item_id);

    if(seen.has(id)){
      throw new Error(
        `ITEM_DUPLICADO_NA_DEVOLUCAO_${id}`
      );
    }

    seen.add(id);

    const item=all.find(x=>n(x.id)===id);

    if(!item){
      throw new Error(
        `ITEM_NAO_PERTENCE_A_VENDA_${id}`
      );
    }

    const qty=validateQty(item,req.qty);

    return {
      ...item,
      requested_qty:qty
    };
  });

  /*
   * Compatibilidade histórica:
   * vendas anteriores ao item-ledger continuam permitidas
   * apenas na condição já segura da V1.6:
   * um único item e devolução integral do saldo.
   */
  const allHaveItemLedger=
    normalized.every(x=>x.item_ledger);

  if(!allHaveItemLedger){

    if(all.length!==1 || normalized.length!==1){
      throw new Error(
        'DEVOLUCAO_HISTORICA_MULTITEM_NAO_SUPORTADA'
      );
    }

    const item=normalized[0];

    if(
      Math.abs(
        n(item.requested_qty)-n(item.returnable_qty)
      )>EPS
    ){
      throw new Error(
        'DEVOLUCAO_HISTORICA_EXIGE_SALDO_INTEGRAL'
      );
    }
  }

  return {
    sale,
    all_items:all,
    requested:normalized,
    modern_item_ledger:allHaveItemLedger
  };
}

function planModernItem(item){
  const ledger=itemLedger(item.id);

  if(!ledger.length){
    throw new Error(
      `LEDGER_ITEM_NAO_ENCONTRADO_${item.id}`
    );
  }

  const originalQty=n(item.qty);
  const requested=n(item.requested_qty);

  if(originalQty<=EPS){
    throw new Error(
      `QUANTIDADE_ORIGINAL_INVALIDA_${item.id}`
    );
  }

  const fullItem=
    Math.abs(requested-originalQty)<=EPS;

  /*
   * Reversão parcial de embalagem/estoque inteligente é
   * fisicamente ambígua. Exemplo: não podemos devolver
   * "0,5 garrafa fechada".
   */
  const hasSmartPhysicalMovement=
    ledger.some(row=>
      Math.abs(n(row.closed_delta))>EPS ||
      Math.abs(n(row.open_delta))>EPS
    );

  if(!fullItem && hasSmartPhysicalMovement){
    throw new Error(
      `DEVOLUCAO_PARCIAL_ESTOQUE_INTELIGENTE_BLOQUEADA_ITEM_${item.id}`
    );
  }

  /*
   * Produto/ingrediente com stock_delta simples pode ser
   * proporcionalizado com segurança.
   */
  const ratio=fullItem ? 1 : requested/originalQty;

  return ledger.map(row=>({
    sale_item_id:item.id,
    affected_product_id:n(row.affected_product_id),
    stock_restore:-n(row.stock_delta)*ratio,
    closed_restore:-n(row.closed_delta)*ratio,
    open_restore:-n(row.open_delta)*ratio,
    ratio,
    source_mode:row.source_mode||item.sale_mode,
    full_item:fullItem
  }));
}

function planHistorical(validation){
  const item=validation.requested[0];
  const ledger=legacyLedger(validation.sale.id);

  if(!ledger.length){
    throw new Error(
      'LEDGER_DA_VENDA_NAO_ENCONTRADO'
    );
  }

  /*
   * Histórico só chega aqui em devolução integral do único
   * item/saldo. Reverte o ledger legado exatamente.
   */
  return ledger.map(row=>({
    sale_item_id:item.id,
    affected_product_id:n(row.product_id),
    stock_restore:-n(row.stock_delta),
    closed_restore:-n(row.closed_delta),
    open_restore:-n(row.open_delta),
    ratio:1,
    source_mode:item.sale_mode,
    full_item:true
  }));
}

export function buildInventoryReturnPlan(validation){
  if(validation.modern_item_ledger){
    return validation.requested.flatMap(
      planModernItem
    );
  }

  return planHistorical(validation);
}

export function applyInventoryReturnPlan(
  plan,
  userId,
  returnId,
  reason
){
  for(const row of plan){

    if(Math.abs(n(row.stock_restore))>EPS){
      db.prepare(`
        UPDATE products
        SET stock=COALESCE(stock,0)+?
        WHERE id=?
      `).run(
        n(row.stock_restore),
        row.affected_product_id
      );
    }

    if(
      Math.abs(n(row.closed_restore))>EPS ||
      Math.abs(n(row.open_restore))>EPS
    ){
      const profile=db.prepare(`
        SELECT *
        FROM inventory_profiles
        WHERE product_id=?
      `).get(row.affected_product_id);

      if(!profile){
        throw new Error(
          `PERFIL_ESTOQUE_NAO_ENCONTRADO_${row.affected_product_id}`
        );
      }

      const nextClosed=
        n(profile.closed_units)+
        n(row.closed_restore);

      const nextOpen=
        n(profile.open_base)+
        n(row.open_restore);

      if(nextClosed < -EPS || nextOpen < -EPS){
        throw new Error(
          `REVERSAO_ESTOQUE_INVALIDA_${row.affected_product_id}`
        );
      }

      db.prepare(`
        UPDATE inventory_profiles
        SET
          closed_units=?,
          open_base=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE product_id=?
      `).run(
        Math.max(0,nextClosed),
        Math.max(0,nextOpen),
        row.affected_product_id
      );
    }

    const movementQty=
      Math.abs(n(row.stock_restore))>EPS
        ? n(row.stock_restore)
        : Math.abs(n(row.open_restore))>EPS
          ? n(row.open_restore)
          : n(row.closed_restore);

    db.prepare(`
      INSERT INTO stock_movements(
        product_id,
        type,
        qty,
        reference_type,
        reference_id,
        user_id,
        notes,
        display_unit
      )
      VALUES(
        ?,
        'SALE_RETURN_REVERSAL',
        ?,
        'SALE_RETURN',
        ?,
        ?,
        ?,
        ?
      )
    `).run(
      row.affected_product_id,
      movementQty,
      String(returnId),
      userId,
      `Devolução V1.6.1 • ${reason} • sale_item ${row.sale_item_id}`,
      row.source_mode||null
    );
  }
}

export function calculateReturnTotal(items){
  return round(
    items.reduce(
      (sum,item)=>
        sum+
        n(item.requested_qty)*
        n(item.unit_price),
      0
    )
  );
}

export function returnCoverage(saleId){
  const items=returnableItems(saleId);

  const originalQty=items.reduce(
    (a,x)=>a+n(x.qty),
    0
  );

  const returnedQty=items.reduce(
    (a,x)=>a+n(x.returned_qty),
    0
  );

  const remainingQty=items.reduce(
    (a,x)=>a+n(x.returnable_qty),
    0
  );

  const returnedValue=round(
    db.prepare(`
      SELECT COALESCE(SUM(total),0) total
      FROM sale_returns
      WHERE sale_id=?
    `).get(saleId)?.total
  );

  let status='SEM_DEVOLUCAO';

  if(returnedQty>EPS){
    status=
      remainingQty<=EPS
        ? 'DEVOLVIDA'
        : 'DEVOLUCAO_PARCIAL';
  }

  return {
    status,
    original_qty:originalQty,
    returned_qty:returnedQty,
    remaining_qty:remainingQty,
    returned_value:returnedValue
  };
}
