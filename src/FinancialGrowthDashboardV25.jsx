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
     detail="últimos 30 dias"
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
         "ANALISANDO HISTÓRICO"}
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

  </main>
 );
}


