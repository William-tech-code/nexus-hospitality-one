import React,{useEffect,useState}from'react';
import{api}from'./api.js';
import'./CustomerTicketPortalV25.css';

const SESSION_KEY='nexus_ticket_customer_session';

const money=v=>
 Number(v||0).toLocaleString(
  'pt-BR',
  {
   style:'currency',
   currency:'BRL'
  }
 );

function dateBR(v){
 if(!v)return 'Data a confirmar';

 const d=new Date(v);

 if(Number.isNaN(d.getTime())){
  return String(v);
 }

 return d.toLocaleString(
  'pt-BR',
  {
   timeZone:'America/Sao_Paulo',
   dateStyle:'long',
   timeStyle:'short'
  }
 );
}

export default function CustomerTicketPortalV25({
 token
}){

 const[portal,setPortal]=useState(null);
 const[wallet,setWallet]=useState(null);
 const[session,setSession]=useState(
  ()=>localStorage.getItem(SESSION_KEY)||''
 );
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[mode,setMode]=useState('claim');

 const[form,setForm]=useState({
  full_name:'',
  document:'',
  email:'',
  phone:'',
  birth_date:''
 });

 async function loadWallet(activeSession=session){

  if(!activeSession)return false;

  try{

   const data=
    await api.customerWallet(
     activeSession
    );

   setWallet(data);
   setMode('wallet');
   setError('');

   return true;

  }catch{

   localStorage.removeItem(
    SESSION_KEY
   );

   setSession('');
   setWallet(null);

   return false;
  }
 }

 useEffect(()=>{

  let active=true;

  async function boot(){

   setLoading(true);

   if(session){

    const ok=
     await loadWallet(session);

    if(ok){
     if(active)setLoading(false);
     return;
    }
   }

   try{

    const data=
     await api.publicMyTicket(token);

    if(!active)return;

    setPortal(data);

    setForm({
     full_name:
      data.order?.buyer_name||'',
     document:
      data.order?.buyer_document||'',
     email:
      data.order?.buyer_email||'',
     phone:
      data.order?.buyer_phone||'',
     birth_date:''
    });

    setMode('claim');

   }catch(e){

    if(active){
     setError(
      e.message ||
      'Ingresso nao encontrado.'
     );
    }
   }finally{

    if(active)setLoading(false);
   }
  }

  boot();

  return()=>{
   active=false;
  };

 },[token]);

 async function claim(){

  if(busy)return;

  if(!form.full_name.trim()){
   setError(
    'Informe seu nome completo.'
   );
   return;
  }

  if(
   String(form.document)
    .replace(/\D/g,'')
    .length!==11
  ){
   setError(
    'Informe um CPF valido.'
   );
   return;
  }

  if(!form.email.includes('@')){
   setError(
    'Informe um e-mail valido.'
   );
   return;
  }

  if(
   String(form.phone)
    .replace(/\D/g,'')
    .length<10
  ){
   setError(
    'Informe seu WhatsApp.'
   );
   return;
  }

  if(!form.birth_date){
   setError(
    'Informe sua data de nascimento.'
   );
   return;
  }

  setBusy(true);
  setError('');

  try{

   const result=
    await api.customerClaimTicket(
     token,
     form
    );

   localStorage.setItem(
    SESSION_KEY,
    result.session
   );

   setSession(result.session);

   await loadWallet(
    result.session
   );

  }catch(e){

   setError(
    e.message ||
    'Nao foi possivel concluir o cadastro.'
   );

  }finally{

   setBusy(false);
  }
 }

 async function logout(){

  try{
   if(session){
    await api.customerLogout(session);
   }
  }catch{}

  localStorage.removeItem(
   SESSION_KEY
  );

  setSession('');
  setWallet(null);
  setMode('claim');
 }

 if(loading){

  return(
   <main className="nexus-ticket-portal">
    <div className="ticket-loading">
     <div className="ticket-orb">N</div>
     <span>NEXUS HOSPITALITY ONE</span>
     <h1>Preparando sua carteira</h1>
    </div>
   </main>
  );
 }

 if(error&&!portal&&!wallet){

  return(
   <main className="nexus-ticket-portal">
    <div className="ticket-error-card">
     <div className="ticket-orb">N</div>
     <span>ACESSO SEGURO</span>
     <h1>Ingresso nao encontrado</h1>
     <p>{error}</p>
    </div>
   </main>
  );
 }

 if(mode==='claim'&&portal){

  const event=portal.event||{};

  return(
   <main className="nexus-ticket-portal">

    <header className="ticket-public-header">
     <div className="ticket-brand-mark">N</div>
     <div>
      <span>NEXUS HOSPITALITY ONE</span>
      <strong>Minha Carteira</strong>
     </div>
    </header>

    <section className="ticket-event-hero">
     <span className="ticket-eyebrow">
      SEU INGRESSO ESTA PRONTO
     </span>

     <h1>{event.title||'Evento'}</h1>

     <p>
      Complete seu cadastro uma unica vez
      para guardar este e seus proximos
      ingressos.
     </p>

     <div className="ticket-event-meta">
      <div>
       <small>EVENTO</small>
       <strong>
        {dateBR(event.starts_at)}
       </strong>
      </div>

      <div>
       <small>PEDIDO</small>
       <strong>
        {portal.order?.order_code}
       </strong>
      </div>

      <div>
       <small>INGRESSOS</small>
       <strong>
        {portal.tickets?.length||0}
       </strong>
      </div>
     </div>
    </section>

    <section className="customer-claim-card">

     <span className="ticket-eyebrow">
      PRIMEIRO ACESSO
     </span>

     <h2>Crie sua carteira NEXUS</h2>

     <p>
      Seus dados vinculam este ingresso
      a sua conta pessoal.
     </p>

     <div className="customer-form-grid">

      <label>
       NOME COMPLETO
       <input
        value={form.full_name}
        onChange={e=>
         setForm({
          ...form,
          full_name:e.target.value
         })
        }
       />
      </label>

      <label>
       CPF
       <input
        inputMode="numeric"
        value={form.document}
        onChange={e=>
         setForm({
          ...form,
          document:e.target.value
         })
        }
       />
      </label>

      <label>
       E-MAIL
       <input
        type="email"
        value={form.email}
        onChange={e=>
         setForm({
          ...form,
          email:e.target.value
         })
        }
       />
      </label>

      <label>
       WHATSAPP
       <input
        inputMode="tel"
        value={form.phone}
        onChange={e=>
         setForm({
          ...form,
          phone:e.target.value
         })
        }
       />
      </label>

      <label>
       DATA DE NASCIMENTO
       <input
        type="date"
        value={form.birth_date}
        onChange={e=>
         setForm({
          ...form,
          birth_date:e.target.value
         })
        }
       />
      </label>

     </div>

     {error&&(
      <div className="customer-wallet-error">
       {error}
      </div>
     )}

     <button
      className="customer-wallet-primary"
      disabled={busy}
      onClick={claim}
     >
      {busy
       ?'CRIANDO MINHA CARTEIRA...'
       :'CADASTRAR E VER MEUS INGRESSOS'}
     </button>

     <small className="customer-security-note">
      Seus ingressos permanecem vinculados
      ao mesmo pedido e ao mesmo QR Code.
     </small>

    </section>

   </main>
  );
 }

 const customer=wallet?.customer||{};
 const tickets=wallet?.tickets||[];

 return(
  <main className="nexus-ticket-portal">

   <header className="ticket-public-header wallet-header">

    <div className="ticket-brand-mark">
     N
    </div>

    <div>
     <span>NEXUS HOSPITALITY ONE</span>
     <strong>Meus Ingressos</strong>
    </div>

    <button
     className="wallet-logout"
     onClick={logout}
    >
     SAIR
    </button>

   </header>

   <section className="wallet-welcome">

    <span className="ticket-eyebrow">
     MINHA CARTEIRA
    </span>

    <h1>
     Ola, {customer.full_name?.split(' ')[0]||'Cliente'}.
    </h1>

    <p>
     Todos os seus ingressos em um unico lugar.
    </p>

    <div className="wallet-actions">

     <a href="/eventos">
      COMPRAR OUTRO INGRESSO
     </a>

     <span>
      {tickets.length}
      {' '}
      ingresso(s)
     </span>

    </div>

   </section>

   <section className="ticket-public-list">

    {tickets.length===0&&(
     <div className="wallet-empty">
      <h2>Nenhum ingresso encontrado.</h2>
      <a href="/eventos">
       Ver eventos disponiveis
      </a>
     </div>
    )}

    {tickets.map(ticket=>{

     const used=
      ticket.access_status==='USED';

     return(
      <article
       className={
        `ticket-digital-card ${used?'used':'valid'}`
       }
       key={ticket.id}
      >

       <div className="ticket-status-row">

        <div>
         <small>STATUS</small>
         <strong className="ticket-status">
          {used
           ?'UTILIZADO'
           :'VALIDO PARA ENTRADA'}
         </strong>
        </div>

        <span className="ticket-security">
         {used
          ?'ACESSO REGISTRADO'
          :'QR SEGURO'}
        </span>

       </div>

       <div className="ticket-main-grid">

        <div className="ticket-info">

         <span>
          {ticket.event_title||'EVENTO'}
         </span>

         <h2>
          {ticket.event_title||ticket.ticket_type}
         </h2>

         <p>
          {dateBR(ticket.starts_at)}
          <br/>
          {ticket.venue_name||'Local a confirmar'}
         </p>

         <div className="ticket-code-box">
          <small>CODIGO DO INGRESSO</small>
          <strong>
           {ticket.ticket_code}
          </strong>
         </div>

         <div className="ticket-details">

          <div>
           <small>LOTE</small>
           <b>
            {ticket.lot_name||
             ticket.ticket_type||
             'Ingresso'}
           </b>
          </div>

          <div>
           <small>VALOR</small>
           <b>
            {money(ticket.price)}
           </b>
          </div>

         </div>

        </div>

        <div className="ticket-qr-area">

         {ticket.qr_image&&(
          <img
           src={ticket.qr_image}
           alt={`QR Code ${ticket.ticket_code}`}
          />
         )}

         <small>
          {used
           ?'Este ingresso ja teve seu acesso registrado.'
           :'Apresente este QR Code na entrada do evento.'}
         </small>

        </div>

       </div>

      </article>
     );
    })}

   </section>

   <footer className="ticket-public-footer">
    <div className="ticket-brand-mark small">
     N
    </div>
    <p>
     Carteira digital protegida pela
     <strong> NEXUS Hospitality One</strong>.
    </p>
   </footer>

  </main>
 );
}
