import crypto from "crypto";
import { db } from "./db.js";
import {
  resolveWalletMagicLink
} from "./event-access-v31.js";

function hash(value){
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function createCustomerSession(customerId){

  const raw=
    crypto
      .randomBytes(32)
      .toString("hex");

  const digest=hash(raw);

  db.prepare(`
    INSERT INTO ticket_customer_sessions(
      customer_id,
      token_hash,
      expires_at,
      last_seen_at
    )
    VALUES(
      ?,
      ?,
      datetime('now','+30 days'),
      CURRENT_TIMESTAMP
    )
  `).run(
    customerId,
    digest
  );

  return raw;
}

export function registerEventAccessV31(app){

  app.post(
    "/api/public/event-experience/access",
    (req,res)=>{

      try{

        const raw=String(
          req.body?.token||""
        ).trim();

        if(!/^[a-f0-9]{64}$/i.test(raw)){
          return res.status(400).json({
            error:"ACCESS_TOKEN_INVALID"
          });
        }

        const link=
          resolveWalletMagicLink(raw);

        if(!link){
          return res.status(401).json({
            error:"ACCESS_LINK_INVALID_OR_EXPIRED"
          });
        }

        const customer=db.prepare(`
          SELECT *
          FROM ticket_customers
          WHERE id=?
            AND status='ACTIVE'
        `).get(
          link.ticket_customer_id
        );

        if(!customer){
          return res.status(404).json({
            error:"CUSTOMER_NOT_FOUND"
          });
        }

        const session=
          createCustomerSession(
            customer.id
          );

        /*
         * O magic link continua marcado como ACTIVE
         * ate expirar, permitindo ao comprador reabrir
         * o acesso no mesmo dispositivo ou em outro.
         * used_at registra a utilizacao.
         */
        db.prepare(`
          UPDATE ticket_magic_links
          SET used_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(link.id);

        res.json({
          ok:true,
          session,
          customer:{
            id:customer.id,
            name:
              customer.full_name ||
              customer.name ||
              null
          },
          order_id:
            link.ticket_order_id,
          redirect:
            "/meus-ingressos"
        });

      }catch(error){

        console.error(
          "[EVENT_ACCESS_V32]",
          error?.message||error
        );

        res.status(500).json({
          error:"EVENT_ACCESS_FAILED"
        });
      }
    }
  );

  console.log(
    "NEXUS EVENT EXPERIENCE V3.2 ACCESS ONLINE"
  );
}
