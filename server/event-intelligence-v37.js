import {db} from "./db.js";

function n(value){
  const x=Number(value);
  return Number.isFinite(x)?x:0;
}

function round(value,places=2){
  const factor=10**places;
  return Math.round(n(value)*factor)/factor;
}

function pct(value,total){

  if(!n(total)){
    return 0;
  }

  return round(
    (n(value)/n(total))*100,
    1
  );
}

function tableExists(name){

  return Boolean(
    db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type='table'
        AND name=?
    `).get(name)
  );
}

function recommendation(
  type,
  priority,
  title,
  message,
  metric=null
){
  return{
    type,
    priority,
    title,
    message,
    metric
  };
}

export default function registerEventIntelligenceV37(
  app,
  {
    minRole
  }
){

  app.get(
    "/api/v37/events/:eventId/intelligence",
    minRole(40),
    (req,res)=>{

      try{

        const eventId=
          n(req.params.eventId);

        const event=
          db.prepare(`
            SELECT *
            FROM events
            WHERE id=?
          `).get(eventId);

        if(!event){

          return res.status(404).json({
            error:"EVENT_NOT_FOUND"
          });
        }

        const ticketMetrics=
          db.prepare(`
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
                    THEN price
                    ELSE 0
                  END
                ),
                0
              ) AS ticket_revenue

            FROM tickets
            WHERE event_id=?
          `).get(eventId);

        const orderMetrics=
          db.prepare(`
            SELECT

              COUNT(*) AS orders,

              SUM(
                CASE
                  WHEN payment_status='PAID'
                  THEN 1 ELSE 0
                END
              ) AS paid_orders,

              SUM(
                CASE
                  WHEN payment_status='PENDING'
                  THEN 1 ELSE 0
                END
              ) AS pending_orders,

              COALESCE(
                SUM(
                  CASE
                    WHEN payment_status='PAID'
                    THEN total
                    ELSE 0
                  END
                ),
                0
              ) AS paid_value,

              COALESCE(
                SUM(
                  CASE
                    WHEN payment_status='PENDING'
                    THEN total
                    ELSE 0
                  END
                ),
                0
              ) AS pending_value

            FROM ticket_orders
            WHERE event_id=?
          `).get(eventId);

        const lots=
          db.prepare(`
            SELECT
              l.*,

              COALESCE(
                (
                  SELECT COUNT(*)
                  FROM tickets t
                  WHERE t.lot_id=l.id
                    AND t.payment_status='PAID'
                ),
                0
              ) AS paid_tickets,

              COALESCE(
                (
                  SELECT COUNT(*)
                  FROM tickets t
                  WHERE t.lot_id=l.id
                    AND t.checkin_at IS NOT NULL
                ),
                0
              ) AS checked_in,

              COALESCE(
                (
                  SELECT SUM(t.price)
                  FROM tickets t
                  WHERE t.lot_id=l.id
                    AND t.payment_status='PAID'
                ),
                0
              ) AS revenue

            FROM ticket_lots l
            WHERE l.event_id=?
            ORDER BY l.id
          `).all(eventId);

        const costs=
          tableExists("event_costs")
            ?db.prepare(`
                SELECT
                  COALESCE(
                    SUM(amount),
                    0
                  ) AS total
                FROM event_costs
                WHERE event_id=?
              `).get(eventId)
            :{total:0};

        const costCategories=
          tableExists("event_costs")
            ?db.prepare(`
                SELECT
                  category,
                  COUNT(*) AS items,
                  COALESCE(
                    SUM(amount),
                    0
                  ) AS total
                FROM event_costs
                WHERE event_id=?
                GROUP BY category
                ORDER BY total DESC
              `).all(eventId)
            :[];

        const access=
          db.prepare(`
            SELECT

              COUNT(*) AS attempts,

              SUM(
                CASE
                  WHEN result='ALLOWED'
                  THEN 1 ELSE 0
                END
              ) AS allowed,

              SUM(
                CASE
                  WHEN result='DUPLICATE'
                  THEN 1 ELSE 0
                END
              ) AS duplicates,

              SUM(
                CASE
                  WHEN result='INVALID'
                  THEN 1 ELSE 0
                END
              ) AS invalid,

              SUM(
                CASE
                  WHEN result='PAYMENT_PENDING'
                  THEN 1 ELSE 0
                END
              ) AS payment_pending

            FROM ticket_access_log
            WHERE event_id=?
          `).get(eventId);

        const accessMinutes=
          db.prepare(`
            SELECT
              strftime(
                '%Y-%m-%d %H:%M',
                created_at,
                'localtime'
              ) AS minute,

              COUNT(*) AS attempts,

              SUM(
                CASE
                  WHEN result='ALLOWED'
                  THEN 1 ELSE 0
                END
              ) AS allowed

            FROM ticket_access_log

            WHERE event_id=?

            GROUP BY
              strftime(
                '%Y-%m-%d %H:%M',
                created_at,
                'localtime'
              )

            ORDER BY minute
          `).all(eventId);

        const purchaseHours=
          db.prepare(`
            SELECT
              strftime(
                '%H',
                created_at,
                'localtime'
              ) AS hour,

              COUNT(*) AS orders,

              COALESCE(
                SUM(total),
                0
              ) AS value

            FROM ticket_orders

            WHERE event_id=?
              AND payment_status='PAID'

            GROUP BY
              strftime(
                '%H',
                created_at,
                'localtime'
              )

            ORDER BY orders DESC
          `).all(eventId);

        const salesTimeline=
          db.prepare(`
            SELECT
              date(
                created_at,
                'localtime'
              ) AS day,

              COUNT(*) AS orders,

              COALESCE(
                SUM(quantity),
                0
              ) AS tickets,

              COALESCE(
                SUM(total),
                0
              ) AS revenue

            FROM ticket_orders

            WHERE event_id=?
              AND payment_status='PAID'

            GROUP BY
              date(
                created_at,
                'localtime'
              )

            ORDER BY day
          `).all(eventId);

        const operatorAccess=
          db.prepare(`
            SELECT
              a.user_id,
              COALESCE(
                u.name,
                'Operador'
              ) AS operator_name,

              COUNT(*) AS attempts,

              SUM(
                CASE
                  WHEN a.result='ALLOWED'
                  THEN 1 ELSE 0
                END
              ) AS allowed

            FROM ticket_access_log a

            LEFT JOIN users u
              ON u.id=a.user_id

            WHERE a.event_id=?

            GROUP BY
              a.user_id,
              u.name

            ORDER BY allowed DESC
          `).all(eventId);

        const issued=
          n(ticketMetrics.issued);

        const paid=
          n(ticketMetrics.paid);

        const courtesy=
          n(ticketMetrics.courtesy);

        const checkedIn=
          n(ticketMetrics.checked_in);

        const capacity=
          n(event.capacity);

        const lotCapacity=
          lots.reduce(
            (sum,row)=>
              sum+n(row.quantity),
            0
          );

        const effectiveCapacity=
          capacity||lotCapacity;

        const occupancy=
          pct(
            paid+courtesy,
            effectiveCapacity
          );

        const checkinRate=
          pct(
            checkedIn,
            paid+courtesy
          );

        const noShow=
          Math.max(
            0,
            paid+courtesy-checkedIn
          );

        const noShowRate=
          pct(
            noShow,
            paid+courtesy
          );

        const ticketRevenue=
          n(ticketMetrics.ticket_revenue);

        const orderRevenue=
          n(orderMetrics.paid_value);

        /*
         * Prefer paid order value because it is the
         * commercial transaction total.
         */
        const revenue=
          orderRevenue||ticketRevenue;

        const detailedCosts=
          n(costs.total);

        const estimatedCost=
          n(event.cost_estimate);

        const totalCost=
          detailedCosts>0
            ?detailedCosts
            :estimatedCost;

        const margin=
          revenue-totalCost;

        const marginPercent=
          pct(
            margin,
            revenue
          );

        const averageTicket=
          n(orderMetrics.paid_orders)
            ?round(
                revenue/
                n(orderMetrics.paid_orders)
              )
            :0;

        const latestMinute=
          accessMinutes.length
            ?accessMinutes[
                accessMinutes.length-1
              ]
            :null;

        const recentFive=
          accessMinutes.slice(-5);

        const recentAllowed=
          recentFive.reduce(
            (sum,row)=>
              sum+n(row.allowed),
            0
          );

        const checkinPerMinute=
          recentFive.length
            ?round(
                recentAllowed/
                recentFive.length,
                1
              )
            :0;

        const peakAccess=
          [...accessMinutes]
            .sort(
              (a,b)=>
                n(b.allowed)-
                n(a.allowed)
            )[0]||null;

        const peakPurchase=
          purchaseHours[0]||null;

        const anomalyCount=
          n(access.duplicates)+
          n(access.invalid)+
          n(access.payment_pending);

        const anomalyRate=
          pct(
            anomalyCount,
            n(access.attempts)
          );

        const salesDays=
          salesTimeline.length;

        const soldTickets=
          salesTimeline.reduce(
            (sum,row)=>
              sum+n(row.tickets),
            0
          );

        const salesVelocity=
          salesDays
            ?round(
                soldTickets/
                salesDays,
                1
              )
            :0;

        const recommendations=[];

        if(
          effectiveCapacity>0 &&
          occupancy>=90
        ){

          recommendations.push(
            recommendation(
              "CAPACITY",
              "HIGH",
              "Capacidade próxima do limite",
              `A ocupação comercial está em ${occupancy}%. Avalie encerrar lotes disponíveis e reforçar o controle de capacidade.`,
              occupancy
            )
          );
        }

        if(
          effectiveCapacity>0 &&
          occupancy<40 &&
          paid>0
        ){

          recommendations.push(
            recommendation(
              "SALES",
              "MEDIUM",
              "Ocupação ainda baixa",
              `A ocupação comercial está em ${occupancy}%. Há espaço para intensificar divulgação e conversão antes do evento.`,
              occupancy
            )
          );
        }

        if(
          n(orderMetrics.pending_orders)>0
        ){

          recommendations.push(
            recommendation(
              "PAYMENT",
              "MEDIUM",
              "Pagamentos pendentes",
              `${n(orderMetrics.pending_orders)} pedido(s) ainda representam ${round(n(orderMetrics.pending_value),2)} em valor pendente.`,
              n(orderMetrics.pending_value)
            )
          );
        }

        if(anomalyRate>=5){

          recommendations.push(
            recommendation(
              "GATE",
              anomalyRate>=15
                ?"HIGH"
                :"MEDIUM",
              "Atenção às tentativas de acesso",
              `${anomalyRate}% das tentativas registradas são duplicadas, inválidas ou possuem pagamento pendente.`,
              anomalyRate
            )
          );
        }

        if(
          paid+courtesy>0 &&
          noShowRate>=30
        ){

          recommendations.push(
            recommendation(
              "ACCESS",
              "MEDIUM",
              "Volume relevante ainda sem check-in",
              `${noShow} ingresso(s) emitido(s) ainda não registraram entrada, equivalente a ${noShowRate}%.`,
              noShowRate
            )
          );
        }

        if(
          revenue>0 &&
          margin<0
        ){

          recommendations.push(
            recommendation(
              "FINANCE",
              "HIGH",
              "Evento abaixo do ponto de equilíbrio",
              `A receita confirmada ainda não cobre o custo considerado. Diferença atual: ${round(Math.abs(margin),2)}.`,
              margin
            )
          );
        }

        if(
          revenue>0 &&
          marginPercent>=30
        ){

          recommendations.push(
            recommendation(
              "FINANCE",
              "INFO",
              "Margem positiva",
              `A margem calculada está em ${marginPercent}% sobre a receita confirmada.`,
              marginPercent
            )
          );
        }

        if(
          checkinPerMinute>=10
        ){

          recommendations.push(
            recommendation(
              "GATE",
              "INFO",
              "Fluxo intenso na portaria",
              `A média dos últimos minutos está em ${checkinPerMinute} entradas liberadas por minuto.`,
              checkinPerMinute
            )
          );
        }

        if(!recommendations.length){

          recommendations.push(
            recommendation(
              "STATUS",
              "INFO",
              "Operação estável",
              "Nenhum alerta operacional relevante foi identificado com os dados disponíveis neste momento."
            )
          );
        }

        const lotPerformance=
          lots.map(row=>{

            const quantity=
              n(row.quantity);

            const sold=
              n(row.sold);

            return{
              id:row.id,
              name:row.name,
              price:n(row.price),
              quantity,
              sold,
              paid_tickets:
                n(row.paid_tickets),
              checked_in:
                n(row.checked_in),
              revenue:
                n(row.revenue),
              occupancy_percent:
                pct(
                  sold,
                  quantity
                ),
              checkin_percent:
                pct(
                  n(row.checked_in),
                  n(row.paid_tickets)
                )
            };
          });

        return res.json({

          generated_at:
            new Date().toISOString(),

          engine:
            "NEXUS_EVENT_INTELLIGENCE_V3.7",

          mode:
            "REAL_DATA_DETERMINISTIC",

          event:{
            id:event.id,
            title:event.title,
            event_type:event.event_type,
            venue_name:event.venue_name,
            starts_at:event.starts_at,
            ends_at:event.ends_at,
            status:event.status,
            capacity:effectiveCapacity
          },

          commercial:{
            issued,
            paid,
            courtesy,
            orders:
              n(orderMetrics.orders),
            paid_orders:
              n(orderMetrics.paid_orders),
            pending_orders:
              n(orderMetrics.pending_orders),
            pending_value:
              n(orderMetrics.pending_value),
            occupancy_percent:
              occupancy,
            sales_velocity_per_day:
              salesVelocity,
            average_order:
              averageTicket
          },

          finance:{
            revenue:
              round(revenue),
            detailed_cost:
              round(detailedCosts),
            estimated_cost:
              round(estimatedCost),
            cost_used:
              round(totalCost),
            margin:
              round(margin),
            margin_percent:
              marginPercent
          },

          gate:{
            checked_in:checkedIn,
            checkin_percent:
              checkinRate,
            unused_tickets:
              noShow,
            unused_percent:
              noShowRate,
            attempts:
              n(access.attempts),
            allowed:
              n(access.allowed),
            duplicates:
              n(access.duplicates),
            invalid:
              n(access.invalid),
            payment_pending:
              n(access.payment_pending),
            anomaly_count:
              anomalyCount,
            anomaly_percent:
              anomalyRate,
            current_velocity_per_minute:
              checkinPerMinute,
            last_minute:
              latestMinute,
            peak:
              peakAccess
          },

          peaks:{
            purchase_hour:
              peakPurchase,
            access_minute:
              peakAccess
          },

          lots:
            lotPerformance,

          sales_timeline:
            salesTimeline,

          access_timeline:
            accessMinutes,

          operators:
            operatorAccess,

          cost_categories:
            costCategories,

          recommendations
        });

      }catch(error){

        console.error(
          "EVENT_INTELLIGENCE_V37",
          error
        );

        return res.status(500).json({
          error:
            "EVENT_INTELLIGENCE_FAILED",
          message:
            error.message
        });
      }
    }
  );

  console.log(
    "NEXUS EVENT INTELLIGENCE V3.7 ONLINE"
  );
}
