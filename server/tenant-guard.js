import { db } from "./db.js";

/*
 * NEXUS HOSPITALITY ONE
 * TENANT GUARD V1
 *
 * The client never chooses ownership.
 * Tenant ownership is resolved only from authenticated user membership.
 */

function positiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function membershipsForUser(userId) {

  const id = positiveInteger(userId);

  if (!id) return [];

  return db.prepare(`
    SELECT
      stu.id AS membership_id,
      stu.tenant_id,
      stu.tenant_role,
      stu.active AS membership_active,

      st.public_id,
      st.code,
      st.legal_name,
      st.trade_name,
      st.email,
      st.status,
      st.owner_user_id

    FROM saas_tenant_users stu

    JOIN saas_tenants st
      ON st.id = stu.tenant_id

    WHERE stu.user_id = ?
      AND stu.active = 1

    ORDER BY stu.id ASC
  `).all(id);
}

export function resolveTenantForUser(userId) {

  const rows = membershipsForUser(userId);

  if (rows.length === 0) {
    return {
      ok: false,
      code: "TENANT_ACCESS_REQUIRED"
    };
  }

  /*
   * V1:
   * exactly one operational membership is expected.
   *
   * PENDING tenant is intentionally accepted because the migrated
   * Parada Obrigatoria tenant is currently PENDING while already
   * containing the operational legacy data.
   *
   * Commercial subscription state remains separate.
   */

  if (rows.length > 1) {
    return {
      ok: false,
      code: "TENANT_SELECTION_REQUIRED",
      tenants: rows
    };
  }

  const row = rows[0];

  return {
    ok: true,

    tenant: {
      id: Number(row.tenant_id),
      public_id: row.public_id,
      code: row.code,
      legal_name: row.legal_name,
      trade_name: row.trade_name,
      email: row.email,
      status: row.status,
      owner_user_id:
        row.owner_user_id == null
          ? null
          : Number(row.owner_user_id),

      role: row.tenant_role,
      membership_id:
        Number(row.membership_id)
    }
  };
}

export function tenantContext(req, res, next) {

  if (!req?.user?.id) {
    return res.status(401).json({
      error: "AUTH_REQUIRED"
    });
  }

  const result =
    resolveTenantForUser(req.user.id);

  if (!result.ok) {

    if (
      result.code ===
      "TENANT_SELECTION_REQUIRED"
    ) {
      return res.status(409).json({
        error:
          "TENANT_SELECTION_REQUIRED"
      });
    }

    return res.status(403).json({
      error:
        "TENANT_ACCESS_REQUIRED"
    });
  }

  req.tenant = result.tenant;
  req.tenantId = result.tenant.id;

  next();
}

export function tenantId(req) {

  const id =
    positiveInteger(
      req?.tenant?.id ??
      req?.tenantId
    );

  if (!id) {
    const error =
      new Error(
        "TENANT_CONTEXT_REQUIRED"
      );

    error.code =
      "TENANT_CONTEXT_REQUIRED";

    throw error;
  }

  return id;
}

export function assertTenantRow(
  req,
  row,
  field = "tenant_id"
) {

  if (!row) return row;

  const expected = tenantId(req);
  const actual =
    positiveInteger(row[field]);

  if (actual !== expected) {

    const error =
      new Error(
        "TENANT_RESOURCE_NOT_FOUND"
      );

    error.code =
      "TENANT_RESOURCE_NOT_FOUND";

    throw error;
  }

  return row;
}

export function tenantClause(
  req,
  alias = null
) {

  const id = tenantId(req);

  if (
    alias &&
    !/^[A-Za-z_][A-Za-z0-9_]*$/
      .test(alias)
  ) {
    throw new Error(
      "INVALID_TENANT_ALIAS"
    );
  }

  return {
    sql:
      alias
        ? `${alias}.tenant_id = ?`
        : "tenant_id = ?",

    params: [id]
  };
}

export function tenantInsert(req) {
  return tenantId(req);
}

export function tenantOwned(
  req,
  table,
  id
) {

  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/
      .test(String(table))
  ) {
    throw new Error(
      "INVALID_TABLE"
    );
  }

  const resourceId =
    positiveInteger(id);

  if (!resourceId) return null;

  return db.prepare(`
    SELECT *
    FROM "${table}"
    WHERE id = ?
      AND tenant_id = ?
  `).get(
    resourceId,
    tenantId(req)
  );
}

/* ============================================================
   NEXUS HOSPITALITY ONE
   TENANT SQL GUARD V3
   ============================================================ */

const TENANT_TABLE_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*$/;

function safeTable(table){
  const value=String(table||'').trim();

  if(!TENANT_TABLE_PATTERN.test(value)){
    throw new Error('INVALID_TENANT_TABLE');
  }

  return value;
}

export function tenantRootById(
  req,
  table,
  id,
  {
    idColumn='id',
    columns='*'
  }={}
){
  const tenant=tenantId(req);
  const t=safeTable(table);
  const key=safeTable(idColumn);

  return db.prepare(
    `SELECT ${columns}
       FROM "${t}"
      WHERE "${key}"=?
        AND tenant_id=?
      LIMIT 1`
  ).get(
    Number(id)||0,
    tenant
  );
}

export function tenantRootExists(
  req,
  table,
  id,
  options={}
){
  return Boolean(
    tenantRootById(
      req,
      table,
      id,
      {
        ...options,
        columns:'id'
      }
    )
  );
}

export function tenantRootUpdate(
  req,
  table,
  id,
  setSql,
  params=[]
){
  const tenant=tenantId(req);
  const t=safeTable(table);

  if(!String(setSql||'').trim()){
    throw new Error('TENANT_UPDATE_SET_REQUIRED');
  }

  return db.prepare(
    `UPDATE "${t}"
        SET ${setSql}
      WHERE id=?
        AND tenant_id=?`
  ).run(
    ...params,
    Number(id)||0,
    tenant
  );
}

export function tenantRootDelete(
  req,
  table,
  id
){
  const tenant=tenantId(req);
  const t=safeTable(table);

  return db.prepare(
    `DELETE FROM "${t}"
      WHERE id=?
        AND tenant_id=?`
  ).run(
    Number(id)||0,
    tenant
  );
}

export function tenantProduct(
  req,
  productId,
  {
    activeOnly=false
  }={}
){
  const tenant=tenantId(req);

  return db.prepare(
    `SELECT *
       FROM products
      WHERE id=?
        AND tenant_id=?
        ${activeOnly ? 'AND active=1' : ''}
      LIMIT 1`
  ).get(
    Number(productId)||0,
    tenant
  );
}

export function tenantOrder(
  req,
  orderId
){
  const tenant=tenantId(req);

  return db.prepare(
    `SELECT *
       FROM orders
      WHERE id=?
        AND tenant_id=?
      LIMIT 1`
  ).get(
    Number(orderId)||0,
    tenant
  );
}

export function tenantCashSession(
  req,
  cashId
){
  const tenant=tenantId(req);

  return db.prepare(
    `SELECT *
       FROM cash_sessions
      WHERE id=?
        AND tenant_id=?
      LIMIT 1`
  ).get(
    Number(cashId)||0,
    tenant
  );
}

export function tenantOpenCash(
  req
){
  const tenant=tenantId(req);

  return db.prepare(
    `SELECT *
       FROM cash_sessions
      WHERE tenant_id=?
        AND status='OPEN'
      ORDER BY id DESC
      LIMIT 1`
  ).get(tenant);
}

export function tenantEmployee(
  req,
  employeeId
){
  const tenant=tenantId(req);

  return db.prepare(
    `SELECT *
       FROM employees
      WHERE id=?
        AND tenant_id=?
      LIMIT 1`
  ).get(
    Number(employeeId)||0,
    tenant
  );
}

export function tenantEvent(
  req,
  eventId
){
  const tenant=tenantId(req);

  return db.prepare(
    `SELECT *
       FROM events
      WHERE id=?
        AND tenant_id=?
      LIMIT 1`
  ).get(
    Number(eventId)||0,
    tenant
  );
}

export function assertSameTenant(
  req,
  row,
  {
    field='tenant_id',
    error='TENANT_RESOURCE_NOT_FOUND'
  }={}
){
  if(!row){
    const e=new Error(error);
    e.status=404;
    throw e;
  }

  const expected=tenantId(req);
  const actual=Number(row[field]||0);

  if(
    !actual ||
    actual!==expected
  ){
    const e=new Error(error);
    e.status=404;
    throw e;
  }

  return row;
}

export function tenantDependentOrderItem(
  req,
  itemId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT oi.*
      FROM order_items oi
      JOIN orders o
        ON o.id=oi.order_id
     WHERE oi.id=?
       AND o.tenant_id=?
     LIMIT 1
  `).get(
    Number(itemId)||0,
    tenant
  );
}

export function tenantDependentSaleItem(
  req,
  itemId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT si.*
      FROM sale_items si
      JOIN sales s
        ON s.id=si.sale_id
     WHERE si.id=?
       AND s.tenant_id=?
     LIMIT 1
  `).get(
    Number(itemId)||0,
    tenant
  );
}

export function tenantDependentRecipe(
  req,
  recipeId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT r.*
      FROM recipes r
      JOIN products p
        ON p.id=r.product_id
     WHERE r.id=?
       AND p.tenant_id=?
     LIMIT 1
  `).get(
    Number(recipeId)||0,
    tenant
  );
}

export function tenantDependentRecipeItem(
  req,
  itemId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT ri.*
      FROM recipe_items ri
      JOIN recipes r
        ON r.id=ri.recipe_id
      JOIN products p
        ON p.id=r.product_id
     WHERE ri.id=?
       AND p.tenant_id=?
     LIMIT 1
  `).get(
    Number(itemId)||0,
    tenant
  );
}

export function tenantDependentPurchaseOrder(
  req,
  purchaseOrderId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT po.*
      FROM purchase_orders po
      JOIN suppliers s
        ON s.id=po.supplier_id
     WHERE po.id=?
       AND s.tenant_id=?
     LIMIT 1
  `).get(
    Number(purchaseOrderId)||0,
    tenant
  );
}

export function tenantDependentTicketLot(
  req,
  lotId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT tl.*
      FROM ticket_lots tl
      JOIN events e
        ON e.id=tl.event_id
     WHERE tl.id=?
       AND e.tenant_id=?
     LIMIT 1
  `).get(
    Number(lotId)||0,
    tenant
  );
}

export function tenantDependentTicketOrder(
  req,
  ticketOrderId
){
  const tenant=tenantId(req);

  return db.prepare(`
    SELECT tor.*
      FROM ticket_orders tor
      JOIN events e
        ON e.id=tor.event_id
     WHERE tor.id=?
       AND e.tenant_id=?
     LIMIT 1
  `).get(
    Number(ticketOrderId)||0,
    tenant
  );
}

/* END TENANT SQL GUARD V3 */