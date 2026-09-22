import React,{
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import jsQR from "jsqr";

import {api} from "./api";

function dt(value){

  if(!value)return "—";

  try{
    return new Date(value)
      .toLocaleString("pt-BR");
  }catch{
    return value;
  }
}

function tone(result){

  if(result==="ALLOWED"){
    return "allowed";
  }

  if(result==="DUPLICATE"){
    return "duplicate";
  }

  return "denied";
}

function label(result){

  if(result==="ALLOWED"){
    return "ENTRADA LIBERADA";
  }

  if(result==="DUPLICATE"){
    return "INGRESSO JÁ UTILIZADO";
  }

  if(result==="PAYMENT_PENDING"){
    return "PAGAMENTO PENDENTE";
  }

  if(result==="INVALID"){
    return "INGRESSO INVÁLIDO";
  }

  if(result==="CAMERA_ERROR"){
    return "CÂMERA NÃO DISPONÍVEL";
  }

  return "ACESSO NEGADO";
}

function beep(result){

  try{

    const AudioContext=
      window.AudioContext||
      window.webkitAudioContext;

    if(!AudioContext)return;

    const ctx=new AudioContext();
    const oscillator=
      ctx.createOscillator();

    const gain=
      ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type="sine";

    if(result==="ALLOWED"){
      oscillator.frequency.value=880;
    }else if(result==="DUPLICATE"){
      oscillator.frequency.value=520;
    }else{
      oscillator.frequency.value=220;
    }

    gain.gain.setValueAtTime(
      .07,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      .001,
      ctx.currentTime+.20
    );

    oscillator.start();
    oscillator.stop(
      ctx.currentTime+.21
    );

  }catch{}
}

export default function GateScannerV25(){

  const[code,setCode]=useState("");
  const[result,setResult]=useState(null);
  const[busy,setBusy]=useState(false);

  const[camera,setCamera]=useState(false);
  const[continuous,setContinuous]=useState(true);

  const[events,setEvents]=useState([]);
  const[eventId,setEventId]=useState("");

  const[query,setQuery]=useState("");
  const[search,setSearch]=useState([]);
  const[searching,setSearching]=useState(false);

  const[session,setSession]=useState({
    allowed:0,
    duplicate:0,
    denied:0,
    total:0
  });

  const[lastAccess,setLastAccess]=useState([]);

  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const scanningRef=useRef(false);
  const lastCodeRef=useRef("");
  const lastReadRef=useRef(0);

  const state=
    result
      ?tone(result.result)
      :"idle";

  const activeEvent=
    useMemo(
      ()=>
        events.find(
          row=>
            String(row.id)===
            String(eventId)
        )||null,
      [events,eventId]
    );

  useEffect(()=>{

    let alive=true;

    async function loadEvents(){

      try{

        const rows=
          await api.ticketEvents();

        if(!alive)return;

        const list=
          Array.isArray(rows)
            ?rows
            :Array.isArray(rows?.events)
              ?rows.events
              :[];

        setEvents(list);

        if(list.length){
          setEventId(
            current=>
              current||
              String(list[0].id)
          );
        }

      }catch(error){

        console.error(
          "NEXUS GATE EVENTS",
          error
        );
      }
    }

    loadEvents();

    return()=>{
      alive=false;
    };

  },[]);

  function registerSession(response){

    const r=response?.result;

    setSession(current=>({

      allowed:
        current.allowed+
        (r==="ALLOWED"?1:0),

      duplicate:
        current.duplicate+
        (r==="DUPLICATE"?1:0),

      denied:
        current.denied+
        (
          r!=="ALLOWED" &&
          r!=="DUPLICATE"
            ?1
            :0
        ),

      total:
        current.total+1
    }));

    setLastAccess(current=>[
      {
        result:r,
        code:
          response?.ticket?.ticket_code||
          code||
          "—",
        attendee:
          response?.ticket?.attendee_name||
          "—",
        at:new Date().toISOString()
      },
      ...current
    ].slice(0,8));
  }

  async function validate(rawCode){

    const normalized=
      String(rawCode||"")
        .trim()
        .toUpperCase();

    if(!normalized || busy){
      return;
    }

    setBusy(true);

    try{

      const response=
        await api.checkinV25(
          normalized
        );

      setResult(response);
      setCode("");

      beep(response?.result);
      registerSession(response);

      window.dispatchEvent(
        new CustomEvent(
          "nexus:gate-intelligence",
          {
            detail:response
          }
        )
      );

    }catch(error){

      const response={
        ok:false,
        result:"ERROR",
        message:
          error.message||
          "Falha ao validar ingresso."
      };

      setResult(response);
      beep("ERROR");
      registerSession(response);

    }finally{

      setBusy(false);

      if(
        continuous &&
        streamRef.current
      ){
        scanningRef.current=true;
      }
    }
  }

  function stopCamera(){

    scanningRef.current=false;

    if(streamRef.current){

      streamRef.current
        .getTracks()
        .forEach(
          track=>track.stop()
        );
    }

    streamRef.current=null;
    setCamera(false);
  }

  async function startCamera(){

    if(
      !navigator.mediaDevices?.
        getUserMedia
    ){

      setResult({
        ok:false,
        result:"CAMERA_ERROR",
        message:
          "Nenhuma câmera disponível neste dispositivo. Use a busca ou digite o código do ingresso."
      });

      return;
    }

    /*
     * NEXUS_QR_SCANNER_UNIVERSAL_V2
     * Scanner hibrido:
     * BarcodeDetector nativo quando disponivel;
     * jsQR quando o navegador nao possui BarcodeDetector.
     */
    const hasNativeBarcodeDetector=
      typeof window.BarcodeDetector!=="undefined";

    try{

      const stream=
        await navigator.mediaDevices
          .getUserMedia({
            video:{
              facingMode:{
                ideal:"environment"
              }
            },
            audio:false
          });

      streamRef.current=stream;
      setCamera(true);

      await new Promise(
        resolve=>
          setTimeout(resolve,150)
      );

      if(videoRef.current){

        videoRef.current.srcObject=
          stream;

        await videoRef.current.play();
      }

      const detector=
        hasNativeBarcodeDetector
          ?new window.BarcodeDetector({
              formats:["qr_code"]
            })
          :null;

      const qrCanvas=
        document.createElement("canvas");

      const qrContext=
        qrCanvas.getContext(
          "2d",
          {
            willReadFrequently:true
          }
        );

      scanningRef.current=true;

      const scan=async()=>{

        if(
          !scanningRef.current ||
          !videoRef.current
        ){
          return;
        }

        try{

          let raw="";

          if(detector){

            const codes=
              await detector.detect(
                videoRef.current
              );

            raw=
              codes?.[0]?.rawValue||
              "";

          }else{

            const video=
              videoRef.current;

            const width=
              video.videoWidth;

            const height=
              video.videoHeight;

            if(
              width>0 &&
              height>0 &&
              qrContext
            ){

              if(
                qrCanvas.width!==width ||
                qrCanvas.height!==height
              ){
                qrCanvas.width=width;
                qrCanvas.height=height;
              }

              qrContext.drawImage(
                video,
                0,
                0,
                width,
                height
              );

              const frame=
                qrContext.getImageData(
                  0,
                  0,
                  width,
                  height
                );

              const decoded=
                jsQR(
                  frame.data,
                  frame.width,
                  frame.height,
                  {
                    inversionAttempts:
                      "attemptBoth"
                  }
                );

              raw=
                decoded?.data||
                "";
            }
          }

          if(raw){

            const now=Date.now();

            /*
             * Anti-double-read:
             * same QR ignored for 2.5 seconds.
             */
            if(
              raw===lastCodeRef.current &&
              now-lastReadRef.current<2500
            ){

              requestAnimationFrame(scan);
              return;
            }

            lastCodeRef.current=raw;
            lastReadRef.current=now;

            scanningRef.current=false;

            setCode(raw);

            await validate(raw);

            if(
              continuous &&
              streamRef.current
            ){

              setTimeout(
                ()=>{
                  scanningRef.current=true;
                  requestAnimationFrame(scan);
                },
                650
              );

              return;
            }

            stopCamera();
            return;
          }

        }catch{
          // scanner permanece ativo
        }

        if(scanningRef.current){
          requestAnimationFrame(scan);
        }
      };

      requestAnimationFrame(scan);

    }catch(error){

      stopCamera();

      /*
       * NEXUS_CAMERA_ERROR_FIX_V2
       *
       * Este catch pertence exclusivamente
       * à abertura da câmera.
       */

      const cameraErrorName=
        String(error?.name||"");

      const cameraErrorMessage=
        String(error?.message||"");

      let cameraMessage=
        cameraErrorMessage||
        "Não foi possível iniciar a câmera.";

      if(
        cameraErrorName==="NotFoundError" ||
        /requested device not found/i.test(
          cameraErrorMessage
        ) ||
        /device not found/i.test(
          cameraErrorMessage
        )
      ){

        cameraMessage=
          "Nenhuma câmera disponível neste dispositivo. Use a busca ou digite o código do ingresso.";

      }else if(
        cameraErrorName==="NotAllowedError" ||
        cameraErrorName==="PermissionDeniedError"
      ){

        cameraMessage=
          "Acesso à câmera não autorizado. Libere a permissão da câmera no navegador e tente novamente.";

      }else if(
        cameraErrorName==="NotReadableError" ||
        /could not start video source/i.test(
          cameraErrorMessage
        )
      ){

        cameraMessage=
          "A câmera está sendo utilizada por outro aplicativo ou não pôde ser iniciada.";

      }else if(
        cameraErrorName==="OverconstrainedError"
      ){

        cameraMessage=
          "A câmera disponível não atende à configuração solicitada. Tente novamente.";
      }

      setResult({
        ok:false,
        result:"CAMERA_ERROR",
        message:cameraMessage
      });
    }
  }

  async function runSearch(){

    if(
      !eventId ||
      !query.trim()
    ){
      setSearch([]);
      return;
    }

    setSearching(true);

    try{

      const rows=
        await api.ticketSearchV25(
          eventId,
          query.trim()
        );

      setSearch(
        Array.isArray(rows)
          ?rows
          :[]
      );

    }catch(error){

      setResult({
        ok:false,
        result:"ERROR",
        message:
          error.message||
          "Falha na busca."
      });
    }finally{
      setSearching(false);
    }
  }

  async function validateSearchTicket(ticket){

    if(!ticket?.ticket_code){
      return;
    }

    setQuery("");
    setSearch([]);

    await validate(
      ticket.ticket_code
    );
  }

  useEffect(
    ()=>{
      return()=>{
        stopCamera();
      };
    },
    []
  );

  return(
    <section
      className={
        `nexus-gate-v25 nexus-gate-v36 ${state}`
      }
    >

      <div className="gate36-top">

        <div className="gate36-brand">

          <span>
            NEXUS EVENT EXPERIENCE
          </span>

          <h2>
            Gate Intelligence
          </h2>

          <p>
            Controle inteligente de entrada,
            QR individual e proteção contra
            reutilização.
          </p>

        </div>

        <div className="gate36-live">
          <i/>
          PORTARIA ONLINE
        </div>

      </div>

      <div className="gate36-event">

        <div>

          <small>EVENTO EM OPERAÇÃO</small>

          <select
            value={eventId}
            onChange={event=>{
              setEventId(
                event.target.value
              );
              setSearch([]);
              setQuery("");
            }}
          >

            {!events.length&&(
              <option value="">
                Nenhum evento
              </option>
            )}

            {events.map(event=>(
              <option
                key={event.id}
                value={event.id}
              >
                {event.title||
                 `Evento #${event.id}`}
              </option>
            ))}

          </select>

        </div>

        {activeEvent&&(
          <div className="gate36-event-name">
            <span>ATIVO</span>
            <strong>
              {activeEvent.title}
            </strong>
          </div>
        )}

      </div>

      <div className="gate36-kpis">

        <article>
          <span>LIBERADOS</span>
          <strong>
            {session.allowed}
          </strong>
        </article>

        <article>
          <span>DUPLICADOS</span>
          <strong>
            {session.duplicate}
          </strong>
        </article>

        <article>
          <span>BLOQUEADOS</span>
          <strong>
            {session.denied}
          </strong>
        </article>

        <article>
          <span>LEITURAS</span>
          <strong>
            {session.total}
          </strong>
        </article>

      </div>

      <div className="gate36-workspace">

        <div className="gate36-scanner">

          <div className="gate36-section-title">
            <div>
              <small>ENTRADA PRINCIPAL</small>
              <h3>Leitor de ingresso</h3>
            </div>

            <label className="gate36-continuous">
              <input
                type="checkbox"
                checked={continuous}
                onChange={event=>
                  setContinuous(
                    event.target.checked
                  )
                }
              />
              Leitura contínua
            </label>
          </div>

          <div className="gate-v25-controls">

            <input
              value={code}
              autoComplete="off"
              placeholder="Código do ingresso"
              onChange={event=>
                setCode(
                  event.target.value
                )
              }
              onKeyDown={event=>{
                if(event.key==="Enter"){
                  validate(code);
                }
              }}
            />

            <button
              disabled={busy}
              onClick={()=>
                validate(code)
              }
            >
              {busy
                ?"VALIDANDO..."
                :"VALIDAR"}
            </button>

            {!camera
              ?(
                <button
                  className="secondary"
                  onClick={startCamera}
                >
                  ABRIR CÂMERA
                </button>
              )
              :(
                <button
                  className="secondary"
                  onClick={stopCamera}
                >
                  FECHAR CÂMERA
                </button>
              )
            }

          </div>

          {camera&&(
            <div className="gate-v25-camera gate36-camera">

              <video
                ref={videoRef}
                playsInline
                muted
              />

              <div className="gate-v25-frame"/>

              <div className="gate36-camera-label">
                POSICIONE O QR CODE
              </div>

            </div>
          )}

          {result&&(
            <div
              className={
                `gate-v25-result gate36-result ${state}`
              }
            >

              <div className="gate36-result-icon">
                {result.result==="ALLOWED"
                  ?"✓"
                  :result.result==="DUPLICATE"
                    ?"!"
                    :"×"}
              </div>

              <strong>
                {label(result.result)}
              </strong>

              <p>
                {result.message}
              </p>

              {result.ticket&&(
                <div className="gate-v25-ticket">

                  <div>
                    <span>Participante</span>
                    <b>
                      {result.ticket.attendee_name||
                       "—"}
                    </b>
                  </div>

                  <div>
                    <span>Ingresso</span>
                    <b>
                      {result.ticket.ticket_type||
                       result.ticket.lot_name||
                       "—"}
                    </b>
                  </div>

                  <div>
                    <span>Código</span>
                    <b>
                      {result.ticket.ticket_code||
                       "—"}
                    </b>
                  </div>

                  <div>
                    <span>Pagamento</span>
                    <b>
                      {result.ticket.payment_status||
                       "—"}
                    </b>
                  </div>

                  <div>
                    <span>Evento</span>
                    <b>
                      {result.ticket.event_title||
                       "—"}
                    </b>
                  </div>

                  <div>
                    <span>Check-in</span>
                    <b>
                      {dt(
                        result.ticket.checkin_at
                      )}
                    </b>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

        <aside className="gate36-contingency">

          <div className="gate36-section-title">
            <div>
              <small>CONTINGÊNCIA</small>
              <h3>Localizar ingresso</h3>
            </div>
          </div>

          <p>
            Sem QR? Localize o cliente por
            nome, telefone, e-mail ou código.
          </p>

          <div className="gate36-search">

            <input
              value={query}
              placeholder="Buscar participante..."
              onChange={event=>
                setQuery(
                  event.target.value
                )
              }
              onKeyDown={event=>{
                if(event.key==="Enter"){
                  runSearch();
                }
              }}
            />

            <button
              onClick={runSearch}
              disabled={
                searching||
                !eventId
              }
            >
              {searching
                ?"BUSCANDO..."
                :"BUSCAR"}
            </button>

          </div>

          {!!search.length&&(
            <div className="gate36-search-results">

              {search.map(ticket=>(

                <button
                  key={
                    ticket.id||
                    ticket.ticket_code
                  }
                  onClick={()=>
                    validateSearchTicket(
                      ticket
                    )
                  }
                >

                  <div>
                    <strong>
                      {ticket.attendee_name||
                       "Participante"}
                    </strong>

                    <span>
                      {ticket.ticket_code}
                    </span>
                  </div>

                  <em>
                    {ticket.checkin_at
                      ?"UTILIZADO"
                      :"VALIDAR"}
                  </em>

                </button>

              ))}

            </div>
          )}

          {query &&
           !searching &&
           !search.length&&(
            <small className="gate36-empty">
              Nenhum resultado exibido.
            </small>
          )}

          <div className="gate36-history">

            <div className="gate36-section-title">
              <div>
                <small>SESSÃO ATUAL</small>
                <h3>Últimas leituras</h3>
              </div>
            </div>

            {!lastAccess.length&&(
              <span className="gate36-empty">
                Aguardando primeiro ingresso.
              </span>
            )}

            {lastAccess.map(
              (item,index)=>(
                <article
                  key={
                    `${item.at}-${index}`
                  }
                  className={
                    tone(item.result)
                  }
                >

                  <i/>

                  <div>
                    <strong>
                      {item.attendee}
                    </strong>
                    <span>
                      {item.code}
                    </span>
                  </div>

                  <b>
                    {item.result}
                  </b>

                </article>
              )
            )}

          </div>

        </aside>

      </div>

      <footer className="gate36-footer">
        <span>
          NEXUS GATE INTELLIGENCE V3.6
        </span>

        <span>
          QR • CHECK-IN • CONTINGÊNCIA • AUDITORIA
        </span>
      </footer>

    </section>
  );
}
