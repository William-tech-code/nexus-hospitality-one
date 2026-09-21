import React,{
 useEffect,
 useMemo,
 useState
}from"react";

import{
 financialTruthV50C,
 financialDebtsV50C
}from"./api.js";

import"./CEOCommandCenterV50C.css";

const n=value=>{
 const x=Number(value||0);
 return Number.isFinite(x)?x:0;
};

const money=value=>
 n(value).toLocaleString(
  "pt-BR",
  {
   style:"currency",
   currency:"BRL"
  }
 );

const pct=value=>
 value===null ||
 value===undefined
  ?"-"
  :`${n(value).toFixed(1)}%`;

const number=value=>
 n(value).toLocaleString(
  "pt-BR",
  {
   maximumFractionDigits:1
  }
 );

function statusLabel(status){

 switch(
  String(status||"").toUpperCase()
 ){
  case"DEBT_FREE":
   return"SEM DIVIDA REGISTRADA";

  case"CONTROLLED":
   return"CONTROLADO";

  case"ATTENTION":
   return"ATENCAO";

  case"HIGH_PRESSURE":
   return"PRESSAO ALTA";

  case"OVERDUE":
   return"DIVIDA VENCIDA";

  default:
   return"EM ANALISE";
 }
}

function severityLabel(value){

 switch(
  String(value||"").toUpperCase()
 ){
  case"HIGH":
   return"ALTA PRIORIDADE";

  case"MEDIUM":
   return"ATENCAO";

  case"INFO":
   return"INFORMATIVO";

  default:
   return"ANALISE";
 }
}

export default function CEOCommandCenterV50C(){

 const [truth,setTruth]=useState(null);
 const [debts,setDebts]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 const load=async()=>{

  setLoading(true);
  setError("");

  try{

   const [truthData,debtData]=
    await Promise.all([
     financialTruthV50C(),
     financialDebtsV50C()
    ]);

   setTruth(truthData||null);
   setDebts(debtData||null);

  }catch(err){

   console.error(
    "V50C_CEO_LOAD",
    err
   );

   setError(
    err?.message||
    "Nao foi possivel carregar a inteligencia financeira."
   );

  }finally{

   setLoading(false);
  }
 };

 useEffect(()=>{
  load();
 },[]);

 const debt=
  truth?.debt||
  debts||
  {};

 const revenue=
  truth?.revenue||{};

 const operations=
  truth?.operations||{};

 const extraordinary=
  truth?.extraordinary||{};

 const commitments=
  truth?.commitments||{};

 const ratios=
  truth?.ratios||{};

 const ceo=
  truth?.ceo||{};

 const signals=
  Array.isArray(ceo?.signals)
   ?ceo.signals
   :[];

 const creditors=
  Array.isArray(debt?.creditors)
   ?debt.creditors
   :[];

 const debtRows=
  Array.isArray(debt?.debts)
   ?debt.debts
   :[];

 const debt30=
  n(debt?.due_today)+
  n(debt?.due_7_days)+
  n(debt?.due_8_15_days)+
  n(debt?.due_16_30_days);

 const extraordinaryTotal=
  n(extraordinary?.investments_30_days)+
  n(extraordinary?.renovations_30_days)+
  n(extraordinary?.adhoc_purchases_30_days);

 const debtCoverage=useMemo(()=>{

  const debtTotal=
   n(debt?.total_debt);

  const revenue30=
   n(revenue?.last_30_days);

  if(debtTotal<=0){
   return 100;
  }

  if(revenue30<=0){
   return 0;
  }

  return Math.min(
   100,
   revenue30/debtTotal*100
  );

 },[
  debt?.total_debt,
  revenue?.last_30_days
 ]);

 const ceoScore=useMemo(()=>{

  let score=100;

  const revenue30=
   n(revenue?.last_30_days);

  const operating=
   n(
    operations
     ?.operating_result_30_days
   );

  const overdue=
   n(debt?.overdue);

  const ratio=
   ratios
    ?.debt_to_revenue_30d_percent;

  if(overdue>0){
   score-=30;
  }

  if(
   ratio!==null &&
   ratio!==undefined
  ){
   if(n(ratio)>=100){
    score-=25;
   }
   else if(n(ratio)>=50){
    score-=15;
   }
   else if(n(ratio)>=25){
    score-=6;
   }
  }

  if(operating<0){
   score-=25;
  }

  if(
   revenue30<=0 &&
   n(debt?.total_debt)>0
  ){
   score-=15;
  }

  return Math.max(
   0,
   Math.min(100,score)
  );

 },[
  revenue?.last_30_days,
  operations?.operating_result_30_days,
  debt?.overdue,
  debt?.total_debt,
  ratios?.debt_to_revenue_30d_percent
 ]);

 const ceoLevel=
  ceoScore>=80
   ?"FORTE"
   :ceoScore>=60
    ?"ESTAVEL"
    :ceoScore>=40
     ?"ATENCAO"
     :"CRITICO";

 const mentor=useMemo(()=>{

  const items=[];

  const overdue=
   n(debt?.overdue);

  const debtTotal=
   n(debt?.total_debt);

  const revenue30=
   n(revenue?.last_30_days);

  const operating=
   n(
    operations
     ?.operating_result_30_days
   );

  const afterExtra=
   n(
    extraordinary
     ?.result_after_extraordinary_30_days
   );

  const due30=
   debt30;

  const dailyPressure=
   n(
    commitments
     ?.daily_revenue_required_for_pressure
   );

  if(overdue>0){

   items.push({
    priority:"1",
    title:"Regularizar dividas vencidas",
    text:
     `Existem ${money(overdue)} em dividas vencidas. A prioridade gerencial e negociar ou regularizar esses compromissos antes de ampliar novas obrigacoes.`
   });
  }

  if(
   due30>0 &&
   revenue30>0
  ){

   items.push({
    priority:
     items.length+1,
    title:"Proteger caixa dos proximos 30 dias",
    text:
     `${money(due30)} da divida registrada vence entre hoje e os proximos 30 dias. Preserve liquidez para esses vencimentos.`
   });
  }

  if(
   operating>0 &&
   afterExtra<0
  ){

   items.push({
    priority:
     items.length+1,
    title:"Separar crescimento de operacao",
    text:
     `A operacao apresenta ${money(operating)} antes das saidas extraordinarias, mas investimentos, reformas e compras avulsas pressionam o resultado final do periodo.`
   });
  }

  if(operating<0){

   items.push({
    priority:
     items.length+1,
    title:"Recuperar resultado operacional",
    text:
     `O resultado operacional gerencial dos ultimos 30 dias esta em ${money(operating)}. Revise margem, CMV e despesas antes de aumentar investimentos.`
   });
  }

  if(dailyPressure>0){

   items.push({
    priority:
     items.length+1,
    title:"Meta minima de cobertura",
    text:
     `A pressao financeira mapeada equivale a aproximadamente ${money(dailyPressure)} por dia em uma distribuicao simples de 30 dias. Use este numero como referencia gerencial, nao como garantia de caixa.`
   });
  }

  if(
   debtTotal<=0 &&
   operating>0
  ){

   items.push({
    priority:
     items.length+1,
    title:"Construir reserva para crescimento",
    text:
     "Nao ha divida aberta registrada e o resultado operacional esta positivo. O proximo foco gerencial pode ser fortalecer reserva e capital de giro antes de ampliar a operacao."
   });
  }

  if(!items.length){

   items.push({
    priority:"1",
    title:"Construir historico financeiro",
    text:
     "Ainda nao ha dados suficientes para recomendacoes gerenciais mais profundas. Continue registrando vendas, despesas, investimentos e dividas."
   });
  }

  return items.slice(0,5);

 },[
  debt?.overdue,
  debt?.total_debt,
  debt30,
  revenue?.last_30_days,
  operations?.operating_result_30_days,
  extraordinary?.result_after_extraordinary_30_days,
  commitments?.daily_revenue_required_for_pressure
 ]);

 if(loading){

  return(
   <section className="v50c-ceo loading">
    <strong>
     NEXUS CEO INTELLIGENCE
    </strong>
    <span>
     Consolidando verdade financeira...
    </span>
   </section>
  );
 }

 if(error){

  return(
   <section className="v50c-ceo error">
    <strong>
     CEO COMMAND CENTER
    </strong>

    <span>{error}</span>

    <button
     type="button"
     onClick={load}
    >
     Tentar novamente
    </button>
   </section>
  );
 }

 return(
  <section
   className="v50c-ceo"
   data-nexus-ceo-command-center="v50c-r2"
  >

   <header className="v50c-hero">

    <div>
     <small>
      NEXUS HOSPITALITY ONE
     </small>

     <h2>
      CEO Command Center
     </h2>

     <p>
      Visao executiva de resultado,
      endividamento, vencimentos,
      pressao financeira e capacidade
      de crescimento.
     </p>
    </div>

    <div className="v50c-health">

     <span>
      CEO FINANCIAL HEALTH
     </span>

     <strong>
      {ceoScore}
     </strong>

     <b>
      {ceoLevel}
     </b>

    </div>

   </header>

   <div className="v50c-statusbar">

    <span>
     STATUS DA DIVIDA
    </span>

    <strong>
     {statusLabel(
      ceo?.debt_status
     )}
    </strong>

    <button
     type="button"
     onClick={load}
    >
     Atualizar inteligencia
    </button>

   </div>

   <div className="v50c-master-grid">

    <article className="v50c-card hero-card">
     <span>DIVIDA TOTAL</span>

     <strong>
      {money(debt?.total_debt)}
     </strong>

     <small>
      {number(debt?.open_count)} compromisso(s) aberto(s)
     </small>
    </article>

    <article className="v50c-card danger-card">
     <span>DIVIDA VENCIDA</span>

     <strong>
      {money(debt?.overdue)}
     </strong>

     <small>
      {number(debt?.overdue_count)} vencimento(s)
     </small>
    </article>

    <article className="v50c-card">
     <span>VENCE HOJE</span>

     <strong>
      {money(debt?.due_today)}
     </strong>

     <small>
      {number(debt?.due_today_count)} compromisso(s)
     </small>
    </article>

    <article className="v50c-card">
     <span>PROXIMOS 7 DIAS</span>

     <strong>
      {money(debt?.due_7_days)}
     </strong>

     <small>
      {number(debt?.due_7_days_count)} compromisso(s)
     </small>
    </article>

    <article className="v50c-card">
     <span>8 A 15 DIAS</span>

     <strong>
      {money(debt?.due_8_15_days)}
     </strong>

     <small>
      {number(debt?.due_8_15_days_count)} compromisso(s)
     </small>
    </article>

    <article className="v50c-card">
     <span>16 A 30 DIAS</span>

     <strong>
      {money(debt?.due_16_30_days)}
     </strong>

     <small>
      {number(debt?.due_16_30_days_count)} compromisso(s)
     </small>
    </article>

    <article className="v50c-card">
     <span>ACIMA DE 30 DIAS</span>

     <strong>
      {money(
       debt?.future_over_30_days
      )}
     </strong>

     <small>
      Divida futura
     </small>
    </article>

    <article className="v50c-card">
     <span>SEM VENCIMENTO</span>

     <strong>
      {money(
       debt?.without_due_date
      )}
     </strong>

     <small>
      Requer organizacao
     </small>
    </article>

   </div>

   <div className="v50c-section">

    <div className="v50c-title">
     <div>
      <small>
       FINANCIAL TRUTH
      </small>
      <h3>
       Verdade Financeira
      </h3>
     </div>
    </div>

    <div className="v50c-truth-grid">

     <article>
      <span>
       Receita 30 dias
      </span>
      <strong>
       {money(
        revenue?.last_30_days
       )}
      </strong>
     </article>

     <article>
      <span>
       CMV estimado
      </span>
      <strong>
       {money(
        operations?.cmv_30_days
       )}
      </strong>
     </article>

     <article>
      <span>
       Lucro bruto gerencial
      </span>
      <strong>
       {money(
        operations
         ?.gross_profit_30_days
       )}
      </strong>
     </article>

     <article>
      <span>
       Despesas operacionais
      </span>
      <strong>
       {money(
        operations
         ?.operating_expenses_30_days
       )}
      </strong>
     </article>

     <article className="important">
      <span>
       Resultado operacional
      </span>
      <strong>
       {money(
        operations
         ?.operating_result_30_days
       )}
      </strong>
     </article>

     <article>
      <span>
       Saidas extraordinarias
      </span>
      <strong>
       {money(
        extraordinaryTotal
       )}
      </strong>
     </article>

     <article className="important">
      <span>
       Resultado apos extraordinarios
      </span>
      <strong>
       {money(
        extraordinary
         ?.result_after_extraordinary_30_days
       )}
      </strong>
     </article>

     <article>
      <span>
       Pressao financeira
      </span>
      <strong>
       {money(
        commitments
         ?.pressure_30_days
       )}
      </strong>
     </article>

    </div>

   </div>

   <div className="v50c-section">

    <div className="v50c-title">
     <div>
      <small>
       DEBT INTELLIGENCE
      </small>
      <h3>
       Endividamento Executivo
      </h3>
     </div>
    </div>

    <div className="v50c-ratio-grid">

     <article>
      <span>
       Divida / Receita 30d
      </span>

      <strong>
       {pct(
        ratios
         ?.debt_to_revenue_30d_percent
       )}
      </strong>
     </article>

     <article>
      <span>
       Vencida / Receita
      </span>

      <strong>
       {pct(
        ratios
         ?.overdue_to_revenue_30d_percent
       )}
      </strong>
     </article>

     <article>
      <span>
       Dias de receita para cobrir divida
      </span>

      <strong>
       {ratios
         ?.revenue_days_to_cover_debt===
         null
        ?"-"
        :number(
          ratios
           ?.revenue_days_to_cover_debt
         )}
      </strong>
     </article>

     <article>
      <span>
       Cobertura comparativa
      </span>

      <strong>
       {debtCoverage.toFixed(1)}%
      </strong>
     </article>

     <article>
      <span>
       Vencimentos ate 30 dias
      </span>

      <strong>
       {money(debt30)}
      </strong>
     </article>

     <article>
      <span>
       Necessidade diaria de cobertura
      </span>

      <strong>
       {money(
        commitments
         ?.daily_revenue_required_for_pressure
       )}
      </strong>
     </article>

    </div>

   </div>

   <div className="v50c-two-columns">

    <div className="v50c-panel">

     <div className="v50c-title">
      <div>
       <small>
        CREDITOR MAP
       </small>
       <h3>
        Principais Credores
       </h3>
      </div>
     </div>

     {!creditors.length&&(
      <div className="v50c-empty">
       Nenhum credor com saldo aberto.
      </div>
     )}

     {creditors
      .slice(0,8)
      .map((item,index)=>(

       <div
        className="v50c-creditor"
        key={`${item.creditor}-${index}`}
       >

        <div>
         <strong>
          {item.creditor}
         </strong>

         <small>
          {item.records} registro(s)
         </small>
        </div>

        <b>
         {money(item.balance)}
        </b>

       </div>

      ))}

    </div>

    <div className="v50c-panel mentor">

     <div className="v50c-title">
      <div>
       <small>
        NEXUS CEO MENTOR
       </small>
       <h3>
        Sala de Decisao
       </h3>
      </div>
     </div>

     {mentor.map(
      (item,index)=>(

       <article
        className="v50c-mentor-item"
        key={`${item.title}-${index}`}
       >

        <span>
         {String(
          item.priority
         ).padStart(2,"0")}
        </span>

        <div>
         <strong>
          {item.title}
         </strong>

         <p>
          {item.text}
         </p>
        </div>

       </article>

      )
     )}

    </div>

   </div>

   {signals.length>0&&(

    <div className="v50c-section">

     <div className="v50c-title">
      <div>
       <small>
        EXECUTIVE SIGNALS
       </small>

       <h3>
        Alertas Estrategicos
       </h3>
      </div>
     </div>

     <div className="v50c-signals">

      {signals.map(
       (signal,index)=>(

        <article
         key={`${signal.type}-${index}`}
        >

         <span>
          {severityLabel(
           signal.severity
          )}
         </span>

         <strong>
          {signal.title}
         </strong>

         <p>
          {signal.message}
         </p>

        </article>

       )
      )}

     </div>

    </div>

   )}

   <div className="v50c-section">

    <div className="v50c-title">
     <div>
      <small>
       DEBT TIMELINE
      </small>

      <h3>
       Agenda de Dividas
      </h3>
     </div>

     <strong className="v50c-count">
      {debtRows.length} REGISTROS
     </strong>
    </div>

    {!debtRows.length&&(
     <div className="v50c-empty">
      Nenhuma divida cadastrada.
     </div>
    )}

    {debtRows.length>0&&(

     <div className="v50c-table-wrap">

      <table className="v50c-table">

       <thead>
        <tr>
         <th>Credor</th>
         <th>Descricao</th>
         <th>Original</th>
         <th>Saldo</th>
         <th>Parcela</th>
         <th>Vencimento</th>
         <th>Status</th>
        </tr>
       </thead>

       <tbody>

        {debtRows
         .slice(0,15)
         .map(item=>(

          <tr key={item.id}>

           <td>
            <strong>
             {item.creditor}
            </strong>
           </td>

           <td>
            {item.description}
           </td>

           <td>
            {money(
             item.original_amount
            )}
           </td>

           <td>
            <strong>
             {money(
              item.current_balance
             )}
            </strong>
           </td>

           <td>
            {item.installment_amount
             ?money(
               item.installment_amount
              )
             :"-"}
           </td>

           <td>
            {item.due_date||"-"}
           </td>

           <td>
            <span className="v50c-debt-status">
             {item.status}
            </span>
           </td>

          </tr>

         ))}

       </tbody>

      </table>

     </div>

    )}

   </div>

   <footer className="v50c-footer">

    <span>
     NEXUS CEO INTELLIGENCE
    </span>

    <p>
     {truth?.accounting_notice||
      "Indicadores gerenciais baseados nos dados registrados no sistema."}
    </p>

   </footer>

  </section>
 );
}