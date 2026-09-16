import React,{
  useEffect,
  useRef,
  useState
} from 'react';

import {api} from './api.js';
import './TicketsV25.css';

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

function tone(result){
  if(result==='ALLOWED'){
    return 'allowed';
  }

  if(result==='DUPLICATE'){
    return 'duplicate';
  }

  return 'denied';
}

export default function GateScannerV25(){

  const [code,setCode]=useState('');
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [camera,setCamera]=useState(false);

  const videoRef=useRef(null);
  const streamRef=useRef(null);
  const scanningRef=useRef(false);

  async function validate(
    rawCode
  ){

    const normalized=
      String(
        rawCode||code
      )
        .trim()
        .toUpperCase();

    if(!normalized||busy){
      return;
    }

    setBusy(true);

    try{

      const response=
        await api.checkinV25(
          normalized
        );

      setResult(response);

      if(response.ok){
        setCode('');
      }

    }catch(error){

      setResult({
        ok:false,
        result:'ERROR',
        message:
          error.message||
          'Falha ao validar ingresso.'
      });

    }finally{

      setBusy(false);
    }
  }

  function stopCamera(){

    scanningRef.current=false;

    if(streamRef.current){

      for(
        const track of
        streamRef.current.getTracks()
      ){
        track.stop();
      }
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
        result:'ERROR',
        message:
          'Camera indisponivel neste dispositivo.'
      });

      return;
    }

    if(
      !('BarcodeDetector' in window)
    ){

      setResult({
        ok:false,
        result:'ERROR',
        message:
          'Leitor QR automatico indisponivel. Digite o codigo do ingresso.'
      });

      return;
    }

    try{

      const stream=
        await navigator.mediaDevices.
          getUserMedia({
            video:{
              facingMode:{
                ideal:'environment'
              }
            },
            audio:false
          });

      streamRef.current=stream;

      setCamera(true);

      await new Promise(
        resolve=>
          setTimeout(
            resolve,
            100
          )
      );

      if(videoRef.current){

        videoRef.current.srcObject=
          stream;

        await videoRef.current.play();
      }

      const detector=
        new BarcodeDetector({
          formats:['qr_code']
        });

      scanningRef.current=true;

      const scan=async()=>{

        if(
          !scanningRef.current ||
          !videoRef.current
        ){
          return;
        }

        try{

          const codes=
            await detector.detect(
              videoRef.current
            );

          if(
            codes?.length &&
            codes[0]?.rawValue
          ){

            const value=
              codes[0].rawValue;

            stopCamera();

            setCode(value);

            await validate(value);

            return;
          }

        }catch{
          // keep scanner alive
        }

        if(scanningRef.current){
          requestAnimationFrame(scan);
        }
      };

      requestAnimationFrame(scan);

    }catch(error){

      stopCamera();

      setResult({
        ok:false,
        result:'ERROR',
        message:
          error.message||
          'Nao foi possivel abrir a camera.'
      });
    }
  }

  useEffect(
    ()=>{
      return ()=>{
        stopCamera();
      };
    },
    []
  );

  const state=
    result
      ? tone(result.result)
      : 'idle';

  return (
    <section
      className={
        `nexus-gate-v25 ${state}`
      }
    >

      <div className="gate-v25-head">
        <div>
          <span>
            NEXUS SMART GATE V2.5
          </span>

          <h2>
            Portaria Inteligente
          </h2>

          <p>
            QR unico, validacao imediata e bloqueio
            automatico contra reutilizacao.
          </p>
        </div>

        <div
          className={
            `gate-v25-light ${state}`
          }
        />
      </div>

      <div className="gate-v25-controls">

        <input
          value={code}
          onChange={
            event=>
              setCode(
                event.target.value
              )
          }
          onKeyDown={
            event=>{
              if(event.key==='Enter'){
                validate();
              }
            }
          }
          placeholder="Codigo do ingresso"
          autoComplete="off"
        />

        <button
          onClick={()=>validate()}
          disabled={busy}
        >
          {busy
            ? 'VALIDANDO...'
            : 'VALIDAR INGRESSO'}
        </button>

        {!camera
          ? (
              <button
                className="secondary"
                onClick={startCamera}
              >
                LER QR CODE
              </button>
            )
          : (
              <button
                className="secondary"
                onClick={stopCamera}
              >
                FECHAR CAMERA
              </button>
            )
        }

      </div>

      {camera&&(
        <div className="gate-v25-camera">
          <video
            ref={videoRef}
            playsInline
            muted
          />
          <div className="gate-v25-frame"/>
        </div>
      )}

      {result&&(
        <div
          className={
            `gate-v25-result ${state}`
          }
        >

          <strong>
            {result.result==='ALLOWED'
              ? 'ACESSO LIBERADO'
              : result.result==='DUPLICATE'
                ? 'INGRESSO JA UTILIZADO'
                : result.result==='PAYMENT_PENDING'
                  ? 'PAGAMENTO PENDENTE'
                  : 'ACESSO NEGADO'}
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
                    '\u2014'}
                </b>
              </div>

              <div>
                <span>Evento</span>
                <b>
                  {result.ticket.event_title||
                    '\u2014'}
                </b>
              </div>

              <div>
                <span>Lote</span>
                <b>
                  {result.ticket.lot_name||
                    result.ticket.ticket_type||
                    '\u2014'}
                </b>
              </div>

              <div>
                <span>Codigo</span>
                <b>
                  {result.ticket.ticket_code}
                </b>
              </div>

              <div>
                <span>Pagamento</span>
                <b>
                  {result.ticket.payment_status}
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

    </section>
  );
}
