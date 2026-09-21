import {db} from "./db.js";

const n=v=>Number(v||0);
const txt=v=>String(v??"").trim();

function isoDate(v){
  const s=txt(v);
  if(!s)return null;
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m?`${m[1]}-${m[2]}-${m[3]}`:null;
}

function todayLocal(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function daysBetween(from,to){
  if(!to)return null;
  const a=new Date(`${from}T12:00:00`);
  const b=new Date(`${to}T12:00:00`);
  return Math.round((b-a)/86400000);
}

function expiryStatus(days){
  if(days===null)return "NO_EXPIRY";
  if(days<0)return "EXPIRED";
  if(days===0)return "TODAY";
  if(days<=3)return "CRITICAL";
  if(days<=7)return "URGENT";
  if(days<=15)return "ALERT";
  if(days<=30)return "ATTENTION";
  return "NORMAL";
}

function expiryLabel(days){
  if(days===null)return "Sem validade";
  if(days<0)return `Vencido ha ${Math.abs(days)} dia(s)`;
  if(days===0)return "Vence hoje";
  if(days===1)return "Vence em 1 dia";
  return `Vence em ${days} dias`;
}

export function initInventoryV49A(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_batches(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      batch_code TEXT NOT NULL,
      initial_qty REAL NOT NULL DEFAULT 0,
      remaining_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      manufactured_at TEXT,
      expires_at TEXT,
      supplier_id INTEGER,
      purchase_order_id INTEGER,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_product
      ON inventory_batches(product_id);

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry
      ON inventory_batches(expires_at);

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_fefo
      ON inventory_batches(product_id,expires_at,remaining_qty);

    CREATE TABLE IF NOT EXISTS inventory_losses(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      batch_id INTEGER,
      reason TEXT NOT NULL,
      qty REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      notes TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(batch_id) REFERENCES inventory_batches(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_losses_product
      ON inventory_losses(product_id);

    CREATE INDEX IF NOT EXISTS idx_inventory_losses_created
      ON inventory_losses(created_at);

    CREATE TABLE IF NOT EXISTS inventory_batch_movements(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      qty REAL NOT NULL,
      stock_movement_id INTEGER,
      user_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(batch_id) REFERENCES inventory_batches(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(stock_movement_id) REFERENCES stock_movements(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_batch_movements_batch
      ON inventory_batch_movements(batch_id);

    CREATE TABLE IF NOT EXISTS inventory_alert_ack(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_key TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(alert_key,user_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function productOrFail(id){
  const p=db.prepare(`
    SELECT *
    FROM products
    WHERE id=? AND active=1
  `).get(id);

  if(!p)throw new Error("PRODUCT_NOT_FOUND");
  return p;
}

function stockMovement({
  productId,
  type,
  qty,
  referenceType,
  referenceId=null,
  userId=null,
  notes=null,
  displayUnit=null
}){
  const r=db.prepare(`
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
    VALUES(?,?,?,?,?,?,?,?)
  `).run(
    productId,
    type,
    qty,
    referenceType,
    referenceId==null?null:String(referenceId),
    userId,
    notes,
    displayUnit
  );

  return Number(r.lastInsertRowid);
}

function consumeFefo(productId,qty,userId,movementId,notes){
  let remaining=n(qty);

  const batches=db.prepare(`
    SELECT *
    FROM inventory_batches
    WHERE product_id=?
      AND active=1
      AND remaining_qty>0
    ORDER BY
      CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
      date(expires_at) ASC,
      id ASC
  `).all(productId);

  const used=[];

  for(const batch of batches){
    if(remaining<=0)break;

    const take=Math.min(
      remaining,
      n(batch.remaining_qty)
    );

    if(take<=0)continue;

    db.prepare(`
      UPDATE inventory_batches
      SET
        remaining_qty=remaining_qty-?,
        updated_at=CURRENT_TIMESTAMP,
        active=CASE
          WHEN remaining_qty-?<=0 THEN 0
          ELSE active
        END
      WHERE id=?
    `).run(take,take,batch.id);

    db.prepare(`
      INSERT INTO inventory_batch_movements(
        batch_id,
        product_id,
        movement_type,
        qty,
        stock_movement_id,
        user_id,
        notes
      )
      VALUES(?,?,?,?,?,?,?)
    `).run(
      batch.id,
      productId,
      "OUT_FEFO",
      -take,
      movementId,
      userId,
      notes||null
    );

    used.push({
      batch_id:batch.id,
      batch_code:batch.batch_code,
      qty:take
    });

    remaining-=take;
  }

  return {
    allocated:n(qty)-remaining,
    legacy_unallocated:remaining,
    batches:used
  };
}

function alerts(){
  const today=todayLocal();

  const rows=db.prepare(`
    SELECT
      b.*,
      p.name product_name,
      p.category,
      p.stock_unit
    FROM inventory_batches b
    JOIN products p ON p.id=b.product_id
    WHERE b.active=1
      AND b.remaining_qty>0
      AND b.expires_at IS NOT NULL
    ORDER BY date(b.expires_at) ASC,b.id ASC
  `).all();

  return rows.map(x=>{
    const days=daysBetween(today,isoDate(x.expires_at));
    const status=expiryStatus(days);

    return {
      ...x,
      days_remaining:days,
      expiry_status:status,
      expiry_label:expiryLabel(days),
      value_at_risk:n(x.remaining_qty)*n(x.unit_cost),
      alert_key:`EXPIRY:${x.id}:${isoDate(x.expires_at)}`
    };
  });
}

export function registerInventoryV49A(
  app,
  {minRole,audit}
){
  app.get(
    "/api/v49/inventory/summary",
    minRole(55),
    (_req,res)=>{
      try{
        const products=db.prepare(`
          SELECT
            p.*,
            (
              SELECT MIN(date(b.expires_at))
              FROM inventory_batches b
              WHERE b.product_id=p.id
                AND b.active=1
                AND b.remaining_qty>0
                AND b.expires_at IS NOT NULL
            ) next_expiry,
            (
              SELECT COALESCE(SUM(b.remaining_qty),0)
              FROM inventory_batches b
              WHERE b.product_id=p.id
                AND b.active=1
                AND b.remaining_qty>0
            ) tracked_batch_qty
          FROM products p
          WHERE p.active=1
          ORDER BY p.category,p.name
        `).all();

        const expiry=alerts();

        const loss=db.prepare(`
          SELECT
            COALESCE(SUM(qty),0) qty,
            COALESCE(SUM(total_cost),0) value
          FROM inventory_losses
          WHERE date(created_at)>=date('now','-30 day')
        `).get();

        const criticalStock=products.filter(
          p=>n(p.stock)<=n(p.minimum_stock)
        ).length;

        const activeAlerts=expiry.filter(
          x=>x.days_remaining<=30
        );

        res.json({
          products,
          alerts:activeAlerts,
          metrics:{
            products:products.length,
            critical_stock:criticalStock,
            expired:activeAlerts.filter(
              x=>x.expiry_status==="EXPIRED"
            ).length,
            urgent:activeAlerts.filter(
              x=>[
                "TODAY",
                "CRITICAL",
                "URGENT"
              ].includes(x.expiry_status)
            ).length,
            value_at_risk:activeAlerts.reduce(
              (s,x)=>s+n(x.value_at_risk),0
            ),
            loss_30d_qty:n(loss.qty),
            loss_30d_value:n(loss.value)
          }
        });
      }
      catch(e){
        res.status(500).json({error:e.message});
      }
    }
  );

  app.get(
    "/api/v49/inventory/alerts",
    minRole(55),
    (req,res)=>{
      try{
        const seen=new Set(
          db.prepare(`
            SELECT alert_key
            FROM inventory_alert_ack
            WHERE user_id=?
          `).all(req.user.id).map(x=>x.alert_key)
        );

        const rows=alerts()
          .filter(x=>x.days_remaining<=30)
          .map(x=>({
            ...x,
            seen:seen.has(x.alert_key)
          }));

        res.json(rows);
      }
      catch(e){
        res.status(500).json({error:e.message});
      }
    }
  );

  app.post(
    "/api/v49/inventory/alerts/seen",
    minRole(55),
    (req,res)=>{
      try{
        const keys=Array.isArray(req.body?.keys)
          ?req.body.keys.map(txt).filter(Boolean)
          :[];

        const q=db.prepare(`
          INSERT INTO inventory_alert_ack(
            alert_key,user_id
          )
          VALUES(?,?)
          ON CONFLICT(alert_key,user_id)
          DO UPDATE SET seen_at=CURRENT_TIMESTAMP
        `);

        db.transaction(()=>{
          for(const key of keys)q.run(key,req.user.id);
        })();

        res.json({ok:true,count:keys.length});
      }
      catch(e){
        res.status(400).json({error:e.message});
      }
    }
  );

  app.get(
    "/api/v49/inventory/products/:id",
    minRole(55),
    (req,res)=>{
      try{
        const p=productOrFail(n(req.params.id));

        const batches=db.prepare(`
          SELECT *
          FROM inventory_batches
          WHERE product_id=?
          ORDER BY
            active DESC,
            CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
            date(expires_at) ASC,
            id DESC
        `).all(p.id).map(b=>{
          const days=b.expires_at
            ?daysBetween(todayLocal(),isoDate(b.expires_at))
            :null;

          return {
            ...b,
            days_remaining:days,
            expiry_status:expiryStatus(days),
            expiry_label:expiryLabel(days)
          };
        });

        const movements=db.prepare(`
          SELECT
            sm.*,
            u.name user_name
          FROM stock_movements sm
          LEFT JOIN users u ON u.id=sm.user_id
          WHERE sm.product_id=?
          ORDER BY sm.id DESC
          LIMIT 100
        `).all(p.id);

        const losses=db.prepare(`
          SELECT
            l.*,
            b.batch_code,
            u.name user_name
          FROM inventory_losses l
          LEFT JOIN inventory_batches b ON b.id=l.batch_id
          LEFT JOIN users u ON u.id=l.user_id
          WHERE l.product_id=?
          ORDER BY l.id DESC
          LIMIT 100
        `).all(p.id);

        const counts=db.prepare(`
          SELECT
            sc.*,
            u.name user_name
          FROM stock_counts sc
          LEFT JOIN users u ON u.id=sc.user_id
          WHERE sc.product_id=?
          ORDER BY sc.id DESC
          LIMIT 50
        `).all(p.id);

        res.json({
          product:p,
          batches,
          movements,
          losses,
          counts
        });
      }
      catch(e){
        res.status(
          e.message==="PRODUCT_NOT_FOUND"?404:500
        ).json({error:e.message});
      }
    }
  );

  app.post(
    "/api/v49/inventory/products/:id/entry",
    minRole(55),
    (req,res)=>{
      try{
        const productId=n(req.params.id);
        const p=productOrFail(productId);
        const b=req.body||{};
        const qty=n(b.qty);

        if(qty<=0){
          return res.status(400).json({
            error:"QTY_MUST_BE_POSITIVE"
          });
        }

        const unitCost=b.unit_cost==null
          ?n(p.cost)
          :n(b.unit_cost);

        const expiresAt=isoDate(b.expires_at);
        const manufacturedAt=isoDate(b.manufactured_at);

        if(
          manufacturedAt &&
          expiresAt &&
          manufacturedAt>expiresAt
        ){
          return res.status(400).json({
            error:"INVALID_EXPIRY_DATE"
          });
        }

        const result=db.transaction(()=>{
          db.prepare(`
            UPDATE products
            SET
              stock=stock+?,
              cost=CASE
                WHEN ?>0 THEN ?
                ELSE cost
              END
            WHERE id=?
          `).run(qty,unitCost,unitCost,productId);

          const moveId=stockMovement({
            productId,
            type:"MANUAL_IN",
            qty,
            referenceType:"INVENTORY_ENTRY",
            userId:req.user.id,
            notes:txt(b.notes)||null,
            displayUnit:p.stock_unit
          });

          const batchCode=
            txt(b.batch_code)||
            `ENT-${productId}-${Date.now()}`;

          const batch=db.prepare(`
            INSERT INTO inventory_batches(
              product_id,
              batch_code,
              initial_qty,
              remaining_qty,
              unit_cost,
              manufactured_at,
              expires_at,
              supplier_id,
              purchase_order_id,
              notes,
              created_by
            )
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
          `).run(
            productId,
            batchCode,
            qty,
            qty,
            unitCost,
            manufacturedAt,
            expiresAt,
            b.supplier_id?n(b.supplier_id):null,
            b.purchase_order_id?n(b.purchase_order_id):null,
            txt(b.notes)||null,
            req.user.id
          );

          db.prepare(`
            INSERT INTO inventory_batch_movements(
              batch_id,
              product_id,
              movement_type,
              qty,
              stock_movement_id,
              user_id,
              notes
            )
            VALUES(?,?,?,?,?,?,?)
          `).run(
            batch.lastInsertRowid,
            productId,
            "IN",
            qty,
            moveId,
            req.user.id,
            txt(b.notes)||null
          );

          return {
            movement_id:moveId,
            batch_id:Number(batch.lastInsertRowid),
            batch_code:batchCode
          };
        })();

        audit(
          req.user.id,
          "STOCK_ENTRY",
          "PRODUCT",
          productId,
          {
            qty,
            batch_id:result.batch_id,
            expires_at:expiresAt
          }
        );

        res.status(201).json({
          ok:true,
          ...result
        });
      }
      catch(e){
        res.status(400).json({error:e.message});
      }
    }
  );

  app.post(
    "/api/v49/inventory/products/:id/exit",
    minRole(55),
    (req,res)=>{
      try{
        const productId=n(req.params.id);
        const p=productOrFail(productId);
        const qty=n(req.body?.qty);
        const reason=txt(req.body?.reason);

        if(qty<=0){
          return res.status(400).json({
            error:"QTY_MUST_BE_POSITIVE"
          });
        }

        if(!reason){
          return res.status(400).json({
            error:"EXIT_REASON_REQUIRED"
          });
        }

        if(n(p.stock)<qty){
          return res.status(409).json({
            error:"INSUFFICIENT_STOCK"
          });
        }

        const result=db.transaction(()=>{
          db.prepare(`
            UPDATE products
            SET stock=stock-?
            WHERE id=?
          `).run(qty,productId);

          const moveId=stockMovement({
            productId,
            type:"MANUAL_OUT",
            qty:-qty,
            referenceType:"INVENTORY_EXIT",
            userId:req.user.id,
            notes:reason,
            displayUnit:p.stock_unit
          });

          const fefo=consumeFefo(
            productId,
            qty,
            req.user.id,
            moveId,
            reason
          );

          return {movement_id:moveId,fefo};
        })();

        audit(
          req.user.id,
          "STOCK_EXIT",
          "PRODUCT",
          productId,
          {qty,reason,fefo:result.fefo}
        );

        res.json({ok:true,...result});
      }
      catch(e){
        res.status(400).json({error:e.message});
      }
    }
  );

  app.post(
    "/api/v49/inventory/products/:id/loss",
    minRole(55),
    (req,res)=>{
      try{
        const productId=n(req.params.id);
        const p=productOrFail(productId);
        const b=req.body||{};
        const qty=n(b.qty);
        const reason=txt(b.reason);

        if(qty<=0){
          return res.status(400).json({
            error:"QTY_MUST_BE_POSITIVE"
          });
        }

        if(!reason){
          return res.status(400).json({
            error:"LOSS_REASON_REQUIRED"
          });
        }

        if(n(p.stock)<qty){
          return res.status(409).json({
            error:"INSUFFICIENT_STOCK"
          });
        }

        const batchId=b.batch_id?n(b.batch_id):null;

        const result=db.transaction(()=>{
          let unitCost=n(p.cost);
          let selectedBatch=null;

          if(batchId){
            selectedBatch=db.prepare(`
              SELECT *
              FROM inventory_batches
              WHERE id=? AND product_id=?
            `).get(batchId,productId);

            if(!selectedBatch){
              throw new Error("BATCH_NOT_FOUND");
            }

            if(n(selectedBatch.remaining_qty)<qty){
              throw new Error("BATCH_INSUFFICIENT_QTY");
            }

            unitCost=n(selectedBatch.unit_cost);

            db.prepare(`
              UPDATE inventory_batches
              SET
                remaining_qty=remaining_qty-?,
                updated_at=CURRENT_TIMESTAMP,
                active=CASE
                  WHEN remaining_qty-?<=0 THEN 0
                  ELSE active
                END
              WHERE id=?
            `).run(qty,qty,batchId);
          }

          db.prepare(`
            UPDATE products
            SET stock=stock-?
            WHERE id=?
          `).run(qty,productId);

          const lossType=
            reason.toUpperCase().includes("VENC")
            ?"EXPIRY_LOSS"
            :"LOSS";

          const moveId=stockMovement({
            productId,
            type:lossType,
            qty:-qty,
            referenceType:"INVENTORY_LOSS",
            userId:req.user.id,
            notes:reason,
            displayUnit:p.stock_unit
          });

          let fefo=null;

          if(batchId){
            db.prepare(`
              INSERT INTO inventory_batch_movements(
                batch_id,
                product_id,
                movement_type,
                qty,
                stock_movement_id,
                user_id,
                notes
              )
              VALUES(?,?,?,?,?,?,?)
            `).run(
              batchId,
              productId,
              lossType,
              -qty,
              moveId,
              req.user.id,
              reason
            );
          }
          else{
            fefo=consumeFefo(
              productId,
              qty,
              req.user.id,
              moveId,
              reason
            );
          }

          const totalCost=qty*unitCost;

          const loss=db.prepare(`
            INSERT INTO inventory_losses(
              product_id,
              batch_id,
              reason,
              qty,
              unit_cost,
              total_cost,
              notes,
              user_id
            )
            VALUES(?,?,?,?,?,?,?,?)
          `).run(
            productId,
            batchId,
            reason,
            qty,
            unitCost,
            totalCost,
            txt(b.notes)||null,
            req.user.id
          );

          return {
            loss_id:Number(loss.lastInsertRowid),
            movement_id:moveId,
            total_cost:totalCost,
            fefo
          };
        })();

        audit(
          req.user.id,
          "STOCK_LOSS",
          "PRODUCT",
          productId,
          {
            qty,
            reason,
            batch_id:batchId,
            total_cost:result.total_cost
          }
        );

        res.status(201).json({
          ok:true,
          ...result
        });
      }
      catch(e){
        res.status(400).json({error:e.message});
      }
    }
  );

  app.post(
    "/api/v49/inventory/products/:id/count",
    minRole(55),
    (req,res)=>{
      try{
        const productId=n(req.params.id);
        const p=productOrFail(productId);
        const counted=n(req.body?.counted_qty);
        const reason=txt(req.body?.reason);

        if(counted<0){
          return res.status(400).json({
            error:"INVALID_COUNT"
          });
        }

        const expected=n(p.stock);
        const variance=counted-expected;

        const result=db.transaction(()=>{
          const count=db.prepare(`
            INSERT INTO stock_counts(
              product_id,
              expected_qty,
              counted_qty,
              variance_qty,
              reason,
              user_id
            )
            VALUES(?,?,?,?,?,?)
          `).run(
            productId,
            expected,
            counted,
            variance,
            reason,
            req.user.id
          );

          db.prepare(`
            UPDATE products
            SET stock=?
            WHERE id=?
          `).run(counted,productId);

          let movementId=null;

          if(variance!==0){
            movementId=stockMovement({
              productId,
              type:"COUNT_VARIANCE",
              qty:variance,
              referenceType:"STOCK_COUNT",
              referenceId:count.lastInsertRowid,
              userId:req.user.id,
              notes:reason||"Contagem fisica",
              displayUnit:p.stock_unit
            });
          }

          return {
            count_id:Number(count.lastInsertRowid),
            movement_id:movementId
          };
        })();

        audit(
          req.user.id,
          "STOCK_COUNT",
          "PRODUCT",
          productId,
          {
            expected,
            counted,
            variance,
            reason
          }
        );

        res.status(201).json({
          ok:true,
          expected,
          counted,
          variance,
          ...result
        });
      }
      catch(e){
        res.status(400).json({error:e.message});
      }
    }
  );
}
