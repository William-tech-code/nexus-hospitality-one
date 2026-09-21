import React,{
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  financialMentorV50C
} from "./api";

import "./FinancialMentorV50C.css";

const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

const percent=value=>{

  if(
    value===null ||
    value===undefined
  ){
    return "—";
  }

  return `${Number(value).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:1,
      maximumFractionDigits:1
    }
  )}%`;
};

const stateNames={
  ACT_NOW:"Agir agora",
  PRIORITIZE:"Priorizar",
  OPTIMIZE:"Otimizar",
  OPPORTUNITY:"Oportunidade",
  MONITOR:"Monitorar"
};

const qualityNames={
  NO_HISTORY:"Sem histórico",
  VERY_LIMITED_HISTORY:"Histórico muito limitado",
  LIMITED_HISTORY:"Histórico limitado",
  MODERATE_HISTORY:"Histórico moderado",
  STRONGER_HISTORY:"Histórico mais robusto"
};

function Evidence({item}){

  let value=item.value;

  if(item.unit==="BRL"){
    value=money(item.value);
  }
  else if(item.unit==="PERCENT"){
    value=percent(item.value);
  }

  return(
    <div className="r7-evidence">

      <span>{item.label}</span>

      <strong>{value}</strong>

      <small>{item.source}</small>

    </div>
  );
}

function Recommendation({item}){

  return(
    <article className={`r7-rec ${String(item.priority).toLowerCase()}`}>

      <div className="r7-rec-top">

        <div>
          <span className="r7-priority">
            {item.priority}
          </span>

          <span className="r7-category">
            {item.category}
          </span>
        </div>

        <span className="r7-horizon">
          {String(item.time_horizon||"")
            .replaceAll("_"," ")}
        </span>

      </div>

      <h4>{item.title}</h4>

      <p className="r7-reason">
        {item.reason}
      </p>

      <div className="r7-evidence-grid">

        {(item.evidence||[]).map(
          (evidence,index)=>(
            <Evidence
              item={evidence}
              key={index}
            />
          )
        )}

      </div>

      <div className="r7-action">

        <span>AÇÃO RECOMENDADA</span>

        <strong>
          {item.recommended_action}
        </strong>

      </div>

      <footer>

        <span>
          {(item.source_modules||[])
            .join(" • ")}
        </span>

        {
          item.human_authorization_required
          &&
          (
            <b>
              AUTORIZAÇÃO HUMANA
            </b>
          )
        }

      </footer>

    </article>
  );
}

function Plan({
  title,
  plan
}){

  const actions=
    plan?.actions || [];

  return(
    <article className="r7-plan">

      <div className="r7-plan-head">

        <div>
          <span>PLANO EXECUTIVO</span>
          <strong>{title}</strong>
        </div>

        <b>
          {money(
            plan?.registered_pressure
          )}
        </b>

      </div>

      <div className="r7-plan-meta">

        <span>
          Pressão registrada
        </span>

        <strong>
          Meta diária de referência:
          {" "}
          {money(
            plan?.required_daily_revenue
          )}
        </strong>

      </div>

      <div className="r7-plan-actions">

        {
          actions.length===0
          ?(
            <div className="r7-empty">
              Nenhuma ação adicional gerada
              para este horizonte.
            </div>
          )
          :actions.map(
            (item,index)=>(
              <div
                className="r7-plan-action"
                key={`${item.recommendation_id}-${index}`}
              >

                <span className={`r7-mini-priority ${String(item.priority).toLowerCase()}`}>
                  {item.priority}
                </span>

                <div>
                  <strong>
                    {item.title}
                  </strong>

                  <p>
                    {item.action}
                  </p>
                </div>

                {
                  item.authorization_required
                  &&
                  (
                    <small>
                      HUMANO
                    </small>
                  )
                }

              </div>
            )
          )
        }

      </div>

    </article>
  );
}

export default function FinancialMentorV50C(){

  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [plan,setPlan]=useState("days_7");

  const load=useCallback(async()=>{

    try{

      setLoading(true);
      setError("");

      const response=
        await financialMentorV50C();

      setData(response);

    }catch(err){

      setError(
        err?.message ||
        "Não foi possível carregar o Financial Mentor."
      );

    }finally{
      setLoading(false);
    }

  },[]);

  useEffect(()=>{
    load();
  },[load]);

  const executive=
    data?.executive || {};

  const snapshot=
    data?.snapshot || {};

  const recommendations=
    data?.recommendations || [];

  const plans=
    data?.plans || {};

  const currentPlan=
    plans?.[plan] || {};

  const planTitle=
    plan==="days_7"
      ?"7 dias"
      :(
        plan==="days_15"
          ?"15 dias"
          :"30 dias"
      );

  const counts=
    useMemo(()=>{

      const result={
        P0:0,
        P1:0,
        P2:0,
        P3:0
      };

      for(const item of recommendations){

        if(
          Object.prototype.hasOwnProperty.call(
            result,
            item.priority
          )
        ){
          result[item.priority]++;
        }
      }

      return result;

    },[recommendations]);

  if(loading){

    return(
      <section className="r7-shell">
        <div className="r7-loading">
          NEXUS Mentor analisando os dados...
        </div>
      </section>
    );
  }

  if(error){

    return(
      <section className="r7-shell">

        <div className="r7-error">

          <strong>
            NEXUS Financial Mentor
          </strong>

          <span>{error}</span>

          <button onClick={load}>
            Tentar novamente
          </button>

        </div>

      </section>
    );
  }

  return(
    <section className="r7-shell">

      <header className="r7-hero">

        <div>

          <span className="r7-eyebrow">
            NEXUS DECISION INTELLIGENCE • V5.0C-R7
          </span>

          <h2>
            Financial <em>Mentor</em>
          </h2>

          <p>
            O sistema transforma dados financeiros
            registrados em prioridades, evidências
            e ações gerenciais.
          </p>

        </div>

        <div className="r7-state">

          <span>ESTADO GERENCIAL</span>

          <strong>
            {
              stateNames[
                executive.management_state
              ] ||
              executive.management_state ||
              "—"
            }
          </strong>

          <small>
            {
              qualityNames[
                executive.data_quality
              ] ||
              executive.data_quality ||
              "—"
            }
          </small>

          <button onClick={load}>
            Recalcular análise
          </button>

        </div>

      </header>

      <div className="r7-guard">

        <div>
          <b>
            Intelligence with Human Control
          </b>

          <span>
            O Mentor analisa, prioriza e recomenda.
            Pagamentos, crédito, compras e investimentos
            continuam dependendo de decisão humana.
          </span>
        </div>

        <strong>
          HUMAN-IN-THE-LOOP
        </strong>

      </div>

      <div className="r7-priority-grid">

        {["P0","P1","P2","P3"].map(
          priority=>(
            <div
              className={`r7-priority-card ${priority.toLowerCase()}`}
              key={priority}
            >

              <span>{priority}</span>

              <strong>
                {counts[priority]}
              </strong>

              <small>
                {
                  priority==="P0"
                    ?"Crítico"
                    :priority==="P1"
                    ?"Alta prioridade"
                    :priority==="P2"
                    ?"Otimização"
                    :"Oportunidade"
                }
              </small>

            </div>
          )
        )}

      </div>

      <article className="r7-command">

        <div className="r7-command-label">
          PRIORIDADE EXECUTIVA
        </div>

        {
          executive.top_priority
          ?(
            <>
              <div className="r7-command-main">

                <span className={`r7-command-priority ${String(executive.top_priority.priority).toLowerCase()}`}>
                  {executive.top_priority.priority}
                </span>

                <h3>
                  {executive.top_priority.title}
                </h3>

              </div>

              <p>
                O NEXUS posicionou esta ação no topo
                da fila com base nos dados registrados.
              </p>
            </>
          )
          :(
            <div className="r7-empty">
              Nenhuma prioridade financeira adicional
              foi identificada nos dados atuais.
            </div>
          )
        }

      </article>

      <div className="r7-snapshot">

        <div>
          <span>Receita • 30 dias</span>
          <strong>
            {money(
              snapshot.revenue_30_days
            )}
          </strong>
          <small>
            Tendência {percent(
              snapshot.trend_30_days_percent
            )}
          </small>
        </div>

        <div>
          <span>Dívida em aberto</span>
          <strong>
            {money(
              snapshot.open_debt
            )}
          </strong>
          <small>
            Vencida {money(
              snapshot.overdue_debt
            )}
          </small>
        </div>

        <div>
          <span>Pressão • 7 dias</span>
          <strong>
            {money(
              snapshot.pressure_7_days
            )}
          </strong>
          <small>
            Referência/dia {money(
              snapshot.required_daily_revenue_7_days
            )}
          </small>
        </div>

        <div>
          <span>CMV • 30 dias</span>
          <strong>
            {percent(
              snapshot.cmv_ratio_percent
            )}
          </strong>
          <small>
            {money(
              snapshot.cmv_30_days
            )}
          </small>
        </div>

      </div>

      <article className="r7-section">

        <div className="r7-section-head">

          <div>
            <span>DECISION QUEUE</span>
            <h3>
              Recomendações priorizadas
            </h3>
          </div>

          <b>
            {recommendations.length}
            {" "}AÇÃO(ÕES)
          </b>

        </div>

        <div className="r7-recommendations">

          {
            recommendations.length===0
            ?(
              <div className="r7-empty">
                Nenhuma recomendação adicional
                foi gerada pelos dados atuais.
              </div>
            )
            :recommendations.map(
              item=>(
                <Recommendation
                  item={item}
                  key={item.id}
                />
              )
            )
          }

        </div>

      </article>

      <article className="r7-section">

        <div className="r7-section-head">

          <div>
            <span>EXECUTION ROADMAP</span>
            <h3>
              Plano financeiro 7 / 15 / 30
            </h3>
          </div>

          <div className="r7-plan-switch">

            <button
              className={
                plan==="days_7"
                  ?"active"
                  :""
              }
              onClick={
                ()=>setPlan("days_7")
              }
            >
              7 dias
            </button>

            <button
              className={
                plan==="days_15"
                  ?"active"
                  :""
              }
              onClick={
                ()=>setPlan("days_15")
              }
            >
              15 dias
            </button>

            <button
              className={
                plan==="days_30"
                  ?"active"
                  :""
              }
              onClick={
                ()=>setPlan("days_30")
              }
            >
              30 dias
            </button>

          </div>

        </div>

        <Plan
          title={planTitle}
          plan={currentPlan}
        />

      </article>

      <article className="r7-cycle">

        <div>
          <span>NEXUS MANAGEMENT LOOP</span>
          <h3>
            Ação → Resultado → Aprendizado →
            Recálculo → Nova ação
          </h3>
          <p>
            O aprendizado aqui significa recalcular
            as recomendações a partir dos novos dados
            operacionais e financeiros registrados.
          </p>
        </div>

        <div className="r7-cycle-steps">

          {[
            "AÇÃO",
            "RESULTADO",
            "APRENDER",
            "RECALCULAR",
            "NOVA AÇÃO"
          ].map(
            (item,index)=>(
              <div key={item}>
                <b>
                  {String(index+1).padStart(2,"0")}
                </b>
                <span>{item}</span>
              </div>
            )
          )}

        </div>

      </article>

      <div className="r7-disclaimer">
        {data?.disclaimer}
      </div>

    </section>
  );
}
