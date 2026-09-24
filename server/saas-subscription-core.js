import crypto from 'node:crypto';
import { db } from './db.js';

function normalizeEmail(value=''){
  return String(value || '').trim().toLowerCase();
}

function normalizeCode(value=''){
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}

function publicId(prefix){
  return `${prefix}_${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

function nowIso(){
  return new Date().toISOString();
}

function parseJson(value,fallback={}){
  try{
    return JSON.parse(value || '');
  }catch{
    return fallback;
  }
}

function ensureSchema(){

  db.exec(`
    CREATE TABLE IF NOT EXISTS saas_tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      legal_name TEXT NOT NULL,
      trade_name TEXT,
      document TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      owner_user_id INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      activated_at TEXT,
      suspended_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(owner_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_saas_tenants_status
      ON saas_tenants(status);

    CREATE INDEX IF NOT EXISTS idx_saas_tenants_email
      ON saas_tenants(email);

    CREATE TABLE IF NOT EXISTS saas_tenant_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      tenant_role TEXT NOT NULL DEFAULT 'STAFF',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id,user_id),
      FOREIGN KEY(tenant_id) REFERENCES saas_tenants(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_saas_tenant_users_tenant
      ON saas_tenant_users(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_saas_tenant_users_user
      ON saas_tenant_users(user_id);

    CREATE TABLE IF NOT EXISTS saas_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      tenant_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      promotion_id INTEGER,
      status TEXT NOT NULL DEFAULT 'PENDING',
      billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
      currency TEXT NOT NULL DEFAULT 'BRL',

      base_price REAL NOT NULL,
      contracted_price REAL NOT NULL,

      promotion_code TEXT,
      promotion_benefit_months INTEGER,
      promotion_started_at TEXT,
      promotion_ends_at TEXT,

      provider TEXT,
      provider_customer_id TEXT,
      provider_subscription_id TEXT,

      current_period_start TEXT,
      current_period_end TEXT,
      next_due_date TEXT,

      started_at TEXT,
      activated_at TEXT,
      cancelled_at TEXT,
      past_due_at TEXT,

      metadata_json TEXT NOT NULL DEFAULT '{}',

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY(tenant_id) REFERENCES saas_tenants(id),
      FOREIGN KEY(plan_id) REFERENCES saas_plans(id),
      FOREIGN KEY(promotion_id) REFERENCES saas_promotions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant
      ON saas_subscriptions(tenant_id);

    CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status
      ON saas_subscriptions(status);

    CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_provider
      ON saas_subscriptions(provider,provider_subscription_id);

    CREATE TABLE IF NOT EXISTS saas_subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      subscription_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,

      provider TEXT,
      provider_payment_id TEXT,

      status TEXT NOT NULL DEFAULT 'PENDING',
      billing_type TEXT,

      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'BRL',

      due_date TEXT,
      paid_at TEXT,

      invoice_url TEXT,
      pix_payload TEXT,

      raw_json TEXT,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY(subscription_id) REFERENCES saas_subscriptions(id),
      FOREIGN KEY(tenant_id) REFERENCES saas_tenants(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_subscription_payment_provider
      ON saas_subscription_payments(provider,provider_payment_id)
      WHERE provider_payment_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_saas_subscription_payments_subscription
      ON saas_subscription_payments(subscription_id);

    CREATE TABLE IF NOT EXISTS saas_subscription_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,

      event_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'SYSTEM',

      previous_status TEXT,
      new_status TEXT,

      payload_json TEXT NOT NULL DEFAULT '{}',

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY(subscription_id) REFERENCES saas_subscriptions(id),
      FOREIGN KEY(tenant_id) REFERENCES saas_tenants(id)
    );

    CREATE INDEX IF NOT EXISTS idx_saas_subscription_events_subscription
      ON saas_subscription_events(subscription_id);

    CREATE INDEX IF NOT EXISTS idx_saas_subscription_events_tenant
      ON saas_subscription_events(tenant_id);

    CREATE TABLE IF NOT EXISTS saas_promotion_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      promotion_id INTEGER NOT NULL,
      subscription_id INTEGER NOT NULL UNIQUE,
      tenant_id INTEGER NOT NULL,

      status TEXT NOT NULL DEFAULT 'REDEEMED',

      redeemed_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      metadata_json TEXT NOT NULL
        DEFAULT '{}',

      created_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      updated_at TEXT NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY(promotion_id)
        REFERENCES saas_promotions(id),

      FOREIGN KEY(subscription_id)
        REFERENCES saas_subscriptions(id),

      FOREIGN KEY(tenant_id)
        REFERENCES saas_tenants(id)
    );

    CREATE INDEX IF NOT EXISTS
      idx_saas_promotion_redemptions_promotion
      ON saas_promotion_redemptions(promotion_id);

    CREATE INDEX IF NOT EXISTS
      idx_saas_promotion_redemptions_tenant
      ON saas_promotion_redemptions(tenant_id);
  `);
}

function getPlan(code){
  return db.prepare(`
    SELECT *
    FROM saas_plans
    WHERE UPPER(code)=UPPER(?)
      AND active=1
  `).get(String(code || '').trim());
}

function getPromotionForPlan(planId,promotionCode=null){

  if(promotionCode){

    return db.prepare(`
      SELECT *
      FROM saas_promotions
      WHERE plan_id=?
        AND UPPER(code)=UPPER(?)
        AND active=1
        AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
        AND (ends_at IS NULL OR datetime(ends_at) >= datetime('now'))
        AND (
          max_redemptions IS NULL
          OR redemption_count < max_redemptions
        )
      LIMIT 1
    `).get(planId,String(promotionCode).trim());
  }

  return db.prepare(`
    SELECT *
    FROM saas_promotions
    WHERE plan_id=?
      AND active=1
      AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
      AND (ends_at IS NULL OR datetime(ends_at) >= datetime('now'))
      AND (
        max_redemptions IS NULL
        OR redemption_count < max_redemptions
      )
    ORDER BY priority DESC,id DESC
    LIMIT 1
  `).get(planId);
}

function calculatePrice(base,promotion){

  const basePrice=Number(base || 0);

  if(!promotion){
    return basePrice;
  }

  const value=Number(promotion.discount_value || 0);

  if(promotion.discount_type === 'FIXED_PRICE'){
    return Math.max(0,value);
  }

  if(promotion.discount_type === 'PERCENT'){
    return Math.max(
      0,
      Number((basePrice * (1-(value/100))).toFixed(2))
    );
  }

  if(promotion.discount_type === 'FIXED_DISCOUNT'){
    return Math.max(
      0,
      Number((basePrice-value).toFixed(2))
    );
  }

  return basePrice;
}

function subscriptionView(id){

  const row=db.prepare(`
    SELECT
      s.*,

      t.public_id AS tenant_public_id,
      t.code AS tenant_code,
      t.legal_name AS tenant_legal_name,
      t.trade_name AS tenant_trade_name,
      t.email AS tenant_email,
      t.status AS tenant_status,

      p.code AS plan_code,
      p.name AS plan_name

    FROM saas_subscriptions s

    JOIN saas_tenants t
      ON t.id=s.tenant_id

    JOIN saas_plans p
      ON p.id=s.plan_id

    WHERE s.id=?
  `).get(id);

  if(!row){
    return null;
  }

  return {
    ...row,
    metadata:parseJson(row.metadata_json,{})
  };
}

function createEvent({
  subscriptionId,
  tenantId,
  eventType,
  source='SYSTEM',
  previousStatus=null,
  newStatus=null,
  payload={}
}){

  db.prepare(`
    INSERT INTO saas_subscription_events (
      subscription_id,
      tenant_id,
      event_type,
      source,
      previous_status,
      new_status,
      payload_json
    )
    VALUES (?,?,?,?,?,?,?)
  `).run(
    subscriptionId,
    tenantId,
    eventType,
    source,
    previousStatus,
    newStatus,
    JSON.stringify(payload || {})
  );
}

const createContractTransaction=db.transaction((input,atomicHook=null)=>{

  const legalName=String(input.legal_name || '').trim();
  const tradeName=String(input.trade_name || '').trim();
  const email=normalizeEmail(input.email);
  const planCode=String(input.plan_code || '').trim();
  const promotionCode=
    input.promotion_code
      ? String(input.promotion_code).trim()
      : null;

  if(!legalName){
    throw new Error('LEGAL_NAME_REQUIRED');
  }

  if(!email || !email.includes('@')){
    throw new Error('VALID_EMAIL_REQUIRED');
  }

  if(!planCode){
    throw new Error('PLAN_REQUIRED');
  }

  const plan=getPlan(planCode);

  if(!plan){
    throw new Error('PLAN_NOT_FOUND');
  }

  const promotion=getPromotionForPlan(
    plan.id,
    promotionCode
  );

  if(promotionCode && !promotion){
    throw new Error('PROMOTION_NOT_AVAILABLE');
  }

  /*
   * NEW CUSTOMER PROMOTION GUARD V1
   *
   * PENDING não transforma checkout abandonado
   * em cliente anterior.
   */
  if(
    promotion &&
    Number(promotion.new_customers_only || 0)===1
  ){

    const normalizedDocument=
      String(input.document || '')
        .replace(/\D/g,'');

    const previousCustomer=
      db.prepare(`
        SELECT s.id
        FROM saas_subscriptions s

        JOIN saas_tenants t
          ON t.id=s.tenant_id

        WHERE
          s.status IN (
            'ACTIVE',
            'PAST_DUE',
            'CANCELLED'
          )

          AND (
            lower(t.email)=lower(?)

            OR (
              ? <> ''
              AND
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      COALESCE(t.document,''),
                      '.',''
                    ),
                    '-',''
                  ),
                  '/',''
                ),
                ' ',''
              )=?
            )
          )

        LIMIT 1
      `).get(
        email,
        normalizedDocument,
        normalizedDocument
      );

    if(previousCustomer){
      throw new Error(
        'PROMOTION_NEW_CUSTOMERS_ONLY'
      );
    }
  }

  const basePrice=Number(plan.monthly_price || 0);
  const contractedPrice=calculatePrice(
    basePrice,
    promotion
  );

  let tenantCode=normalizeCode(
    input.tenant_code ||
    tradeName ||
    legalName
  );

  if(!tenantCode){
    tenantCode=`TENANT-${Date.now()}`;
  }

  const existingCode=db.prepare(`
    SELECT id
    FROM saas_tenants
    WHERE code=?
  `).get(tenantCode);

  if(existingCode){
    tenantCode=
      `${tenantCode}-${crypto.randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;
  }

  const tenantPublicId=publicId('TEN');
  const subscriptionPublicId=publicId('SUB');

  const tenantInsert=db.prepare(`
    INSERT INTO saas_tenants (
      public_id,
      code,
      legal_name,
      trade_name,
      document,
      email,
      phone,
      status,
      metadata_json
    )
    VALUES (?,?,?,?,?,?,?,'PENDING',?)
  `).run(
    tenantPublicId,
    tenantCode,
    legalName,
    tradeName || null,
    input.document || null,
    email,
    input.phone || null,
    JSON.stringify(input.metadata || {})
  );

  const tenantId=Number(tenantInsert.lastInsertRowid);

  let benefitEnd=null;

  if(
    promotion &&
    promotion.benefit_months != null
  ){
    const d=new Date();

    d.setUTCMonth(
      d.getUTCMonth()+
      Number(promotion.benefit_months)
    );

    benefitEnd=d.toISOString();
  }

  const subscriptionInsert=db.prepare(`
    INSERT INTO saas_subscriptions (
      public_id,
      tenant_id,
      plan_id,
      promotion_id,
      status,
      billing_cycle,
      currency,
      base_price,
      contracted_price,
      promotion_code,
      promotion_benefit_months,
      promotion_started_at,
      promotion_ends_at,
      metadata_json
    )
    VALUES (
      ?,?,?,
      ?,
      'PENDING',
      'MONTHLY',
      'BRL',
      ?,?,
      ?,?,
      ?,?,
      ?
    )
  `).run(
    subscriptionPublicId,
    tenantId,
    plan.id,
    promotion?.id || null,
    basePrice,
    contractedPrice,
    promotion?.code || null,
    promotion?.benefit_months ?? null,
    promotion ? nowIso() : null,
    benefitEnd,
    JSON.stringify(input.metadata || {})
  );

  const subscriptionId=
    Number(subscriptionInsert.lastInsertRowid);

  createEvent({
    subscriptionId,
    tenantId,
    eventType:'SUBSCRIPTION_CREATED',
    source:'CONTRACTING',
    newStatus:'PENDING',
    payload:{
      plan_code:plan.code,
      base_price:basePrice,
      contracted_price:contractedPrice,
      promotion_code:promotion?.code || null
    }
  });
  /*
   * A promoção é congelada na contratação,
   * mas a vaga somente será consumida quando
   * a assinatura for efetivamente ativada.
   */


  const result={
    tenant_id:tenantId,
    tenant_public_id:tenantPublicId,
    subscription_id:subscriptionId,
    subscription_public_id:subscriptionPublicId,
    base_price:basePrice,
    contracted_price:contractedPrice,
    promotion_code:promotion?.code || null
  };

  /*
   * NEXUS_SAAS_ATOMIC_CONTRACT_HOOK_V1
   *
   * Somente operacoes SQLite sincronas.
   * Se o hook falhar, better-sqlite3 reverte
   * a mesma transacao que criou tenant/subscription.
   *
   * Nunca executar chamadas externas aqui.
   */
  if(typeof atomicHook === 'function'){
    atomicHook(result);
  }

  return result;
});

function createContract(input){
  return createContractTransaction(
    input || {},
    null
  );
}

function createContractWithAtomicHook(
  input,
  atomicHook
){
  if(typeof atomicHook !== 'function'){
    throw new Error(
      'ATOMIC_CONTRACT_HOOK_REQUIRED'
    );
  }

  return createContractTransaction(
    input || {},
    atomicHook
  );
}

function activateSubscription({
  subscriptionId,
  ownerUserId=null,
  source='SYSTEM',
  provider=null,
  providerCustomerId=null,
  providerSubscriptionId=null
}){

  const transaction=db.transaction(()=>{

    const current=db.prepare(`
      SELECT *
      FROM saas_subscriptions
      WHERE id=?
    `).get(subscriptionId);

    if(!current){
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const tenant=db.prepare(`
      SELECT *
      FROM saas_tenants
      WHERE id=?
    `).get(current.tenant_id);

    if(!tenant){
      throw new Error('TENANT_NOT_FOUND');
    }

    if(ownerUserId != null){

      const user=db.prepare(`
        SELECT id,active
        FROM users
        WHERE id=?
      `).get(ownerUserId);

      if(!user || Number(user.active)!==1){
        throw new Error('OWNER_USER_INVALID');
      }

      db.prepare(`
        INSERT INTO saas_tenant_users (
          tenant_id,
          user_id,
          tenant_role,
          active,
          updated_at
        )
        VALUES (?,?,'OWNER',1,CURRENT_TIMESTAMP)

        ON CONFLICT(tenant_id,user_id)
        DO UPDATE SET
          tenant_role='OWNER',
          active=1,
          updated_at=CURRENT_TIMESTAMP
      `).run(
        tenant.id,
        ownerUserId
      );

      db.prepare(`
        UPDATE saas_tenants
        SET
          owner_user_id=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        ownerUserId,
        tenant.id
      );
    }

    /*
     * NEXUS PROMOTION REDEMPTION LEDGER V1
     *
     * Uma assinatura consome no máximo uma vaga.
     */
    if(current.promotion_id){

      const existingRedemption=
        db.prepare(`
          SELECT id
          FROM saas_promotion_redemptions
          WHERE subscription_id=?
          LIMIT 1
        `).get(subscriptionId);

      if(!existingRedemption){

        const promotionUpdate=
          db.prepare(`
            UPDATE saas_promotions
            SET
              redemption_count=
                redemption_count+1,
              updated_at=CURRENT_TIMESTAMP
            WHERE id=?
              AND (
                max_redemptions IS NULL
                OR redemption_count < max_redemptions
              )
          `).run(
            current.promotion_id
          );

        if(promotionUpdate.changes !== 1){
          throw new Error(
            'PROMOTION_CAP_REACHED'
          );
        }

        db.prepare(`
          INSERT INTO saas_promotion_redemptions (
            promotion_id,
            subscription_id,
            tenant_id,
            status,
            metadata_json
          )
          VALUES (
            ?,?,?,
            'REDEEMED',
            ?
          )
        `).run(
          current.promotion_id,
          subscriptionId,
          tenant.id,
          JSON.stringify({
            source,
            promotion_code:
              current.promotion_code ||
              null
          })
        );
      }
    }

    const previousStatus=current.status;

    db.prepare(`
      UPDATE saas_subscriptions
      SET
        status='ACTIVE',
        provider=COALESCE(?,provider),
        provider_customer_id=COALESCE(?,provider_customer_id),
        provider_subscription_id=COALESCE(?,provider_subscription_id),
        started_at=COALESCE(started_at,CURRENT_TIMESTAMP),
        activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP),
        current_period_start=COALESCE(current_period_start,CURRENT_TIMESTAMP),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      provider,
      providerCustomerId,
      providerSubscriptionId,
      subscriptionId
    );

    db.prepare(`
      UPDATE saas_tenants
      SET
        status='ACTIVE',
        activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP),
        suspended_at=NULL,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(tenant.id);

    createEvent({
      subscriptionId,
      tenantId:tenant.id,
      eventType:'SUBSCRIPTION_ACTIVATED',
      source,
      previousStatus,
      newStatus:'ACTIVE',
      payload:{
        owner_user_id:ownerUserId,
        provider,
        provider_customer_id:providerCustomerId,
        provider_subscription_id:providerSubscriptionId
      }
    });

    return subscriptionView(subscriptionId);
  });

  return transaction();
}

function recordPayment(input={}){

  const subscription=db.prepare(`
    SELECT *
    FROM saas_subscriptions
    WHERE id=?
  `).get(input.subscription_id);

  if(!subscription){
    throw new Error('SUBSCRIPTION_NOT_FOUND');
  }

  const paymentPublicId=publicId('PAY');

  const info=db.prepare(`
    INSERT INTO saas_subscription_payments (
      public_id,
      subscription_id,
      tenant_id,
      provider,
      provider_payment_id,
      status,
      billing_type,
      amount,
      currency,
      due_date,
      paid_at,
      invoice_url,
      pix_payload,
      raw_json
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    paymentPublicId,
    subscription.id,
    subscription.tenant_id,
    input.provider || null,
    input.provider_payment_id || null,
    input.status || 'PENDING',
    input.billing_type || null,
    Number(
      input.amount == null
        ? subscription.contracted_price
        : input.amount
    ),
    input.currency || 'BRL',
    input.due_date || null,
    input.paid_at || null,
    input.invoice_url || null,
    input.pix_payload || null,
    JSON.stringify(input.raw || {})
  );

  createEvent({
    subscriptionId:subscription.id,
    tenantId:subscription.tenant_id,
    eventType:'PAYMENT_RECORDED',
    source:input.source || 'SYSTEM',
    previousStatus:subscription.status,
    newStatus:subscription.status,
    payload:{
      payment_id:Number(info.lastInsertRowid),
      payment_public_id:paymentPublicId,
      provider_payment_id:input.provider_payment_id || null,
      payment_status:input.status || 'PENDING'
    }
  });

  return db.prepare(`
    SELECT *
    FROM saas_subscription_payments
    WHERE id=?
  `).get(info.lastInsertRowid);
}

export function registerSaasSubscriptionCore(app,auth){

  ensureSchema();

  /*
    Nesta V1:
    - NÃO há checkout público ainda.
    - NÃO há chamada ao Asaas.
    - NÃO há senha trafegando nesta camada.
    - NÃO há alteração das tabelas operacionais.
  */

  app.get(
    '/api/saas/admin/tenants',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      const rows=db.prepare(`
        SELECT
          t.*,
          (
            SELECT COUNT(*)
            FROM saas_tenant_users tu
            WHERE tu.tenant_id=t.id
              AND tu.active=1
          ) AS users_count
        FROM saas_tenants t
        ORDER BY t.id DESC
      `).all();

      res.json({
        tenants:rows.map(row=>({
          ...row,
          metadata:parseJson(row.metadata_json,{})
        }))
      });
    }
  );

  app.get(
    '/api/saas/admin/subscriptions',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      const rows=db.prepare(`
        SELECT
          s.*,
          t.code AS tenant_code,
          t.trade_name AS tenant_trade_name,
          t.legal_name AS tenant_legal_name,
          p.code AS plan_code,
          p.name AS plan_name
        FROM saas_subscriptions s
        JOIN saas_tenants t
          ON t.id=s.tenant_id
        JOIN saas_plans p
          ON p.id=s.plan_id
        ORDER BY s.id DESC
      `).all();

      res.json({
        subscriptions:rows
      });
    }
  );

  app.get(
    '/api/saas/admin/subscriptions/:id',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      const row=subscriptionView(
        Number(req.params.id)
      );

      if(!row){
        return res.status(404).json({
          error:'SUBSCRIPTION_NOT_FOUND'
        });
      }

      res.json(row);
    }
  );

  app.post(
    '/api/saas/admin/contracts',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      try{
        const result=createContract(req.body || {});

        res.status(201).json({
          ok:true,
          ...result
        });

      }catch(error){

        res.status(400).json({
          error:error?.message || 'CONTRACT_CREATE_FAILED'
        });
      }
    }
  );

  app.post(
    '/api/saas/admin/subscriptions/:id/activate',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      try{

        const result=activateSubscription({
          subscriptionId:Number(req.params.id),
          ownerUserId:
            req.body?.owner_user_id == null
              ? null
              : Number(req.body.owner_user_id),
          source:'ADMIN',
          provider:req.body?.provider || null,
          providerCustomerId:req.body?.provider_customer_id || null,
          providerSubscriptionId:req.body?.provider_subscription_id || null
        });

        res.json({
          ok:true,
          subscription:result
        });

      }catch(error){

        res.status(400).json({
          error:error?.message || 'SUBSCRIPTION_ACTIVATION_FAILED'
        });
      }
    }
  );

  app.post(
    '/api/saas/admin/subscriptions/:id/payments',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      try{

        const payment=recordPayment({
          ...(req.body || {}),
          subscription_id:Number(req.params.id),
          source:'ADMIN'
        });

        res.status(201).json({
          ok:true,
          payment
        });

      }catch(error){

        res.status(400).json({
          error:error?.message || 'PAYMENT_RECORD_FAILED'
        });
      }
    }
  );

  app.get(
    '/api/saas/admin/subscriptions/:id/events',
    auth,
    (req,res)=>{
      if(!['OWNER','ADMIN'].includes(req.user?.role)){
        return res.status(403).json({
          error:'FORBIDDEN'
        });
      }

      const rows=db.prepare(`
        SELECT *
        FROM saas_subscription_events
        WHERE subscription_id=?
        ORDER BY id DESC
      `).all(
        Number(req.params.id)
      );

      res.json({
        events:rows.map(row=>({
          ...row,
          payload:parseJson(row.payload_json,{})
        }))
      });
    }
  );

  console.log('NEXUS SAAS SUBSCRIPTION CORE V1 ONLINE');
}

export {
  ensureSchema as ensureSaasSubscriptionSchema,
  createContract as createSaasContract,
  createContractWithAtomicHook as createSaasContractWithAtomicHook,
  activateSubscription as activateSaasSubscription,
  recordPayment as recordSaasSubscriptionPayment
};