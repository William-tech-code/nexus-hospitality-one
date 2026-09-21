import React,{
 useEffect,
 useMemo,
 useState
}from"react";

import{
 financialEntriesV50B,
 createFinancialEntryV50B
}from"./api.js";

import"./FinancialEntryCenterV50B.css";

const money=value=>
 Number(value||0).toLocaleString(
  "pt-BR",
  {
   style:"currency",
   currency:"BRL"
  }
 );

const TYPES=[
 {
  value:"EXPENSE",
  label:"Despesa",
  full:"Despesa operacional"
 },
 {
  value:"INVESTMENT",
  label:"Investimento",
  full:"Investimento"
 },
 {
  value:"RENOVATION",
  label:"Reforma",
  full:"Reforma"
 },
 {
  value:"PURCHASE",
  label:"Compra avulsa",
  full:"Compra avulsa"
 }
];

const PAYMENT_METHODS=[
 ["","Nao informada"],
 ["CASH","Dinheiro"],
 ["PIX","PIX"],
 ["DEBIT","Cartao de debito"],
 ["CREDIT","Cartao de credito"],
 ["TRANSFER","Transferencia"],
 ["BOLETO","Boleto"],
 ["OTHER","Outro"]
];

const emptyForm=()=>({
 entry_type:"EXPENSE",
 description:"",
 category:"Geral",
 amount:"",
 due_date:"",
 paid:false,
 recurring:false,
 payment_method:"",
 supplier_name:"",
 document_number:"",
 notes:"",
 investment_area:""
});

export default function FinancialEntryCenterV50B({
 onFinancialChange
}){

 const [form,setForm]=useState(
  emptyForm
 );

 const [entries,setEntries]=useState([]);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 const setField=(field,value)=>{
  setForm(prev=>({
   ...prev,
   [field]:value
  }));
 };

 const loadEntries=async()=>{
  setLoading(true);

  try{

   const result=
    await financialEntriesV50B();

   const list=
    Array.isArray(result)
     ?result
     :Array.isArray(result?.items)
      ?result.items
      :[];

   setEntries(list);

  }catch(err){

   console.error(
    "V50B_LOAD_ENTRIES",
    err
   );

   setError(
    err?.message||
    "Nao foi possivel carregar os lancamentos."
   );

  }finally{

   setLoading(false);

  }
 };

 useEffect(()=>{
  loadEntries();
 },[]);

 const totals=useMemo(()=>{

  return entries.reduce(
   (acc,item)=>{

    const type=
     String(
      item?.entry_type||
      "EXPENSE"
     ).toUpperCase();

    const value=
     Number(
      item?.amount||0
     );

    acc.total+=value;

    if(type==="EXPENSE"){
     acc.expense+=value;
    }

    if(type==="INVESTMENT"){
     acc.investment+=value;
    }

    if(type==="RENOVATION"){
     acc.renovation+=value;
    }

    if(type==="PURCHASE"){
     acc.purchase+=value;
    }

    if(Number(item?.paid||0)===1){
     acc.paid+=value;
    }else{
     acc.pending+=value;
    }

    return acc;

   },
   {
    total:0,
    expense:0,
    investment:0,
    renovation:0,
    purchase:0,
    paid:0,
    pending:0
   }
  );

 },[entries]);

 const recent=useMemo(
  ()=>
   [...entries]
    .sort(
     (a,b)=>
      Number(b?.id||0)-
      Number(a?.id||0)
    )
    .slice(0,12),
  [entries]
 );

 const save=async event=>{

  event.preventDefault();

  setMessage("");
  setError("");

  const description=
   String(
    form.description||""
   ).trim();

  const amount=
   Number(
    String(
     form.amount||""
    ).replace(",",".")
   );

  if(!description){

   setError(
    "Informe a descricao do lancamento."
   );

   return;
  }

  if(
   !Number.isFinite(amount) ||
   amount<=0
  ){

   setError(
    "Informe um valor valido maior que zero."
   );

   return;
  }

  setSaving(true);

  try{

   await createFinancialEntryV50B({
    entry_type:form.entry_type,
    description,
    category:
     String(
      form.category||"Geral"
     ).trim()||"Geral",
    amount,
    due_date:
     form.due_date||null,
    paid:Boolean(form.paid),
    recurring:Boolean(
     form.recurring
    ),
    payment_method:
     form.payment_method||null,
    supplier_name:
     String(
      form.supplier_name||""
     ).trim()||null,
    document_number:
     String(
      form.document_number||""
     ).trim()||null,
    notes:
     String(
      form.notes||""
     ).trim()||null,
    investment_area:
     String(
      form.investment_area||""
     ).trim()||null
   });

   setForm(
    emptyForm()
   );

   setMessage(
    "Lancamento registrado com sucesso."
   );

   await loadEntries();

   if(
    typeof onFinancialChange===
    "function"
   ){
    await onFinancialChange();
   }

  }catch(err){

   console.error(
    "V50B_SAVE_ENTRY",
    err
   );

   setError(
    err?.message||
    "Nao foi possivel registrar o lancamento."
   );

  }finally{

   setSaving(false);

  }
 };

 const typeLabel=value=>
  TYPES.find(
   item=>
    item.value===
    String(
     value||"EXPENSE"
    ).toUpperCase()
  )?.full||
  "Despesa operacional";

 return(
  <section
   className="v50b-center"
   data-nexus-financial-entry-center="v50b-r2"
  >

   <header className="v50b-header">

    <div>
     <small>
      NEXUS FINANCIAL CONTROL V5.0B
     </small>

     <h2>
      Central de Lancamentos
     </h2>

     <p>
      Controle central de despesas,
      investimentos, reformas e compras
      avulsas.
     </p>
    </div>

    <div className="v50b-header-badge">
     FINANCIAL CORE
    </div>

   </header>

   <div className="v50b-notice">
    Compras estruturadas pelo Procurement
    permanecem no modulo de compras.
    Use Compra avulsa somente para gastos
    realizados fora desse fluxo, evitando
    contabilizacao duplicada.
   </div>

   <div className="v50b-types">

    {TYPES.map(item=>(

     <button
      key={item.value}
      type="button"
      className={
       form.entry_type===item.value
        ?"v50b-type active"
        :"v50b-type"
      }
      onClick={()=>
       setField(
        "entry_type",
        item.value
       )
      }
     >

      <span>
       {item.label}
      </span>

      <small>
       {item.full}
      </small>

     </button>

    ))}

   </div>

   <form
    className="v50b-form"
    onSubmit={save}
   >

    <label className="v50b-field span2">
     <span>Descricao</span>

     <input
      value={form.description}
      onChange={e=>
       setField(
        "description",
        e.target.value
       )
      }
      placeholder="Ex.: Compra de bebidas para o fim de semana"
     />
    </label>

    <label className="v50b-field">
     <span>Valor</span>

     <input
      type="number"
      min="0"
      step="0.01"
      value={form.amount}
      onChange={e=>
       setField(
        "amount",
        e.target.value
       )
      }
      placeholder="0,00"
     />
    </label>

    <label className="v50b-field">
     <span>Categoria</span>

     <input
      value={form.category}
      onChange={e=>
       setField(
        "category",
        e.target.value
       )
      }
      placeholder="Ex.: Bebidas"
     />
    </label>

    <label className="v50b-field">
     <span>Fornecedor</span>

     <input
      value={form.supplier_name}
      onChange={e=>
       setField(
        "supplier_name",
        e.target.value
       )
      }
      placeholder="Fornecedor ou prestador"
     />
    </label>

    <label className="v50b-field">
     <span>Vencimento</span>

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

    <label className="v50b-field">
     <span>Forma de pagamento</span>

     <select
      value={form.payment_method}
      onChange={e=>
       setField(
        "payment_method",
        e.target.value
       )
      }
     >

      {PAYMENT_METHODS.map(
       ([value,label])=>(
        <option
         key={value||"NONE"}
         value={value}
        >
         {label}
        </option>
       )
      )}

     </select>
    </label>

    <label className="v50b-field">
     <span>Documento / nota</span>

     <input
      value={form.document_number}
      onChange={e=>
       setField(
        "document_number",
        e.target.value
       )
      }
      placeholder="NF, recibo ou referencia"
     />
    </label>

    {(form.entry_type==="INVESTMENT" ||
      form.entry_type==="RENOVATION")&&(

     <label className="v50b-field">
      <span>Area do investimento</span>

      <input
       value={form.investment_area}
       onChange={e=>
        setField(
         "investment_area",
         e.target.value
        )
       }
       placeholder="Ex.: Salao, cozinha, eventos"
      />
     </label>

    )}

    <label className="v50b-field span2">
     <span>Observacoes</span>

     <textarea
      rows="3"
      value={form.notes}
      onChange={e=>
       setField(
        "notes",
        e.target.value
       )
      }
      placeholder="Detalhes importantes do lancamento"
     />
    </label>

    <div className="v50b-checks span2">

     <label>
      <input
       type="checkbox"
       checked={form.paid}
       onChange={e=>
        setField(
         "paid",
         e.target.checked
        )
       }
      />

      <span>
       Valor ja pago
      </span>
     </label>

     <label>
      <input
       type="checkbox"
       checked={form.recurring}
       onChange={e=>
        setField(
         "recurring",
         e.target.checked
        )
       }
      />

      <span>
       Lancamento recorrente
      </span>
     </label>

    </div>

    <div className="v50b-feedback span2">

     {error&&(
      <div className="v50b-error">
       {error}
      </div>
     )}

     {message&&(
      <div className="v50b-success">
       {message}
      </div>
     )}

    </div>

    <div className="v50b-actions span2">

     <button
      type="button"
      className="v50b-btn secondary"
      disabled={saving}
      onClick={()=>{
       setForm(emptyForm());
       setError("");
       setMessage("");
      }}
     >
      Limpar
     </button>

     <button
      type="submit"
      className="v50b-btn primary"
      disabled={saving}
     >
      {saving
       ?"Salvando..."
       :"Registrar lancamento"}
     </button>

    </div>

   </form>

   <div className="v50b-divider"/>

   <div className="v50b-section-title">

    <div>
     <small>
      FINANCIAL OVERVIEW
     </small>

     <h3>
      Visao dos Lancamentos
     </h3>
    </div>

    <button
     type="button"
     className="v50b-btn secondary"
     onClick={loadEntries}
     disabled={loading}
    >
     {loading
      ?"Atualizando..."
      :"Atualizar"}
    </button>

   </div>

   <div className="v50b-kpis">

    <article>
     <small>
      TOTAL REGISTRADO
     </small>

     <strong>
      {money(totals.total)}
     </strong>
    </article>

    <article>
     <small>
      DESPESAS
     </small>

     <strong>
      {money(totals.expense)}
     </strong>
    </article>

    <article>
     <small>
      INVESTIMENTOS
     </small>

     <strong>
      {money(totals.investment)}
     </strong>
    </article>

    <article>
     <small>
      REFORMAS
     </small>

     <strong>
      {money(totals.renovation)}
     </strong>
    </article>

    <article>
     <small>
      COMPRAS AVULSAS
     </small>

     <strong>
      {money(totals.purchase)}
     </strong>
    </article>

    <article>
     <small>
      PENDENTE
     </small>

     <strong>
      {money(totals.pending)}
     </strong>
    </article>

   </div>

   <div className="v50b-divider"/>

   <div className="v50b-section-title">

    <div>
     <small>
      HISTORICO FINANCEIRO
     </small>

     <h3>
      Ultimos Lancamentos
     </h3>
    </div>

    <strong className="v50b-record-count">
     {entries.length} REGISTROS
    </strong>

   </div>

   {loading&&(
    <div className="v50b-empty">
     Carregando lancamentos...
    </div>
   )}

   {!loading &&
    recent.length===0&&(
     <div className="v50b-empty">
      Nenhum lancamento registrado.
     </div>
    )}

   {!loading &&
    recent.length>0&&(

    <div className="v50b-table-wrap">

     <table className="v50b-table">

      <thead>
       <tr>
        <th>Tipo</th>
        <th>Descricao</th>
        <th>Categoria</th>
        <th>Fornecedor</th>
        <th>Valor</th>
        <th>Status</th>
       </tr>
      </thead>

      <tbody>

       {recent.map(item=>(

        <tr key={item.id}>

         <td>
          <span className="v50b-entry-badge">
           {typeLabel(
            item.entry_type
           )}
          </span>
         </td>

         <td>
          <strong>
           {item.description}
          </strong>

          {item.document_number&&(
           <small className="v50b-row-note">
            Doc.: {item.document_number}
           </small>
          )}
         </td>

         <td>
          {item.category||"-"}
         </td>

         <td>
          {item.supplier_name||"-"}
         </td>

         <td>
          <strong>
           {money(item.amount)}
          </strong>
         </td>

         <td>
          <span
           className={
            Number(item?.paid||0)===1
             ?"v50b-status paid"
             :"v50b-status pending"
           }
          >
           {Number(item?.paid||0)===1
            ?"PAGO"
            :"PENDENTE"}
          </span>
         </td>

        </tr>

       ))}

      </tbody>

     </table>

    </div>

   )}

  </section>
 );
}