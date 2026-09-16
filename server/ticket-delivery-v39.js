import { db } from "./db.js";

const txt = value =>
  String(value ?? "").trim();

const digits = value =>
  txt(value).replace(/\D/g,"");

const sleep = ms =>
  new Promise(resolve=>setTimeout(resolve,ms));

function safeJson(value){

  if(!value)return {};

  try{
    return JSON.parse(value);
  }catch{
    return {};
  }
}

function ensureSchema(){

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_delivery_v39_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id INTEGER,
      ticket_order_id INTEGER,
      channel TEXT NOT NULL,
      destination TEXT,
      provider TEXT,
      result TEXT NOT NULL,
      provider_message_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS
      idx_ticket_delivery_v39_order
    ON ticket_delivery_v39_log(
      ticket_order_id,
      created_at
    );

    CREATE INDEX IF NOT EXISTS
      idx_ticket_delivery_v39_result
    ON ticket_delivery_v39_log(
      result,
      created_at
    );
  `);
}

ensureSchema();

function publicBaseUrl(){

  return txt(
    process.env.NEXUS_PUBLIC_URL ||
    process.env.PUBLIC_URL ||
    process.env.APP_URL
  ).replace(/\/+$/,"");
}

function providerState(){

  return{
    email:{
      provider:"RESEND",
      configured:Boolean(
        txt(process.env.RESEND_API_KEY) &&
        txt(process.env.NEXUS_EMAIL_FROM)
      )
    },

    whatsapp:{
      provider:"META_WHATSAPP_CLOUD",
      configured:Boolean(
        txt(process.env.META_WHATSAPP_TOKEN) &&
        txt(process.env.META_WHATSAPP_PHONE_NUMBER_ID)
      )
    },

    public_url_configured:
      Boolean(publicBaseUrl())
  };
}

function logDelivery({
  source,
  sourceId,
  orderId,
  channel,
  destination,
  provider,
  result,
  providerMessageId=null,
  error=null
}){

  db.prepare(`
    INSERT INTO ticket_delivery_v39_log(
      source,
      source_id,
      ticket_order_id,
      channel,
      destination,
      provider,
      result,
      provider_message_id,
      error
    )
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
    source,
    sourceId || null,
    orderId || null,
    channel,
    destination || null,
    provider || null,
    result,
    providerMessageId || null,
    error || null
  );
}

function orderData(orderId){

  return db.prepare(`
    SELECT
      o.*,
      e.title AS event_title,
      e.starts_at AS event_starts_at,
      e.venue_name AS venue_name
    FROM ticket_orders o
    LEFT JOIN events e
      ON e.id=o.event_id
    WHERE o.id=?
  `).get(orderId);
}

function buildWalletUrl(payload){

  const token=txt(payload?.token);

  if(!token){
    throw new Error(
      "WALLET_MAGIC_TOKEN_NOT_AVAILABLE"
    );
  }

  if(!/^[a-f0-9]{64}$/i.test(token)){
    throw new Error(
      "WALLET_MAGIC_TOKEN_INVALID"
    );
  }

  const base=publicBaseUrl();

  if(!base){
    throw new Error(
      "NEXUS_PUBLIC_URL_NOT_CONFIGURED"
    );
  }

  return(
    base+
    "/acesso-ingressos/"+
    encodeURIComponent(token)
  );
}

function eventDate(value){

  if(!value)return "";

  const date=new Date(value);

  if(Number.isNaN(date.getTime())){
    return txt(value);
  }

  return date.toLocaleString(
    "pt-BR",
    {
      dateStyle:"full",
      timeStyle:"short"
    }
  );
}

async function sendEmail({
  destination,
  order,
  walletUrl
}){

  const apiKey=
    txt(process.env.RESEND_API_KEY);

  const from=
    txt(process.env.NEXUS_EMAIL_FROM);

  if(!apiKey || !from){

    const error=
      new Error(
        "EMAIL_PROVIDER_NOT_CONFIGURED"
      );

    error.code=
      "PROVIDER_NOT_CONFIGURED";

    throw error;
  }

  const eventTitle=
    txt(order?.event_title) ||
    "Evento NEXUS";

  const response=
    await fetch(
      "https://api.resend.com/emails",
      {
        method:"POST",

        headers:{
          "Authorization":
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json"
        },

        body:JSON.stringify({
          from,
          to:[destination],

          subject:
            `Seus ingressos - ${eventTitle}`,

          html:`
            <div style="
              font-family:Arial,sans-serif;
              max-width:640px;
              margin:auto;
              padding:32px;
              background:#0b0d12;
              color:#ffffff;
              border-radius:20px;
            ">
              <div style="
                font-size:12px;
                letter-spacing:2px;
                color:#d6aa4d;
                margin-bottom:12px;
              ">
                NEXUS EVENT EXPERIENCE
              </div>

              <h1 style="
                margin:0 0 14px;
                font-size:28px;
              ">
                Pagamento confirmado
              </h1>

              <p style="
                color:#d6d8df;
                line-height:1.6;
              ">
                Olá,
                ${txt(order?.buyer_name) || "cliente"}.
                Seus ingressos para
                <strong>${eventTitle}</strong>
                já estão disponíveis.
              </p>

              ${
                order?.event_starts_at
                ? `
                  <p style="
                    color:#d6d8df;
                  ">
                    <strong>Data:</strong>
                    ${eventDate(order.event_starts_at)}
                  </p>
                `
                :""
              }

              ${
                order?.venue_name
                ? `
                  <p style="
                    color:#d6d8df;
                  ">
                    <strong>Local:</strong>
                    ${txt(order.venue_name)}
                  </p>
                `
                :""
              }

              <p style="
                color:#d6d8df;
              ">
                <strong>Pedido:</strong>
                ${txt(order?.order_code)}
              </p>

              <div style="
                margin:28px 0;
              ">
                <a
                  href="${walletUrl}"
                  style="
                    display:inline-block;
                    padding:16px 24px;
                    border-radius:12px;
                    background:#d6aa4d;
                    color:#080a0e;
                    text-decoration:none;
                    font-weight:bold;
                  "
                >
                  ABRIR MEUS INGRESSOS
                </a>
              </div>

              <p style="
                font-size:13px;
                color:#9297a5;
                line-height:1.5;
              ">
                O acesso é pessoal.
                Não compartilhe este link.
                Na entrada do evento,
                apresente o QR Code individual
                disponível na sua carteira.
              </p>
            </div>
          `
        })
      }
    );

  const body=
    await response
      .json()
      .catch(()=>({}));

  if(!response.ok){

    throw new Error(
      body?.message ||
      body?.error ||
      `RESEND_HTTP_${response.status}`
    );
  }

  return{
    provider:"RESEND",
    id:
      body?.id ||
      null
  };
}

async function sendWhatsApp({
  destination,
  order,
  walletUrl
}){

  const token=
    txt(
      process.env.META_WHATSAPP_TOKEN
    );

  const phoneNumberId=
    txt(
      process.env
        .META_WHATSAPP_PHONE_NUMBER_ID
    );

  if(!token || !phoneNumberId){

    const error=
      new Error(
        "WHATSAPP_PROVIDER_NOT_CONFIGURED"
      );

    error.code=
      "PROVIDER_NOT_CONFIGURED";

    throw error;
  }

  const phone=
    digits(destination);

  if(phone.length<10){

    throw new Error(
      "WHATSAPP_DESTINATION_INVALID"
    );
  }

  /*
   * Para desenvolvimento usamos mensagem textual.
   *
   * Em produção, fora da janela permitida pela Meta,
   * o canal deverá usar template aprovado.
   * O motor NÃO marcará sucesso se a Meta rejeitar.
   */

  const eventTitle=
    txt(order?.event_title) ||
    "Evento NEXUS";

  const message=[
    "NEXUS EVENT EXPERIENCE",
    "",
    `Pagamento confirmado para ${eventTitle}.`,
    `Pedido: ${txt(order?.order_code)}`,
    "",
    "Seus ingressos já estão disponíveis:",
    walletUrl,
    "",
    "Apresente o QR Code individual na entrada.",
    "Não compartilhe este link."
  ].join("\n");

  const response=
    await fetch(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method:"POST",

        headers:{
          "Authorization":
            `Bearer ${token}`,
          "Content-Type":
            "application/json"
        },

        body:JSON.stringify({
          messaging_product:"whatsapp",
          recipient_type:"individual",
          to:phone,
          type:"text",
          text:{
            preview_url:true,
            body:message
          }
        })
      }
    );

  const body=
    await response
      .json()
      .catch(()=>({}));

  if(!response.ok){

    throw new Error(
      body?.error?.message ||
      `WHATSAPP_HTTP_${response.status}`
    );
  }

  return{
    provider:
      "META_WHATSAPP_CLOUD",

    id:
      body?.messages?.[0]?.id ||
      null
  };
}

async function deliver({
  channel,
  destination,
  order,
  payload
}){

  const walletUrl=
    buildWalletUrl(payload);

  if(channel==="EMAIL"){

    return sendEmail({
      destination,
      order,
      walletUrl
    });
  }

  if(channel==="WHATSAPP"){

    return sendWhatsApp({
      destination,
      order,
      walletUrl
    });
  }

  throw new Error(
    `CHANNEL_NOT_SUPPORTED:${channel}`
  );
}

function notificationTableExists(){

  return Boolean(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE
        type='table'
        AND name='event_experience_notifications'
    `).get()
  );
}

async function processNotification(row){

  const order=
    orderData(
      row.ticket_order_id
    );

  if(!order){

    db.prepare(`
      UPDATE event_experience_notifications
      SET
        status='FAILED',
        attempts=attempts+1,
        last_error=? 
      WHERE id=?
    `).run(
      "TICKET_ORDER_NOT_FOUND",
      row.id
    );

    return{
      ok:false,
      id:row.id,
      error:"TICKET_ORDER_NOT_FOUND"
    };
  }

  if(
    txt(order.payment_status)
      .toUpperCase()!=="PAID"
  ){

    return{
      ok:false,
      skipped:true,
      id:row.id,
      error:"PAYMENT_NOT_CONFIRMED"
    };
  }

  const channel=
    txt(row.channel)
      .toUpperCase();

  const destination=
    txt(row.destination);

  const payload=
    safeJson(row.payload);

  try{

    const sent=
      await deliver({
        channel,
        destination,
        order,
        payload
      });

    db.prepare(`
      UPDATE event_experience_notifications
      SET
        status='SENT',
        attempts=attempts+1,
        last_error=NULL,
        sent_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(row.id);

    logDelivery({
      source:
        "EVENT_EXPERIENCE_NOTIFICATION",
      sourceId:row.id,
      orderId:row.ticket_order_id,
      channel,
      destination,
      provider:sent.provider,
      result:"SENT",
      providerMessageId:sent.id
    });

    return{
      ok:true,
      id:row.id,
      channel,
      provider:sent.provider,
      provider_message_id:sent.id
    };

  }catch(error){

    const code=
      txt(error?.code);

    /*
     * Provider não configurado NÃO é tratado
     * como envio realizado.
     *
     * Mantemos QUEUED para que o job seja
     * retomado automaticamente quando
     * o provedor for configurado.
     */

    if(
      code==="PROVIDER_NOT_CONFIGURED" ||
      txt(error?.message)
        .includes("NEXUS_PUBLIC_URL_NOT_CONFIGURED")
    ){

      db.prepare(`
        UPDATE event_experience_notifications
        SET
          status='QUEUED',
          last_error=?
        WHERE id=?
      `).run(
        txt(error?.message),
        row.id
      );

      logDelivery({
        source:
          "EVENT_EXPERIENCE_NOTIFICATION",
        sourceId:row.id,
        orderId:row.ticket_order_id,
        channel,
        destination,
        provider:
          channel==="EMAIL"
            ?"RESEND"
            :"META_WHATSAPP_CLOUD",
        result:"WAITING_CONFIGURATION",
        error:txt(error?.message)
      });

      return{
        ok:false,
        waiting_configuration:true,
        id:row.id,
        channel,
        error:txt(error?.message)
      };
    }

    db.prepare(`
      UPDATE event_experience_notifications
      SET
        status=
          CASE
            WHEN attempts>=4
            THEN 'FAILED'
            ELSE 'QUEUED'
          END,
        attempts=attempts+1,
        last_error=?
      WHERE id=?
    `).run(
      txt(error?.message) ||
      "DELIVERY_FAILED",
      row.id
    );

    logDelivery({
      source:
        "EVENT_EXPERIENCE_NOTIFICATION",
      sourceId:row.id,
      orderId:row.ticket_order_id,
      channel,
      destination,
      provider:
        channel==="EMAIL"
          ?"RESEND"
          :"META_WHATSAPP_CLOUD",
      result:"FAILED",
      error:
        txt(error?.message) ||
        "DELIVERY_FAILED"
    });

    return{
      ok:false,
      id:row.id,
      channel,
      error:
        txt(error?.message) ||
        "DELIVERY_FAILED"
    };
  }
}

async function dispatch({
  orderId=null,
  limit=20
}={}){

  if(!notificationTableExists()){

    return{
      ok:true,
      processed:0,
      sent:0,
      waiting:0,
      failed:0,
      reason:
        "NOTIFICATION_TABLE_NOT_INITIALIZED"
    };
  }

  const safeLimit=
    Math.max(
      1,
      Math.min(
        100,
        Number(limit)||20
      )
    );

  let sql=`
    SELECT *
    FROM event_experience_notifications
    WHERE status='QUEUED'
  `;

  const params=[];

  if(orderId){

    sql+=`
      AND ticket_order_id=?
    `;

    params.push(
      Number(orderId)
    );
  }

  sql+=`
    ORDER BY id
    LIMIT ?
  `;

  params.push(safeLimit);

  const rows=
    db.prepare(sql).all(...params);

  const results=[];

  for(const row of rows){

    results.push(
      await processNotification(row)
    );

    /*
     * Pequena separação para não disparar
     * múltiplas mensagens simultaneamente.
     */
    await sleep(120);
  }

  return{
    ok:true,
    processed:results.length,
    sent:
      results.filter(x=>x.ok).length,
    waiting:
      results.filter(
        x=>x.waiting_configuration
      ).length,
    failed:
      results.filter(
        x=>
          !x.ok &&
          !x.waiting_configuration &&
          !x.skipped
      ).length,
    results
  };
}

function deliveryStatus(orderId=null){

  if(!notificationTableExists()){

    return{
      providers:providerState(),
      summary:{
        total:0,
        queued:0,
        sent:0,
        failed:0
      },
      rows:[]
    };
  }

  let where="";
  const params=[];

  if(orderId){

    where=
      "WHERE n.ticket_order_id=?";

    params.push(
      Number(orderId)
    );
  }

  const rows=
    db.prepare(`
      SELECT
        n.id,
        n.ticket_order_id,
        o.order_code,
        e.title AS event_title,
        n.channel,
        n.destination,
        n.status,
        n.attempts,
        n.last_error,
        n.created_at,
        n.sent_at
      FROM event_experience_notifications n
      LEFT JOIN ticket_orders o
        ON o.id=n.ticket_order_id
      LEFT JOIN events e
        ON e.id=o.event_id
      ${where}
      ORDER BY n.id DESC
      LIMIT 200
    `).all(...params);

  return{
    providers:providerState(),

    summary:{
      total:rows.length,

      queued:
        rows.filter(
          x=>x.status==="QUEUED"
        ).length,

      sent:
        rows.filter(
          x=>x.status==="SENT"
        ).length,

      failed:
        rows.filter(
          x=>x.status==="FAILED"
        ).length
    },

    rows
  };
}

function resetForResend(id){

  if(!notificationTableExists()){
    throw new Error(
      "NOTIFICATION_TABLE_NOT_INITIALIZED"
    );
  }

  const row=
    db.prepare(`
      SELECT *
      FROM event_experience_notifications
      WHERE id=?
    `).get(Number(id));

  if(!row){
    throw new Error(
      "DELIVERY_NOT_FOUND"
    );
  }

  db.prepare(`
    UPDATE event_experience_notifications
    SET
      status='QUEUED',
      attempts=0,
      last_error=NULL,
      sent_at=NULL
    WHERE id=?
  `).run(row.id);

  return row;
}

function registerTicketDeliveryV39(
  app,
  {
    auth,
    minRole,
    audit
  }
){

  app.get(
    "/api/v39/ticket-delivery/status",
    auth,
    minRole(60),
    (req,res)=>{
      try{

        const orderId=
          Number(
            req.query?.order_id || 0
          ) || null;

        res.json(
          deliveryStatus(orderId)
        );

      }catch(error){

        res.status(500).json({
          error:
            txt(error?.message) ||
            "DELIVERY_STATUS_FAILED"
        });
      }
    }
  );

  app.get(
    "/api/v39/ticket-delivery/providers",
    auth,
    minRole(60),
    (_req,res)=>{
      res.json(
        providerState()
      );
    }
  );

  app.post(
    "/api/v39/ticket-delivery/dispatch",
    auth,
    minRole(60),
    async(req,res)=>{
      try{

        const result=
          await dispatch({
            orderId:
              Number(
                req.body?.order_id || 0
              ) || null,

            limit:
              Number(
                req.body?.limit || 20
              )
          });

        try{
          audit(
            req.user?.id,
            "DISPATCH",
            "TICKET_DELIVERY",
            req.body?.order_id || null,
            {
              processed:
                result.processed,
              sent:
                result.sent,
              waiting:
                result.waiting,
              failed:
                result.failed
            }
          );
        }catch{}

        res.json(result);

      }catch(error){

        res.status(500).json({
          error:
            txt(error?.message) ||
            "DELIVERY_DISPATCH_FAILED"
        });
      }
    }
  );

  app.post(
    "/api/v39/ticket-delivery/:id/resend",
    auth,
    minRole(60),
    async(req,res)=>{
      try{

        const original=
          resetForResend(
            req.params.id
          );

        try{
          audit(
            req.user?.id,
            "RESEND",
            "TICKET_DELIVERY",
            original.id,
            {
              ticket_order_id:
                original.ticket_order_id,
              channel:
                original.channel
            }
          );
        }catch{}

        const result=
          await dispatch({
            orderId:
              original.ticket_order_id,
            limit:20
          });

        res.json({
          ok:true,
          delivery_id:
            original.id,
          dispatch:result
        });

      }catch(error){

        const message=
          txt(error?.message);

        const status=
          message==="DELIVERY_NOT_FOUND"
            ?404
            :400;

        res.status(status).json({
          error:
            message ||
            "DELIVERY_RESEND_FAILED"
        });
      }
    }
  );

  /*
   * Dispatcher automático.
   *
   * Não mantém o Node vivo sozinho
   * graças ao unref().
   */

  const timer=
    setInterval(
      ()=>{
        dispatch({
          limit:20
        }).catch(error=>{
          console.error(
            "TICKET_DELIVERY_V39_AUTO_ERROR",
            error?.message
          );
        });
      },
      15000
    );

  timer.unref?.();

  /*
   * Primeira tentativa logo após
   * inicialização do servidor.
   */
  setTimeout(
    ()=>{
      dispatch({
        limit:20
      }).catch(()=>{});
    },
    2500
  ).unref?.();

  console.log(
    "NEXUS TICKET DELIVERY V3.9 ONLINE"
  );

  console.log(
    "EMAIL PROVIDER:",
    providerState()
      .email
      .configured
      ?"CONFIGURED"
      :"NOT CONFIGURED"
  );

  console.log(
    "WHATSAPP PROVIDER:",
    providerState()
      .whatsapp
      .configured
      ?"CONFIGURED"
      :"NOT CONFIGURED"
  );
}

export{
  registerTicketDeliveryV39,
  dispatch as dispatchTicketDeliveryV39,
  providerState as ticketDeliveryProviderStateV39
};
