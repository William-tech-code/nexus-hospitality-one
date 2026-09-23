import crypto from 'node:crypto';
import { db } from './db.js';

import {asaasWebhookToken} from './asaas-config.js';
import {hashPassword} from './security.js';
import {
  createSaasContract,
  activateSaasSubscription,
  recordSaasSubscriptionPayment
} from './saas-subscription-core.js';

import {
  createAsaasCustomer,
  createAsaasSubscription,
  normalizeAsaasSaasWebhook,
  classifyAsaasSaasEvent
} from './saas-asaas-subscription-adapter.js';

/*
 * ============================================================
 * NEXUS HOSPITALITY ONE
 * SAAS CONTRACTING ENGINE V1
 * ============================================================
 *
 * Estado desta versão:
 *
 * - checkout público disponível;
 * - criação local de tenant + subscription;
 * - Asaas em DRY RUN obrigatório;
 * - webhook SaaS isolado;
 * - ativação somente após evento PAID;
 * - nenhuma senha é recebida no checkout;
 * - nenhuma cobrança real nesta V1.
 */

/*
 * ASAAS SaaS fail-safe:
 *
 * LIVE somente quando:
 * - NEXUS_SAAS_ASAAS_LIVE=true
 * - ASAAS_ENV=production
 * - ASAAS_API_KEY presente
 * - ASAAS_WEBHOOK_TOKEN presente
 *
 * Qualquer outra condição = DRY RUN.
 */

function nexusEnvFlag(name){
  return String(
    process.env[name] || ''
  ).trim().toLowerCase() === 'true';
}

function saasAsaasLiveEnabled(){

  const explicitLive =
    nexusEnvFlag(
      'NEXUS_SAAS_ASAAS_LIVE'
    );

  const environment =
    String(
      process.env.ASAAS_ENV || ''
    )
      .trim()
      .toLowerCase();

  const apiKeyConfigured =
    Boolean(
      String(
        process.env.ASAAS_API_KEY || ''
      ).trim()
    );

  const webhookConfigured =
    Boolean(
      String(
        process.env.ASAAS_WEBHOOK_TOKEN || ''
      ).trim()
    );

  return (
    explicitLive === true &&
    environment === 'production' &&
    apiKeyConfigured === true &&
    webhookConfigured === true
  );
}

const ASAAS_DRY_RUN =
  !saasAsaasLiveEnabled();

function txt(value){
  return String(value ?? '').trim();
}

function digits(value){
  return txt(value).replace(/\D/g,'');
}

function normalizeEmail(value){
  return txt(value).toLowerCase();
}

function randomToken(){
  return crypto.randomBytes(32).toString('hex');
}

function addDays(date,days){
  const result=new Date(date);
  result.setUTCDate(
    result.getUTCDate()+Number(days)
  );
  return result;
}

function publicContractView(subscriptionId){

  const row=db.prepare(`
    SELECT
      s.id,
      s.public_id,
      s.status,
      s.base_price,
      s.contracted_price,
      s.currency,
      s.billing_cycle,
      s.promotion_code,
      s.promotion_benefit_months,
      s.next_due_date,
      s.created_at,

      t.public_id AS tenant_public_id,
      t.trade_name,
      t.legal_name,
      t.status AS tenant_status,

      p.code AS plan_code,
      p.name AS plan_name

    FROM saas_subscriptions s

    JOIN saas_tenants t
      ON t.id=s.tenant_id

    JOIN saas_plans p
      ON p.id=s.plan_id

    WHERE s.id=?
  `).get(subscriptionId);

  if(!row){
    return null;
  }

  return {
    subscription_public_id:
      row.public_id,

    subscription_status:
      row.status,

    tenant_public_id:
      row.tenant_public_id,

    tenant_status:
      row.tenant_status,

    company:
      row.trade_name ||
      row.legal_name,

    plan:{
      code:row.plan_code,
      name:row.plan_name
    },

    pricing:{
      currency:row.currency,
      billing_cycle:
        row.billing_cycle,
      base_price:
        Number(row.base_price),
      contracted_price:
        Number(row.contracted_price),
      promotion_code:
        row.promotion_code,
      promotion_benefit_months:
        row.promotion_benefit_months
    },

    next_due_date:
      row.next_due_date,

    created_at:
      row.created_at
  };
}

function ensureContractingSchema(){

  db.exec(`
    CREATE TABLE IF NOT EXISTS saas_contracting_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      public_id TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL UNIQUE,

      tenant_id INTEGER NOT NULL,
      subscription_id INTEGER NOT NULL,

      owner_name TEXT,
      owner_email TEXT,
      owner_password_hash TEXT,

      status TEXT NOT NULL DEFAULT 'PENDING',

      customer_dry_run_json TEXT,
      subscription_dry_run_json TEXT,

      expires_at TEXT NOT NULL,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY(tenant_id)
        REFERENCES saas_tenants(id),

      FOREIGN KEY(subscription_id)
        REFERENCES saas_subscriptions(id)
    );

    CREATE INDEX IF NOT EXISTS
      idx_saas_contracting_subscription
      ON saas_contracting_sessions(
        subscription_id
      );

    CREATE INDEX IF NOT EXISTS
      idx_saas_contracting_status
      ON saas_contracting_sessions(
        status
      );

    CREATE TABLE IF NOT EXISTS saas_webhook_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      provider TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT,

      subscription_id INTEGER,

      payload_json TEXT NOT NULL,

      processed INTEGER NOT NULL DEFAULT 0,
      processing_result TEXT,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,

      FOREIGN KEY(subscription_id)
        REFERENCES saas_subscriptions(id)
    );
  `);

  /*
   * OWNER_PENDING_SCHEMA_V4
   * Migração segura para banco existente.
   */
  const ownerColumns=
    db.prepare(`
      PRAGMA table_info(saas_contracting_sessions)
    `).all();

  const ownerColumnNames=
    new Set(
      ownerColumns.map(
        column=>String(column.name)
      )
    );

  if(!ownerColumnNames.has('owner_name')){
    db.exec(`
      ALTER TABLE saas_contracting_sessions
      ADD COLUMN owner_name TEXT
    `);
  }

  if(!ownerColumnNames.has('owner_email')){
    db.exec(`
      ALTER TABLE saas_contracting_sessions
      ADD COLUMN owner_email TEXT
    `);
  }

  if(!ownerColumnNames.has('owner_password_hash')){
    db.exec(`
      ALTER TABLE saas_contracting_sessions
      ADD COLUMN owner_password_hash TEXT
    `);
  }}

function validateCheckout(body={}){

  const legalName=
    txt(body.legal_name);

  const tradeName=
    txt(body.trade_name);

  const email=
    normalizeEmail(body.email);

  const ownerName=
    txt(body.owner_name);

  const password=
    String(body.password || '');

  const document=
    digits(body.document);

  const phone=
    digits(body.phone);

  const planCode=
    txt(body.plan_code)
      .toUpperCase();

  const promotionCode=
    body.promotion_code
      ? txt(body.promotion_code)
          .toUpperCase()
      : null;

  if(legalName.length<3){
    throw new Error(
      'LEGAL_NAME_REQUIRED'
    );
  }

  if(
    !email ||
    !email.includes('@')
  ){
    throw new Error(
      'VALID_EMAIL_REQUIRED'
    );
  }

  if(!ownerName){
    throw new Error(
      'OWNER_NAME_REQUIRED'
    );
  }

  if(password.length < 10){
    throw new Error(
      'OWNER_PASSWORD_TOO_SHORT'
    );
  }

  const existingUser=
    db.prepare(`
      SELECT id
      FROM users
      WHERE lower(email)=lower(?)
      LIMIT 1
    `).get(email);

  if(existingUser){
    throw new Error(
      'EMAIL_ALREADY_REGISTERED'
    );
  }

  if(
    document &&
    ![11,14].includes(document.length)
  ){
    throw new Error(
      'INVALID_DOCUMENT'
    );
  }

  if(!planCode){
    throw new Error(
      'PLAN_REQUIRED'
    );
  }

  return {
    legal_name:legalName,
    trade_name:tradeName,
    email,
    owner_name:ownerName,
    owner_password_hash:
      hashPassword(password),
    document:document || null,
    phone:phone || null,
    plan_code:planCode,
    promotion_code:promotionCode
  };
}

async function createCheckout(
  body={}
){

  const input=
    validateCheckout(body);

  /*
   * A criação local ocorre primeiro como PENDING.
   * Nenhum acesso é liberado aqui.
   */

  const contract=
    createSaasContract({
      ...input,
      metadata:{
        source:'PUBLIC_CHECKOUT'
      }
    });

  const subscription=
    db.prepare(`
      SELECT *
      FROM saas_subscriptions
      WHERE id=?
  `).get(
    contract.subscription_id
  );

  const tenant=
    db.prepare(`
      SELECT *
      FROM saas_tenants
      WHERE id=?
  `).get(
    contract.tenant_id
  );

  if(!subscription || !tenant){
    throw new Error(
      'CONTRACT_PERSISTENCE_FAILED'
    );
  }

  const customerResult=
    await createAsaasCustomer(
      {
        name:
          tenant.trade_name ||
          tenant.legal_name,

        email:
          tenant.email,

        cpfCnpj:
          tenant.document,

        mobilePhone:
          tenant.phone,

        externalReference:
          `NEXUS_TENANT:${tenant.id}`
      },
      {
        dryRun:ASAAS_DRY_RUN
      }
    );

  /*
   * Em DRY RUN precisamos de um ID fictício
   * apenas para validar o segundo payload.
   */

  const customerId=
    customerResult?.result?.id ||
    `dry_customer_${tenant.id}`;

  const nextDue=
    addDays(
      new Date(),
      1
    );

  const subscriptionResult=
    await createAsaasSubscription(
      {
        customerId,

        subscriptionId:
          subscription.id,

        value:
          subscription.contracted_price,

        nextDueDate:
          nextDue,

        cycle:'MONTHLY',

        description:
          `NEXUS Hospitality One - ${input.plan_code}`
      },
      {
        dryRun:ASAAS_DRY_RUN
      }
    );

  const token=
    randomToken();

  const tokenHash=
    crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

  const publicId=
    `CHK_${crypto
      .randomBytes(12)
      .toString('hex')
      .toUpperCase()}`;

  const expires=
    addDays(
      new Date(),
      1
    ).toISOString();

  /*
   * OWNER_PENDING_STORAGE_V4
   * Apenas o hash é persistido.
   */
  db.prepare(`
    INSERT INTO saas_contracting_sessions (
      public_id,
      token_hash,
      tenant_id,
      subscription_id,
      owner_name,
      owner_email,
      owner_password_hash,
      status,
      customer_dry_run_json,
      subscription_dry_run_json,
      expires_at
    )
    VALUES (
      ?,?,?,?,?,?,?,
      'PENDING_PAYMENT',
      ?,?,?
    )
  `).run(
    publicId,
    tokenHash,
    tenant.id,
    subscription.id,
    input.owner_name,
    input.email,
    input.owner_password_hash,
    JSON.stringify(
      customerResult
    ),
    JSON.stringify(
      subscriptionResult
    ),
    expires
  );

  db.prepare(`
    UPDATE saas_subscriptions
    SET
      provider='ASAAS',
      next_due_date=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    nextDue
      .toISOString()
      .slice(0,10),
    subscription.id
  );

  return {
    ok:true,

    checkout_id:
      publicId,

    checkout_token:
      token,

    mode:
      ASAAS_DRY_RUN
        ? 'DRY_RUN'
        : 'LIVE',

    contract:
      publicContractView(
        subscription.id
      ),

    payment:{
      provider:'ASAAS',
      created:false,
      dry_run:
        ASAAS_DRY_RUN,

      message:
        ASAAS_DRY_RUN
          ? 'Cobrança externa não criada nesta versão.'
          : 'Cobrança criada.'
    },

    asaas_preview:{
      customer:
        customerResult,

      subscription:
        subscriptionResult
    }
  };
}

function getCheckout(
  publicId,
  token
){

  const hash=
    crypto
      .createHash('sha256')
      .update(txt(token))
      .digest('hex');

  const session=
    db.prepare(`
      SELECT *
      FROM saas_contracting_sessions
      WHERE public_id=?
        AND token_hash=?
  `).get(
    txt(publicId),
    hash
  );

  if(!session){
    return null;
  }

  if(
    new Date(session.expires_at)
      .getTime() <
    Date.now()
  ){
    return {
      expired:true,
      status:'EXPIRED'
    };
  }

  return {
    expired:false,
    checkout_id:
      session.public_id,
    status:
      session.status,
    contract:
      publicContractView(
        session.subscription_id
      )
  };
}

function webhookEventKey(body={}){

  const event=
    txt(body?.event);

  const paymentId=
    txt(body?.payment?.id);

  const subscriptionId=
    txt(
      body?.payment?.subscription ||
      body?.subscription?.id
    );

  return crypto
    .createHash('sha256')
    .update(
      [
        event,
        paymentId,
        subscriptionId,
        JSON.stringify(body)
      ].join('|')
    )
    .digest('hex');
}

function processSaasWebhook(
  body={}
){

  const normalized=
    normalizeAsaasSaasWebhook(
      body
    );

  if(!normalized.belongs_to_saas){

    return {
      belongs_to_saas:false,
      processed:false
    };
  }

  const classification=
    classifyAsaasSaasEvent(
      normalized.event
    );

  const subscription=
    db.prepare(`
      SELECT *
      FROM saas_subscriptions
      WHERE id=?
    `).get(
      normalized.subscription_id
    );

  if(!subscription){

    return {
      belongs_to_saas:true,
      processed:false,
      error:'SUBSCRIPTION_NOT_FOUND'
    };
  }

  const key=
    webhookEventKey(body);

  const existing=
    db.prepare(`
      SELECT *
      FROM saas_webhook_receipts
      WHERE event_key=?
    `).get(key);

  /*
   * Somente evento já PROCESSADO é duplicate.
   *
   * processed=0 significa tentativa anterior
   * incompleta e portanto pode ser reprocessada.
   */
  if(
    existing &&
    Number(existing.processed)===1
  ){

    return {
      belongs_to_saas:true,
      processed:true,
      duplicate:true,
      classification
    };
  }

  const atomicWebhook=
    db.transaction(()=>{

      let receiptId=null;

      if(existing){

        receiptId=
          Number(existing.id);

        db.prepare(`
          UPDATE saas_webhook_receipts
          SET
            event_type=?,
            subscription_id=?,
            payload_json=?,
            processed=0,
            processing_result=NULL,
            processed_at=NULL
          WHERE id=?
        `).run(
          normalized.event,
          subscription.id,
          JSON.stringify(body),
          receiptId
        );
      }
      else{

        const inserted=
          db.prepare(`
            INSERT INTO saas_webhook_receipts (
              provider,
              event_key,
              event_type,
              subscription_id,
              payload_json,
              processed
            )
            VALUES (
              'ASAAS',
              ?,?,?,?,
              0
            )
          `).run(
            key,
            normalized.event,
            subscription.id,
            JSON.stringify(body)
          );

        receiptId=
          Number(
            inserted.lastInsertRowid
          );
      }


      /*
       * PAYMENT PAID
       */
      if(classification==='PAID'){

        const existingPayment=
          normalized.provider_payment_id
            ? db.prepare(`
                SELECT id
                FROM saas_subscription_payments
                WHERE provider='ASAAS'
                  AND provider_payment_id=?
                LIMIT 1
              `).get(
                normalized.provider_payment_id
              )
            : null;

        if(!existingPayment){

          recordSaasSubscriptionPayment({
            subscription_id:
              subscription.id,

            provider:'ASAAS',

            provider_payment_id:
              normalized.provider_payment_id,

            status:'CONFIRMED',

            billing_type:
              body?.payment?.billingType ||
              null,

            amount:
              normalized.value ??
              subscription.contracted_price,

            due_date:
              normalized.due_date,

            paid_at:
              normalized.payment_date ||
              new Date().toISOString(),

            raw:body,

            source:'ASAAS_WEBHOOK'
          });
        }


        /*
         * OWNER só nasce dentro da mesma transação
         * do pagamento + ativação.
         */
        const pendingOwner=
          db.prepare(`
            SELECT
              owner_name,
              owner_email,
              owner_password_hash

            FROM saas_contracting_sessions

            WHERE subscription_id=?
            LIMIT 1
          `).get(
            subscription.id
          );

        if(
          !pendingOwner?.owner_name ||
          !pendingOwner?.owner_email ||
          !pendingOwner?.owner_password_hash
        ){
          throw new Error(
            'OWNER_CREDENTIALS_NOT_FOUND'
          );
        }


        let owner=
          db.prepare(`
            SELECT
              id AS user_id

            FROM users

            WHERE lower(email)=lower(?)

            LIMIT 1
          `).get(
            pendingOwner.owner_email
          );


        if(!owner){

          const createdOwner=
            db.prepare(`
              INSERT INTO users (
                name,
                email,
                password_hash,
                role,
                active,
                force_password_change
              )
              VALUES (
                ?,?,?,
                'OWNER',
                1,
                0
              )
            `).run(
              pendingOwner.owner_name,
              pendingOwner.owner_email,
              pendingOwner.owner_password_hash
            );

          owner={
            user_id:
              Number(
                createdOwner.lastInsertRowid
              )
          };
        }
        else{

          const sameTenantOwner=
            db.prepare(`
              SELECT id
              FROM saas_tenant_users
              WHERE tenant_id=?
                AND user_id=?
                AND tenant_role='OWNER'
              LIMIT 1
            `).get(
              subscription.tenant_id,
              owner.user_id
            );

          if(!sameTenantOwner){
            throw new Error(
              'EMAIL_ALREADY_REGISTERED'
            );
          }
        }


        /*
         * better-sqlite3 suporta nested transaction
         * via savepoint. Se a ativação falhar,
         * a transação externa também é abortada.
         */
        activateSaasSubscription({
          subscriptionId:
            subscription.id,

          ownerUserId:
            owner.user_id,

          source:
            'ASAAS_WEBHOOK',

          provider:
            'ASAAS',

          providerCustomerId:
            subscription.provider_customer_id,

          providerSubscriptionId:
            normalized.provider_subscription_id ||
            subscription.provider_subscription_id
        });


        db.prepare(`
          UPDATE saas_contracting_sessions
          SET
            status='ACTIVE',
            updated_at=CURRENT_TIMESTAMP
          WHERE subscription_id=?
        `).run(
          subscription.id
        );
      }


      /*
       * OVERDUE
       */
      if(classification==='OVERDUE'){

        const latest=
          db.prepare(`
            SELECT *
            FROM saas_subscriptions
            WHERE id=?
          `).get(
            subscription.id
          );

        const previous=
          latest?.status ||
          subscription.status;

        db.prepare(`
          UPDATE saas_subscriptions
          SET
            status='PAST_DUE',
            past_due_at=
              COALESCE(
                past_due_at,
                CURRENT_TIMESTAMP
              ),
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(
          subscription.id
        );

        db.prepare(`
          UPDATE saas_tenants
          SET
            status='PAST_DUE',
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(
          subscription.tenant_id
        );

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
          VALUES (
            ?,?,
            'SUBSCRIPTION_PAST_DUE',
            'ASAAS_WEBHOOK',
            ?,
            'PAST_DUE',
            ?
          )
        `).run(
          subscription.id,
          subscription.tenant_id,
          previous,
          JSON.stringify(body)
        );
      }


      /*
       * REVERSED
       */
      if(classification==='REVERSED'){

        const latest=
          db.prepare(`
            SELECT status
            FROM saas_subscriptions
            WHERE id=?
          `).get(
            subscription.id
          );

        const status=
          latest?.status ||
          subscription.status;

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
          VALUES (
            ?,?,
            'PAYMENT_REVERSED',
            'ASAAS_WEBHOOK',
            ?,
            ?,
            ?
          )
        `).run(
          subscription.id,
          subscription.tenant_id,
          status,
          status,
          JSON.stringify(body)
        );
      }


      db.prepare(`
        UPDATE saas_webhook_receipts
        SET
          processed=1,
          processing_result=?,
          processed_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        classification,
        receiptId
      );


      return {
        belongs_to_saas:true,
        processed:true,
        duplicate:false,
        classification
      };
    });


  try{

    return atomicWebhook();

  }
  catch(error){

    /*
     * A transação de negócio já sofreu rollback.
     *
     * Persistimos apenas a falha retryable.
     */
    db.prepare(`
      INSERT INTO saas_webhook_receipts (
        provider,
        event_key,
        event_type,
        subscription_id,
        payload_json,
        processed,
        processing_result,
        processed_at
      )
      VALUES (
        'ASAAS',
        ?,?,?,?,
        0,
        ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(event_key)
      DO UPDATE SET
        event_type=excluded.event_type,
        subscription_id=excluded.subscription_id,
        payload_json=excluded.payload_json,
        processed=0,
        processing_result=excluded.processing_result,
        processed_at=CURRENT_TIMESTAMP
    `).run(
      key,
      normalized.event,
      subscription.id,
      JSON.stringify(body),
      `ERROR:${error?.message || 'UNKNOWN'}`
    );

    throw error;
  }
}

export function registerSaasContractingEngine(
  app
){

  ensureContractingSchema();

  /*
   * PUBLIC:
   * cria somente contrato PENDING.
   * Nesta V1 o Asaas está obrigatoriamente
   * em DRY RUN.
   */

  app.post(
    '/api/public/saas/checkout',
    async (req,res)=>{

      try{

        const result=
          await createCheckout(
            req.body || {}
          );

        res.status(201).json(
          result
        );

      }catch(error){

        const message=
          error?.message ||
          'CHECKOUT_FAILED';

        const safeErrors=[
          'LEGAL_NAME_REQUIRED',
          'VALID_EMAIL_REQUIRED',
          'INVALID_DOCUMENT',
          'PLAN_REQUIRED',
          'PLAN_NOT_FOUND',
          'PROMOTION_NOT_AVAILABLE'
        ];

        res.status(
          safeErrors.includes(message)
            ? 400
            : 500
        ).json({
          error:message
        });
      }
    }
  );

  app.get(
    '/api/public/saas/checkout/:id',
    (req,res)=>{

      const token=
        txt(
          req.headers[
            'x-checkout-token'
          ]
        );

      if(!token){

        return res.status(401).json({
          error:
            'CHECKOUT_TOKEN_REQUIRED'
        });
      }

      const result=
        getCheckout(
          req.params.id,
          token
        );

      if(!result){

        return res.status(404).json({
          error:
            'CHECKOUT_NOT_FOUND'
        });
      }

      res.json(result);
    }
  );

  /*
   * ROTA ESPECÍFICA DO SaaS.
   *
   * NÃO substitui o webhook atual de
   * pedidos e ingressos.
   *
   * Antes de produção deverá receber
   * a mesma validação de segurança/token
   * utilizada pelo webhook Asaas existente.
   */

  app.post(
    '/api/webhooks/asaas/saas',
    (req,res)=>{

      try{
        /*
         * NEXUS SAAS WEBHOOK SECURITY
         * Mesmo padrão utilizado pelo webhook Asaas operacional.
         */
        const expectedWebhookToken=
          asaasWebhookToken();

        const receivedWebhookToken=
          String(
            req.headers['asaas-access-token'] || ''
          ).trim();

        if(!expectedWebhookToken){

          return res.status(503).json({
            error:'WEBHOOK_TOKEN_NOT_CONFIGURED'
          });
        }

        if(receivedWebhookToken !== expectedWebhookToken){

          return res.status(401).json({
            error:'INVALID_WEBHOOK_TOKEN'
          });
        }


        const result=
          processSaasWebhook(
            req.body || {}
          );

        res.json({
          ok:true,
          ...result
        });

      }catch(error){

        console.error(
          'SAAS ASAAS WEBHOOK ERROR',
          error
        );

        res.status(500).json({
          error:
            'SAAS_WEBHOOK_FAILED'
        });
      }
    }
  );

  console.log(
    'NEXUS SAAS CONTRACTING ENGINE V1 ONLINE | ASAAS DRY RUN'
  );
}

export {
  ensureContractingSchema,
  createCheckout as createSaasCheckout,
  getCheckout as getSaasCheckout,
  processSaasWebhook
};