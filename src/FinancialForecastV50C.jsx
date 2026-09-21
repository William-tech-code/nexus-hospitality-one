import React,{
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  financialForecastV50C
} from "./api";

import "./FinancialForecastV50C.css";

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

const scenarioNames={
  CONSERVATIVE:"Conservador",
  BASE:"Base",
  GROWTH:"Crescimento"
};

const historyNames={
  NO_HISTORY:"Sem histórico",
  VERY_LIMITED_HISTORY:"Histórico muito limitado",
  LIMITED_HISTORY:"Histórico limitado",
  MODERATE_HISTORY:"Histórico moderado",
  STRONGER_HISTORY:"Histórico mais robusto"
};

function Metric({
  label,
  value,
  hint,
  tone=""
}){
  return(
    <article className={`r6-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}

function Signal({item}){

  return(
    <div className={`r6-signal ${String(item.severity||"").toLowerCase()}`}>
      <div>
        <span>{item.severity}</span>
        <strong>{item.title}</strong>
      </div>
      <p>{item.message}</p>
    </div>
  );
}

export default function FinancialForecastV50C(){

  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [scenario,setScenario]=useState("BASE");

  const load=useCallback(async()=>{

    try{

      setLoading(true);
      setError("");

      const response=
        await financialForecastV50C();

      setData(response);

    }catch(err){

      setError(
        err?.message ||
        "Não foi possível carregar a projeção financeira."
      );

    }finally{
      setLoading(false);
    }

  },[]);

  useEffect(()=>{
    load();
  },[load]);

  const forecast=
    data?.forecast || [];

  const history=
    data?.history || {};

  const cost=
    data?.cost_basis || {};

  const signals=
    data?.signals || [];

  const scenarioLabel=
    scenarioNames[scenario] ||
    scenario;

  const horizon30=
    useMemo(
      ()=>forecast.find(
        item=>item.days===30
      ),
      [forecast]
    );

  const base30=
    horizon30?.scenarios?.[scenario] || {};

  if(loading){

    return(
      <section className="r6-shell">
        <div className="r6-loading">
          Construindo cenários financeiros...
        </div>
      </section>
    );
  }

  if(error){

    return(
      <section className="r6-shell">

        <div className="r6-error">
          <strong>
            Financial Forecast Engine
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
    <section className="r6-shell">

      <header className="r6-hero">

        <div className="r6-hero-copy">

          <span className="r6-eyebrow">
            NEXUS FINANCIAL INTELLIGENCE • V5.0C-R6
          </span>

          <h2>
            Financial Forecast
            <em> & Scenario Engine</em>
          </h2>

          <p>
            Projeção gerencial baseada no histórico real,
            CMV observado e compromissos registrados.
          </p>

        </div>

        <div className="r6-hero-side">

          <div className="r6-history">
            <span>PROFUNDIDADE DOS DADOS</span>
            <strong>
              {
                historyNames[
                  history.classification
                ] ||
                history.classification ||
                "—"
              }
            </strong>
            <small>
              {history.active_sales_days || 0}
              {" "}dia(s) com vendas
            </small>
          </div>

          <button onClick={load}>
            Recalcular
          </button>

        </div>

      </header>

      <div className="r6-safety">

        <div>
          <b>Scenario Intelligence</b>
          <span>
            O NEXUS projeta movimento financeiro.
            Não fabrica saldo bancário futuro.
          </span>
        </div>

        <span className="r6-safety-chip">
          SEM FALSA PRECISÃO
        </span>

      </div>

      <div className="r6-kpis">

        <Metric
          label="Receita • 7 dias"
          value={money(
            history.revenue_7_days
          )}
          hint={`Tendência ${percent(
            history.trend_7_days_percent
          )}`}
        />

        <Metric
          label="Receita • 30 dias"
          value={money(
            history.revenue_30_days
          )}
          hint={`Tendência ${percent(
            history.trend_30_days_percent
          )}`}
        />

        <Metric
          label="Ritmo diário ponderado"
          value={money(
            history.weighted_base_daily
          )}
          hint="Base histórica do motor"
        />

        <Metric
          label="CMV histórico"
          value={percent(
            cost.cmv_ratio
          )}
          hint={money(
            cost.cmv_30_days
          )}
        />

      </div>

      <article className="r6-card">

        <div className="r6-card-head">

          <div>
            <span>CENÁRIO ATIVO</span>
            <h3>
              {scenarioLabel}
            </h3>
          </div>

          <div className="r6-scenario-switch">

            {Object.keys(
              scenarioNames
            ).map(key=>(

              <button
                key={key}
                className={
                  scenario===key
                    ?"active"
                    :""
                }
                onClick={
                  ()=>setScenario(key)
                }
              >
                {scenarioNames[key]}
              </button>

            ))}

          </div>

        </div>

        <div className="r6-horizon-grid">

          {forecast.map(item=>{

            const current=
              item.scenarios?.[scenario] || {};

            const negative=
              Number(
                current.projected_net_movement
              )<0;

            return(
              <div
                className={`r6-horizon ${negative?"negative":""}`}
                key={item.days}
              >

                <div className="r6-horizon-title">
                  <span>HORIZONTE</span>
                  <strong>
                    {item.days} dias
                  </strong>
                </div>

                <div className="r6-horizon-row">
                  <span>
                    Receita projetada
                  </span>
                  <b>
                    {money(
                      current.projected_revenue
                    )}
                  </b>
                </div>

                <div className="r6-horizon-row">
                  <span>
                    CMV projetado
                  </span>
                  <b>
                    {money(
                      current.projected_cmv
                    )}
                  </b>
                </div>

                <div className="r6-horizon-row">
                  <span>
                    Após CMV
                  </span>
                  <b>
                    {money(
                      current
                        .projected_contribution_after_cmv
                    )}
                  </b>
                </div>

                <div className="r6-horizon-row">
                  <span>
                    Pressão registrada
                  </span>
                  <b>
                    {money(
                      current.registered_pressure
                    )}
                  </b>
                </div>

                <div className="r6-horizon-result">

                  <span>
                    Movimento projetado
                  </span>

                  <strong>
                    {money(
                      current.projected_net_movement
                    )}
                  </strong>

                </div>

                <div className="r6-horizon-foot">

                  <span>
                    Necessário/dia
                  </span>

                  <b>
                    {money(
                      current
                        .required_daily_revenue_for_registered_pressure
                    )}
                  </b>

                </div>

              </div>
            );

          })}

        </div>

      </article>

      <div className="r6-grid">

        <article className="r6-card">

          <div className="r6-card-head">
            <div>
              <span>30 DIAS</span>
              <h3>
                Visão executiva • {scenarioLabel}
              </h3>
            </div>
          </div>

          <div className="r6-executive-grid">

            <Metric
              label="Receita projetada"
              value={money(
                base30.projected_revenue
              )}
            />

            <Metric
              label="Contribuição após CMV"
              value={money(
                base30
                  .projected_contribution_after_cmv
              )}
            />

            <Metric
              label="Pressão registrada"
              value={money(
                base30.registered_pressure
              )}
            />

            <Metric
              label="Movimento projetado"
              value={money(
                base30.projected_net_movement
              )}
              tone={
                Number(
                  base30.projected_net_movement
                )<0
                  ?"danger"
                  :"success"
              }
            />

          </div>

          <div className="r6-not-balance">

            <b>
              Movimento projetado ≠ saldo futuro
            </b>

            <span>
              Esse número compara contribuição
              projetada e pressão registrada.
              Ele não representa dinheiro em banco
              nem disponibilidade para investimento.
            </span>

          </div>

        </article>

        <article className="r6-card">

          <div className="r6-card-head">
            <div>
              <span>EXECUTIVE SIGNALS</span>
              <h3>
                Pontos de atenção
              </h3>
            </div>
          </div>

          <div className="r6-signals">

            {signals.length===0 ? (

              <div className="r6-empty">
                Nenhum alerta adicional gerado
                pelos dados atuais.
              </div>

            ):(
              signals.map(
                (item,index)=>(
                  <Signal
                    item={item}
                    key={`${item.code}-${index}`}
                  />
                )
              )
            )}

          </div>

        </article>

      </div>

      <article className="r6-card">

        <div className="r6-card-head">

          <div>
            <span>PRESSÃO POR ORIGEM</span>
            <h3>
              Compromissos registrados • 30 dias
            </h3>
          </div>

          <div className="r6-pill">
            POSSÍVEL SOBREPOSIÇÃO
          </div>

        </div>

        <div className="r6-source-grid">

          {Object.entries(
            horizon30?.commitments?.by_source || {}
          ).map(([source,value])=>(

            <div
              className="r6-source"
              key={source}
            >

              <span>{source}</span>

              <strong>
                {money(
                  Number(value.scheduled||0)+
                  Number(value.overdue||0)
                )}
              </strong>

              <small>
                Agendado {money(value.scheduled)}
                {" • "}
                Vencido {money(value.overdue)}
              </small>

            </div>

          ))}

          {
            Object.keys(
              horizon30?.commitments?.by_source || {}
            ).length===0 &&
            (
              <div className="r6-empty">
                Nenhum compromisso registrado
                nas fontes mapeadas.
              </div>
            )
          }

        </div>

        <div className="r6-overlap">

          <strong>
            Sem consolidação financeira artificial
          </strong>

          <span>
            Dívidas, despesas, obrigações e Procurement
            permanecem separados porque registros podem
            representar a mesma obrigação econômica.
          </span>

        </div>

      </article>

      <article className="r6-card">

        <div className="r6-card-head">
          <div>
            <span>METODOLOGIA</span>
            <h3>
              Como os cenários são calculados
            </h3>
          </div>
        </div>

        <div className="r6-methodology">

          {(data?.methodology || []).map(
            (item,index)=>(
              <div key={index}>
                <b>
                  {String(index+1).padStart(2,"0")}
                </b>
                <span>{item}</span>
              </div>
            )
          )}

        </div>

      </article>

    </section>
  );
}
