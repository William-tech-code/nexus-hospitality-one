import React,{
 useEffect,
 useMemo,
 useState
}from"react";

import{
 financialIntelligenceDashboard,
 financialPurchaseSimulation,
 financialExecutiveGrowth,
 financialSaveGrowthGoal,
 financialNetOverview
}from"./api.js";

import FinancialEntryCenterV50B from"./FinancialEntryCenterV50B.jsx";
import CEOCommandCenterV50C from"./CEOCommandCenterV50C.jsx";
import DebtManagementV50C from"./DebtManagementV50C.jsx";
import FinancialCalendarV50C from"./FinancialCalendarV50C.jsx";
import CashFlowDREV50C from './CashFlowDREV50C';
import FinancialForecastV50C from './FinancialForecastV50C';
import FinancialMentorV50C from './FinancialMentorV50C';
import HospitalityExecutiveFinalV50C from "./HospitalityExecutiveFinalV50C";
import"./FinancialGrowthDashboardV25.css";

const money=v=>
 Number(v||0).toLocaleString(
  "pt-BR",
  {
   style:"currency",
   currency:"BRL"
  }
 );

const number=v=>
 Number(v||0).toLocaleString(
  "pt-BR",
  {
   maximumFractionDigits:2
  }
 );

function Kpi({
 label,
 value,
 detail,
 tone=""
}){
 return(
  <article className={`fg-kpi ${tone}`}>
   <small>{label}</small>
   <strong>{value}</strong>
   {detail&&<span>{detail}</span>}
  </article>
 );
}

function MiniBars({
 data=[],
 valueKey,
 labelKey
}){
 const max=Math.max(
  1,
  ...data.map(
   x=>Number(x[valueKey]||0)
  )
 );

 return(
  <div className="fg-bars">
   {data.map((x,i)=>(
    <div
     className="fg-bar-row"
     key={i}
    >
     <span>
      {x[labelKey]}
     </span>

     <div className="fg-bar-track">
      <i
       style={{
        width:
         `${Math.max(
          2,
          Number(x[valueKey]||0)/
          max*100
         )}%`
       }}
      />
     </div>

     <strong>
      {money(x[valueKey])}
     </strong>
    </div>
   ))}
  </div>
 );
}

function Trend({data=[]}){

 const max=Math.max(
  1,
  ...data.map(
   x=>Number(x.revenue||0)
  )
 );

 return(
  <div className="fg-trend">
   {data.map((x,i)=>(
    <div
     className="fg-trend-col"
     key={i}
     title={`${x.day}: ${money(x.net_revenue ?? x.revenue)}`}
    >
     <div className="fg-trend-space">
      <i
       style={{
        height:
         `${Math.max(
          4,
          Number(x.revenue||0)/
          max*100
         )}%`
       }}
      />
     </div>
     <small>
      {String(x.day||"").slice(5)}
     </small>
    </div>
   ))}
  </div>
 );
}

export default function FinancialGrowthDashboardV25(){

 const[data,setData]=useState(null);
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState("");
 const[executive,setExecutive]=useState(null);
 const[net,setNet]=useState(null);
 const[goalSaving,setGoalSaving]=useState(false);

 const[simulation,setSimulation]=
  useState(null);

 const load=async()=>{
  setLoading(true);

  try{
   const [base,executiveData,netData]=
    await Promise.all([
     financialIntelligenceDashboard(),
     financialExecutiveGrowth(),
     financialNetOverview()
    ]);

   setData(base);
   setExecutive(executiveData);
   setNet(netData);
   setError("");
  }catch(e){
   setError(e.message);
  }finally{
   setLoading(false);
  }
 };

 useEffect(()=>{
  load();
 },[]);

 const products=
  useMemo(
   ()=>data?.products||[],
   [data]
  );

 const lowCoverage=
  products
   .filter(
    x=>
     x.stock_coverage_days!==null &&
     x.stock_coverage_days<=7
   )
   .slice(0,8);

 const slow=
  products
   .filter(
    x=>
     Number(x.stock)>0 &&
     Number(x.qty_sold)===0
   )
   .slice(0,8);

 const simulate=async e=>{
  e.preventDefault();

  const f=
   new FormData(e.currentTarget);

  try{
   setSimulation(
    await financialPurchaseSimulation({
     amount:
      Number(f.get("amount")),
     days:
      Number(f.get("days")),
     expected_margin:
      Number(
       f.get("margin")
      )
    })
   );
  }catch(e){
   alert(e.message);
  }
 };

 const saveGoal=async e=>{
  e.preventDefault();

  const form=
   new FormData(e.currentTarget);

  setGoalSaving(true);

  try{
   await financialSaveGrowthGoal({
    revenue_target:
     Number(
      form.get("revenue_target")
     ),
    gross_profit_target:
     Number(
      form.get("gross_profit_target")||0
     ),
    average_ticket_target:
     Number(
      form.get("average_ticket_target")||0
     )
   });

   await load();

  }catch(e){
   alert(e.message);
  }finally{
   setGoalSaving(false);
  }
 };

 if(loading){
  return(
   <main className="fg-shell">
    <div className="fg-loading">
     NEXUS Intelligence analisando o negócio...
    </div>
   </main>
  );
 }

 if(error){

  /* ========================================================
     NEXUS OWNER COMMAND CENTER V5.0
     Growth Intelligence Layer
     ======================================================== */

  const v50Revenue30=
   Number(
    data?.sales?.current_30d?.revenue||0
   );

  const v50Sales30=
   Number(
    data?.sales?.current_30d?.sales||0
   );

  const v50AverageTicket=
   Number(
    data?.sales?.current_30d?.average_ticket||0
   );

  const v50GrossProfit=
   Number(
    data?.profitability
     ?.estimated_gross_profit_30d||0
   );

  const v50GrossMargin=
   Number(
    data?.profitability
     ?.estimated_gross_margin||0
   );

  const v50StockCost=
   Number(
    data?.inventory?.stock_cost_value||0
   );

  const v50SlowStock=
   Number(
    data?.inventory?.slow_stock_cost||0
   );

  const v50Commitments=
   Number(
    data?.commitments?.open_total||0
   );

  const v50Projection30=
   Number(
    data?.forecast?.projected_30d||0
   );

  const v50GoalConfigured=
   Boolean(
    executive?.goal?.configured
   );

  const v50Goal=
   Number(
    executive?.goal?.targets?.revenue||0
   );

  const v50GoalRemaining=
   Number(
    executive?.goal?.revenue_remaining||0
   );

  const v50RequiredDaily=
   Number(
    executive?.goal?.required_daily_revenue||0
   );

  const v50GoalProgress=
   Number(
    executive?.goal?.progress?.revenue_percent||0
   );

  const v50Confidence=
   net?.confidence?.level||"LOW";

  const v50ConfidenceFactor=
   v50Confidence==="HIGH"
    ?0.08
    :v50Confidence==="MEDIUM"
     ?0.15
     :0.25;

  /*
   * These are planning sensitivity scenarios.
   * They are not promises or guaranteed outcomes.
   */
  const v50Conservative=
   Math.max(
    0,
    v50Projection30*(1-v50ConfidenceFactor)
   );

  const v50Base=
   v50Projection30;

  const v50GrowthScenario=
   v50Projection30*(1+v50ConfidenceFactor);

  const v50GoalGapProjected=
   v50GoalConfigured
    ?Math.max(0,v50Goal-v50Base)
    :0;

  const v50ProjectedGoalRatio=
   v50GoalConfigured && v50Goal>0
    ?(v50Base/v50Goal)*100
    :0;

  const v50CommitmentBurden=
   v50Revenue30>0
    ?(v50Commitments/v50Revenue30)*100
    :0;

  const v50SlowStockBurden=
   v50StockCost>0
    ?(v50SlowStock/v50StockCost)*100
    :0;

  const v50OperationalResult=
   v50GrossProfit-v50Commitments;

  const v50HealthScore=(()=>{
   let score=50;

   if(growth30>0) score+=10;
   if(growth30<0) score-=10;

   if(v50GrossMargin>=40) score+=10;
   else if(
    v50GrossMargin>0 &&
    v50GrossMargin<20
   ) score-=10;

   if(v50CommitmentBurden<=25) score+=10;
   else if(v50CommitmentBurden>=60) score-=15;

   if(v50SlowStockBurden<=15) score+=10;
   else if(v50SlowStockBurden>=40) score-=10;

   if(v50GoalConfigured){
    if(v50ProjectedGoalRatio>=100) score+=10;
    else if(v50ProjectedGoalRatio<70) score-=10;
   }

   return Math.max(
    0,
    Math.min(100,score)
   );
  })();

  const v50HealthLabel=
   v50HealthScore>=80
    ?"FORTE"
    :v50HealthScore>=60
     ?"ESTAVEL"
     :v50HealthScore>=40
      ?"ATENCAO"
      :"CRITICO";

  const v50Mentor=[];

  if(!v50GoalConfigured){
   v50Mentor.push({
    priority:"HIGH",
    title:"Defina uma meta mensal",
    message:
     "Sem uma meta de faturamento, o NEXUS consegue projetar o ritmo, mas nao consegue medir a distancia entre o resultado atual e o objetivo do negocio."
   });
  }

  if(
   v50GoalConfigured &&
   v50GoalGapProjected>0
  ){
   v50Mentor.push({
    priority:"HIGH",
    title:"Existe gap para a meta",
    message:
     `Mantido o ritmo atual, a projecao fica ${money(v50GoalGapProjected)} abaixo da meta. O ritmo necessario indicado pelo motor e ${money(v50RequiredDaily)} por dia.`
   });
  }

  if(
   v50GoalConfigured &&
   v50Base>=v50Goal
  ){
   v50Mentor.push({
    priority:"POSITIVE",
    title:"Ritmo compativel com a meta",
    message:
     `A projecao-base atual e ${money(v50Base)}, acima da meta configurada de ${money(v50Goal)}. Preserve margem e controle de custos para converter faturamento em resultado.`
   });
  }

  if(v50CommitmentBurden>=50){
   v50Mentor.push({
    priority:"HIGH",
    title:"Compromissos pressionam o giro",
    message:
     `Os compromissos abertos equivalem a aproximadamente ${number(v50CommitmentBurden)}% do faturamento dos ultimos 30 dias. Priorize caixa e vencimentos antes de novos investimentos relevantes.`
   });
  }

  if(v50SlowStockBurden>=30){
   v50Mentor.push({
    priority:"MEDIUM",
    title:"Capital parado no estoque",
    message:
     `Aproximadamente ${number(v50SlowStockBurden)}% do estoque a custo esta classificado como baixo giro. O capital pode estar imobilizado em produtos com pouca saida.`
   });
  }

  if(growth30<0){
   v50Mentor.push({
    priority:"HIGH",
    title:"Tendencia de faturamento negativa",
    message:
     `O faturamento de 30 dias apresenta variacao de ${number(growth30)}% contra o periodo anterior. Revise dias fracos, ticket medio e mix de produtos antes de ampliar custos fixos.`
   });
  }

  if(growth30>0){
   v50Mentor.push({
    priority:"POSITIVE",
    title:"Negocio em crescimento",
    message:
     `O faturamento apresenta crescimento de ${number(growth30)}% em 30 dias. O foco deve ser preservar margem, estoque e caixa enquanto o volume aumenta.`
   });
  }

  if(
   v50GrossMargin>0 &&
   v50GrossMargin<25
  ){
   v50Mentor.push({
    priority:"HIGH",
    title:"Margem merece atencao",
    message:
     `A margem bruta estimada esta em ${number(v50GrossMargin)}%. Crescer faturamento com margem comprimida pode aumentar movimento sem gerar resultado proporcional.`
   });
  }

  if(!v50Mentor.length){
   v50Mentor.push({
    priority:"MEDIUM",
    title:"Continue formando historico",
    message:
     "O NEXUS ainda esta acumulando dados. Continue registrando vendas, compras, estoque e compromissos para aumentar a qualidade das projecoes."
   });
  }

  const v50ExpansionReadiness=(()=>{
   let score=0;
   const reasons=[];

   if(v50Confidence==="HIGH"){
    score+=25;
   }else{
    reasons.push(
     "Historico ainda precisa ganhar consistencia."
    );
   }

   if(growth30>0){
    score+=20;
   }else{
    reasons.push(
     "Crescimento recente ainda nao e positivo."
    );
   }

   if(v50GrossMargin>=35){
    score+=20;
   }else{
    reasons.push(
     "Margem precisa ser fortalecida antes de escalar."
    );
   }

   if(v50CommitmentBurden<=30){
    score+=20;
   }else{
    reasons.push(
     "Compromissos financeiros ainda pressionam o giro."
    );
   }

   if(v50SlowStockBurden<=20){
    score+=15;
   }else{
    reasons.push(
     "Ha capital relevante imobilizado em baixo giro."
    );
   }

   return{
    score,
    label:
     score>=80
      ?"PREPARACAO AVANCADA"
      :score>=60
       ?"EM PREPARACAO"
       :score>=40
        ?"BASE EM CONSTRUCAO"
        :"AINDA NAO MADURO",
    reasons
   };
  })();

  return(
   <main className="fg-shell">
    <div className="fg-loading">
     <h2>
      Financial Intelligence
     </h2>
     <p>{error}</p>
     <button onClick={load}>
      Tentar novamente
     </button>
    </div>
   </main>
  );
 }

 const growth30=
  Number(
   data?.sales?.growth_30d||0
  );

 return(
  <main className="fg-shell">

   <header className="fg-hero">

    <div>
     <small>
      NEXUS FINANCIAL INTELLIGENCE
     </small>

     <h1>
      Giro & Crescimento
     </h1>

     <p>
      Visão executiva de vendas,
      margem, estoque, capital de giro,
      compromissos e crescimento.
     </p>
    </div>

    <div className="fg-health">
     <span/>
     MOTOR ATIVO
    </div>

   </header>

   <section className="fg-kpis">

    <Kpi
     label="Faturamento 30 dias"
     value={money(
      data.sales.current_30d.revenue
     )}
     detail={
      `${data.sales.current_30d.sales} vendas`
     }
    />

    <Kpi
     label="Crescimento 30 dias"
     value={`${number(growth30)}%`}
     detail="versus período anterior"
     tone={
      growth30>=0
       ?"positive"
       :"negative"
     }
    />

    <Kpi
     label="Lucro bruto estimado"
     value={money(
      data.profitability
       .estimated_gross_profit_30d
     )}
     detail={
      `${number(
       data.profitability
        .estimated_gross_margin
      )}% de margem`
     }
    />

    <Kpi
     label="Ticket médio"
     value={money(
      data.sales.current_30d
       .average_ticket
     )}
     detail="Últimos 30 dias"
    />

    <Kpi
     label="Estoque a custo"
     value={money(
      data.inventory.stock_cost_value
     )}
     detail="capital imobilizado"
    />

    <Kpi
     label="Compromissos abertos"
     value={money(
      data.commitments.open_total
     )}
     detail={
      `${data.commitments.count} obrigação(ões)`
     }
    />

    <Kpi
     label="Reservar hoje"
     value={money(
      data.commitments
       .today_reserve_target
     )}
     detail="meta ponderada pelo giro"
     tone="attention"
    />

    <Kpi
     label="Projeção 30 dias"
     value={money(
      data.forecast.projected_30d
     )}
     detail="mantido o ritmo atual"
    />

   </section>

   <section className="fg-grid">

    <article className="fg-card fg-wide">

     <div className="fg-card-head">
      <div>
       <small>EVOLUÇÃO</small>
       <h2>
        Faturamento diário
       </h2>
      </div>

      <strong>
       Média {money(
        data.forecast
         .average_daily_revenue
       )}/dia
      </strong>
     </div>

     <Trend
      data={data.daily_trend||[]}
     />

    </article>

    <article className="fg-card">

     <div className="fg-card-head">
      <div>
       <small>GIRO SEMANAL</small>
       <h2>
        Força por dia
       </h2>
      </div>
     </div>

     <MiniBars
      data={
       data.weekday_profile||[]
      }
      valueKey="average_daily_revenue"
      labelKey="name"
     />

    </article>

    <article className="fg-card">

     <div className="fg-card-head">
      <div>
       <small>RENTABILIDADE</small>
       <h2>
        Categorias
       </h2>
      </div>
     </div>

     <MiniBars
      data={
       (data.categories||[])
        .slice(0,8)
      }
      valueKey="gross_profit"
      labelKey="category"
     />

    </article>

    <article className="fg-card fg-wide">

     <div className="fg-card-head">
      <div>
       <small>COMPROMISSOS</small>
       <h2>
        Quanto separar
       </h2>
      </div>
     </div>

     {!data.commitments
       .obligations.length&&(
      <div className="fg-empty">
       Nenhuma obrigação aberta.
      </div>
     )}

     <div className="fg-obligations">

      {data.commitments
       .obligations
       .slice(0,10)
       .map((x,i)=>(

       <div
        className="fg-obligation"
        key={`${x.source}-${x.id}-${i}`}
       >

        <div>
         <strong>{x.title}</strong>
         <span>
          Vence {x.due_date}
          {" • "}
          {x.days_remaining} dia(s)
         </span>
        </div>

        <div>
         <small>
          Reservar hoje
         </small>
         <strong>
          {money(
           x.weighted_today_reserve
          )}
         </strong>
        </div>

        <div>
         <small>Total</small>
         <strong>
          {money(x.amount)}
         </strong>
        </div>

       </div>
      ))}

     </div>

    </article>

    <article className="fg-card">

     <div className="fg-card-head">
      <div>
       <small>ESTOQUE</small>
       <h2>
        Risco de ruptura
       </h2>
      </div>
     </div>

     {!lowCoverage.length&&(
      <div className="fg-empty">
       Nenhuma ruptura crítica detectada.
      </div>
     )}

     {lowCoverage.map(x=>(
      <div
       className="fg-product"
       key={x.id}
      >
       <span>{x.name}</span>
       <strong>
        {number(
         x.stock_coverage_days
        )} dias
       </strong>
      </div>
     ))}

    </article>

    <article className="fg-card">

     <div className="fg-card-head">
      <div>
       <small>CAPITAL PARADO</small>
       <h2>
        Baixo giro
       </h2>
      </div>
     </div>

     <div className="fg-big-number">
      {money(
       data.inventory.slow_stock_cost
      )}
     </div>

     {slow.map(x=>(
      <div
       className="fg-product"
       key={x.id}
      >
       <span>{x.name}</span>
       <strong>
        {number(x.stock)} un.
       </strong>
      </div>
     ))}

    </article>

    <article className="fg-card fg-wide">

     <div className="fg-card-head">
      <div>
       <small>SIMULADOR</small>
       <h2>
        Posso fazer esta compra?
       </h2>
      </div>
     </div>

     <form
      className="fg-simulator"
      onSubmit={simulate}
     >

      <label>
       Valor da compra
       <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="3000"
        required
       />
      </label>

      <label>
       Prazo para pagar
       <input
        name="days"
        type="number"
        min="1"
        placeholder="15"
        required
       />
      </label>

      <label>
       Margem esperada %
       <input
        name="margin"
        type="number"
        min="0"
        max="99"
        step="0.1"
        placeholder="50"
       />
      </label>

      <button type="submit">
       Analisar impacto
      </button>

     </form>

     {simulation&&(
      <div className="fg-simulation">

       <Kpi
        label="Reserva simples/dia"
        value={money(
         simulation.simple_daily_reserve
        )}
       />

       <Kpi
        label="Receita esperada"
        value={money(
         simulation.expected_revenue
        )}
       />

       <Kpi
        label="Lucro bruto esperado"
        value={money(
         simulation.expected_gross_profit
        )}
       />

       <Kpi
        label="Peso sobre o giro"
        value={
         `${number(
          simulation.reserve_burden_percent
         )}%`
        }
       />

      </div>
     )}

    </article>

        <article className="fg-card fg-wide fg-confidence">

     <div className="fg-confidence-main">

      <div>
       <small>
        QUALIDADE DO INDICADOR
       </small>

       <h2>
        {net?.confidence?.label||
         "ANALISANDO HISTóRICO"}
       </h2>

       <p>
        {net?.confidence?.message||
         "O NEXUS está avaliando o histórico disponível."}
       </p>
      </div>

      <div
       className={
        `fg-confidence-badge confidence-${net?.confidence?.level||"LOW"}`
       }
      >
       {net?.confidence?.level==="HIGH"
        ?"BASE FORTE"
        :net?.confidence?.level==="MEDIUM"
         ?"BASE EM FORMAÇÃO"
         :"AMOSTRA INICIAL"}
      </div>

     </div>

     {(net?.current?.returned_revenue||0)>0&&(
      <div className="fg-net-strip">

       <span>
        Devoluções descontadas dos indicadores
       </span>

       <strong>
        {money(
         net.current.returned_revenue
        )}
       </strong>

      </div>
     )}

    </article>
<article className="fg-card fg-wide fg-executive">

     <div className="fg-card-head">
      <div>
       <small>CURVA ABC</small>
       <h2>
        Produtos que sustentam o negócio
       </h2>
      </div>

      <strong>
       Receita • Giro • Margem
      </strong>
     </div>

     <div className="fg-abc-table">

      <div className="fg-abc-row fg-abc-head">
       <span>Classe</span>
       <span>Produto</span>
       <span>Participação</span>
       <span>Faturamento</span>
       <span>Lucro bruto</span>
       <span>Margem</span>
       <span>Cobertura</span>
      </div>

      {(net?.abc||executive?.abc||[])
       .slice(0,15)
       .map(x=>(
        <div
         className="fg-abc-row"
         key={x.product_id}
        >
         <strong
          className={`fg-abc-class abc-${x.abc}`}
         >
          {x.abc}
         </strong>

         <span>{x.name}</span>

         <span>
          {number(
           x.revenue_share_percent
          )}%
         </span>

         <span>
          {money(x.net_revenue ?? x.revenue)}
         </span>

         <span>
          {money(
           x.estimated_gross_profit
          )}
         </span>

         <span>
          {number(
           x.estimated_margin
          )}%
         </span>

         <span>
          {x.stock_coverage_days===null
           ?"—"
           :`${number(
             x.stock_coverage_days
            )} dias`
          }
         </span>
        </div>
       ))}

     </div>

    </article>

    <article className="fg-card">

     <div className="fg-card-head">
      <div>
       <small>METAS</small>
       <h2>
        Meta do mês
       </h2>
      </div>
     </div>

     {executive?.goal?.configured ? (
      <div className="fg-goal-current">

       <div className="fg-goal-ring">
        <strong>
         {number(
          executive.goal
           .progress
           .revenue_percent
         )}%
        </strong>
        <span>da meta</span>
       </div>

       <div className="fg-goal-data">

        <p>
         <span>Meta</span>
         <strong>
          {money(
           executive.goal
            .targets
            .revenue
          )}
         </strong>
        </p>

        <p>
         <span>Realizado</span>
         <strong>
          {money(
           executive.goal
            .actual
            .revenue
          )}
         </strong>
        </p>

        <p>
         <span>Falta</span>
         <strong>
          {money(
           executive.goal
            .revenue_remaining
          )}
         </strong>
        </p>

        <p>
         <span>Necessário/dia</span>
         <strong>
          {money(
           executive.goal
            .required_daily_revenue
          )}
         </strong>
        </p>

       </div>

      </div>
     ):(
      <div className="fg-empty">
       Defina uma meta para transformar
       o dashboard em acompanhamento
       diário de crescimento.
      </div>
     )}

     <form
      className="fg-goal-form"
      onSubmit={saveGoal}
     >

      <label>
       Meta de faturamento
       <input
        name="revenue_target"
        type="number"
        step="0.01"
        min="0.01"
        required
        placeholder="30000"
        defaultValue={
         executive?.goal?.configured
          ?executive.goal.targets.revenue
          :""
        }
       />
      </label>

      <label>
       Meta de lucro bruto
       <input
        name="gross_profit_target"
        type="number"
        step="0.01"
        min="0"
        placeholder="15000"
        defaultValue={
         executive?.goal?.configured
          ?executive.goal.targets.gross_profit
          :""
        }
       />
      </label>

      <label>
       Ticket médio desejado
       <input
        name="average_ticket_target"
        type="number"
        step="0.01"
        min="0"
        placeholder="45"
        defaultValue={
         executive?.goal?.configured
          ?executive.goal.targets.average_ticket
          :""
        }
       />
      </label>

      <button
       type="submit"
       disabled={goalSaving}
      >
       {goalSaving
        ?"Salvando..."
        :"Salvar meta"
       }
      </button>

     </form>

    </article>

    <article className="fg-card">

     <div className="fg-card-head">
      <div>
       <small>NEXUS ALERTS</small>
       <h2>
        Atenção do proprietário
       </h2>
      </div>
     </div>

     <div className="fg-alert-list">

      {!(executive?.alerts||[]).length&&(
       <div className="fg-empty">
        Nenhum alerta relevante
        detectado neste momento.
       </div>
      )}

      {(executive?.alerts||[])
       .slice(0,8)
       .map((x,i)=>(
        <div
         className={
          `fg-alert severity-${x.severity}`
         }
         key={`${x.type}-${i}`}
        >
         <strong>{x.title}</strong>
         <p>{x.message}</p>
        </div>
       ))}

     </div>

    </article>

    <article className="fg-card fg-wide">

     <div className="fg-card-head">
      <div>
       <small>NEXUS GROWTH ENGINE</small>
       <h2>
        Recomendações do negócio
       </h2>
      </div>

      <strong>
       Baseadas nos dados atuais
      </strong>
     </div>

     <div className="fg-recommendations">

      {(executive?.recommendations||[])
       .map((x,i)=>(
        <div
         className={
          `fg-recommendation priority-${x.priority}`
         }
         key={`${x.type}-${i}`}
        >
         <div className="fg-rec-icon">
          N
         </div>

         <div>
          <strong>{x.title}</strong>
          <p>{x.message}</p>
         </div>
        </div>
       ))}

     </div>

    </article>
    <article className="fg-card fg-wide">

     <div className="fg-card-head">
      <div>
       <small>PROJEÇÕES</small>
       <h2>
        Próximos períodos
       </h2>
      </div>
     </div>

     <div className="fg-projections">

      <Kpi
       label="7 dias"
       value={money(
        data.forecast.projected_7d
       )}
      />

      <Kpi
       label="14 dias"
       value={money(
        data.forecast.projected_14d
       )}
      />

      <Kpi
       label="30 dias"
       value={money(
        data.forecast.projected_30d
       )}
      />

      <Kpi
       label="Capital de giro estimado"
       value={money(
        data.working_capital
         .estimated_need
       )}
      />

     </div>

    </article>

   </section>

  
    {/* NEXUS OWNER COMMAND CENTER V5.0 */}

    <CEOCommandCenterV50C/>
<FinancialCalendarV50C/>
      <CashFlowDREV50C/>
      <FinancialForecastV50C/>
      <FinancialMentorV50C/>
<DebtManagementV50C/>
<FinancialEntryCenterV50B
 onFinancialChange={load}
/>
<section
     className="fg-grid"
     data-nexus-owner-command-center="v5"
    >

     <article className="fg-card fg-wide v50-owner-hero">

      <div className="fg-card-head">
       <div>
        <small>
         NEXUS OWNER COMMAND CENTER V5.0
        </small>
        <h2>
         Central do Proprietario
        </h2>
       </div>

       <strong>
        BUSINESS HEALTH {v50HealthScore}/100
       </strong>
      </div>

      <div className="v50-owner-status">

       <div>
        <small>SAUDE DO NEGOCIO</small>
        <strong>{v50HealthLabel}</strong>
       </div>

       <div>
        <small>FATURAMENTO 30D</small>
        <strong>{money(v50Revenue30)}</strong>
       </div>

       <div>
        <small>RESULTADO GERENCIAL BASE</small>
        <strong>{money(v50OperationalResult)}</strong>
       </div>

       <div>
        <small>PROJECAO BASE</small>
        <strong>{money(v50Base)}</strong>
       </div>

       <div>
        <small>TICKET MEDIO</small>
        <strong>{money(v50AverageTicket)}</strong>
       </div>

       <div>
        <small>CONFIANCA DOS DADOS</small>
        <strong>{v50Confidence}</strong>
       </div>

      </div>

      <p className="v50-disclaimer">
       Indicadores gerenciais calculados a partir dos
       registros disponiveis no NEXUS. Projecoes representam
       cenarios de planejamento e nao garantia de resultado.
      </p>

     </article>

     <article className="fg-card fg-wide">

      <div className="fg-card-head">
       <div>
        <small>FORECAST ENGINE</small>
        <h2>
         Se continuar neste ritmo...
        </h2>
       </div>

       <strong>PROJECAO VIVA</strong>
      </div>

      <div className="v50-scenarios">

       <div className="v50-scenario">
        <small>CENARIO CONSERVADOR</small>
        <strong>{money(v50Conservative)}</strong>
        <span>
         Faixa inferior de sensibilidade baseada
         na qualidade atual do historico.
        </span>
       </div>

       <div className="v50-scenario v50-base">
        <small>CENARIO BASE</small>
        <strong>{money(v50Base)}</strong>
        <span>
         Mantido o ritmo calculado pelo
         Financial Intelligence.
        </span>
       </div>

       <div className="v50-scenario">
        <small>CENARIO CRESCIMENTO</small>
        <strong>{money(v50GrowthScenario)}</strong>
        <span>
         Faixa superior de sensibilidade para
         planejamento do negocio.
        </span>
       </div>

      </div>

      {v50GoalConfigured&&(
       <div className="v50-goal-command">

        <div>
         <small>META</small>
         <strong>{money(v50Goal)}</strong>
        </div>

        <div>
         <small>REALIZADO 30D</small>
         <strong>{money(v50Revenue30)}</strong>
        </div>

        <div>
         <small>PROGRESSO</small>
         <strong>{number(v50GoalProgress)}%</strong>
        </div>

        <div>
         <small>GAP PROJETADO</small>
         <strong>{money(v50GoalGapProjected)}</strong>
        </div>

        <div>
         <small>NECESSARIO/DIA</small>
         <strong>{money(v50RequiredDaily)}</strong>
        </div>

       </div>
      )}

     </article>

     <article className="fg-card fg-wide">

      <div className="fg-card-head">
       <div>
        <small>NEXUS MENTOR AI</small>
        <h2>Mentor Executivo</h2>
       </div>

       <strong>
        DADOS - DIAGNOSTICO - ACAO
       </strong>
      </div>

      <div className="v50-mentor-list">

       {v50Mentor.map((x,i)=>(
        <div
         className={`v50-mentor priority-${x.priority}`}
         key={`${x.title}-${i}`}
        >
         <div className="v50-mentor-avatar">
          AI
         </div>

         <div>
          <small>MENTOR NEXUS</small>
          <strong>{x.title}</strong>
          <p>{x.message}</p>
         </div>
        </div>
       ))}

      </div>

     </article>

     <article className="fg-card">

      <div className="fg-card-head">
       <div>
        <small>CAPITAL</small>
        <h2>Pressao financeira</h2>
       </div>
      </div>

      <div className="v50-metric-stack">

       <p>
        <span>Compromissos</span>
        <strong>{money(v50Commitments)}</strong>
       </p>

       <p>
        <span>Peso sobre faturamento</span>
        <strong>
         {number(v50CommitmentBurden)}%
        </strong>
       </p>

       <p>
        <span>Estoque a custo</span>
        <strong>{money(v50StockCost)}</strong>
       </p>

       <p>
        <span>Capital em baixo giro</span>
        <strong>{money(v50SlowStock)}</strong>
       </p>

      </div>

     </article>

     <article className="fg-card">

      <div className="fg-card-head">
       <div>
        <small>EXPANSION INTELLIGENCE</small>
        <h2>Preparacao para escalar</h2>
       </div>
      </div>

      <div className="v50-expansion-score">
       <strong>
        {v50ExpansionReadiness.score}/100
       </strong>
       <span>
        {v50ExpansionReadiness.label}
       </span>
      </div>

      <div className="v50-expansion-reasons">

       {!v50ExpansionReadiness.reasons.length&&(
        <p>
         Os indicadores atuais atendem aos
         criterios internos desta leitura.
         Uma nova unidade ainda exige analise
         completa de investimento, caixa,
         local e custos.
        </p>
       )}

       {v50ExpansionReadiness.reasons.map(
        (x,i)=>(
         <p key={i}>
          - {x}
         </p>
        )
       )}

      </div>

     </article>

     <article className="fg-card fg-wide">

      <div className="fg-card-head">
       <div>
        <small>ESCALA</small>
        <h2>
         Visao de crescimento do grupo
        </h2>
       </div>

       <strong>
        1 - 10 UNIDADES
       </strong>
      </div>

      <div className="v50-units">

       {[1,2,3,4,5,6,7,8,9,10].map(
        unit=>(
         <div
          className={
           unit===1
            ?"v50-unit active"
            :"v50-unit future"
          }
          key={unit}
         >
          <small>UNIDADE</small>

          <strong>
           {String(unit).padStart(2,"0")}
          </strong>

          <span>
           {unit===1
            ?"OPERACAO ATUAL"
            :"EXPANSAO FUTURA"}
          </span>
         </div>
        )
       )}

      </div>

      <p className="v50-disclaimer">
       Nesta versao, as unidades futuras representam
       planejamento de expansao. A segregacao real
       de dados sera ativada quando a fundacao
       multiunidade estiver persistida no backend.
      </p>

     </article>

    </section>

    <style>{`
     .v50-owner-hero{
      position:relative;
      overflow:hidden;
     }

     .v50-owner-hero:before{
      content:"";
      position:absolute;
      width:260px;
      height:260px;
      border-radius:50%;
      right:-100px;
      top:-130px;
      background:rgba(255,255,255,.035);
      pointer-events:none;
     }

     .v50-owner-status{
      display:grid;
      grid-template-columns:
       repeat(3,minmax(0,1fr));
      gap:12px;
      margin-top:18px;
     }

     .v50-owner-status>div,
     .v50-goal-command>div,
     .v50-scenario,
     .v50-unit{
      padding:16px;
      border:
       1px solid rgba(255,255,255,.09);
      border-radius:16px;
      background:rgba(255,255,255,.025);
     }

     .v50-owner-status small,
     .v50-goal-command small,
     .v50-scenario small,
     .v50-unit small{
      display:block;
      opacity:.62;
      font-size:10px;
      letter-spacing:.12em;
      margin-bottom:8px;
     }

     .v50-owner-status strong{
      font-size:19px;
     }

     .v50-disclaimer{
      margin-top:16px;
      opacity:.58;
      font-size:12px;
      line-height:1.55;
     }

     .v50-scenarios{
      display:grid;
      grid-template-columns:
       repeat(3,minmax(0,1fr));
      gap:14px;
      margin-top:18px;
     }

     .v50-scenario{
      display:flex;
      flex-direction:column;
      gap:7px;
     }

     .v50-scenario strong{
      font-size:25px;
     }

     .v50-scenario span{
      opacity:.62;
      font-size:12px;
      line-height:1.45;
     }

     .v50-base{
      transform:translateY(-4px);
      border-color:rgba(255,255,255,.2);
     }

     .v50-goal-command{
      display:grid;
      grid-template-columns:
       repeat(5,minmax(0,1fr));
      gap:10px;
      margin-top:18px;
     }

     .v50-mentor-list{
      display:grid;
      gap:12px;
      margin-top:16px;
     }

     .v50-mentor{
      display:grid;
      grid-template-columns:46px 1fr;
      gap:14px;
      align-items:flex-start;
      padding:16px;
      border-radius:16px;
      border:
       1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.025);
     }

     .v50-mentor-avatar{
      width:42px;
      height:42px;
      border-radius:14px;
      display:grid;
      place-items:center;
      font-weight:900;
      border:
       1px solid rgba(255,255,255,.14);
     }

     .v50-mentor small{
      display:block;
      opacity:.55;
      font-size:10px;
      letter-spacing:.12em;
      margin-bottom:4px;
     }

     .v50-mentor strong{
      display:block;
      margin-bottom:5px;
     }

     .v50-mentor p{
      margin:0;
      opacity:.72;
      line-height:1.55;
     }

     .v50-metric-stack{
      display:grid;
      gap:8px;
      margin-top:14px;
     }

     .v50-metric-stack p{
      margin:0;
      display:flex;
      justify-content:space-between;
      gap:16px;
      padding:12px 0;
      border-bottom:
       1px solid rgba(255,255,255,.07);
     }

     .v50-metric-stack span{
      opacity:.65;
     }

     .v50-expansion-score{
      display:flex;
      flex-direction:column;
      gap:6px;
      margin:18px 0;
     }

     .v50-expansion-score strong{
      font-size:38px;
     }

     .v50-expansion-score span{
      font-size:12px;
      letter-spacing:.1em;
      opacity:.7;
     }

     .v50-expansion-reasons p{
      margin:8px 0;
      opacity:.7;
      line-height:1.45;
     }

     .v50-units{
      display:grid;
      grid-template-columns:
       repeat(5,minmax(0,1fr));
      gap:10px;
      margin-top:16px;
     }

     .v50-unit{
      display:flex;
      flex-direction:column;
      min-height:100px;
      justify-content:center;
     }

     .v50-unit strong{
      font-size:25px;
     }

     .v50-unit span{
      font-size:9px;
      opacity:.55;
      margin-top:6px;
     }

     .v50-unit.future{
      opacity:.42;
     }

     @media(max-width:900px){

      .v50-owner-status,
      .v50-scenarios{
       grid-template-columns:1fr;
      }

      .v50-goal-command{
       grid-template-columns:
        repeat(2,minmax(0,1fr));
      }

      .v50-units{
       grid-template-columns:
        repeat(2,minmax(0,1fr));
      }

      .v50-base{
       transform:none;
      }
     }
    `}</style>

    
      <HospitalityExecutiveFinalV50C />
      </main>
 );
}






