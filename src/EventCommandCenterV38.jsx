import React,{
  useEffect,
  useMemo,
  useState
} from "react";

import {api} from "./api.js";

import TicketsV15 from "./TicketsV15.jsx";
import TicketOrderCenterV25 from "./TicketOrderCenterV25.jsx";
import GateScannerV25 from "./GateScannerV25.jsx";
import EventIntelligenceV37 from "./EventIntelligenceV37.jsx";

import "./EventCommandCenterV38.css";

const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

function dt(value){

  if(!value){
    return "Data a confirmar";
  }

  try{

    return new Date(value).toLocaleString(
      "pt-BR",
      {
        dateStyle:"medium",
        timeStyle:"short"
      }
    );

  }catch{

    return value;
  }
}

export default function EventCommandCenterV38(){

  const[events,setEvents]=useState([]);
  const[eventId,setEventId]=useState("");
  const[dashboard,setDashboard]=useState(null);

  const[tab,setTab]=useState("overview");

  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");

  async function loadEvents(){

    try{

      const rows=
        await api.ticketEvents();

      const list=
        Array.isArray(rows)
          ?rows
          :[];

      setEvents(list);

      setEventId(current=>{

        if(
          current &&
          list.some(
            item=>
              String(item.id)===
              String(current)
          )
        ){
          return current;
        }

        return list.length
          ?String(list[0].id)
          :"";
      });

    }catch(err){

      setError(
        err?.message||
        "Falha ao carregar eventos."
      );

    }finally{

      setLoading(false);
    }
  }

  async function loadDashboard(){

    if(!eventId){
      setDashboard(null);
      return;
    }

    try{

      const response=
        await api.ticketDashboardV25(
          eventId
        );

      setDashboard(response);

    }catch(err){

      console.error(
        "EVENT_COMMAND_CENTER_DASHBOARD",
        err
      );
    }
  }

  useEffect(()=>{

    loadEvents();

  },[]);

  useEffect(()=>{

    loadDashboard();

  },[eventId]);

  useEffect(()=>{

    const refresh=()=>{
      loadDashboard();
    };

    window.addEventListener(
      "nexus:ticket-checkin",
      refresh
    );

    window.addEventListener(
      "nexus:gate-intelligence",
      refresh
    );

    const timer=
      setInterval(
        refresh,
        15000
      );

    return()=>{

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

  const activeEvent=
    useMemo(
      ()=>
        events.find(
          item=>
            String(item.id)===
            String(eventId)
        )||null,
      [events,eventId]
    );

  const metrics=
    dashboard?.metrics||{};

  const orders=
    dashboard?.orders||{};

  const issued=
    Number(metrics.issued||0);

  const checked=
    Number(
      metrics.checked_in||
      metrics.checkins||
      metrics.used||
      0
    );

  const occupancy=
    issued>0
      ?Math.min(
          100,
          Math.round(
            (checked/issued)*100
          )
        )
      :0;

  function openPublicEvent(){

    if(!eventId){
      return;
    }

    window.open(
      `/eventos/${eventId}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  if(loading){

    return(
      <section className="ecc38-shell">

        <div className="ecc38-loading">

          <div className="ecc38-orb">
            N
          </div>

          <strong>
            NEXUS EVENT COMMAND CENTER
          </strong>

          <span>
            Sincronizando ecossistema do evento...
          </span>

        </div>

      </section>
    );
  }

  return(
    <section className="ecc38-shell">

      <header className="ecc38-hero">

        <div className="ecc38-brand">

          <span className="ecc38-kicker">
            NEXUS EVENT EXPERIENCE V3.8
          </span>

          <h1>
            Event Command Center
          </h1>

          <p>
            Venda, ingressos, lotes, acesso,
            experiência do cliente e inteligência
            operando como um único ecossistema.
          </p>

        </div>

        <div className="ecc38-event-control">

          <small>
            EVENTO EM OPERAÇÃO
          </small>

          <select
            value={eventId}
            onChange={event=>{
              setEventId(
                event.target.value
              );
            }}
          >

            {!events.length&&(
              <option value="">
                Nenhum evento disponível
              </option>
            )}

            {events.map(event=>(
              <option
                key={event.id}
                value={event.id}
              >
                {event.title}
              </option>
            ))}

          </select>

          {!!eventId&&(
            <button
              type="button"
              onClick={openPublicEvent}
            >
              ABRIR PÁGINA PÚBLICA ↗
            </button>
          )}

        </div>

      </header>

      {error&&(
        <div className="ecc38-error">
          {error}
        </div>
      )}

      {activeEvent&&(

        <section className="ecc38-event-strip">

          <div>

            <span>
              EVENTO SELECIONADO
            </span>

            <strong>
              {activeEvent.title}
            </strong>

          </div>

          <div>

            <span>
              DATA
            </span>

            <strong>
              {dt(
                activeEvent.starts_at
              )}
            </strong>

          </div>

          <div>

            <span>
              LOCAL
            </span>

            <strong>
              {activeEvent.venue_name||
               "Local a confirmar"}
            </strong>

          </div>

          <div className="ecc38-live">

            <i/>

            <span>
              ECOSSISTEMA ONLINE
            </span>

          </div>

        </section>
      )}

      <nav className="ecc38-nav">

        <button
          className={
            tab==="overview"
              ?"active"
              :""
          }
          onClick={()=>
            setTab("overview")
          }
        >
          <span>01</span>
          VISÃO GERAL
        </button>

        <button
          className={
            tab==="tickets"
              ?"active"
              :""
          }
          onClick={()=>
            setTab("tickets")
          }
        >
          <span>02</span>
          VENDAS & INGRESSOS
        </button>

        <button
          className={
            tab==="lots"
              ?"active"
              :""
          }
          onClick={()=>
            setTab("lots")
          }
        >
          <span>03</span>
          EVENTO & LOTES
        </button>

        <button
          className={
            tab==="gate"
              ?"active"
              :""
          }
          onClick={()=>
            setTab("gate")
          }
        >
          <span>04</span>
          PORTARIA
        </button>

        <button
          className={
            tab==="public"
              ?"active"
              :""
          }
          onClick={()=>
            setTab("public")
          }
        >
          <span>05</span>
          EXPERIÊNCIA PÚBLICA
        </button>

        <button
          className={
            tab==="intelligence"
              ?"active"
              :""
          }
          onClick={()=>
            setTab("intelligence")
          }
        >
          <span>06</span>
          INTELLIGENCE
        </button>

      </nav>


      {tab==="overview"&&(

        <div className="ecc38-overview">

          <section className="ecc38-kpis">

            <article>

              <span>
                INGRESSOS EMITIDOS
              </span>

              <strong>
                {issued}
              </strong>

              <small>
                base atual do evento
              </small>

            </article>

            <article>

              <span>
                CHECK-INS
              </span>

              <strong>
                {checked}
              </strong>

              <small>
                entradas registradas
              </small>

            </article>

            <article>

              <span>
                RECEITA
              </span>

              <strong>
                {money(
                  metrics.revenue
                )}
              </strong>

              <small>
                ingressos confirmados
              </small>

            </article>

            <article>

              <span>
                PAGAMENTOS PENDENTES
              </span>

              <strong>
                {orders.pending||0}
              </strong>

              <small>
                aguardando confirmação
              </small>

            </article>

          </section>


          <section className="ecc38-grid">

            <article className="ecc38-card ecc38-occupancy">

              <div className="ecc38-card-title">

                <span>
                  LIVE OPERATION
                </span>

                <h3>
                  Fluxo de entrada
                </h3>

              </div>

              <div className="ecc38-ring">

                <div>
                  <strong>
                    {occupancy}%
                  </strong>

                  <span>
                    CHECK-IN
                  </span>
                </div>

              </div>

              <p>
                {checked} de {issued} ingresso(s)
                emitido(s) já passaram pela portaria.
              </p>

              <button
                onClick={()=>
                  setTab("gate")
                }
              >
                ABRIR PORTARIA →
              </button>

            </article>


            <article className="ecc38-card">

              <div className="ecc38-card-title">

                <span>
                  CUSTOMER JOURNEY
                </span>

                <h3>
                  Jornada automatizada
                </h3>

              </div>

              <div className="ecc38-flow">

                <div>
                  <b>01</b>
                  <span>Evento publicado</span>
                </div>

                <i/>

                <div>
                  <b>02</b>
                  <span>Compra online</span>
                </div>

                <i/>

                <div>
                  <b>03</b>
                  <span>Pagamento</span>
                </div>

                <i/>

                <div>
                  <b>04</b>
                  <span>Ingresso emitido</span>
                </div>

                <i/>

                <div>
                  <b>05</b>
                  <span>Carteira digital</span>
                </div>

                <i/>

                <div>
                  <b>06</b>
                  <span>Gate</span>
                </div>

              </div>

              <p>
                O pagamento confirmado alimenta
                automaticamente emissão, carteira
                digital, QR individual e acesso.
              </p>

            </article>


            <article className="ecc38-card">

              <div className="ecc38-card-title">

                <span>
                  QUICK ACTIONS
                </span>

                <h3>
                  Operação do evento
                </h3>

              </div>

              <div className="ecc38-actions">

                <button
                  onClick={()=>
                    setTab("tickets")
                  }
                >
                  <span>INGRESSOS</span>
                  Venda e pedidos
                </button>

                <button
                  onClick={()=>
                    setTab("lots")
                  }
                >
                  <span>CONFIGURAÇÃO</span>
                  Evento e lotes
                </button>

                <button
                  onClick={()=>
                    setTab("gate")
                  }
                >
                  <span>PORTARIA</span>
                  Validar acesso
                </button>

                <button
                  onClick={()=>
                    setTab("intelligence")
                  }
                >
                  <span>INTELLIGENCE</span>
                  Analisar evento
                </button>

                <button
                  onClick={openPublicEvent}
                >
                  <span>PÚBLICO</span>
                  Abrir página
                </button>

              </div>

            </article>


            <article className="ecc38-card ecc38-status">

              <div className="ecc38-card-title">

                <span>
                  NEXUS CORE
                </span>

                <h3>
                  Sistemas conectados
                </h3>

              </div>

              <div>
                <span>
                  <i/>
                  EVENT ENGINE
                </span>

                <b>ONLINE</b>
              </div>

              <div>
                <span>
                  <i/>
                  ASAAS PAYMENT
                </span>

                <b>INTEGRADO</b>
              </div>

              <div>
                <span>
                  <i/>
                  TICKET ENGINE
                </span>

                <b>ONLINE</b>
              </div>

              <div>
                <span>
                  <i/>
                  CUSTOMER WALLET
                </span>

                <b>CONECTADO</b>
              </div>

              <div>
                <span>
                  <i/>
                  GATE INTELLIGENCE
                </span>

                <b>ONLINE</b>
              </div>

              <div>
                <span>
                  <i/>
                  EVENT INTELLIGENCE
                </span>

                <b>ONLINE</b>
              </div>

            </article>

          </section>

        </div>
      )}


      {tab==="tickets"&&(

        <div className="ecc38-module">

          <div className="ecc38-module-head">

            <span>
              TICKET OPERATIONS
            </span>

            <h2>
              Vendas & Ingressos
            </h2>

            <p>
              Venda presencial, pedidos online,
              pagamentos, emissão e localização
              de ingressos.
            </p>

          </div>

          <TicketOrderCenterV25/>

        </div>
      )}


      {tab==="lots"&&(

        <div className="ecc38-module">

          <div className="ecc38-module-head">

            <span>
              EVENT MANAGEMENT
            </span>

            <h2>
              Evento & Lotes
            </h2>

            <p>
              Estrutura comercial do evento,
              lotes, capacidade e regras de venda.
            </p>

          </div>

          <TicketsV15/>

        </div>
      )}


      {tab==="gate"&&(

        <div className="ecc38-module ecc38-gate-module">

          <div className="ecc38-module-head">

            <span>
              ACCESS OPERATION
            </span>

            <h2>
              Portaria & Gate Intelligence
            </h2>

            <p>
              QR Code, contingência, validação,
              bloqueio de duplicidade e leitura
              operacional em tempo real.
            </p>

          </div>

          <GateScannerV25/>

        </div>
      )}


      {tab==="public"&&(

        <div className="ecc38-public">

          <div className="ecc38-public-orb">
            N
          </div>

          <span>
            NEXUS EVENT EXPERIENCE
          </span>

          <h2>
            A experiência do cliente
            começa antes da entrada.
          </h2>

          <p>
            A página pública conecta divulgação,
            compra, PIX, confirmação automática,
            emissão do ingresso, carteira digital
            e QR Code individual.
          </p>

          <div className="ecc38-public-flow">

            <span>EVENTO</span>
            <i>→</i>
            <span>CHECKOUT</span>
            <i>→</i>
            <span>PIX</span>
            <i>→</i>
            <span>INGRESSO</span>
            <i>→</i>
            <span>WALLET</span>
            <i>→</i>
            <span>GATE</span>

          </div>

          <button
            onClick={openPublicEvent}
            disabled={!eventId}
          >
            ABRIR EXPERIÊNCIA PÚBLICA ↗
          </button>

        </div>
      )}


      {tab==="intelligence"&&(

        <div className="ecc38-module">

          <div className="ecc38-module-head">

            <span>
              NEXUS EVENT INTELLIGENCE
            </span>

            <h2>
              Inteligência do Evento
            </h2>

            <p>
              Receita, ocupação, ritmo de vendas,
              comportamento de entrada e sinais
              operacionais do evento.
            </p>

          </div>

          {eventId
            ?(
              <EventIntelligenceV37
                eventId={eventId}
              />
            )
            :(
              <div className="ecc38-empty">
                Selecione um evento.
              </div>
            )
          }

        </div>
      )}


      <footer className="ecc38-footer">

        <span>
          NEXUS HOSPITALITY ONE
        </span>

        <b>
          EVENT COMMAND CENTER • V3.8
        </b>

      </footer>

    </section>
  );
}
