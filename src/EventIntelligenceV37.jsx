import React,{
  useEffect,
  useState
} from "react";

import "./EventIntelligenceV37.css";

function money(value){

  return Number(value||0)
    .toLocaleString(
      "pt-BR",
      {
        style:"currency",
        currency:"BRL"
      }
    );
}

function number(value){
  return Number(value||0)
    .toLocaleString("pt-BR");
}

function percent(value){
  return `${Number(value||0)
    .toLocaleString(
      "pt-BR",
      {
        maximumFractionDigits:1
      }
    )}%`;
}

function Recommendation({item}){

  return(
    <article
      className={
        `ei37-recommendation ${String(
          item.priority||"INFO"
        ).toLowerCase()}`
      }
    >
      <div>
        <span>
          {item.type}
        </span>
        <strong>
          {item.title}
        </strong>
        <p>
          {item.message}
        </p>
      </div>
    </article>
  );
}

export default function EventIntelligenceV37({
  eventId
}){

  const[data,setData]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");

  useEffect(()=>{

    if(!eventId){
      setData(null);
      return;
    }

    let alive=true;

    async function load(){

      setLoading(true);
      setError("");

      try{

        const response=
          await fetch(
            `/api/v37/events/${eventId}/intelligence`,
            {
              credentials:"include"
            }
          );

        const payload=
          await response.json();

        if(!response.ok){
          throw new Error(
            payload?.message||
            payload?.error||
            "Falha ao carregar inteligência."
          );
        }

        if(alive){
          setData(payload);
        }

      }catch(error){

        if(alive){
          setError(error.message);
        }

      }finally{

        if(alive){
          setLoading(false);
        }
      }
    }

    load();

    const timer=
      setInterval(
        load,
        15000
      );

    const refresh=()=>{
      load();
    };

    window.addEventListener(
      "nexus:ticket-checkin",
      refresh
    );

    window.addEventListener(
      "nexus:gate-intelligence",
      refresh
    );

    return()=>{

      alive=false;

      clearInterval(timer);

      window.removeEventListener(
        "nexus:ticket-checkin",
        refresh
      );

      window.removeEventListener(
        "nexus:gate-intelligence",
        refresh
      );
    };

  },[eventId]);

  if(!eventId){
    return null;
  }

  if(loading && !data){

    return(
      <section className="ei37-shell">
        <div className="ei37-loading">
          NEXUS EVENT INTELLIGENCE
          <span/>
        </div>
      </section>
    );
  }

  if(error && !data){

    return(
      <section className="ei37-shell">
        <div className="ei37-error">
          <strong>
            Event Intelligence indisponível
          </strong>
          <span>{error}</span>
        </div>
      </section>
    );
  }

  if(!data){
    return null;
  }

  const commercial=
    data.commercial||{};

  const finance=
    data.finance||{};

  const gate=
    data.gate||{};

  return(
    <section className="ei37-shell">

      <header className="ei37-header">

        <div>
          <span>
            NEXUS EVENT INTELLIGENCE
          </span>

          <h2>
            Centro de inteligência do evento
          </h2>

          <p>
            Dados comerciais, financeiros e
            operacionais transformados em
            leitura executiva em tempo real.
          </p>
        </div>

        <div className="ei37-live">
          <i/>
          DADOS REAIS
        </div>

      </header>

      <div className="ei37-event">

        <div>
          <small>EVENTO ANALISADO</small>
          <strong>
            {data.event?.title}
          </strong>
        </div>

        <span>
          Atualização automática
        </span>

      </div>

      <div className="ei37-kpis">

        <article>
          <span>OCUPAÇÃO</span>
          <strong>
            {percent(
              commercial.occupancy_percent
            )}
          </strong>
          <small>
            {number(
              commercial.paid+
              commercial.courtesy
            )} / {number(
              data.event?.capacity
            )}
          </small>
        </article>

        <article>
          <span>RECEITA</span>
          <strong>
            {money(finance.revenue)}
          </strong>
          <small>
            pagamentos confirmados
          </small>
        </article>

        <article>
          <span>MARGEM</span>
          <strong>
            {money(finance.margin)}
          </strong>
          <small>
            {percent(
              finance.margin_percent
            )}
          </small>
        </article>

        <article>
          <span>CHECK-IN</span>
          <strong>
            {percent(
              gate.checkin_percent
            )}
          </strong>
          <small>
            {number(
              gate.checked_in
            )} entradas
          </small>
        </article>

        <article>
          <span>RITMO DE VENDAS</span>
          <strong>
            {number(
              commercial.sales_velocity_per_day
            )}
          </strong>
          <small>
            ingressos / dia
          </small>
        </article>

        <article>
          <span>PORTARIA AGORA</span>
          <strong>
            {number(
              gate.current_velocity_per_minute
            )}
          </strong>
          <small>
            entradas / min
          </small>
        </article>

      </div>

      <div className="ei37-grid">

        <article className="ei37-panel">

          <div className="ei37-title">
            <span>COMERCIAL</span>
            <h3>Conversão do evento</h3>
          </div>

          <div className="ei37-rows">

            <div>
              <span>Ingressos emitidos</span>
              <b>
                {number(
                  commercial.issued
                )}
              </b>
            </div>

            <div>
              <span>Pagos</span>
              <b>
                {number(
                  commercial.paid
                )}
              </b>
            </div>

            <div>
              <span>Cortesias</span>
              <b>
                {number(
                  commercial.courtesy
                )}
              </b>
            </div>

            <div>
              <span>Pedidos pagos</span>
              <b>
                {number(
                  commercial.paid_orders
                )}
              </b>
            </div>

            <div>
              <span>Pedidos pendentes</span>
              <b>
                {number(
                  commercial.pending_orders
                )}
              </b>
            </div>

            <div>
              <span>Ticket médio</span>
              <b>
                {money(
                  commercial.average_order
                )}
              </b>
            </div>

          </div>

        </article>

        <article className="ei37-panel">

          <div className="ei37-title">
            <span>FINANCEIRO</span>
            <h3>Resultado do evento</h3>
          </div>

          <div className="ei37-finance-main">

            <span>RESULTADO ATUAL</span>

            <strong>
              {money(finance.margin)}
            </strong>

            <small>
              receita {money(finance.revenue)}
              {" • "}
              custo {money(finance.cost_used)}
            </small>

          </div>

          <div className="ei37-margin">

            <span
              style={{
                width:
                  `${Math.max(
                    0,
                    Math.min(
                      100,
                      finance.margin_percent
                    )
                  )}%`
              }}
            />

          </div>

        </article>

        <article className="ei37-panel">

          <div className="ei37-title">
            <span>GATE INTELLIGENCE</span>
            <h3>Controle de acesso</h3>
          </div>

          <div className="ei37-rows">

            <div>
              <span>Tentativas</span>
              <b>
                {number(gate.attempts)}
              </b>
            </div>

            <div>
              <span>Liberados</span>
              <b>
                {number(gate.allowed)}
              </b>
            </div>

            <div>
              <span>Duplicados</span>
              <b>
                {number(gate.duplicates)}
              </b>
            </div>

            <div>
              <span>Inválidos</span>
              <b>
                {number(gate.invalid)}
              </b>
            </div>

            <div>
              <span>Pagamento pendente</span>
              <b>
                {number(
                  gate.payment_pending
                )}
              </b>
            </div>

            <div>
              <span>Anomalias</span>
              <b>
                {percent(
                  gate.anomaly_percent
                )}
              </b>
            </div>

          </div>

        </article>

        <article className="ei37-panel">

          <div className="ei37-title">
            <span>PÚBLICO</span>
            <h3>Presença no evento</h3>
          </div>

          <div className="ei37-presence">

            <strong>
              {number(
                gate.checked_in
              )}
            </strong>

            <span>
              pessoas já entraram
            </span>

            <div className="ei37-presence-bar">
              <i
                style={{
                  width:
                    `${Math.min(
                      100,
                      Number(
                        gate.checkin_percent||0
                      )
                    )}%`
                }}
              />
            </div>

            <small>
              {number(
                gate.unused_tickets
              )} ingresso(s) ainda sem check-in
            </small>

          </div>

        </article>

      </div>

      {!!data.lots?.length&&(
        <section className="ei37-lots">

          <div className="ei37-title">
            <span>LOTES</span>
            <h3>
              Performance comercial por lote
            </h3>
          </div>

          <div className="ei37-lot-grid">

            {data.lots.map(lot=>(

              <article key={lot.id}>

                <div>
                  <span>
                    {lot.name}
                  </span>

                  <strong>
                    {percent(
                      lot.occupancy_percent
                    )}
                  </strong>
                </div>

                <div className="ei37-lot-bar">
                  <i
                    style={{
                      width:
                        `${Math.min(
                          100,
                          lot.occupancy_percent
                        )}%`
                    }}
                  />
                </div>

                <small>
                  {number(lot.sold)}
                  {" / "}
                  {number(lot.quantity)}
                  {" • "}
                  {money(lot.revenue)}
                </small>

              </article>

            ))}

          </div>

        </section>
      )}

      <section className="ei37-ai">

        <div className="ei37-ai-orb">
          N
        </div>

        <div className="ei37-ai-content">

          <span>
            NEXUS EVENT INTELLIGENCE
          </span>

          <h3>
            Recomendações operacionais
          </h3>

          <p>
            Análise automática baseada
            exclusivamente nos dados reais
            deste evento.
          </p>

          <div className="ei37-recommendations">

            {data.recommendations?.map(
              (item,index)=>(
                <Recommendation
                  key={index}
                  item={item}
                />
              )
            )}

          </div>

        </div>

      </section>

      <footer className="ei37-footer">
        <span>
          REAL DATA DETERMINISTIC ENGINE
        </span>

        <span>
          NEXUS EVENT EXPERIENCE V3.7
        </span>
      </footer>

    </section>
  );
}
