import {asaasRequest} from './asaas-config.js';

/*
 * ============================================================
 * NEXUS HOSPITALITY ONE
 * ASAAS SUBSCRIPTION ADAPTER V1
 * ============================================================
 *
 * Responsabilidade:
 *
 * - montar payload de cliente Asaas;
 * - montar payload de assinatura recorrente;
 * - padronizar externalReference do SaaS;
 * - interpretar eventos recebidos do Asaas;
 * - permitir DRY RUN sem chamada externa;
 *
 * IMPORTANTE:
 *
 * Este módulo NÃO altera o fluxo de:
 *
 * - ingressos;
 * - pedidos públicos;
 * - vendas;
 * - caixa.
 *
 * O namespace de referência do software será:
 *
 * NEXUS_SAAS_SUBSCRIPTION:<subscriptionId>
 *
 * O modo DRY RUN é o padrão nesta V1.
 */

const DEFAULT_CYCLE='MONTHLY';

function text(value){
  return String(value ?? '').trim();
}

function number(value){
  const parsed=Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value){
  return Math.round(number(value)*100)/100;
}

function digits(value){
  return text(value).replace(/\D/g,'');
}

function isoDateOnly(value){

  if(!value){
    return null;
  }

  const date=
    value instanceof Date
      ? value
      : new Date(value);

  if(Number.isNaN(date.getTime())){
    return null;
  }

  return date
    .toISOString()
    .slice(0,10);
}

export function saasExternalReference(
  subscriptionId
){

  const id=Math.trunc(
    number(subscriptionId)
  );

  if(id<=0){
    throw new Error(
      'INVALID_SAAS_SUBSCRIPTION_ID'
    );
  }

  return `NEXUS_SAAS_SUBSCRIPTION:${id}`;
}

export function parseSaasExternalReference(
  value
){

  const ref=text(value);

  const match=
    /^NEXUS_SAAS_SUBSCRIPTION:(\d+)$/
      .exec(ref);

  if(!match){
    return null;
  }

  return {
    type:'SAAS_SUBSCRIPTION',
    subscription_id:
      Number(match[1])
  };
}

export function buildAsaasCustomerPayload({
  name,
  email,
  cpfCnpj,
  phone,
  mobilePhone,
  externalReference
}={}){

  const payload={
    name:text(name),
    email:text(email) || undefined,
    cpfCnpj:
      digits(cpfCnpj) || undefined,
    phone:
      digits(phone) || undefined,
    mobilePhone:
      digits(mobilePhone) || undefined,
    externalReference:
      text(externalReference) || undefined
  };

  if(!payload.name){
    throw new Error(
      'ASAAS_CUSTOMER_NAME_REQUIRED'
    );
  }

  return Object.fromEntries(
    Object.entries(payload)
      .filter(([,value])=>
        value !== undefined &&
        value !== null &&
        value !== ''
      )
  );
}

export function buildAsaasSubscriptionPayload({
  customerId,
  subscriptionId,
  value,
  nextDueDate,
  cycle=DEFAULT_CYCLE,
  description
}={}){

  const customer=text(customerId);

  if(!customer){
    throw new Error(
      'ASAAS_CUSTOMER_ID_REQUIRED'
    );
  }

  const amount=money(value);

  if(amount<=0){
    throw new Error(
      'INVALID_SUBSCRIPTION_VALUE'
    );
  }

  const dueDate=
    isoDateOnly(nextDueDate);

  if(!dueDate){
    throw new Error(
      'INVALID_NEXT_DUE_DATE'
    );
  }

  const normalizedCycle=
    text(cycle).toUpperCase() ||
    DEFAULT_CYCLE;

  const allowedCycles=[
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'SEMIANNUALLY',
    'YEARLY'
  ];

  if(
    !allowedCycles.includes(
      normalizedCycle
    )
  ){
    throw new Error(
      'INVALID_SUBSCRIPTION_CYCLE'
    );
  }

  return {
    customer,
    billingType:'UNDEFINED',
    value:amount,
    nextDueDate:dueDate,
    cycle:normalizedCycle,
    description:
      text(description) ||
      'NEXUS Hospitality One',
    externalReference:
      saasExternalReference(
        subscriptionId
      )
  };
}

export async function createAsaasCustomer(
  data,
  {
    dryRun=true
  }={}
){

  const payload=
    buildAsaasCustomerPayload(data);

  if(dryRun){

    return {
      dry_run:true,
      provider:'ASAAS',
      operation:'CREATE_CUSTOMER',
      endpoint:'/customers',
      payload
    };
  }

  /*
   * NEXUS_ASAAS_CUSTOMER_IDEMPOTENCY_V2
   * Recupera cliente existente antes de criar outro.
   */
  if(payload.externalReference){
    const existing=
      await asaasRequest(
        `/customers?externalReference=${encodeURIComponent(payload.externalReference)}&limit=1`,
        {
          method:'GET'
        }
      );

    const found=
      Array.isArray(existing?.data)
        ? existing.data[0]
        : null;

    if(found?.id){
      return {
        dry_run:false,
        provider:'ASAAS',
        operation:'REUSE_CUSTOMER',
        reused:true,
        result:found
      };
    }
  }

  const result=
    await asaasRequest(
      '/customers',
      {
        method:'POST',
        body:payload
      }
    );

  return {
    dry_run:false,
    provider:'ASAAS',
    operation:'CREATE_CUSTOMER',
    result
  };
}

export async function createAsaasSubscription(
  data,
  {
    dryRun=true
  }={}
){

  const payload=
    buildAsaasSubscriptionPayload(
      data
    );

  if(dryRun){

    return {
      dry_run:true,
      provider:'ASAAS',
      operation:'CREATE_SUBSCRIPTION',
      endpoint:'/subscriptions',
      payload
    };
  }

  /*
   * NEXUS_ASAAS_SUBSCRIPTION_IDEMPOTENCY_V2
   * A refer?ncia local da assinatura ? est?vel.
   */
  if(payload.externalReference){
    const existing=
      await asaasRequest(
        `/subscriptions?externalReference=${encodeURIComponent(payload.externalReference)}&limit=1`,
        {
          method:'GET'
        }
      );

    const found=
      Array.isArray(existing?.data)
        ? existing.data[0]
        : null;

    if(found?.id){
      return {
        dry_run:false,
        provider:'ASAAS',
        operation:'REUSE_SUBSCRIPTION',
        reused:true,
        result:found
      };
    }
  }

  const result=
    await asaasRequest(
      '/subscriptions',
      {
        method:'POST',
        body:payload
      }
    );

  return {
    dry_run:false,
    provider:'ASAAS',
    operation:'CREATE_SUBSCRIPTION',
    result
  };
}

export function normalizeAsaasSaasWebhook(
  body={}
){

  const event=text(body?.event);

  const payment=
    body?.payment || null;

  const subscription=
    body?.subscription || null;

  const externalReference=
    text(
      payment?.externalReference ||
      subscription?.externalReference
    );

  const nexusReference=
    parseSaasExternalReference(
      externalReference
    );

  if(!nexusReference){

    return {
      belongs_to_saas:false,
      event,
      external_reference:
        externalReference || null
    };
  }

  return {
    belongs_to_saas:true,

    event,

    external_reference:
      externalReference,

    subscription_id:
      nexusReference.subscription_id,

    provider_payment_id:
      text(payment?.id) || null,

    provider_subscription_id:
      text(
        payment?.subscription ||
        subscription?.id
      ) || null,

    payment_status:
      text(payment?.status) || null,

    value:
      payment?.value == null
        ? null
        : money(payment.value),

    due_date:
      text(payment?.dueDate) || null,

    payment_date:
      text(
        payment?.paymentDate ||
        payment?.confirmedDate
      ) || null
  };
}

export function classifyAsaasSaasEvent(
  event
){

  const value=
    text(event).toUpperCase();

  if(
    [
      'PAYMENT_RECEIVED',
      'PAYMENT_CONFIRMED'
    ].includes(value)
  ){
    return 'PAID';
  }

  if(
    [
      'PAYMENT_OVERDUE'
    ].includes(value)
  ){
    return 'OVERDUE';
  }

  if(
    [
      'PAYMENT_REFUNDED',
      'PAYMENT_DELETED'
    ].includes(value)
  ){
    return 'REVERSED';
  }

  return 'IGNORED';
}