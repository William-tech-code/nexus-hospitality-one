import React,{
  useEffect,
  useRef,
  useState
} from "react";

const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

export default function EventPaymentTrackerV35({
  order,
  onError
}){

  const[status,setStatus]=
    useState(
      order?.payment_status||
      "PENDING"
    );

  const[tracking,setTracking]=
    useState("");

  const[walletUrl,setWalletUrl]=
    useState("");

  const[ticketsCount,setTicketsCount]=
    useState(0);

  const[seconds,setSeconds]=
    useState(0);

  const started=
    useRef(false);

  useEffect(()=>{

    if(
      !order?.order_code ||
      !order?.asaas_payment_id ||
      started.current
    ){
      return;
    }

    started.current=true;

    let alive=true;
    let timer=null;

    async function start(){

      try{

        const init=
          await fetch(
            `/api/public/ticket-orders/${encodeURIComponent(order.order_code)}/tracking`,
            {
              method:"POST",
              headers:{
                "Content-Type":
                  "application/json"
              },
              body:JSON.stringify({
                payment_id:
                  order.asaas_payment_id
              })
            }
          );

        const initData=
          await init.json();

        if(!init.ok){
          throw new Error(
            initData?.error||
            "PAYMENT_TRACKING_INIT_FAILED"
          );
        }

        if(!alive)return;

        setTracking(
          initData.tracking_token
        );

        async function poll(){

          try{

            const response=
              await fetch(
                `/api/public/ticket-orders/${encodeURIComponent(order.order_code)}/payment-status`,
                {
                  headers:{
                    "x-nexus-ticket-tracking":
                      initData.tracking_token
                  }
                }
              );

            const data=
              await response.json();

            if(!response.ok){
              throw new Error(
                data?.error||
                "PAYMENT_STATUS_FAILED"
              );
            }

            if(!alive)return;

            setStatus(
              data?.order?.payment_status||
              "PENDING"
            );

            setTicketsCount(
              Number(
                data?.tickets_count||0
              )
            );

            if(
              data?.paid &&
              data?.wallet_access?.url
            ){

              setWalletUrl(
                data.wallet_access.url
              );

              if(timer){
                clearInterval(timer);
              }
            }

          }catch(error){

            console.error(
              "NEXUS PAYMENT TRACKER",
              error
            );
          }
        }

        await poll();

        timer=
          setInterval(
            poll,
            3000
          );

      }catch(error){

        if(alive && onError){
          onError(error);
        }
      }
    }

    start();

    const clock=
      setInterval(
        ()=>setSeconds(v=>v+1),
        1000
      );

    return()=>{

      alive=false;

      if(timer){
        clearInterval(timer);
      }

      clearInterval(clock);
    };

  },[
    order?.order_code,
    order?.asaas_payment_id,
    onError
  ]);

  if(walletUrl){

    return(
      <section className="nev35-confirmed">

        <div className="nev35-success-orb">
          ✓
        </div>

        <span className="nev33-eyebrow">
          PAGAMENTO CONFIRMADO
        </span>

        <h2>
          Seus ingressos estão prontos.
        </h2>

        <p>
          O pagamento foi identificado,
          {ticketsCount>0
            ?` ${ticketsCount} ingresso${ticketsCount>1?"s foram emitidos":" foi emitido"}`
            :" seus ingressos foram emitidos"}
          {" "}e sua carteira NEXUS já está disponível.
        </p>

        <button
          className="nev35-open-wallet"
          onClick={()=>{
            window.location.href=
              walletUrl;
          }}
        >
          Abrir meus ingressos
        </button>

        <small>
          Acesso seguro • QR individual •
          NEXUS Event Experience
        </small>

      </section>
    );
  }

  return(
    <div className="nev35-monitor">

      <div className="nev35-live">
        <i/>
        MONITORAMENTO ATIVO
      </div>

      <strong>
        {status==="PAID"
          ?"Emitindo seus ingressos..."
          :"Aguardando confirmação do pagamento"}
      </strong>

      <p>
        Não precisa atualizar esta página.
        O NEXUS acompanha o pagamento automaticamente.
      </p>

      <div className="nev35-progress">
        <span/>
      </div>

      <small>
        Verificação automática • {seconds}s
      </small>

      {tracking&&(
        <span className="nev35-secure">
          CONEXÃO SEGURA
        </span>
      )}

    </div>
  );
}
