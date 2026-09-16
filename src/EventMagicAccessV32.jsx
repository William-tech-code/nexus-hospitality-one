import React,{
  useEffect,
  useState
} from "react";

const SESSION_KEY=
  "nexus_ticket_customer_session";

export default function EventMagicAccessV32({
  token
}){

  const [state,setState]=useState({
    status:"loading",
    message:
      "Validando seu acesso seguro..."
  });

  useEffect(()=>{

    let alive=true;

    async function open(){

      try{

        if(
          !token ||
          !/^[a-f0-9]{64}$/i.test(token)
        ){
          throw new Error(
            "LINK_INVALIDO"
          );
        }

        const response=await fetch(
          "/api/public/event-experience/access",
          {
            method:"POST",
            headers:{
              "Content-Type":
                "application/json"
            },
            body:JSON.stringify({
              token
            })
          }
        );

        const data=
          await response.json()
            .catch(()=>({}));

        if(!response.ok){
          throw new Error(
            data?.error ||
            "ACCESS_FAILED"
          );
        }

        if(
          !data?.session ||
          !/^[a-f0-9]{64}$/i.test(
            data.session
          )
        ){
          throw new Error(
            "SESSION_INVALID"
          );
        }

        localStorage.setItem(
          SESSION_KEY,
          data.session
        );

        if(!alive)return;

        setState({
          status:"success",
          message:
            "Ingressos encontrados. Abrindo sua carteira..."
        });

        window.setTimeout(()=>{
          window.location.replace(
            data.redirect ||
            "/meus-ingressos"
          );
        },650);

      }catch(error){

        if(!alive)return;

        setState({
          status:"error",
          message:
            error?.message ===
            "LINK_INVALIDO"
              ? "Este link de acesso nao e valido."
              : "Nao foi possivel abrir seus ingressos."
        });
      }
    }

    open();

    return()=>{
      alive=false;
    };

  },[token]);

  return(
    <main style={{
      minHeight:"100vh",
      display:"grid",
      placeItems:"center",
      padding:"24px",
      background:
        "linear-gradient(145deg,#080a0d,#11151b)",
      color:"#fff",
      fontFamily:
        "Inter,system-ui,sans-serif"
    }}>
      <section style={{
        width:"min(520px,100%)",
        padding:"36px",
        borderRadius:"28px",
        background:
          "rgba(255,255,255,.06)",
        border:
          "1px solid rgba(255,255,255,.12)",
        boxShadow:
          "0 30px 80px rgba(0,0,0,.35)"
      }}>

        <div style={{
          fontSize:"12px",
          letterSpacing:"2px",
          opacity:.65,
          marginBottom:"12px"
        }}>
          NEXUS EVENT EXPERIENCE
        </div>

        <h1 style={{
          margin:"0 0 12px",
          fontSize:"32px"
        }}>
          Meus Ingressos
        </h1>

        <p style={{
          margin:0,
          lineHeight:1.6,
          opacity:.8
        }}>
          {state.message}
        </p>

        {state.status==="loading" && (
          <div style={{
            marginTop:"28px",
            height:"4px",
            borderRadius:"999px",
            background:
              "rgba(255,255,255,.12)",
            overflow:"hidden"
          }}>
            <div style={{
              width:"55%",
              height:"100%",
              background:"#fff",
              borderRadius:"999px"
            }}/>
          </div>
        )}

        {state.status==="error" && (
          <button
            onClick={()=>
              window.location.href="/eventos"
            }
            style={{
              marginTop:"26px",
              border:0,
              borderRadius:"14px",
              padding:"14px 20px",
              fontWeight:700,
              cursor:"pointer"
            }}
          >
            Voltar para eventos
          </button>
        )}

      </section>
    </main>
  );
}
