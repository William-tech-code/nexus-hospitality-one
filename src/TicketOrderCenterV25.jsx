import React,{
  useEffect,
  useMemo,
  useState
} from 'react';

import {api} from './api.js';
import EventIntelligenceV37 from "./EventIntelligenceV37.jsx";
import './TicketsV25.css';

const money=value=>
  Number(value||0)
    .toLocaleString(
      'pt-BR',
      {
        style:'currency',
        currency:'BRL'
      }
    );

const dt=value=>{
  if(!value)return '\u2014';

  const date=new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? value
    : date.toLocaleString(
        'pt-BR',
        {
          timeZone:'America/Sao_Paulo',
          year:'numeric',
          month:'2-digit',
          day:'2-digit',
          hour:'2-digit',
          minute:'2-digit',
          second:'2-digit',
          hour12:false
        }
      );
};

export default function TicketOrderCenterV25(){

  const [events,setEvents]=useState([]);
  const [eventId,setEventId]=useState('');
  const [dashboard,setDashboard]=useState(null);
  const [orders,setOrders]=useState([]);
  const [history,setHistory]=useState([]);
  const [tickets,setTickets]=useState([]);
  const [lots,setLots]=useState([]);
  const [query,setQuery]=useState('');
  const [search,setSearch]=useState([]);
  const [message,setMessage]=useState('');

  const [form,setForm]=useState({
    attendee_name:'',
    attendee_phone:'',
    buyer_email:'',
    buyer_document:'',
    lot_id:'',
    payment_method:'DINHEIRO',
    payment_status:'PAID'
  });

  async function loadEvents(){

    const rows=
      await api.ticketEvents();

    setEvents(rows);

    if(
      !eventId &&
      rows.length
    ){
      setEventId(
        String(rows[0].id)
      );
    }
  }

  async function load(){

    if(!eventId){
      return;
    }

    try{

      const [
        dashboardData,
        orderRows,
        accessRows,
        ticketRows,
        lotRows
      ]=await Promise.all([
        api.ticketDashboardV25(eventId),
        api.ticketOrdersV25(eventId),
        api.ticketAccessV25(eventId),
        api.tickets(eventId),
        api.ticketLots(eventId)
      ]);

      setDashboard(
        dashboardData
      );

      setOrders(
        orderRows
      );

      setHistory(
        accessRows
      );

      setTickets(
        ticketRows
      );

      setLots(
        lotRows
      );

    }catch(error){

      setMessage(
        error.message||
        'Falha ao carregar central de ingressos.'
      );
    }
  }

  useEffect(
    ()=>{
      loadEvents()
        .catch(
          error=>
            setMessage(
              error.message
            )
        );
    },
    []
  );

  useEffect(
    ()=>{
      load();
    },
    [eventId]
  );

  useEffect(
    ()=>{
      const handleTicketCheckin=()=>{
        load();
      };

      window.addEventListener(
        'nexus:ticket-checkin',
        handleTicketCheckin
      );

      return ()=>{
        window.removeEventListener(
          'nexus:ticket-checkin',
          handleTicketCheckin
        );
      };
    },
    [eventId]
  );

  async function runSearch(){

    if(!query.trim()){
      setSearch([]);
      return;
    }

    try{

      const rows=
        await api.ticketSearchV25(
          eventId,
          query.trim()
        );

      setSearch(rows);

    }catch(error){

      setMessage(
        error.message
      );
    }
  }

  async function createPresential(){

    if(
      !eventId ||
      !form.attendee_name.trim()
    ){

      setMessage(
        'Informe o participante.'
      );

      return;
    }

    try{

      const response=
        await api.createPresentialTicketV25({
          event_id:Number(eventId),
          lot_id:
            form.lot_id
              ? Number(form.lot_id)
              : null,
          attendee_name:
            form.attendee_name,
          attendee_phone:
            form.attendee_phone,
          buyer_email:
            form.buyer_email,
          buyer_document:
            form.buyer_document,
          payment_method:
            form.payment_method,
          payment_status:
            form.payment_status
        });

      setMessage(
        'Ingresso emitido: '+
        response.ticket.ticket_code
      );

      setForm(current=>({
        ...current,
        attendee_name:'',
        attendee_phone:'',
        buyer_email:'',
        buyer_document:''
      }));

      await load();

    }catch(error){

      setMessage(
        error.message||
        'Falha ao emitir ingresso.'
      );
    }
  }

  const metrics=
    dashboard?.metrics||{};

  const orderMetrics=
    dashboard?.orders||{};

  const visibleTickets=
    query.trim()
      ? search
      : tickets;

  const activeEvent=
    useMemo(
      ()=>
        events.find(
          row=>
            String(row.id)===
            String(eventId)
        ),
      [events,eventId]
    );

  return (
    <section className="ticket-center-v25">

      <div className="ticket-center-head">

        <div>
          <span>
            NEXUS TICKETS V2.5
          </span>

          <h2>
            Ticket Order Center
          </h2>

          <p>
            Venda, pagamento, emissao,
            QR Code e acesso em uma unica operacao.
          </p>
        </div>

        <select
          value={eventId}
          onChange={
            event=>
              setEventId(
                event.target.value
              )
          }
        >
          <option value="">
            Selecione o evento
          </option>

          {events.map(row=>(
            <option
              key={row.id}
              value={row.id}
            >
              {row.title}
            </option>
          ))}
        </select>

      </div>

      {message&&(
        <div className="ticket-v25-message">
          {message}
        </div>
      )}

      {activeEvent&&(
        <div className="ticket-v25-event">
          <b>
            {activeEvent.title}
          </b>

          <span>
            {dt(
              activeEvent.starts_at
            )}
          </span>
        </div>
      )}

      <div className="ticket-v25-kpis">

        <article>
          <span>EMITIDOS</span>
          <strong>
            {metrics.issued||0}
          </strong>
        </article>

        <article>
          <span>DISPONIVEIS</span>
          <strong>
            {metrics.available===null
              ? '\u221e'
              : metrics.available||0}
          </strong>
        </article>

        <article>
          <span>CHECK-INS</span>
          <strong>
            {metrics.checked_in||0}
          </strong>
        </article>

        <article>
          <span>PRESENCA</span>
          <strong>
            {metrics.attendance_rate||0}%
          </strong>
        </article>

        <article>
          <span>RECEITA</span>
          <strong>
            {money(
              metrics.revenue
            )}
          </strong>
        </article>

        <article>
          <span>PENDENTES</span>
          <strong>
            {orderMetrics.pending||0}
          </strong>
        </article>

      </div>

      <div className="ticket-v25-grid">

        <section className="ticket-v25-card">

          <div className="ticket-v25-title">
            <span>VENDA PRESENCIAL</span>
            <h3>
              Emitir ingresso
            </h3>
          </div>

          <div className="ticket-v25-form">

            <input
              placeholder="Nome do participante"
              value={
                form.attendee_name
              }
              onChange={
                event=>
                  setForm({
                    ...form,
                    attendee_name:
                      event.target.value
                  })
              }
            />

            <input
              placeholder="WhatsApp"
              value={
                form.attendee_phone
              }
              onChange={
                event=>
                  setForm({
                    ...form,
                    attendee_phone:
                      event.target.value
                  })
              }
            />

            <input
              placeholder="E-mail"
              value={
                form.buyer_email
              }
              onChange={
                event=>
                  setForm({
                    ...form,
                    buyer_email:
                      event.target.value
                  })
              }
            />

            <input
              placeholder="CPF / documento"
              value={
                form.buyer_document
              }
              onChange={
                event=>
                  setForm({
                    ...form,
                    buyer_document:
                      event.target.value
                  })
              }
            />

            <select
              value={form.lot_id}
              onChange={
                event=>
                  setForm({
                    ...form,
                    lot_id:
                      event.target.value
                  })
              }
            >
              <option value="">
                Sem lote
              </option>

              {lots.map(row=>(
                <option
                  key={row.id}
                  value={row.id}
                >
                  {row.name} - {money(row.price)}
                </option>
              ))}
            </select>

            <select
              value={
                form.payment_status
              }
              onChange={
                event=>
                  setForm({
                    ...form,
                    payment_status:
                      event.target.value
                  })
              }
            >
              <option value="PAID">
                Pago
              </option>

              <option value="COURTESY">
                Cortesia
              </option>
            </select>

            {form.payment_status==='PAID'&&(
              <select
                value={
                  form.payment_method
                }
                onChange={
                  event=>
                    setForm({
                      ...form,
                      payment_method:
                        event.target.value
                    })
                }
              >
                <option value="DINHEIRO">
                  Dinheiro
                </option>

                <option value="PIX">
                  PIX
                </option>

                <option value="CARTAO">
                  Cartao
                </option>
              </select>
            )}

            <button
              onClick={
                createPresential
              }
            >
              EMITIR INGRESSO
            </button>

          </div>

        </section>

        <section className="ticket-v25-card">

          <div className="ticket-v25-title">
            <span>ASAAS</span>
            <h3>
              Pedidos online
            </h3>
          </div>

          <div className="ticket-v25-orders">

            {!orders.length&&(
              <div className="ticket-v25-empty">
                Nenhum pedido online.
              </div>
            )}

            {orders.slice(0,20)
              .map(row=>(
                <article key={row.id}>

                  <div>
                    <b>
                      {row.order_code}
                    </b>
                    <span>
                      {row.buyer_name}
                    </span>
                  </div>

                  <div>
                    <b>
                      {row.lot_name}
                    </b>
                    <span>
                      {row.quantity} ingresso(s)
                    </span>
                  </div>

                  <div>
                    <b>
                      {money(row.total)}
                    </b>
                    <span>
                      {row.payment_status}
                    </span>
                  </div>

                  <div>
                    <b>
                      {row.asaas_payment_id||
                        '\u2014'}
                    </b>
                    <span>
                      {dt(row.created_at)}
                    </span>
                  </div>

                </article>
              ))
            }

          </div>

        </section>

      </div>

      <section className="ticket-v25-card">

        <div className="ticket-v25-title">
          <span>BUSCA INTELIGENTE</span>
          <h3>
            Ingressos emitidos
          </h3>
        </div>

        <div className="ticket-v25-search">

          <input
            value={query}
            onChange={
              event=>
                setQuery(
                  event.target.value
                )
            }
            onKeyDown={
              event=>{
                if(event.key==='Enter'){
                  runSearch();
                }
              }
            }
            placeholder="Nome, telefone, e-mail ou codigo"
          />

          <button
            onClick={runSearch}
          >
            BUSCAR
          </button>

          {query&&(
            <button
              className="secondary"
              onClick={()=>{
                setQuery('');
                setSearch([]);
              }}
            >
              LIMPAR
            </button>
          )}

        </div>

        <div className="ticket-v25-table-wrap">

          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Participante</th>
                <th>Lote</th>
                <th>Valor</th>
                <th>Pagamento</th>
                <th>Acesso</th>
              </tr>
            </thead>

            <tbody>

              {visibleTickets.map(row=>(
                <tr key={row.id}>
                  <td>
                    <b>
                      {row.ticket_code}
                    </b>
                  </td>

                  <td>
                    {row.attendee_name||
                      '\u2014'}
                  </td>

                  <td>
                    {row.lot_name||
                      row.ticket_type||
                      '\u2014'}
                  </td>

                  <td>
                    {money(row.price)}
                  </td>

                  <td>
                    {row.payment_status}
                  </td>

                  <td>
                    {row.checkin_at
                      ? 'UTILIZADO'
                      : 'DISPONIVEL'}
                  </td>
                </tr>
              ))}

            </tbody>
          </table>

        </div>

      </section>

      <section className="ticket-v25-card">

        <div className="ticket-v25-title">
          <span>SEGURANCA</span>
          <h3>
            Historico da portaria
          </h3>
        </div>

        <div className="ticket-v25-access">

          {!history.length&&(
            <div className="ticket-v25-empty">
              Nenhuma tentativa registrada.
            </div>
          )}

          {history.slice(0,50)
            .map(row=>(
              <article
                key={row.id}
                className={
                  String(
                    row.result
                  ).toLowerCase()
                }
              >

                <b>
                  {row.result}
                </b>

                <span>
                  {row.attendee_name||
                    row.code}
                </span>

                <span>
                  {row.lot_name||
                    '\u2014'}
                </span>

                <span>
                  {row.operator_name||
                    '\u2014'}
                </span>

                <span>
                  {dt(row.created_at)}
                </span>

              </article>
            ))
          }

        </div>

      </section>
      <EventIntelligenceV37
        eventId={eventId}
      />


    </section>
  );
}

