const API=(import.meta.env.VITE_API_URL||'/api').replace(/\/+$/,'');
let token=localStorage.getItem('nexus_hospitality_token')||'';
export function setAuthToken(v){token=v||'';if(token)localStorage.setItem('nexus_hospitality_token',token);else localStorage.removeItem('nexus_hospitality_token')}
async function request(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(token)headers.Authorization=`Bearer ${token}`;let res;try{res=await fetch(`${API}${path}`,{...options,headers})}catch(cause){const e=new Error('API do NEXUS Hospitality indisponível. Confirme que o servidor está ativo na porta 8989.');e.code='API_UNREACHABLE';e.cause=cause;throw e}const data=await res.json().catch(()=>({}));if(!res.ok){const e=new Error(data.message||data.error||`Erro HTTP ${res.status}`);e.code=data.error;e.status=res.status;throw e}return data}
export const api={
  inventoryV49Summary:()=>request('/v49/inventory/summary'),
  inventoryV49Alerts:()=>request('/v49/inventory/alerts'),
  inventoryV49Product:id=>request(`/v49/inventory/products/${id}`),
  inventoryV49Entry:(id,body)=>request(`/v49/inventory/products/${id}/entry`,{method:'POST',body:JSON.stringify(body)}),
  inventoryV49Exit:(id,body)=>request(`/v49/inventory/products/${id}/exit`,{method:'POST',body:JSON.stringify(body)}),
  inventoryV49Loss:(id,body)=>request(`/v49/inventory/products/${id}/loss`,{method:'POST',body:JSON.stringify(body)}),
  inventoryV49Count:(id,body)=>request(`/v49/inventory/products/${id}/count`,{method:'POST',body:JSON.stringify(body)}),
  inventoryV49AlertsSeen:keys=>request('/v49/inventory/alerts/seen',{method:'POST',body:JSON.stringify({keys})}),
  paymentConfigV15:()=>request('/v15/payments/config'),saveAsaasV15:body=>request('/v15/payments/config',{method:'PUT',body:JSON.stringify(body)}),testAsaasV15:()=>request('/v15/payments/test',{method:'POST'}),
  salesRecentV14:()=>request('/v14/sales/recent'),saleV14:id=>request(`/v14/sales/${id}`),createSaleV14:body=>request('/v14/sales',{method:'POST',body:JSON.stringify(body)}),releaseSaleV14:id=>request(`/v14/sales/${id}/release`,{method:'POST'}),changeCorrectionV14:(id,body)=>request(`/v14/sales/${id}/change-correction`,{method:'POST',body:JSON.stringify(body)}),returnSaleV14:(id,body)=>request(`/v14/sales/${id}/return`,{method:'POST',body:JSON.stringify(body)}),printSaleV14:(id,type)=>request(`/v14/sales/${id}/print`,{method:'POST',body:JSON.stringify({type})}),paymentConfigV14:()=>request('/v14/payment-config'),
  salesV13:()=>request('/v13/sales/recent'),cancelSaleV13:(id,reason)=>request(`/v13/sales/${id}/cancel`,{method:'POST',body:JSON.stringify({reason})}),splitPaymentV13:body=>request('/v13/sales/split-payment',{method:'POST',body:JSON.stringify(body)}),withdrawalAdviceV13:()=>request('/v13/cash/withdrawal-advice'),pricingV13:()=>request('/v13/pricing'),priceProductV13:(id,body)=>request(`/v13/pricing/product/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  purchaseOrdersV49C:()=>request('/v49c/purchase-orders'),
  purchaseOrderV49C:id=>request(`/v49c/purchase-orders/${id}`),
  receivePurchaseOrderV49C:(id,body)=>request(`/v49c/purchase-orders/${id}/receive`,{method:'POST',body:JSON.stringify(body)}),
  procurementNeedV49B:()=>request('/v49b/procurement/need'),
smartQuoteAnalysisV49B:id=>request(`/v49b/quotes/${id}/smart-analysis`),
finalizeSmartQuoteV49B:id=>request(`/v49b/quotes/${id}/finalize-smart`,{method:'POST'}),
  supplierDispatchesV49D:()=>request('/v49d/dispatches'),
  supplierDispatchV49D:id=>request(`/v49d/dispatches/${id}`),
  markSupplierDispatchSentV49D:(id,body)=>request(`/v49d/dispatches/${id}/sent`,{method:'POST',body:JSON.stringify(body||{})}),
quotesV13:()=>request('/v13/quotes'),createQuoteV13:body=>request('/v13/quotes',{method:'POST',body:JSON.stringify(body)}),quoteAnalysisV13:id=>request(`/v13/quotes/${id}/analysis`),finalizeQuoteV13:(id,supplier_id)=>request(`/v13/quotes/${id}/finalize`,{method:'POST',body:JSON.stringify({supplier_id})}),publicSupplierQuoteV13:token=>request(`/public/supplier-quote/${token}`),submitSupplierQuoteV13:(token,body)=>request(`/public/supplier-quote/${token}`,{method:'POST',body:JSON.stringify(body)}),

  publicStore:()=>request('/public/store'),publicCreateOrder:body=>request('/public/orders',{method:'POST',body:JSON.stringify(body)}),publicOrder:code=>request(`/public/orders/${code}`),publicEvents:()=>request('/public/events'),publicEvent:id=>request(`/public/events/${id}`),publicBuyTicket:(id,body)=>request(`/public/events/${id}/buy`,{method:'POST',body:JSON.stringify(body)}),publicTicketOrder:code=>request(`/public/ticket-orders/${code}`),growthV12:()=>request('/v12/growth'),updateEventV12:(id,body)=>request(`/v12/events/${id}`,{method:'PATCH',body:JSON.stringify(body)}),
  ticketDashboardV25:id=>request(`/v25/tickets/dashboard/${id}`),ticketOrdersV25:id=>request(`/v25/tickets/orders/${id}`),ticketAccessV25:id=>request(`/v25/tickets/access/${id}`),ticketSearchV25:(id,q)=>request(`/v25/tickets/search/${id}?q=${encodeURIComponent(q)}`),createPresentialTicketV25:body=>request('/v25/tickets/presential',{method:'POST',body:JSON.stringify(body)}),checkinV25:async code=>{const result=await request('/v25/tickets/checkin',{method:'POST',body:JSON.stringify({code})});window.dispatchEvent(new CustomEvent('nexus:ticket-checkin',{detail:result}));return result},publicMenu:()=>request('/public/menu'),ticketEvents:()=>request('/v11/tickets/events'),ticketLots:id=>request(`/v11/tickets/lots/${id}`),createTicketLot:body=>request('/v11/tickets/lots',{method:'POST',body:JSON.stringify(body)}),tickets:id=>request(`/v11/tickets/${id}`),createTicket:body=>request('/v11/tickets',{method:'POST',body:JSON.stringify(body)}),checkin:code=>request('/v11/access/checkin',{method:'POST',body:JSON.stringify({code})}),menuAdmin:()=>request('/v11/menu'),updateMenuItem:(id,body)=>request(`/v11/menu/${id}`,{method:'PATCH',body:JSON.stringify(body)}),salon:()=>request('/v11/salon'),updateTableV11:(id,body)=>request(`/v11/tables/${id}`,{method:'PATCH',body:JSON.stringify(body)}),deliveryV11:()=>request('/v11/delivery'),deliveryOneV11:id=>request(`/v11/delivery/${id}`),createDeliveryV11:body=>request('/v11/delivery',{method:'POST',body:JSON.stringify(body)}),deliveryStatusV11:(id,status)=>request(`/v11/delivery/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),


  smartInventory:()=>request('/inventory/smart'),createSmartProduct:body=>request('/inventory/smart-product',{method:'POST',body:JSON.stringify(body)}),updateInventoryProfile:(id,body)=>request(`/inventory/${id}/profile`,{method:'PATCH',body:JSON.stringify(body)}),cashMovement:body=>request('/cash-movements',{method:'POST',body:JSON.stringify(body)}),cashMovements:()=>request('/cash-movements/current'),
  customers:()=>request('/customers'),createCustomer:body=>request('/customers',{method:'POST',body:JSON.stringify(body)}),reservations:()=>request('/reservations'),createReservation:body=>request('/reservations',{method:'POST',body:JSON.stringify(body)}),reservationStatus:(id,status)=>request(`/reservations/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),
  delivery:()=>request('/delivery'),createDelivery:body=>request('/delivery',{method:'POST',body:JSON.stringify(body)}),deliveryStatus:(id,status)=>request(`/delivery/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),eventsV06:()=>request('/events-v06'),createEventV06:body=>request('/events-v06',{method:'POST',body:JSON.stringify(body)}),addEventCost:(id,body)=>request(`/events-v06/${id}/costs`,{method:'POST',body:JSON.stringify(body)}),
  fiscalCaptures:()=>request('/fiscal-captures'),createFiscalCapture:body=>request('/fiscal-captures',{method:'POST',body:JSON.stringify(body)}),executiveReport:()=>request('/reports/executive'),
  login:body=>request('/auth/login',{method:'POST',body:JSON.stringify(body)}),logout:()=>request('/auth/logout',{method:'POST'}),me:()=>request('/auth/me'),changePassword:body=>request('/auth/change-password',{method:'POST',body:JSON.stringify(body)}),capabilities:()=>request('/auth/capabilities'),
  dashboard:()=>request('/dashboard'),products:()=>request('/products'),createProduct:body=>request('/products',{method:'POST',body:JSON.stringify(body)}),updateProduct:(id,body)=>request(`/products/${id}`,{method:'PATCH',body:JSON.stringify(body)}),aiBrief:()=>request('/ai/operations-brief'),createSale:body=>request('/sales-v1',{method:'POST',body:JSON.stringify(body)}),
  currentCash:()=>request('/cash-sessions/current'),openCash:body=>request('/cash-sessions/open',{method:'POST',body:JSON.stringify(body)}),closeCash:(id,body)=>request(`/cash-sessions/${id}/close-v1`,{method:'POST',body:JSON.stringify(body)}),
  employees:()=>request('/employees'),createEmployee:body=>request('/employees',{method:'POST',body:JSON.stringify(body)}),users:()=>request('/users'),createUser:body=>request('/users',{method:'POST',body:JSON.stringify(body)}),audit:()=>request('/audit'),
  performance:()=>request('/performance'),createIncentive:body=>request('/incentive-rules',{method:'POST',body:JSON.stringify(body)}),createTip:body=>request('/tips',{method:'POST',body:JSON.stringify(body)}),

  opsSummary:()=>request('/operations/summary'),tables:()=>request('/tables'),createTable:body=>request('/tables',{method:'POST',body:JSON.stringify(body)}),openTable:(id,body)=>request(`/tables/${id}/open`,{method:'POST',body:JSON.stringify(body)}),
  ordersV03:()=>request('/orders-v03'),orderV03:id=>request(`/orders-v03/${id}`),addOrderItem:(id,body)=>request(`/orders-v03/${id}/items`,{method:'POST',body:JSON.stringify(body)}),setOrderItemStatus:(id,status)=>request(`/order-items/${id}/status`,{method:'PATCH',body:JSON.stringify({status})}),deleteOrderItem:id=>request(`/order-items/${id}`,{method:'DELETE'}),transferOrder:(id,table_id)=>request(`/orders-v03/${id}/transfer`,{method:'POST',body:JSON.stringify({table_id})}),splitOrder:(id,body)=>request(`/orders-v03/${id}/split`,{method:'POST',body:JSON.stringify(body)}),closeOrder:(id,body)=>request(`/orders-v1/${id}/close`,{method:'POST',body:JSON.stringify(body)}),kitchen:()=>request('/kitchen'),
  beverageControl:()=>request('/beverage-control'),updateBeverage:(id,body)=>request(`/products/${id}/beverage`,{method:'PATCH',body:JSON.stringify(body)}),adjustStock:(id,body)=>request(`/products/${id}/stock-adjust`,{method:'POST',body:JSON.stringify(body)}),
  suppliersV03:()=>request('/suppliers-v03'),createSupplierV03:body=>request('/suppliers-v03',{method:'POST',body:JSON.stringify(body)}),quotesV03:()=>request('/quotes-v03'),createQuoteV03:body=>request('/quotes-v03',{method:'POST',body:JSON.stringify(body)}),quoteV03:id=>request(`/quotes-v03/${id}`),addQuoteItemV03:(id,body)=>request(`/quotes-v03/${id}/items`,{method:'POST',body:JSON.stringify(body)}),bestQuoteV03:id=>request(`/quotes-v03/${id}/best`),
  recipes:()=>request('/recipes'),recipe:id=>request(`/recipes/${id}`),saveRecipe:body=>request('/recipes',{method:'POST',body:JSON.stringify(body)}),addRecipeItem:(id,body)=>request(`/recipes/${id}/items`,{method:'POST',body:JSON.stringify(body)}),deleteRecipeItem:(id,itemId)=>request(`/recipes/${id}/items/${itemId}`,{method:'DELETE'}),stockCount:body=>request('/stock-counts',{method:'POST',body:JSON.stringify(body)}),smartClosing:()=>request('/smart-closing'),
  orders:()=>request('/orders'),createOrder:body=>request('/orders',{method:'POST',body:JSON.stringify(body)}),expenses:()=>request('/expenses'),createExpense:body=>request('/expenses',{method:'POST',body:JSON.stringify(body)}),financialEntriesV50B:()=>request('/expenses'),createFinancialEntryV50B:body=>request('/expenses',{method:'POST',body:JSON.stringify(body)}),goals:()=>request('/goals'),createGoal:body=>request('/goals',{method:'POST',body:JSON.stringify(body)}),closingPlan:revenue=>request(`/closing-plan?revenue=${encodeURIComponent(revenue)}`),settings:()=>request('/settings'),updateSettings:body=>request('/settings',{method:'PUT',body:JSON.stringify(body)}),
  // ==================================================
  // NEXUS HOSPITALITY ONE V1.6
  // Operational Checkout & Audit
  // ==================================================

  salesRecentV16: () =>
    request('/v16/sales/recent'),

  saleV16: id =>
    request(`/v16/sales/${id}`),

  cancelSaleV16: (id, reason) =>
    request(`/v16/sales/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  returnPreviewV16: (id, body) =>
    request(`/v16/sales/${id}/return-preview`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  returnSaleV16: (id, body) =>
    request(`/v16/sales/${id}/return`, {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  /* NEXUS_DESKTOP_PRINT_FRONTEND_V218I1 */
  desktopPrintPendingV16:(limit=50)=>request('/v16/print-jobs/desktop/pending?limit='+encodeURIComponent(limit)),
  printJobV16:id=>request('/v16/print-jobs/'+id),
  beginDesktopPrintV16:(id,printerName)=>request('/v16/print-jobs/'+id+'/desktop/begin',{method:'POST',body:JSON.stringify({printer_name:printerName||null})}),
  markDesktopPrintedV16:(id,printerName)=>request('/v16/print-jobs/'+id+'/desktop/printed',{method:'POST',body:JSON.stringify({printer_name:printerName||null})}),
  markDesktopFailedV16:(id,error,printerName)=>request('/v16/print-jobs/'+id+'/desktop/failed',{method:'POST',body:JSON.stringify({error:String(error||'DESKTOP_PRINT_FAILED'),printer_name:printerName||null})}),
  retryDesktopPrintV16:id=>request('/v16/print-jobs/'+id+'/desktop/retry',{method:'POST'}),
  queueSaleDocumentsV16:
    (id, mode='SIMULATION') =>
      request(
        `/v16/sales/${id}/documents`,
        {
          method:'POST',
          body:JSON.stringify({mode})
        }
      ),
  publicMyTicket:token=>request(`/public/my-ticket/${encodeURIComponent(token)}`),
  customerClaimTicket:(token,body)=>request(`/public/customer/claim/${encodeURIComponent(token)}`,{method:'POST',body:JSON.stringify(body)}),
  customerMe:session=>request('/public/customer/me',{headers:{'x-nexus-customer-session':session}}),
  customerWallet:session=>request('/public/customer/wallet',{headers:{'x-nexus-customer-session':session}}),
  customerLogout:session=>request('/public/customer/logout',{method:'POST',headers:{'x-nexus-customer-session':session}}),
  publicEventAgeCheck:(id,birth_date)=>request(`/public/ticket-age-check/${id}`,{method:'POST',body:JSON.stringify({birth_date})})
};





/* CUSTOMER EXPERIENCE V26 */

export function customerSessionV26(){
 return localStorage.getItem(
  "nexus_ticket_customer_session"
 )||"";
}

export function setCustomerSessionV26(value){
 if(value){
  localStorage.setItem(
   "nexus_ticket_customer_session",
   value
  );
 }else{
  localStorage.removeItem(
   "nexus_ticket_customer_session"
  );
 }
}

async function customerFetchV26(
 path,
 options={}
){
 const session=customerSessionV26();

 const headers={
  "Content-Type":"application/json",
  ...(options.headers||{})
 };

 if(session){
  headers[
   "x-nexus-customer-session"
  ]=session;
 }

 const response=await fetch(
  path,
  {
   ...options,
   headers
  }
 );

 const data=await response.json()
  .catch(()=>({}));

 if(!response.ok){
  const error=new Error(
   data.error||
   "CUSTOMER_REQUEST_FAILED"
  );

  error.status=response.status;
  error.data=data;

  throw error;
 }

 return data;
}

export function customerMeV26(){
 return customerFetchV26(
  "/api/public/customer/me"
 );
}

export function customerWalletV26(){
 return customerFetchV26(
  "/api/public/customer/wallet"
 );
}

export function customerOrdersV26(){
 return customerFetchV26(
  "/api/public/customer/orders"
 );
}

export function customerEventsV26(){
 return customerFetchV26(
  "/api/public/customer/events"
 );
}

export function updateCustomerProfileV26(data){
 return customerFetchV26(
  "/api/public/customer/profile",
  {
   method:"PUT",
   body:JSON.stringify(data)
  }
 );
}

export function logoutCustomerV26(){
 return customerFetchV26(
  "/api/public/customer/logout",
  {
   method:"POST",
   body:"{}"
  }
 ).finally(()=>{
  setCustomerSessionV26("");
 });
}

export function customerBuyTicketV26(
 eventId,
 data
){
 return customerFetchV26(
  `/api/public/events/${eventId}/buy`,
  {
   method:"POST",
   body:JSON.stringify(data)
  }
 );
}

export function customerAgeCheckV26(
 eventId,
 birthDate
){
 return customerFetchV26(
  `/api/public/ticket-age-check/${eventId}`,
  {
   method:"POST",
   body:JSON.stringify({
    birth_date:birthDate
   })
  }
 );
}

/* NEXUS FINANCIAL INTELLIGENCE V25 */

function nexusAuthHeadersV25(){
 const financialToken=
  localStorage.getItem("nexus_hospitality_token")||"";

 return financialToken
  ?{
    Authorization:`Bearer ${financialToken}`,
    "Content-Type":"application/json"
   }
  :{
    "Content-Type":"application/json"
   };
}

async function nexusFinancialFetch(
 path,
 options={}
){
 const response=await fetch(
  path,
  {
   ...options,
   headers:{
    ...nexusAuthHeadersV25(),
    ...(options.headers||{})
   }
  }
 );

 const data=
  await response.json()
   .catch(()=>({}));

 if(!response.ok){
  throw new Error(
   data.error||
   "FINANCIAL_REQUEST_FAILED"
  );
 }

 return data;
}

export function financialIntelligenceDashboard(){
 return nexusFinancialFetch(
  "/api/v25/intelligence/dashboard"
 );
}

export function financialReservePlan(){
 return nexusFinancialFetch(
  "/api/v25/intelligence/reserve-plan"
 );
}

export function financialPurchaseSimulation(
 data
){
 return nexusFinancialFetch(
  "/api/v25/intelligence/purchase-simulation",
  {
   method:"POST",
   body:JSON.stringify(data)
  }
 );
}

export function financialRecordReserve(
 data
){
 return nexusFinancialFetch(
  "/api/v25/intelligence/reserve",
  {
   method:"POST",
   body:JSON.stringify(data)
  }
 );
}


/* NEXUS GROWTH INTELLIGENCE T2.5C */

export function financialExecutiveGrowth(){
 return nexusFinancialFetch(
  "/api/v25/intelligence/executive-growth"
 );
}

export function financialGrowthGoal(){
 return nexusFinancialFetch(
  "/api/v25/intelligence/goal"
 );
}

export function financialSaveGrowthGoal(
 data
){
 return nexusFinancialFetch(
  "/api/v25/intelligence/goal",
  {
   method:"PUT",
   body:JSON.stringify(data)
  }
 );
}

/* T2.5D NET INTELLIGENCE */

export function financialNetOverview(){
 return nexusFinancialFetch(
  "/api/v25/intelligence/net-overview"
 );
}

/* NEXUS V5.0B-R1A ESM EXPORT BRIDGE */
export const financialEntriesV50B=()=>request('/expenses');
export const createFinancialEntryV50B=body=>request('/expenses',{
 method:'POST',
 body:JSON.stringify(body)
});

/* NEXUS V5.0C FINANCIAL TRUTH API */
export const financialTruthV50C=
 ()=>request('/v50c/financial-truth');

export const financialDebtsV50C=
 ()=>request('/v50c/debts');

export const createFinancialDebtV50C=
 body=>request(
  '/v50c/debts',
  {
   method:'POST',
   body:JSON.stringify(body)
  }
 );

export const payFinancialDebtV50C=
 (id,body)=>request(
  `/v50c/debts/${id}/payment`,
  {
   method:'POST',
   body:JSON.stringify(body)
  }
 );

/* NEXUS V5.0C-R3 DEBT MANAGEMENT API */

export const updateFinancialDebtV50C=
 (id,body)=>request(
  `/v50c/debts/${id}`,
  {
   method:'PUT',
   body:JSON.stringify(body)
  }
 );

export const financialDebtPaymentsV50C=
 id=>request(
  `/v50c/debts/${id}/payments`
 );

export const registerFinancialDebtPaymentV50C=
 (id,body)=>request(
  `/v50c/debts/${id}/pay`,
  {
   method:'POST',
   body:JSON.stringify(body)
  }
 );

export const financialPayoffStrategyV50C=
 ()=>request(
  '/v50c/payoff-strategy'
 );

/* NEXUS V5.0C-R4 FINANCIAL CALENDAR API */
export const financialCalendarV50C=
  ()=>request('/v50c/financial-calendar');


/* NEXUS V5.0C-R5 CASH FLOW + DRE */
export const cashFlowDREV50C=
  ()=>request('/v50c/cash-flow-dre');


/* NEXUS V5.0C-R6 FINANCIAL FORECAST API */
export const financialForecastV50C=
  ()=>request('/v50c/financial-forecast');


/* NEXUS V5.0C-R7 FINANCIAL MENTOR API */
export const financialMentorV50C=
  ()=>request('/v50c/financial-mentor');



/* NEXUS V5.0C MASTER FINAL R8-R18 API */
export const hospitalityFinalIntelligenceV50C =
  () => request('/v50c/final-intelligence');

