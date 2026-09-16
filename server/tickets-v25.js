import crypto from 'node:crypto';
import {db} from './db.js';

const n=v=>Number(v||0);
const txt=v=>String(v??'').trim();

function ticketCode(){
  return (
    'NX-'+
    crypto.randomBytes(6)
      .toString('hex')
      .toUpperCase()
  );
}

function ticketView(id){
  return db.prepare(`
    SELECT
      t.*,
      e.title AS event_title,
      e.starts_at AS event_starts_at,
      e.venue_name,
      l.name AS lot_name
    FROM tickets t
    JOIN events e
      ON e.id=t.event_id
    LEFT JOIN ticket_lots l
      ON l.id=t.lot_id
    WHERE t.id=?
  `).get(id);
}

export function registerTicketsV25(
  app,
  {
    minRole,
    audit
  }
){

  app.get(
    '/api/v25/tickets/dashboard/:eventId',
    minRole(40),
    (req,res)=>{
      try{

        const eventId=n(req.params.eventId);

        const event=db.prepare(`
          SELECT *
          FROM events
          WHERE id=?
        `).get(eventId);

        if(!event){
          return res.status(404).json({
            error:'EVENT_NOT_FOUND'
          });
        }

        const metrics=db.prepare(`
          SELECT
            COUNT(*) AS issued,
            SUM(
              CASE
                WHEN payment_status='PAID'
                THEN 1 ELSE 0
              END
            ) AS paid,
            SUM(
              CASE
                WHEN payment_status='COURTESY'
                THEN 1 ELSE 0
              END
            ) AS courtesy,
            SUM(
              CASE
                WHEN checkin_at IS NOT NULL
                THEN 1 ELSE 0
              END
            ) AS checked_in,
            COALESCE(
              SUM(
                CASE
                  WHEN payment_status='PAID'
                  THEN price ELSE 0
                END
              ),
              0
            ) AS revenue
          FROM tickets
          WHERE event_id=?
        `).get(eventId);

        const lotCapacity=db.prepare(`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN quantity>0
                  THEN quantity
                  ELSE 0
                END
              ),
              0
            ) AS capacity,
            COALESCE(
              SUM(sold),
              0
            ) AS sold,
            SUM(
              CASE
                WHEN quantity=0
                THEN 1 ELSE 0
              END
            ) AS unlimited_lots
          FROM ticket_lots
          WHERE event_id=?
        `).get(eventId);

        const orders=db.prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN payment_status='PENDING'
                THEN 1 ELSE 0
              END
            ) AS pending,
            SUM(
              CASE
                WHEN payment_status='PAID'
                THEN 1 ELSE 0
              END
            ) AS paid,
            COALESCE(
              SUM(
                CASE
                  WHEN payment_status='PENDING'
                  THEN total ELSE 0
                END
              ),
              0
            ) AS pending_value
          FROM ticket_orders
          WHERE event_id=?
        `).get(eventId);

        const issued=n(metrics.issued);
        const checked=n(metrics.checked_in);

        res.json({
          event,
          metrics:{
            issued,
            paid:n(metrics.paid),
            courtesy:n(metrics.courtesy),
            checked_in:checked,
            revenue:n(metrics.revenue),
            attendance_rate:
              issued>0
                ? Number(
                    (
                      checked/issued*100
                    ).toFixed(1)
                  )
                : 0,
            lot_capacity:n(lotCapacity.capacity),
            lot_sold:n(lotCapacity.sold),
            unlimited_lots:n(
              lotCapacity.unlimited_lots
            ),
            available:
              n(lotCapacity.unlimited_lots)>0
                ? null
                : Math.max(
                    0,
                    n(lotCapacity.capacity)-
                    n(lotCapacity.sold)
                  )
          },
          orders:{
            total:n(orders.total),
            pending:n(orders.pending),
            paid:n(orders.paid),
            pending_value:n(
              orders.pending_value
            )
          }
        });

      }catch(error){

        console.error(
          'TICKET_DASHBOARD_V25',
          error
        );

        res.status(500).json({
          error:'TICKET_DASHBOARD_FAILED',
          message:error.message
        });
      }
    }
  );

  app.get(
    '/api/v25/tickets/orders/:eventId',
    minRole(40),
    (req,res)=>{
      try{

        const rows=db.prepare(`
          SELECT
            o.*,
            e.title AS event_title,
            l.name AS lot_name
          FROM ticket_orders o
          JOIN events e
            ON e.id=o.event_id
          JOIN ticket_lots l
            ON l.id=o.lot_id
          WHERE o.event_id=?
          ORDER BY o.id DESC
          LIMIT 200
        `).all(
          n(req.params.eventId)
        );

        res.json(rows);

      }catch(error){

        res.status(500).json({
          error:'TICKET_ORDERS_FAILED',
          message:error.message
        });
      }
    }
  );

  app.get(
    '/api/v25/tickets/access/:eventId',
    minRole(40),
    (req,res)=>{
      try{

        const rows=db.prepare(`
          SELECT
            a.*,
            t.attendee_name,
            t.ticket_code,
            t.payment_status,
            e.title AS event_title,
            l.name AS lot_name,
            u.name AS operator_name
          FROM ticket_access_log a
          LEFT JOIN tickets t
            ON t.id=a.ticket_id
          LEFT JOIN events e
            ON e.id=a.event_id
          LEFT JOIN ticket_lots l
            ON l.id=t.lot_id
          LEFT JOIN users u
            ON u.id=a.user_id
          WHERE a.event_id=?
          ORDER BY a.id DESC
          LIMIT 200
        `).all(
          n(req.params.eventId)
        );

        res.json(rows);

      }catch(error){

        res.status(500).json({
          error:'TICKET_ACCESS_HISTORY_FAILED',
          message:error.message
        });
      }
    }
  );

  app.get(
    '/api/v25/tickets/search/:eventId',
    minRole(40),
    (req,res)=>{
      try{

        const q=txt(req.query.q);

        if(!q){
          return res.json([]);
        }

        const like='%'+q+'%';

        const rows=db.prepare(`
          SELECT
            t.*,
            e.title AS event_title,
            l.name AS lot_name
          FROM tickets t
          JOIN events e
            ON e.id=t.event_id
          LEFT JOIN ticket_lots l
            ON l.id=t.lot_id
          WHERE t.event_id=?
            AND (
              t.ticket_code LIKE ?
              OR COALESCE(
                t.attendee_name,
                ''
              ) LIKE ?
              OR COALESCE(
                t.attendee_phone,
                ''
              ) LIKE ?
              OR COALESCE(
                t.buyer_email,
                ''
              ) LIKE ?
            )
          ORDER BY t.id DESC
          LIMIT 100
        `).all(
          n(req.params.eventId),
          like,
          like,
          like,
          like
        );

        res.json(rows);

      }catch(error){

        res.status(500).json({
          error:'TICKET_SEARCH_FAILED',
          message:error.message
        });
      }
    }
  );

  app.post(
    '/api/v25/tickets/presential',
    minRole(40),
    (req,res)=>{
      try{

        const b=req.body||{};
        const eventId=n(b.event_id);
        const lotId=n(b.lot_id);
        const attendee=txt(
          b.attendee_name
        );

        if(
          !eventId ||
          !attendee
        ){
          return res.status(400).json({
            error:'TICKET_DATA_REQUIRED'
          });
        }

        const paymentStatus=
          txt(
            b.payment_status||
            'PAID'
          ).toUpperCase();

        if(
          ![
            'PAID',
            'COURTESY'
          ].includes(paymentStatus)
        ){
          return res.status(400).json({
            error:'INVALID_PAYMENT_STATUS'
          });
        }

        const create=db.transaction(
          ()=>{

            const event=db.prepare(`
              SELECT *
              FROM events
              WHERE id=?
            `).get(eventId);

            if(!event){
              throw new Error(
                'EVENT_NOT_FOUND'
              );
            }

            let lot=null;

            if(lotId){

              lot=db.prepare(`
                SELECT *
                FROM ticket_lots
                WHERE id=?
                  AND event_id=?
              `).get(
                lotId,
                eventId
              );

              if(!lot){
                throw new Error(
                  'LOT_NOT_FOUND'
                );
              }

              if(
                txt(lot.status)
                  .toUpperCase()!=='ACTIVE'
              ){
                throw new Error(
                  'LOT_NOT_ACTIVE'
                );
              }

              if(
                n(lot.quantity)>0 &&
                n(lot.sold)>=
                n(lot.quantity)
              ){
                throw new Error(
                  'LOT_SOLD_OUT'
                );
              }
            }

            const code=ticketCode();

            const price=
              paymentStatus==='COURTESY'
                ? 0
                : lot
                  ? n(lot.price)
                  : n(b.price);

            const method=
              paymentStatus==='COURTESY'
                ? 'COURTESY'
                : txt(
                    b.payment_method||
                    'DINHEIRO'
                  ).toUpperCase();

            const insert=
              db.prepare(`
                INSERT INTO tickets(
                  event_id,
                  lot_id,
                  attendee_name,
                  attendee_phone,
                  ticket_code,
                  ticket_type,
                  price,
                  payment_status,
                  payment_method,
                  qr_payload,
                  buyer_email,
                  buyer_document
                )
                VALUES(
                  ?,?,?,?,?,?,?,?,?,?,?,?
                )
              `).run(
                eventId,
                lotId||null,
                attendee,
                txt(b.attendee_phone)||null,
                code,
                lot
                  ? lot.name
                  : txt(b.ticket_type)||'PADRAO',
                price,
                paymentStatus,
                method,
                code,
                txt(b.buyer_email)||null,
                txt(b.buyer_document)||null
              );

            if(lot){
              db.prepare(`
                UPDATE ticket_lots
                SET sold=sold+1
                WHERE id=?
              `).run(lot.id);
            }

            return Number(
              insert.lastInsertRowid
            );
          }
        );

        const ticketId=create();
        const ticket=ticketView(
          ticketId
        );

        audit(
          req.user.id,
          'CREATE',
          'TICKET',
          ticketId,
          {
            source:'PRESENTIAL_V25',
            event_id:eventId,
            lot_id:lotId||null,
            payment_status:
              paymentStatus,
            ticket_code:
              ticket.ticket_code
          }
        );

        res.status(201).json({
          ok:true,
          ticket
        });

      }catch(error){

        const conflict=[
          'LOT_SOLD_OUT',
          'LOT_NOT_ACTIVE'
        ].includes(error.message);

        const missing=[
          'EVENT_NOT_FOUND',
          'LOT_NOT_FOUND'
        ].includes(error.message);

        res.status(
          conflict
            ? 409
            : missing
              ? 404
              : 500
        ).json({
          error:error.message||
            'TICKET_CREATE_FAILED'
        });
      }
    }
  );

  app.post(
    '/api/v25/tickets/checkin',
    minRole(40),
    (req,res)=>{
      try{

        const code=
          txt(req.body?.code)
            .toUpperCase();

        if(!code){
          return res.status(400).json({
            ok:false,
            result:'INVALID',
            message:'Informe o codigo do ingresso.'
          });
        }

        let ticket=db.prepare(`
          SELECT
            t.*,
            e.title AS event_title,
            e.starts_at AS event_starts_at,
            e.venue_name,
            l.name AS lot_name
          FROM tickets t
          JOIN events e
            ON e.id=t.event_id
          LEFT JOIN ticket_lots l
            ON l.id=t.lot_id
          WHERE upper(t.ticket_code)=?
        `).get(code);

        if(!ticket){

          db.prepare(`
            INSERT INTO ticket_access_log(
              code,
              result,
              user_id
            )
            VALUES(
              ?,
              'INVALID',
              ?
            )
          `).run(
            code,
            req.user.id
          );

          return res.json({
            ok:false,
            result:'INVALID',
            message:'Ingresso invalido.'
          });
        }

        if(
          ![
            'PAID',
            'COURTESY'
          ].includes(
            txt(ticket.payment_status)
              .toUpperCase()
          )
        ){

          db.prepare(`
            INSERT INTO ticket_access_log(
              ticket_id,
              event_id,
              code,
              result,
              user_id
            )
            VALUES(
              ?,?,?,
              'PAYMENT_PENDING',
              ?
            )
          `).run(
            ticket.id,
            ticket.event_id,
            code,
            req.user.id
          );

          return res.json({
            ok:false,
            result:'PAYMENT_PENDING',
            message:
              'Pagamento ainda nao confirmado.',
            ticket
          });
        }

        if(ticket.checkin_at){

          db.prepare(`
            INSERT INTO ticket_access_log(
              ticket_id,
              event_id,
              code,
              result,
              user_id
            )
            VALUES(
              ?,?,?,
              'DUPLICATE',
              ?
            )
          `).run(
            ticket.id,
            ticket.event_id,
            code,
            req.user.id
          );

          return res.json({
            ok:false,
            result:'DUPLICATE',
            message:
              'Ingresso ja utilizado.',
            ticket
          });
        }

        const update=db.prepare(`
          UPDATE tickets
          SET
            checkin_at=CURRENT_TIMESTAMP,
            checked_in_by=?
          WHERE id=?
            AND checkin_at IS NULL
        `).run(
          req.user.id,
          ticket.id
        );

        if(update.changes!==1){

          ticket=ticketView(
            ticket.id
          );

          db.prepare(`
            INSERT INTO ticket_access_log(
              ticket_id,
              event_id,
              code,
              result,
              user_id
            )
            VALUES(
              ?,?,?,
              'DUPLICATE',
              ?
            )
          `).run(
            ticket.id,
            ticket.event_id,
            code,
            req.user.id
          );

          return res.json({
            ok:false,
            result:'DUPLICATE',
            message:
              'Ingresso ja utilizado.',
            ticket
          });
        }

        ticket=ticketView(
          ticket.id
        );

        db.prepare(`
          INSERT INTO ticket_access_log(
            ticket_id,
            event_id,
            code,
            result,
            user_id
          )
          VALUES(
            ?,?,?,
            'ALLOWED',
            ?
          )
        `).run(
          ticket.id,
          ticket.event_id,
          code,
          req.user.id
        );

        audit(
          req.user.id,
          'CHECKIN',
          'TICKET',
          ticket.id,
          {
            result:'ALLOWED',
            code
          }
        );

        return res.json({
          ok:true,
          result:'ALLOWED',
          message:'ACESSO LIBERADO',
          ticket
        });

      }catch(error){

        console.error(
          'TICKET_CHECKIN_V25',
          error
        );

        res.status(500).json({
          ok:false,
          result:'ERROR',
          error:'CHECKIN_FAILED',
          message:error.message
        });
      }
    }
  );
}
