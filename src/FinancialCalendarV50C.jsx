import React,{
  useCallback,
  useEffect,
  useMemo,
  useState
}from"react";

import{
  financialCalendarV50C
}from"./api.js";

import"./FinancialCalendarV50C.css";

const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

const dateBR=value=>{

  if(!value){
    return"Sem data";
  }

  const raw=
    String(value).slice(0,10);

  const[y,m,d]=
    raw.split("-");

  return y&&m&&d
    ?`${d}/${m}/${y}`
    :value;
};

const sourceLabel={
  DEBT:"Dividas",
  EXPENSE:"Despesas",
  OBLIGATION:"Obrigacoes",
  PROCUREMENT:"Compras"
};

export default function FinancialCalendarV50C(){

  const[data,setData]=
    useState(null);

  const[loading,setLoading]=
    useState(true);

  const[error,setError]=
    useState("");

  const load=
    useCallback(
      async()=>{

        try{

          setLoading(true);
          setError("");

          const result=
            await financialCalendarV50C();

          setData(result);

        }catch(e){

          setError(
            e?.message||
            "Nao foi possivel carregar o calendario financeiro."
          );

        }finally{

          setLoading(false);
        }
      },
      []
    );

  useEffect(()=>{
    load();
  },[load]);

  const calendar=
    useMemo(
      ()=>Array.isArray(
        data?.calendar
      )
        ?data.calendar
        :[],
      [data]
    );

  if(loading){

    return(
      <section className="nexus-r4">
        <div className="r4-loading">
          Calculando calendario financeiro...
        </div>
      </section>
    );
  }

  if(error){

    return(
      <section className="nexus-r4">

        <div className="r4-error">

          <strong>
            Financial Calendar
          </strong>

          <span>
            {error}
          </span>

          <button onClick={load}>
            Tentar novamente
          </button>

        </div>

      </section>
    );
  }

  const totals=
    data?.totals||{};

  const pressure=
    data?.pressure||{};

  const sources=
    data?.by_source||{};

  const alerts=
    Array.isArray(data?.alerts)
      ?data.alerts
      :[];

  return(
    <section className="nexus-r4">

      <header className="r4-hero">

        <div>

          <span className="r4-eyebrow">
            NEXUS FINANCIAL INTELLIGENCE
          </span>

          <h2>
            Financial Calendar
            <small>
              Cash Pressure
            </small>
          </h2>

          <p>
            Visao executiva dos compromissos
            registrados, vencimentos e pressao
            financeira dos proximos 90 dias.
          </p>

        </div>

        <button
          className="r4-refresh"
          onClick={load}
        >
          Atualizar inteligencia
        </button>

      </header>

      <div className="r4-warning">

        <strong>
          Leitura gerencial.
        </strong>

        <span>
          As fontes permanecem separadas porque
          um mesmo compromisso real pode estar
          registrado em mais de um modulo.
          Receita calculada pelo ritmo historico
          nao representa saldo disponivel em caixa.
        </span>

      </div>

      <div className="r4-kpis">

        <article>

          <span>
            Exposicao registrada
          </span>

          <strong>
            {money(
              totals.gross_registered_exposure
            )}
          </strong>

          <small>
            Bruta - pode conter sobreposicao
          </small>

        </article>

        <article
          className={
            Number(totals.overdue)>0
              ?"danger"
              :""
          }
        >

          <span>
            Vencido
          </span>

          <strong>
            {money(totals.overdue)}
          </strong>

          <small>
            {totals.overdue_count||0}
            {" "}registro(s)
          </small>

        </article>

        <article>

          <span>
            Sem vencimento
          </span>

          <strong>
            {money(
              totals.without_date
            )}
          </strong>

          <small>
            {totals.without_date_count||0}
            {" "}registro(s)
          </small>

        </article>

        <article>

          <span>
            Receita bruta 30d
          </span>

          <strong>
            {money(
              data?.revenue
                ?.gross_paid_sales_30_days
            )}
          </strong>

          <small>
            Ritmo diario:
            {" "}
            {money(
              data?.revenue
                ?.historical_daily_pace_30_days
            )}
          </small>

        </article>

      </div>

      <div className="r4-section-head">

        <div>
          <span>
            HORIZONTES
          </span>

          <h3>
            Cash Pressure
          </h3>
        </div>

      </div>

      <div className="r4-horizons">

        {[7,15,30,60,90].map(
          days=>{

            const p=
              pressure?.[days]||{};

            const gap=
              Number(
                p.gap_vs_revenue_pace||0
              );

            return(
              <article
                key={days}
                className={
                  gap>0
                    ?"pressure"
                    :""
                }
              >

                <div className="r4-horizon-top">

                  <strong>
                    {days} dias
                  </strong>

                  <span>
                    {
                      p.exposure_vs_revenue_pace==
                      null
                        ?"Sem base"
                        :`${p.exposure_vs_revenue_pace}%`
                    }
                  </span>

                </div>

                <label>
                  Exposicao agendada
                </label>

                <b>
                  {money(
                    p.scheduled_exposure
                  )}
                </b>

                <dl>

                  <div>
                    <dt>
                      Necessario/dia
                    </dt>
                    <dd>
                      {money(
                        p.required_daily_revenue
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Ritmo historico
                    </dt>
                    <dd>
                      {money(
                        p.historical_daily_revenue_pace
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Gap no horizonte
                    </dt>
                    <dd>
                      {money(gap)}
                    </dd>
                  </div>

                </dl>

              </article>
            );
          }
        )}

      </div>

      <div className="r4-section-head">

        <div>

          <span>
            ORIGEM DOS COMPROMISSOS
          </span>

          <h3>
            Pressao por Fonte
          </h3>

        </div>

      </div>

      <div className="r4-sources">

        {[
          "DEBT",
          "EXPENSE",
          "OBLIGATION",
          "PROCUREMENT"
        ].map(source=>{

          const x=
            sources?.[source]||{};

          return(
            <article key={source}>

              <span>
                {sourceLabel[source]}
              </span>

              <strong>
                {money(x.amount)}
              </strong>

              <div>

                <small>
                  Vencido
                  <b>
                    {money(x.overdue)}
                  </b>
                </small>

                <small>
                  Ate 30d
                  <b>
                    {money(x.due_30)}
                  </b>
                </small>

                <small>
                  Ate 90d
                  <b>
                    {money(x.due_90)}
                  </b>
                </small>

              </div>

            </article>
          );
        })}

      </div>

      {alerts.length>0&&(
        <>

          <div className="r4-section-head">

            <div>

              <span>
                NEXUS SIGNALS
              </span>

              <h3>
                Alertas Executivos
              </h3>

            </div>

          </div>

          <div className="r4-alerts">

            {alerts.map(
              (alert,index)=>(
                <article
                  key={
                    `${alert.code}-${index}`
                  }
                  className={
                    String(
                      alert.level
                    ).toLowerCase()
                  }
                >

                  <strong>
                    {alert.level}
                  </strong>

                  <span>
                    {alert.message}
                  </span>

                </article>
              )
            )}

          </div>

        </>
      )}

      <div className="r4-section-head">

        <div>

          <span>
            AGENDA FINANCEIRA
          </span>

          <h3>
            Proximos Compromissos
          </h3>

        </div>

        <strong>
          {calendar.length}
          {" "}registro(s)
        </strong>

      </div>

      <div className="r4-calendar">

        {calendar.length===0?(
          <div className="r4-empty">
            Nenhum compromisso financeiro
            registrado para exibicao.
          </div>
        ):(
          calendar
            .slice(0,40)
            .map(item=>(

              <article
                key={item.key}
                className={
                  item.bucket==="OVERDUE"
                    ?"overdue"
                    :""
                }
              >

                <div className="r4-date">

                  <strong>
                    {dateBR(
                      item.due_date
                    )}
                  </strong>

                  <span>
                    {
                      item.bucket==="OVERDUE"
                        ?"VENCIDO"
                        :item.days_until_due===0
                          ?"HOJE"
                          :item.days_until_due==null
                            ?"SEM DATA"
                            :`${item.days_until_due} dia(s)`
                    }
                  </span>

                </div>

                <div className="r4-description">

                  <div>

                    <span
                      className={
                        `r4-source ${
                          String(
                            item.source
                          ).toLowerCase()
                        }`
                      }
                    >
                      {item.source_label}
                    </span>

                    {item.recurring&&(
                      <span className="r4-recurring">
                        RECORRENTE
                      </span>
                    )}

                  </div>

                  <strong>
                    {item.title}
                  </strong>

                  <small>
                    {
                      item.counterparty||
                      item.category||
                      "Sem contraparte"
                    }
                  </small>

                </div>

                <div className="r4-value">

                  <strong>
                    {money(item.amount)}
                  </strong>

                  <small>
                    {item.priority}
                  </small>

                </div>

              </article>
            ))
        )}

      </div>

      <footer className="r4-footer">

        <strong>
          NEXUS Financial Calendar V5.0C-R4
        </strong>

        <span>
          Planejamento gerencial. Nao representa
          previsao garantida de receita, saldo
          bancario ou autorizacao automatica
          de pagamento.
        </span>

      </footer>

    </section>
  );
}