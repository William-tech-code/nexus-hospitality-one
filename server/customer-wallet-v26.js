import crypto from "node:crypto";
import Database from "better-sqlite3";
import QRCode from "qrcode";

const db=new Database("./data/nexus-hospitality.sqlite");

function text(v){
 return String(v??"").trim();
}

function normalizeEmail(v){
 return text(v).toLowerCase();
}

function normalizeDocument(v){
 return text(v).replace(/\D/g,"");
}

function normalizePhone(v){
 return text(v).replace(/\D/g,"");
}

function sha256(v){
 return crypto
  .createHash("sha256")
  .update(String(v))
  .digest("hex");
}

function randomToken(){
 return crypto.randomBytes(32).toString("hex");
}

function validBirthDate(v){
 const value=text(v);

 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)){
  return false;
 }

 const d=new Date(value+"T12:00:00");

 return (
  !Number.isNaN(d.getTime()) &&
  d.toISOString().slice(0,10)===value &&
  d.getTime()<Date.now()
 );
}

function ageAtDate(birthDate,targetDate){

 const birth=new Date(
  birthDate+"T12:00:00"
 );

 const target=new Date(targetDate);

 if(
  Number.isNaN(birth.getTime()) ||
  Number.isNaN(target.getTime())
 ){
  return null;
 }

 let age=
  target.getFullYear()-
  birth.getFullYear();

 const month=
  target.getMonth()-
  birth.getMonth();

 if(
  month<0 ||
  (
   month===0 &&
   target.getDate()<birth.getDate()
  )
 ){
  age--;
 }

 return age;
}

function publicCustomer(row){

 if(!row)return null;

 return {
  id:row.id,
  full_name:row.full_name,
  document:row.document,
  email:row.email,
  phone:row.phone,
  birth_date:row.birth_date
 };
}

function customerFromSession(req){

 const raw=
  text(
   req.headers[
    "x-nexus-customer-session"
   ]
  );

 if(!/^[a-f0-9]{64}$/i.test(raw)){
  return null;
 }

 const hash=sha256(raw);

 return db.prepare(`
  SELECT c.*,s.id session_id
  FROM ticket_customer_sessions s
  JOIN ticket_customers c
   ON c.id=s.customer_id
  WHERE s.token_hash=?
    AND s.revoked_at IS NULL
    AND datetime(s.expires_at)>CURRENT_TIMESTAMP
    AND c.status='ACTIVE'
 `).get(hash);
}

function customerAuth(req,res,next){

 const customer=
  customerFromSession(req);

 if(!customer){
  return res.status(401).json({
   error:"CUSTOMER_AUTH_REQUIRED"
  });
 }

 req.ticketCustomer=customer;

 try{
  db.prepare(`
   UPDATE ticket_customer_sessions
   SET last_seen_at=CURRENT_TIMESTAMP
   WHERE id=?
  `).run(customer.session_id);
 }catch{}

 next();
}

function createSession(customerId){

 const raw=randomToken();
 const hash=sha256(raw);

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
 `).run(customerId,hash);

 return raw;
}

function findExistingCustomer({
 email,
 document,
 phone
}){

 if(document){
  const row=db.prepare(`
   SELECT *
   FROM ticket_customers
   WHERE document=?
     AND status='ACTIVE'
   ORDER BY id
   LIMIT 1
  `).get(document);

  if(row)return row;
 }

 if(email){
  const row=db.prepare(`
   SELECT *
   FROM ticket_customers
   WHERE lower(email)=lower(?)
     AND status='ACTIVE'
   ORDER BY id
   LIMIT 1
  `).get(email);

  if(row)return row;
 }

 if(phone){
  return db.prepare(`
   SELECT *
   FROM ticket_customers
   WHERE phone=?
     AND status='ACTIVE'
   ORDER BY id
   LIMIT 1
  `).get(phone);
 }

 return null;
}

async function walletPayload(customerId){

 const customer=db.prepare(`
  SELECT *
  FROM ticket_customers
  WHERE id=?
 `).get(customerId);

 const rows=db.prepare(`
  SELECT
   t.id,
   t.ticket_code,
   t.ticket_type,
   t.price,
   t.payment_status,
   t.checkin_at,
   t.created_at,
   t.attendee_name,
   t.ticket_order_id,

   o.order_code,
   o.total order_total,

   e.id event_id,
   e.title event_title,
   e.venue_name,
   e.starts_at,
   e.ends_at,
   e.image_url,
   e.minimum_age,
   e.minor_policy,

   l.name lot_name

  FROM tickets t

  LEFT JOIN ticket_orders o
   ON o.id=t.ticket_order_id

  LEFT JOIN events e
   ON e.id=t.event_id

  LEFT JOIN ticket_lots l
   ON l.id=o.lot_id

  WHERE
   t.ticket_customer_id=?
   OR o.ticket_customer_id=?

  ORDER BY
   datetime(e.starts_at) DESC,
   t.id DESC
 `).all(customerId,customerId);

 const tickets=[];

 for(const row of rows){

  let qr_image=null;

  try{
   qr_image=
    await QRCode.toDataURL(
     row.ticket_code,
     {
      width:360,
      margin:1,
      errorCorrectionLevel:"M"
     }
    );
  }catch{}

  tickets.push({
   ...row,
   access_status:
    row.checkin_at
     ?"USED"
     :"VALID",
   qr_image
  });
 }

 return {
  customer:publicCustomer(customer),
  tickets
 };
}

function registerCustomerWallet(app){

 /*
  * Claim an existing paid order through
  * the secure private portal token.
  */
 app.post(
  "/api/public/customer/claim/:token",
  (req,res)=>{

   try{

    const token=text(req.params.token);

    if(!/^[a-f0-9]{64}$/i.test(token)){
     return res.status(404).json({
      error:"INGRESSO_NAO_ENCONTRADO"
     });
    }

    const tokenHash=sha256(token);

    const order=db.prepare(`
     SELECT *
     FROM ticket_orders
     WHERE ticket_portal_token_hash=?
       AND payment_status='PAID'
    `).get(tokenHash);

    if(!order){
     return res.status(404).json({
      error:"INGRESSO_NAO_ENCONTRADO"
     });
    }

    const fullName=text(
     req.body?.full_name ||
     order.buyer_name
    );

    const email=normalizeEmail(
     req.body?.email ||
     order.buyer_email
    );

    const phone=normalizePhone(
     req.body?.phone ||
     order.buyer_phone
    );

    const document=normalizeDocument(
     req.body?.document ||
     order.buyer_document
    );

    const birthDate=
     text(req.body?.birth_date);

    if(fullName.length<3){
     return res.status(400).json({
      error:"NOME_COMPLETO_OBRIGATORIO"
     });
    }

    if(!email || !email.includes("@")){
     return res.status(400).json({
      error:"EMAIL_VALIDO_OBRIGATORIO"
     });
    }

    if(phone.length<10){
     return res.status(400).json({
      error:"TELEFONE_VALIDO_OBRIGATORIO"
     });
    }

    if(document.length!==11){
     return res.status(400).json({
      error:"CPF_OBRIGATORIO"
     });
    }

    if(!validBirthDate(birthDate)){
     return res.status(400).json({
      error:"DATA_NASCIMENTO_INVALIDA"
     });
    }

    let customer=
     findExistingCustomer({
      email,
      document,
      phone
     });

    const tx=db.transaction(()=>{

     if(!customer){

      const result=db.prepare(`
       INSERT INTO ticket_customers(
        full_name,
        document,
        email,
        phone,
        birth_date
       )
       VALUES(?,?,?,?,?)
      `).run(
       fullName,
       document,
       email,
       phone,
       birthDate
      );

      customer=db.prepare(`
       SELECT *
       FROM ticket_customers
       WHERE id=?
      `).get(result.lastInsertRowid);

     }else{

      db.prepare(`
       UPDATE ticket_customers
       SET
        full_name=?,
        document=?,
        email=?,
        phone=?,
        birth_date=?,
        updated_at=CURRENT_TIMESTAMP
       WHERE id=?
      `).run(
       fullName,
       document,
       email,
       phone,
       birthDate,
       customer.id
      );

      customer=db.prepare(`
       SELECT *
       FROM ticket_customers
       WHERE id=?
      `).get(customer.id);
     }

     const existingClaim=db.prepare(`
      SELECT customer_id
      FROM ticket_customer_claims
      WHERE ticket_order_id=?
     `).get(order.id);

     if(
      existingClaim &&
      Number(existingClaim.customer_id)!==
       Number(customer.id)
     ){
      throw new Error(
       "ORDER_ALREADY_CLAIMED"
      );
     }

     db.prepare(`
      INSERT OR IGNORE INTO
       ticket_customer_claims(
        customer_id,
        ticket_order_id
       )
      VALUES(?,?)
     `).run(
      customer.id,
      order.id
     );

     db.prepare(`
      UPDATE ticket_orders
      SET
       ticket_customer_id=?,
       updated_at=CURRENT_TIMESTAMP
      WHERE id=?
     `).run(
      customer.id,
      order.id
     );

     db.prepare(`
      UPDATE tickets
      SET ticket_customer_id=?
      WHERE ticket_order_id=?
     `).run(
      customer.id,
      order.id
     );
    });

    try{
     tx();
    }catch(error){

     if(
      error.message===
      "ORDER_ALREADY_CLAIMED"
     ){
      return res.status(409).json({
       error:"INGRESSO_JA_VINCULADO"
      });
     }

     throw error;
    }

    const session=
     createSession(customer.id);

    return res.json({
     ok:true,
     session,
     customer:publicCustomer(customer)
    });

   }catch(error){

    console.error(
     "CUSTOMER_CLAIM_ERROR",
     error
    );

    return res.status(500).json({
     error:"CUSTOMER_CLAIM_FAILED"
    });
   }
  }
 );

 app.get(
  "/api/public/customer/me",
  customerAuth,
  (req,res)=>{
   res.json({
    customer:
     publicCustomer(
      req.ticketCustomer
     )
   });
  }
 );

 app.get(
  "/api/public/customer/wallet",
  customerAuth,
  async(req,res)=>{

   try{
    res.json(
     await walletPayload(
      req.ticketCustomer.id
     )
    );
   }catch(error){

    console.error(
     "CUSTOMER_WALLET_ERROR",
     error
    );

    res.status(500).json({
     error:"CUSTOMER_WALLET_FAILED"
    });
   }
  }
 );

 
 /*
  * CUSTOMER_EXPERIENCE_MASTER_V26
  *
  * Integrated customer account endpoints.
  */

 app.get(
  "/api/public/customer/orders",
  customerAuth,
  (req,res)=>{
   try{
    const orders=db.prepare(`
     SELECT
      o.id,
      o.order_code,
      o.event_id,
      o.lot_id,
      o.quantity,
      o.total,
      o.payment_status,
      o.invoice_url,
      o.created_at,
      o.updated_at,
      e.title event_title,
      e.starts_at event_starts_at,
      e.venue_name,
      l.name lot_name
     FROM ticket_orders o
     JOIN events e
      ON e.id=o.event_id
     LEFT JOIN ticket_lots l
      ON l.id=o.lot_id
     WHERE o.ticket_customer_id=?
     ORDER BY o.id DESC
    `).all(req.ticketCustomer.id);

    res.json({orders});
   }catch(error){
    console.error(
     "CUSTOMER_ORDERS_ERROR",
     error
    );

    res.status(500).json({
     error:"CUSTOMER_ORDERS_FAILED"
    });
   }
  }
 );

 app.get(
  "/api/public/customer/events",
  customerAuth,
  (req,res)=>{
   try{
    const events=db.prepare(`
     SELECT
      e.*
     FROM events e
     WHERE e.public_sales=1
       AND COALESCE(e.status,'')
        NOT IN ('CANCELLED','DRAFT')
     ORDER BY datetime(e.starts_at) ASC
    `).all();

    const result=events.map(event=>({
     ...event,
     lots:db.prepare(`
      SELECT *
      FROM ticket_lots
      WHERE event_id=?
      ORDER BY id
     `).all(event.id)
    }));

    res.json({events:result});
   }catch(error){
    console.error(
     "CUSTOMER_EVENTS_ERROR",
     error
    );

    res.status(500).json({
     error:"CUSTOMER_EVENTS_FAILED"
    });
   }
  }
 );

 app.put(
  "/api/public/customer/profile",
  customerAuth,
  (req,res)=>{
   try{
    const fullName=text(req.body?.full_name);
    const email=text(req.body?.email).toLowerCase();
    const phone=text(req.body?.phone);
    const document=text(req.body?.document);
    const birthDate=text(req.body?.birth_date);

    if(!fullName){
     return res.status(400).json({
      error:"CUSTOMER_NAME_REQUIRED"
     });
    }

    if(!validBirthDate(birthDate)){
     return res.status(400).json({
      error:"INVALID_BIRTH_DATE"
     });
    }

    const conflict=db.prepare(`
     SELECT id
     FROM ticket_customers
     WHERE id<>?
       AND (
        (?<>'' AND lower(email)=lower(?))
        OR
        (?<>'' AND document=?)
       )
     LIMIT 1
    `).get(
     req.ticketCustomer.id,
     email,
     email,
     document,
     document
    );

    if(conflict){
     return res.status(409).json({
      error:"CUSTOMER_PROFILE_CONFLICT"
     });
    }

    db.prepare(`
     UPDATE ticket_customers
     SET
      full_name=?,
      email=?,
      phone=?,
      document=?,
      birth_date=?,
      updated_at=CURRENT_TIMESTAMP
     WHERE id=?
    `).run(
     fullName,
     email||null,
     phone||null,
     document||null,
     birthDate,
     req.ticketCustomer.id
    );

    const customer=db.prepare(`
     SELECT *
     FROM ticket_customers
     WHERE id=?
    `).get(req.ticketCustomer.id);

    res.json({
     ok:true,
     customer:publicCustomer(customer)
    });

   }catch(error){
    console.error(
     "CUSTOMER_PROFILE_ERROR",
     error
    );

    res.status(500).json({
     error:"CUSTOMER_PROFILE_FAILED"
    });
   }
  }
 );

app.post(
  "/api/public/customer/logout",
  customerAuth,
  (req,res)=>{

   db.prepare(`
    UPDATE ticket_customer_sessions
    SET revoked_at=CURRENT_TIMESTAMP
    WHERE id=?
   `).run(
    req.ticketCustomer.session_id
   );

   res.json({ok:true});
  }
 );

 /*
  * Public age eligibility check.
  * Age is calculated AT EVENT DATE.
  */
 app.post(
  "/api/public/ticket-age-check/:id",
  (req,res)=>{

   const event=db.prepare(`
    SELECT
     id,
     title,
     starts_at,
     minimum_age,
     minor_policy,
     age_notice
    FROM events
    WHERE id=?
   `).get(
    Number(req.params.id)
   );

   if(!event){
    return res.status(404).json({
     error:"EVENT_NOT_FOUND"
    });
   }

   const birthDate=
    text(req.body?.birth_date);

   if(!validBirthDate(birthDate)){
    return res.status(400).json({
     error:"DATA_NASCIMENTO_INVALIDA"
    });
   }

   const age=
    ageAtDate(
     birthDate,
     event.starts_at
    );

   const minimumAge=
    Math.max(
     0,
     Number(event.minimum_age||0)
    );

   const policy=
    text(
     event.minor_policy ||
     "UNRESTRICTED"
    ).toUpperCase();

   let eligible=true;
   let requiresGuardian=false;
   let requiresAuthorization=false;

   if(age<minimumAge){

    if(policy==="ADULT_ONLY"){
     eligible=false;
    }

    if(policy==="WITH_GUARDIAN"){
     requiresGuardian=true;
    }

    if(policy==="WITH_AUTHORIZATION"){
     requiresAuthorization=true;
    }
   }

   res.json({
    eligible,
    age,
    minimum_age:minimumAge,
    minor_policy:policy,
    requires_guardian:requiresGuardian,
    requires_authorization:
     requiresAuthorization,
    notice:event.age_notice||null
   });
  }
 );

 console.log(
  "NEXUS CUSTOMER WALLET ROUTES ONLINE"
 );
}

export {
 registerCustomerWallet
};



