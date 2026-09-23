import { db } from "./db.js";

/*
 * ============================================================
 * NEXUS HOSPITALITY ONE
 * TENANT CONTEXT CORE V1
 * ============================================================
 *
 * SECURITY RULES
 *
 * - Tenant is resolved server-side.
 * - Never trust tenant_id from request body/query/header.
 * - User must have active tenant membership.
 * - OWNER fallback may use saas_tenants.owner_user_id.
 * - Operational code receives req.tenant.
 * - Cross-tenant access must be explicitly rejected/scoped.
 * ============================================================
 */

function integer(value){
  const n=Number(value);
  return Number.isInteger(n) && n>0 ? n : null;
}


export function tenantMembershipsForUser(userId){

  const id=integer(userId);

  if(!id){
    return [];
  }

  return db.prepare(`
    SELECT
      t.id,
      t.public_id,
      t.code,
      t.legal_name,
      t.trade_name,
      t.status,
      t.owner_user_id,
      stu.tenant_role,
      stu.active AS membership_active
    FROM saas_tenant_users stu
    JOIN saas_tenants t
      ON t.id=stu.tenant_id
    WHERE stu.user_id=?
      AND stu.active=1
    ORDER BY
      CASE
        WHEN stu.tenant_role='OWNER' THEN 0
        WHEN stu.tenant_role='ADMIN' THEN 1
        WHEN stu.tenant_role='MANAGER' THEN 2
        ELSE 3
      END,
      t.id
  `).all(id);
}


export function resolveTenantForUser(userId){

  const id=integer(userId);

  if(!id){
    return null;
  }

  /*
   * Primary source:
   * active membership.
   */
  const memberships=
    tenantMembershipsForUser(id);

  if(memberships.length===1){
    return memberships[0];
  }

  /*
   * V1 intentionally refuses ambiguous multi-tenant
   * automatic selection.
   *
   * Later we can add explicit active-tenant switching
   * validated against membership.
   */
  if(memberships.length>1){
    const error=
      new Error("TENANT_SELECTION_REQUIRED");

    error.code=
      "TENANT_SELECTION_REQUIRED";

    error.tenants=
      memberships.map(t=>({
        id:t.id,
        public_id:t.public_id,
        code:t.code,
        trade_name:t.trade_name,
        tenant_role:t.tenant_role
      }));

    throw error;
  }

  /*
   * Owner fallback.
   * Useful during controlled migration.
   */
  const owned=
    db.prepare(`
      SELECT
        id,
        public_id,
        code,
        legal_name,
        trade_name,
        status,
        owner_user_id,
        'OWNER' AS tenant_role,
        1 AS membership_active
      FROM saas_tenants
      WHERE owner_user_id=?
      ORDER BY id
    `).all(id);

  if(owned.length===1){
    return owned[0];
  }

  if(owned.length>1){
    const error=
      new Error("TENANT_SELECTION_REQUIRED");

    error.code=
      "TENANT_SELECTION_REQUIRED";

    error.tenants=
      owned.map(t=>({
        id:t.id,
        public_id:t.public_id,
        code:t.code,
        trade_name:t.trade_name,
        tenant_role:"OWNER"
      }));

    throw error;
  }

  return null;
}


export function tenantContextMiddleware(options={}){

  const required=
    options.required!==false;

  return function tenantContext(req,res,next){

    try{

      if(!req.user?.id){

        if(!required){
          req.tenant=null;
          return next();
        }

        return res.status(401).json({
          error:"AUTH_REQUIRED"
        });
      }

      /*
       * IMPORTANT:
       * no tenant_id is read from:
       * - req.body
       * - req.query
       * - req.params
       * - custom headers
       *
       * Tenant ownership comes from authenticated identity.
       */
      const tenant=
        resolveTenantForUser(
          req.user.id
        );

      if(!tenant){

        if(!required){
          req.tenant=null;
          return next();
        }

        return res.status(403).json({
          error:"TENANT_MEMBERSHIP_REQUIRED"
        });
      }

      req.tenant={
        id:tenant.id,
        public_id:tenant.public_id,
        code:tenant.code,
        legal_name:tenant.legal_name,
        trade_name:tenant.trade_name,
        status:tenant.status,
        owner_user_id:tenant.owner_user_id,
        role:tenant.tenant_role
      };

      next();

    }catch(error){

      if(
        error?.code===
        "TENANT_SELECTION_REQUIRED"
      ){
        return res.status(409).json({
          error:"TENANT_SELECTION_REQUIRED",
          tenants:error.tenants || []
        });
      }

      next(error);
    }
  };
}


export function requireTenant(req,res,next){

  return tenantContextMiddleware({
    required:true
  })(req,res,next);
}


export function optionalTenant(req,res,next){

  return tenantContextMiddleware({
    required:false
  })(req,res,next);
}


export function tenantIdFromRequest(req){

  const id=
    integer(
      req?.tenant?.id
    );

  if(!id){
    const error=
      new Error(
        "TENANT_CONTEXT_REQUIRED"
      );

    error.code=
      "TENANT_CONTEXT_REQUIRED";

    throw error;
  }

  return id;
}


export function assertTenantObject(
  req,
  objectTenantId
){

  const tenantId=
    tenantIdFromRequest(req);

  const objectId=
    integer(objectTenantId);

  if(
    !objectId ||
    tenantId!==objectId
  ){
    const error=
      new Error(
        "CROSS_TENANT_ACCESS_DENIED"
      );

    error.code=
      "CROSS_TENANT_ACCESS_DENIED";

    throw error;
  }

  return true;
}


export function tenantWhere(
  req,
  alias=null
){

  const tenantId=
    tenantIdFromRequest(req);

  const prefix=
    alias
      ? `${alias}.`
      : "";

  return {
    sql:`${prefix}tenant_id=?`,
    params:[tenantId]
  };
}