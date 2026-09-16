import crypto from "crypto";
import { db } from "./db.js";

function hash(value){
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function token(){
  return crypto.randomBytes(32).toString("hex");
}

function ensureSchema(){

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_magic_links(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_customer_id INTEGER NOT NULL,
      ticket_order_id INTEGER,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL DEFAULT 'WALLET_ACCESS',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_magic_customer
    ON ticket_magic_links(ticket_customer_id);

    CREATE INDEX IF NOT EXISTS idx_magic_order
    ON ticket_magic_links(ticket_order_id);

    CREATE TABLE IF NOT EXISTS event_experience_notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_customer_id INTEGER,
      ticket_order_id INTEGER,
      channel TEXT NOT NULL,
      destination TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      payload TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_experience_notifications
    ON event_experience_notifications(
      ticket_order_id,
      status
    );
  `);
}

ensureSchema();

export function createWalletMagicLink({
  customerId,
  orderId=null,
  expiresHours=72
}){

  if(!customerId){
    throw new Error("CUSTOMER_REQUIRED");
  }

  /*
   * Invalidamos links ativos anteriores do mesmo
   * pedido para evitar vários links simultâneos.
   */
  if(orderId){
    db.prepare(`
      UPDATE ticket_magic_links
      SET status='REPLACED'
      WHERE ticket_order_id=?
        AND status='ACTIVE'
    `).run(orderId);
  }

  const raw=token();
  const digest=hash(raw);

  db.prepare(`
    INSERT INTO ticket_magic_links(
      ticket_customer_id,
      ticket_order_id,
      token_hash,
      expires_at
    )
    VALUES(
      ?,
      ?,
      ?,
      datetime(
        'now',
        '+' || ? || ' hours'
      )
    )
  `).run(
    customerId,
    orderId,
    digest,
    Math.max(1,Number(expiresHours)||72)
  );

  return{
    token:raw,
    customer_id:customerId,
    order_id:orderId,
    expires_hours:
      Math.max(1,Number(expiresHours)||72)
  };
}

export function queueWalletAccess({
  customerId,
  orderId,
  email=null,
  phone=null,
  magicToken
}){

  const payload=JSON.stringify({
    action:"OPEN_MY_TICKETS",
    token:magicToken,
    order_id:orderId
  });

  const insert=db.prepare(`
    INSERT INTO event_experience_notifications(
      ticket_customer_id,
      ticket_order_id,
      channel,
      destination,
      type,
      status,
      payload
    )
    VALUES(?,?,?,?,?,'QUEUED',?)
  `);

  if(email){
    insert.run(
      customerId,
      orderId,
      "EMAIL",
      String(email).trim().toLowerCase(),
      "TICKET_WALLET_ACCESS",
      payload
    );
  }

  if(phone){
    insert.run(
      customerId,
      orderId,
      "WHATSAPP",
      String(phone).replace(/\D/g,""),
      "TICKET_WALLET_ACCESS",
      payload
    );
  }

  return{
    queued:true,
    email:Boolean(email),
    whatsapp:Boolean(phone)
  };
}

export function resolveWalletMagicLink(rawToken){

  const digest=hash(rawToken);

  const link=db.prepare(`
    SELECT *
    FROM ticket_magic_links
    WHERE token_hash=?
      AND status='ACTIVE'
      AND datetime(expires_at)>datetime('now')
    LIMIT 1
  `).get(digest);

  if(!link){
    return null;
  }

  return link;
}

console.log(
  "NEXUS EVENT EXPERIENCE V3.1 SECURE ACCESS ONLINE"
);
