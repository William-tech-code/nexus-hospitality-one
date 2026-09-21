import React,{
 useEffect,
 useMemo,
 useState
}from"react";

import{
 financialDebtsV50C,
 createFinancialDebtV50C,
 updateFinancialDebtV50C,
 registerFinancialDebtPaymentV50C,
 financialDebtPaymentsV50C,
 financialPayoffStrategyV50C
}from"./api.js";

import"./DebtManagementV50C.css";

const money=value=>
 Number(value||0).toLocaleString(
  "pt-BR",
  {
   style:"currency",
   currency:"BRL"
  }
 );

const emptyForm=()=>({
 creditor:"",
 description:"",
 category:"OTHER",
 original_amount:"",
 current_balance:"",
 installment_amount:"",
 installments_total:"",
 installments_paid:"0",
 interest_rate:"",
 due_date:"",
 priority:"NORMAL",
 payment_method:"",
 document_number:"",
 notes:""
});

export default function DebtManagementV50C(){

 const [data,setData]=useState(null);
 const [strategy,setStrategy]=useState(null);

 const [form,setForm]=useState(
  emptyForm()
 );

 const [editing,setEditing]=
  useState(null);

 const [paymentDebt,setPaymentDebt]=
  useState(null);

 const [payment,setPayment]=useState({
  amount:"",
  payment_method:"",
  notes:""
 });

 const [history,setHistory]=
  useState(null);

 const [loading,setLoading]=
  useState(true);

 const [saving,setSaving]=
  useState(false);

 const [error,setError]=
  useState("");

 const load=async()=>{

  setLoading(true);
  setError("");

  try{

   const [debts,plan]=
    await Promise.all([
     financialDebtsV50C(),
     financialPayoffStrategyV50C()
    ]);

   setData(debts||null);
   setStrategy(plan||null);

  }catch(err){

   console.error(
    "V50C_R3_LOAD",
    err
   );

   setError(
    err?.message||
    "Falha ao carregar gestao de dividas."
   );

  }finally{
   setLoading(false);
  }
 };

 useEffect(()=>{
  load();
 },[]);

 const openDebts=useMemo(
  ()=>(
   Array.isArray(data?.debts)
    ?data.debts.filter(
      x=>
       String(
        x.status||""
       ).toUpperCase()==="OPEN"
     )
    :[]
  ),
  [data]
 );

 const setField=(key,value)=>
  setForm(prev=>({
   ...prev,
   [key]:value
  }));

 const reset=()=>{
  setForm(emptyForm());
  setEditing(null);
 };

 const edit=row=>{

  setEditing(row.id);

  setForm({
   creditor:row.creditor||"",
   description:row.description||"",
   category:row.category||"OTHER",
   original_amount:
    row.original_amount??"",
   current_balance:
    row.current_balance??"",
   installment_amount:
    row.installment_amount??"",
   installments_total:
    row.installments_total??"",
   installments_paid:
    row.installments_paid??0,
   interest_rate:
    row.interest_rate??"",
   due_date:
    row.due_date||"",
   priority:
    row.priority||"NORMAL",
   payment_method:
    row.payment_method||"",
   document_number:
    row.document_number||"",
   notes:
    row.notes||""
  });

  window.scrollTo({
   top:0,
   behavior:"smooth"
  });
 };

 const save=async event=>{

  event.preventDefault();

  setSaving(true);
  setError("");

  try{

   const body={
    ...form,

    original_amount:
     Number(
      form.original_amount||0
     ),

    current_balance:
     form.current_balance===""
      ?undefined
      :Number(
        form.current_balance
       ),

    installment_amount:
     form.installment_amount===""
      ?null
      :Number(
        form.installment_amount
       ),

    installments_total:
     form.installments_total===""
      ?null
      :Number(
        form.installments_total
       ),

    installments_paid:
     Number(
      form.installments_paid||0
     ),

    interest_rate:
     form.interest_rate===""
      ?null
      :Number(
        form.interest_rate
       )
   };

   if(editing){

    await updateFinancialDebtV50C(
     editing,
     body
    );

   }else{

    await createFinancialDebtV50C(
     body
    );
   }

   reset();
   await load();

  }catch(err){

   console.error(
    "V50C_R3_SAVE",
    err
   );

   setError(
    err?.message||
    "Nao foi possivel salvar a divida."
   );

  }finally{
   setSaving(false);
  }
 };

 const openPayment=debt=>{

  setPaymentDebt(debt);

  setPayment({
   amount:
    debt.installment_amount||
    "",
   payment_method:
    debt.payment_method||
    "",
   notes:""
  });

  setHistory(null);
 };

 const submitPayment=async()=>{

  if(!paymentDebt){
   return;
  }

  setSaving(true);
  setError("");

  try{

   await registerFinancialDebtPaymentV50C(
    paymentDebt.id,
    {
     amount:Number(
      payment.amount||0
     ),
     payment_method:
      payment.payment_method,
     notes:
      payment.notes
    }
   );

   setPaymentDebt(null);

   setPayment({
    amount:"",
    payment_method:"",
    notes:""
   });

   await load();

  }catch(err){

   console.error(
    "V50C_R3_PAYMENT",
    err
   );

   setError(
    err?.message||
    "Nao foi possivel registrar o pagamento."
   );

  }finally{
   setSaving(false);
  }
 };

 const showHistory=async debt=>{

  setError("");

  try{

   const result=
    await financialDebtPaymentsV50C(
     debt.id
    );

   setHistory(result);

  }catch(err){

   setError(
    err?.message||
    "Falha ao carregar historico."
   );
  }
 };

 if(loading){

  return(
   <section className="v50c-debt-manager">
    <strong>
     NEXUS DEBT INTELLIGENCE
    </strong>

    <p>
     Organizando compromissos financeiros...
    </p>
   </section>
  );
 }

 return(
  <section
   className="v50c-debt-manager"
   data-nexus-debt-management="v50c-r3"
  >

   <header className="v50c-dm-header">

    <div>
     <small>
      NEXUS FINANCIAL CONTROL
     </small>

     <h2>
      Central de Dividas
     </h2>

     <p>
      Cadastre, acompanhe, amortize
      e organize compromissos financeiros.
     </p>
    </div>

    <div className="v50c-dm-total">
     <span>SALDO TOTAL</span>

     <strong>
      {money(data?.total_debt)}
     </strong>

     <small>
      {data?.open_count||0}
      {" "}aberta(s)
     </small>
    </div>

   </header>

   {error&&(
    <div className="v50c-dm-error">
     {error}
    </div>
   )}

   <div className="v50c-dm-grid">

    <form
     className="v50c-dm-form"
     onSubmit={save}
    >

     <div className="v50c-dm-title">

      <div>
       <small>
        {editing
         ?"EDICAO"
         :"NOVA DIVIDA"}
       </small>

       <h3>
        {editing
         ?"Editar compromisso"
         :"Cadastrar compromisso"}
       </h3>
      </div>

      {editing&&(
       <button
        type="button"
        onClick={reset}
       >
        Cancelar edicao
       </button>
      )}

     </div>

     <div className="v50c-fields">

      <label>
       Credor
       <input
        required
        value={form.creditor}
        onChange={e=>
         setField(
          "creditor",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Descricao
       <input
        required
        value={form.description}
        onChange={e=>
         setField(
          "description",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Categoria
       <select
        value={form.category}
        onChange={e=>
         setField(
          "category",
          e.target.value
         )
        }
       >
        <option value="BANK">
         Banco
        </option>

        <option value="SUPPLIER">
         Fornecedor
        </option>

        <option value="EQUIPMENT">
         Equipamento
        </option>

        <option value="RENOVATION">
         Reforma
        </option>

        <option value="TAX">
         Tributo
        </option>

        <option value="PERSONAL_LOAN">
         Emprestimo
        </option>

        <option value="OTHER">
         Outros
        </option>
       </select>
      </label>

      <label>
       Prioridade
       <select
        value={form.priority}
        onChange={e=>
         setField(
          "priority",
          e.target.value
         )
        }
       >
        <option value="LOW">
         Baixa
        </option>

        <option value="NORMAL">
         Normal
        </option>

        <option value="HIGH">
         Alta
        </option>

        <option value="CRITICAL">
         Critica
        </option>
       </select>
      </label>

      <label>
       Valor original
       <input
        required
        type="number"
        min="0.01"
        step="0.01"
        value={form.original_amount}
        onChange={e=>
         setField(
          "original_amount",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Saldo atual
       <input
        type="number"
        min="0"
        step="0.01"
        value={form.current_balance}
        onChange={e=>
         setField(
          "current_balance",
          e.target.value
         )
        }
        placeholder="Automatico na criacao"
       />
      </label>

      <label>
       Valor da parcela
       <input
        type="number"
        min="0"
        step="0.01"
        value={form.installment_amount}
        onChange={e=>
         setField(
          "installment_amount",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Total de parcelas
       <input
        type="number"
        min="0"
        step="1"
        value={form.installments_total}
        onChange={e=>
         setField(
          "installments_total",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Parcelas pagas
       <input
        type="number"
        min="0"
        step="1"
        value={form.installments_paid}
        onChange={e=>
         setField(
          "installments_paid",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Juros %
       <input
        type="number"
        min="0"
        step="0.01"
        value={form.interest_rate}
        onChange={e=>
         setField(
          "interest_rate",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Proximo vencimento
       <input
        type="date"
        value={form.due_date}
        onChange={e=>
         setField(
          "due_date",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Forma de pagamento
       <input
        value={form.payment_method}
        onChange={e=>
         setField(
          "payment_method",
          e.target.value
         )
        }
       />
      </label>

      <label>
       Documento
       <input
        value={form.document_number}
        onChange={e=>
         setField(
          "document_number",
          e.target.value
         )
        }
       />
      </label>

      <label className="wide">
       Observacoes
       <textarea
        value={form.notes}
        onChange={e=>
         setField(
          "notes",
          e.target.value
         )
        }
       />
      </label>

     </div>

     <button
      className="v50c-primary"
      disabled={saving}
      type="submit"
     >
      {saving
       ?"Salvando..."
       :editing
        ?"Salvar alteracoes"
        :"Cadastrar divida"}
     </button>

    </form>

    <aside className="v50c-payoff">

     <small>
      PAYOFF STRATEGY
     </small>

     <h3>
      Plano de Quitacao
     </h3>

     <div className="v50c-payoff-numbers">

      <article>
       <span>
        Divida total
       </span>

       <strong>
        {money(
         strategy?.debt_total
        )}
       </strong>
      </article>

      <article>
       <span>
        Vencida
       </span>

       <strong>
        {money(
         strategy?.overdue
        )}
       </strong>
      </article>

      <article>
       <span>
        Capacidade mensal sugerida
       </span>

       <strong>
        {money(
         strategy
          ?.suggested_monthly_capacity
        )}
       </strong>
      </article>

      <article>
       <span>
        Referencia semanal
       </span>

       <strong>
        {money(
         strategy
          ?.suggested_weekly_capacity
        )}
       </strong>
      </article>

     </div>

     <div className="v50c-plan-list">

      {(strategy?.plan||[])
       .slice(0,8)
       .map(item=>(

        <article
         key={item.debt_id}
        >

         <span className="position">
          {item.position}
         </span>

         <div>
          <strong>
           {item.creditor}
          </strong>

          <p>
           {item.reason}
          </p>

          <small>
           {item.due_date||
            "Sem vencimento"}
          </small>
         </div>

         <b>
          {money(item.balance)}
         </b>

        </article>

       ))}

     </div>

     <p className="v50c-payoff-notice">
      {strategy?.notice}
     </p>

    </aside>

   </div>

   <div className="v50c-dm-list">

    <div className="v50c-dm-title">

     <div>
      <small>
       DEBT PORTFOLIO
      </small>

      <h3>
       Dividas em aberto
      </h3>
     </div>

     <strong>
      {openDebts.length}
     </strong>

    </div>

    {!openDebts.length&&(
     <div className="v50c-dm-empty">
      Nenhuma divida em aberto.
     </div>
    )}

    {openDebts.map(row=>(

     <article
      className="v50c-debt-row"
      key={row.id}
     >

      <div className="main">
       <small>
        {row.category}
       </small>

       <strong>
        {row.creditor}
       </strong>

       <span>
        {row.description}
       </span>
      </div>

      <div>
       <small>SALDO</small>

       <strong>
        {money(
         row.current_balance
        )}
       </strong>
      </div>

      <div>
       <small>PARCELA</small>

       <strong>
        {row.installment_amount
         ?money(
           row.installment_amount
          )
         :"-"}
       </strong>
      </div>

      <div>
       <small>VENCIMENTO</small>

       <strong>
        {row.due_date||"-"}
       </strong>
      </div>

      <div className="actions">

       <button
        type="button"
        onClick={()=>
         openPayment(row)
        }
       >
        Pagar
       </button>

       <button
        type="button"
        onClick={()=>
         edit(row)
        }
       >
        Editar
       </button>

       <button
        type="button"
        onClick={()=>
         showHistory(row)
        }
       >
        Historico
       </button>

      </div>

     </article>

    ))}

   </div>

   {paymentDebt&&(

    <div className="v50c-modal-layer">

     <div className="v50c-modal">

      <small>
       REGISTRAR PAGAMENTO
      </small>

      <h3>
       {paymentDebt.creditor}
      </h3>

      <p>
       Saldo atual:
       {" "}
       <strong>
        {money(
         paymentDebt.current_balance
        )}
       </strong>
      </p>

      <label>
       Valor pago

       <input
        autoFocus
        type="number"
        min="0.01"
        step="0.01"
        value={payment.amount}
        onChange={e=>
         setPayment(prev=>({
          ...prev,
          amount:e.target.value
         }))
        }
       />
      </label>

      <label>
       Forma de pagamento

       <input
        value={
         payment.payment_method
        }
        onChange={e=>
         setPayment(prev=>({
          ...prev,
          payment_method:
           e.target.value
         }))
        }
       />
      </label>

      <label>
       Observacao

       <textarea
        value={payment.notes}
        onChange={e=>
         setPayment(prev=>({
          ...prev,
          notes:e.target.value
         }))
        }
       />
      </label>

      <div className="modal-actions">

       <button
        type="button"
        onClick={()=>
         setPaymentDebt(null)
        }
       >
        Cancelar
       </button>

       <button
        className="v50c-primary"
        type="button"
        disabled={saving}
        onClick={submitPayment}
       >
        Confirmar pagamento
       </button>

      </div>

     </div>

    </div>

   )}

   {history&&(

    <div className="v50c-modal-layer">

     <div className="v50c-modal history">

      <small>
       HISTORICO FINANCEIRO
      </small>

      <h3>
       {history?.debt?.creditor}
      </h3>

      <p>
       {history?.debt?.description}
      </p>

      {!history?.payments?.length&&(
       <div className="v50c-dm-empty">
        Nenhum pagamento registrado
        pelo novo historico.
       </div>
      )}

      {(history?.payments||[])
       .map(item=>(

        <article
         className="history-row"
         key={item.id}
        >

         <div>
          <strong>
           {money(item.amount)}
          </strong>

          <small>
           {item.created_at}
          </small>
         </div>

         <span>
          {money(
           item.previous_balance
          )}
          {" -> "}
          {money(
           item.new_balance
          )}
         </span>

        </article>

       ))}

      <button
       type="button"
       onClick={()=>
        setHistory(null)
       }
      >
       Fechar
      </button>

     </div>

    </div>

   )}

  </section>
 );
}