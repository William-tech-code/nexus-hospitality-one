import React,{
  useEffect,
  useMemo,
  useState
} from "react";

import "./PublicEventsPremiumV33.css";
import EventPaymentTrackerV35 from "./EventPaymentTrackerV35.jsx";

const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

const date=value=>{
  if(!value)return "Data a confirmar";

  try{
    return new Date(value).toLocaleString(
      "pt-BR",
      {
        dateStyle:"long",
        timeStyle:"short"
      }
    );
  }catch{
    return value;
  }
};

async function jsonFetch(url,options){

  const response=await fetch(
    url,
    options
  );

  const data=
    await response.json()
      .catch(()=>({}));

  if(!response.ok){
    throw new Error(
      data?.error||
      "REQUEST_FAILED"
    );
  }

  return data;
}

export default function PublicEventsPremiumV33({
  eventId=null
}){

  const[events,setEvents]=useState([]);
  const[selected,setSelected]=useState(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState("");
  const[checkout,setCheckout]=useState(null);
  const[buying,setBuying]=useState(false);

  /* NEXUS_EVENTS_FINAL_PREMIUM_V1 */
  const[now,setNow]=useState(()=>Date.now());

  useEffect(()=>{
    const timer=setInterval(
      ()=>setNow(Date.now()),
      1000
    );

    return ()=>clearInterval(timer);
  },[]);

  const countdown=value=>{

    if(!value){
      return null;
    }

    const target=
      new Date(value).getTime();

    if(!Number.isFinite(target)){
      return null;
    }

    const diff=
      Math.max(
        0,
        target-now
      );

    const totalSeconds=
      Math.floor(diff/1000);

    const days=
      Math.floor(
        totalSeconds/86400
      );

    const hours=
      Math.floor(
        (totalSeconds%86400)/3600
      );

    const minutes=
      Math.floor(
        (totalSeconds%3600)/60
      );

    const seconds=
      totalSeconds%60;

    return {
      expired:diff<=0,
      days,
      hours,
      minutes,
      seconds
    };
  };

  useEffect(()=>{

    let alive=true;

    async function load(){

      try{

        setLoading(true);
        setError("");

        if(eventId){

          const data=
            await jsonFetch(
              `/api/public/events/${eventId}`
            );

          if(!alive)return;

          const event=
            data?.event||
            data;

          setSelected(event);
          setEvents(
            event?[event]:[]
          );

        }else{

          const data=
            await jsonFetch(
              "/api/public/events"
            );

          if(!alive)return;

          const list=
            Array.isArray(data)
              ?data
              :data?.events||[];

          setEvents(list);

          if(list.length===1){
            setSelected(list[0]);
          }
        }

      }catch(e){

        if(alive){
          setError(
            "Nao foi possivel carregar os eventos."
          );
        }

      }finally{

        if(alive)setLoading(false);
      }
    }

    load();

    return()=>{
      alive=false;
    };

  },[eventId]);

  const current=
    selected||
    (eventId?events[0]:null);

  const lots=useMemo(
    ()=>current?.lots||[],
    [current]
  );

  async function buy(event,lot){

    const name=
      window.prompt(
        "Nome completo do comprador:"
      );

    if(!name?.trim())return;

    const phone=
      window.prompt(
        "WhatsApp com DDD:"
      );

    if(!phone?.trim())return;

    const email=
      window.prompt(
        "E-mail:"
      )||"";

    const document=
      window.prompt(
        "CPF:"
      )||"";

    const quantityRaw=
      window.prompt(
        `Quantidade de ingressos - ${lot.name}:`,
        "1"
      );

    if(quantityRaw===null)return;

    const quantity=
      Math.max(
        1,
        Math.min(
          10,
          Number(quantityRaw)||1
        )
      );

    try{

      setBuying(true);
      setError("");

      const result=
        await jsonFetch(
          `/api/public/events/${event.id}/buy`,
          {
            method:"POST",
            headers:{
              "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
              lot_id:lot.id,
              buyer_name:name.trim(),
              buyer_phone:phone.trim(),
              buyer_email:email.trim(),
              buyer_document:document.trim(),
              quantity
            })
          }
        );

      setCheckout(result);

    }catch(e){

      setError(
        e?.message||
        "Nao foi possivel iniciar a compra."
      );

    }finally{
      setBuying(false);
    }
  }

  if(loading){

    return(
      <main className="nev33-shell nev33-center">
        <div className="nev33-loader">
          <span>N</span>
          <small>NEXUS EVENT EXPERIENCE</small>
          <h1>Preparando sua experiência</h1>
          <p>
            Carregando eventos, lotes e disponibilidade.
          </p>
        </div>
      </main>
    );
  }

  if(checkout){

    const order=
      checkout?.order||
      checkout;

    return(
      <main className="nev33-shell">
        <section className="nev33-checkout-success">

          <span className="nev33-eyebrow">
            COMPRA INICIADA
          </span>

          <h1>
            Seu ingresso está quase garantido.
          </h1>

          <p>
            Assim que o pagamento for confirmado,
            o NEXUS emitirá seus ingressos e os
            conectará automaticamente à sua carteira.
          </p>

          <div className="nev33-order-code">
            <small>PEDIDO</small>
            <strong>
              {order?.order_code||
               order?.id||
               "NEXUS"}
            </strong>
          </div>

          {order?.pix_image&&(
            <div className="nev33-pix">
              <img
                src={
                  order.pix_image.startsWith?.("data:")
                    ?order.pix_image
                    :`data:image/png;base64,${order.pix_image}`
                }
                alt="QR Code PIX"
              />
              <strong>
                Escaneie para pagar
              </strong>
            </div>
          )}

          {order?.pix_payload&&(
            <div className="nev33-copy">
              <small>PIX COPIA E COLA</small>
              <textarea
                readOnly
                value={order.pix_payload}
              />
              <button
                onClick={async()=>{
                  try{
                    await navigator.clipboard.writeText(
                      order.pix_payload
                    );
                  }catch{}
                }}
              >
                Copiar PIX
              </button>
            </div>
          )}

          {order?.invoice_url&&(
            <a
              className="nev33-primary"
              href={order.invoice_url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir pagamento
            </a>
          )}

          <button
            className="nev33-secondary"
            onClick={()=>{
              window.location.href="/meus-ingressos";
            }}
          >
            Já sou cliente
          </button>

          <EventPaymentTrackerV35
            order={order}
            onError={error=>{
              console.error(
                "NEXUS PAYMENT EXPERIENCE",
                error
              );
            }}
          />

          <small className="nev33-security">
            Pagamento confirmado → emissão automática →
            carteira NEXUS → QR individual.
          </small>

        </section>
      </main>
    );
  }

  if(current){

    return(
      <main className="nev33-shell">

        <header className="nev33-header">
          <a href="/eventos" className="nev33-brand">
            <b>N</b>
            <span>
              NEXUS
              <small>EVENT EXPERIENCE</small>
            </span>
          </a>

          <a
            href="/meus-ingressos"
            className="nev33-wallet-link"
          >
            Meus ingressos
          </a>
        </header>

        <section className="nev33-event-hero">

          <div className="nev33-glow"/>

          <div className="nev33-event-content">

            <span className="nev33-eyebrow">
              EXPERIÊNCIA NEXUS
            </span>

            <h1>
              {current.title||"Evento"}
            </h1>

            <p>
              {current.description||
               "Uma experiência preparada para você."}
            </p>

            <div className="nev33-meta">

              <div>
                <small>DATA</small>
                <strong>
                  {date(current.starts_at)}
                </strong>
              </div>

              <div>
                <small>LOCAL</small>
                <strong>
                  {current.venue_name||
                   "Local a confirmar"}
                </strong>
              </div>

              <div>
                <small>ACESSO</small>
                <strong>
                  QR Code individual
                </strong>
              </div>

            </div>
          </div>

          <div className="nev33-event-badge">
            <span>LIVE</span>
            <strong>
              {current.artist_name||
               "NEXUS EVENT"}
            </strong>
            <small>
              Compra e acesso integrados
            </small>
          </div>

        </section>

        <section className="nev33-buy-area">

          <div className="nev33-title">
            <span>INGRESSOS</span>
            <h2>Escolha seu lote</h2>
            <p>
              Após a confirmação do pagamento,
              seus ingressos são emitidos automaticamente.
            </p>
          </div>

          {!lots.length&&(
            <div className="nev33-empty">
              Nenhum lote disponível neste momento.
            </div>
          )}

          <div className="nev33-lots">

            {lots.map((lot,index)=>{
              const clock=
                countdown(lot.ends_at);

              const soldOut=
                String(lot.state||'')
                  .toUpperCase()==='SOLD_OUT';

              const unavailable=
                !lot.available &&
                String(lot.state||'')
                  .toUpperCase()!=='LAST_UNITS';

              return(
                <article
                  className="nev33-lot"
                  key={lot.id}
                >

                  <div className="nev33-lot-head">

                    <span>
                      {index===0
                        ?"LOTE ATUAL"
                        :"LOTE"}
                    </span>
                    <small className="nev33-public-status">
                      {lot.label||"LOTE ATUAL"}
                    </small>

                  </div>

                  <h3>{lot.name}</h3>

                  <strong className="nev33-price">
                    {money(lot.price)}
                  </strong>
                  <div className="nev33-countdown">

                    <small>
                      {clock
                        ? "ESTE LOTE ENCERRA EM"
                        : "LOTE ATUAL"}
                    </small>

                    {clock
                      ?(
                        <div className="nev33-countdown-grid">

                          <span>
                            <b>
                              {String(clock.days)
                                .padStart(2,"0")}
                            </b>
                            <em>DIAS</em>
                          </span>

                          <span>
                            <b>
                              {String(clock.hours)
                                .padStart(2,"0")}
                            </b>
                            <em>HORAS</em>
                          </span>

                          <span>
                            <b>
                              {String(clock.minutes)
                                .padStart(2,"0")}
                            </b>
                            <em>MIN</em>
                          </span>

                          <span>
                            <b>
                              {String(clock.seconds)
                                .padStart(2,"0")}
                            </b>
                            <em>SEG</em>
                          </span>

                        </div>
                      )
                      :(
                        <strong>
                          VENDAS EM ANDAMENTO
                        </strong>
                      )
                    }

                  </div>

                  <button
                    disabled={
                      soldOut||
                      unavailable||
                      buying
                    }
                    onClick={()=>
                      buy(current,lot)
                    }
                  >
                    {soldOut
                      ?"Lote esgotado"
                      :unavailable
                        ?"Lote indisponivel"
                        :buying
                          ?"Processando..."
                          :"Comprar ingresso"}
                  </button>

                </article>
              );
            })}

          </div>
        </section>

        <section className="nev33-flow">

          <span className="nev33-eyebrow">
            NEXUS AUTOMATION
          </span>

          <h2>
            Você compra. O NEXUS cuida do restante.
          </h2>

          <div className="nev33-flow-grid">

            <article>
              <b>01</b>
              <strong>Pagamento</strong>
              <p>
                Compra online integrada ao evento.
              </p>
            </article>

            <article>
              <b>02</b>
              <strong>Emissão</strong>
              <p>
                Confirmação gera os ingressos automaticamente.
              </p>
            </article>

            <article>
              <b>03</b>
              <strong>Carteira</strong>
              <p>
                Seus ingressos ficam reunidos em um único lugar.
              </p>
            </article>

            <article>
              <b>04</b>
              <strong>Entrada</strong>
              <p>
                QR individual validado pelo NEXUS Gate.
              </p>
            </article>

          </div>
        </section>

        {error&&(
          <div className="nev33-error">
            {error}
          </div>
        )}

        <footer className="nev33-footer">
          <strong>NEXUS EVENT EXPERIENCE</strong>
          <span>
            Commerce • Wallet • Access • Intelligence
          </span>
        </footer>

      </main>
    );
  }

  return(
    <main className="nev33-shell">

      <header className="nev33-header">
        <div className="nev33-brand">
          <b>N</b>
          <span>
            NEXUS
            <small>EVENT EXPERIENCE</small>
          </span>
        </div>

        <a
          href="/meus-ingressos"
          className="nev33-wallet-link"
        >
          Meus ingressos
        </a>
      </header>

      <section className="nev33-list-hero">
        <span className="nev33-eyebrow">
          PRÓXIMAS EXPERIÊNCIAS
        </span>
        <h1>
          O próximo evento começa aqui.
        </h1>
        <p>
          Escolha sua experiência, compre seu ingresso
          e deixe o NEXUS cuidar do restante.
        </p>
      </section>

      {error&&(
        <div className="nev33-error">
          {error}
        </div>
      )}

      <section className="nev33-event-list">

        {!events.length&&(
          <div className="nev33-empty">
            Nenhum evento disponível neste momento.
          </div>
        )}

        {events.map(event=>(
          <a
            key={event.id}
            href={`/eventos/${event.id}`}
            className="nev33-event-card"
          >
            <span>
              {date(event.starts_at)}
            </span>

            <h2>{event.title}</h2>

            <p>
              {event.venue_name||
               "Local a confirmar"}
            </p>

            <strong>
              Ver evento →
            </strong>
          </a>
        ))}

      </section>

    </main>
  );
}

