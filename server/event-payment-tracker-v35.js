import crypto from "node:crypto";
import {db} from "./db.js";

import {
  createWalletMagicLink
} from "./event-access-v31.js";

function txt(value){
  return String(value??"").trim();
}

function hash(value){
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function ensureSchema(){

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_payment_tracking(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_order_id INTEGER NOT NULL UNIQUE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT,
      FOREIGN KEY(ticket_order_id)
        REFERENCES ticket_orders(id)
    );

    CREATE INDEX IF NOT EXISTS
      idx_ticket_payment_tracking_token
    ON ticket_payment_tracking(token_hash);
  `);
}

ensureSchema();

function activeTracker(rawToken,orderId){

  if(
    !rawToken ||
    !/^[a-f0-9]{64}$/i.test(rawToken)
  ){
    return null;
  }

  return db.prepare(`
    SELECT *
    FROM ticket_payment_tracking
    WHERE ticket_order_id=?
      AND token_hash=?
      AND datetime(expires_at)>datetime('now')
  `).get(
    orderId,
    hash(rawToken)
  );
}

function existingMagicToken(orderId){

  const rows=db.prepare(`
    SELECT payload
    FROM event_experience_notifications
    WHERE ticket_order_id=?
      AND type='TICKET_WALLET_ACCESS'
    ORDER BY id DESC
    LIMIT 10
  `).all(orderId);

  for(const row of rows){

    try{

      const payload=
        JSON.parse(row.payload||"{}");

      if(
        payload?.token &&
        /^[a-f0-9]{64}$/i.test(
          payload.token
        )
      ){
        return payload.token;
      }

    }catch{}
  }

  return null;
}

function walletAccess(order){

  if(
    order.payment_status!=="PAID" ||
    !order.ticket_customer_id
  ){
    return null;
  }

  let token=
    existingMagicToken(order.id);

  if(!token){

    const magic=
      createWalletMagicLink({
        customerId:
          order.ticket_customer_id,
        orderId:
          order.id,
        expiresHours:72
      });

    token=magic.token;
  }

  return {
    token,
    url:
      `/acesso-ingressos/${token}`
  };
}

export default function registerEventPaymentTrackerV35(app){

  /*
   * Starts private browser tracking.
   *
   * The Asaas payment id must match the order returned
   * by the purchase endpoint. The browser then receives
   * a separate random tracking secret.
   */
  app.post(
    "/api/public/ticket-orders/:code/tracking",
    (req,res)=>{

      try{

        const code=
          txt(req.params.code);

        const paymentId=
          txt(req.body?.payment_id);

        const order=db.prepare(`
          SELECT *
          FROM ticket_orders
          WHERE order_code=?
        `).get(code);

        if(!order){
          return res.status(404).json({
            error:"TICKET_ORDER_NOT_FOUND"
          });
        }

        if(
          !order.asaas_payment_id ||
          !paymentId ||
          !crypto.timingSafeEqual(
            Buffer.from(
              String(order.asaas_payment_id)
            ),
            Buffer.from(paymentId)
          )
        ){
          return res.status(401).json({
            error:"INVALID_PAYMENT_TRACKING_CREDENTIAL"
          });
        }

        const raw=
          crypto
            .randomBytes(32)
            .toString("hex");

        db.prepare(`
          INSERT INTO ticket_payment_tracking(
            ticket_order_id,
            token_hash,
            expires_at
          )
          VALUES(
            ?,?,
            datetime('now','+2 days')
          )
          ON CONFLICT(ticket_order_id)
          DO UPDATE SET
            token_hash=excluded.token_hash,
            expires_at=excluded.expires_at,
            created_at=CURRENT_TIMESTAMP,
            last_seen_at=NULL
        `).run(
          order.id,
          hash(raw)
        );

        return res.json({
          ok:true,
          tracking_token:raw,
          order_code:order.order_code,
          payment_status:
            order.payment_status
        });

      }catch(error){

        return res.status(500).json({
          error:
            "PAYMENT_TRACKING_INIT_FAILED",
          message:error.message
        });
      }
    }
  );

  /*
   * Secure real-time status endpoint.
   */
  app.get(
    "/api/public/ticket-orders/:code/payment-status",
    (req,res)=>{

      try{

        const code=
          txt(req.params.code);

        const raw=
          txt(
            req.headers[
              "x-nexus-ticket-tracking"
            ]
          );

        const order=db.prepare(`
          SELECT
            o.*,
            e.title AS event_title,
            e.starts_at,
            e.venue_name,
            l.name AS lot_name
          FROM ticket_orders o
          JOIN events e
            ON e.id=o.event_id
          LEFT JOIN ticket_lots l
            ON l.id=o.lot_id
          WHERE o.order_code=?
        `).get(code);

        if(!order){
          return res.status(404).json({
            error:"TICKET_ORDER_NOT_FOUND"
          });
        }

        const tracker=
          activeTracker(
            raw,
            order.id
          );

        if(!tracker){
          return res.status(401).json({
            error:
              "INVALID_OR_EXPIRED_TRACKING_TOKEN"
          });
        }

        db.prepare(`
          UPDATE ticket_payment_tracking
          SET last_seen_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(tracker.id);

        const paid=
          order.payment_status==="PAID";

        const tickets=
          paid
            ?db.prepare(`
                SELECT
                  id,
                  ticket_code,
                  attendee_name,
                  ticket_type,
                  price,
                  payment_status,
                  checkin_at
                FROM tickets
                WHERE ticket_order_id=?
                ORDER BY id
              `).all(order.id)
            :[];

        const access=
          paid
            ?walletAccess(order)
            :null;

        return res.json({
          ok:true,
          order:{
            id:order.id,
            order_code:
              order.order_code,
            event_id:
              order.event_id,
            event_title:
              order.event_title,
            lot_name:
              order.lot_name,
            quantity:
              order.quantity,
            total:
              order.total,
            payment_status:
              order.payment_status,
            starts_at:
              order.starts_at,
            venue_name:
              order.venue_name
          },
          paid,
          tickets_count:
            tickets.length,
          wallet_access:
            access
              ?{
                  url:access.url
                }
              :null
        });

      }catch(error){

        return res.status(500).json({
          error:
            "PAYMENT_TRACKING_STATUS_FAILED",
          message:error.message
        });
      }
    }
  );

  console.log(
    "NEXUS EVENT PAYMENT TRACKER V3.5 ONLINE"
  );
}
