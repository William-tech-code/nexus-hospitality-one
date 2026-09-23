import {db} from "./db.js";

/*
 * NEXUS FIRST ACCESS + GROWTH MONITOR V1
 *
 * Rules:
 * - Growth is available to every paid plan.
 * - Mandatory financial onboarding applies only to OWNER.
 * - Gate only becomes mandatory when tenant AND subscription are ACTIVE.
 * - PENDING commercial environments are never locked.
 * - Non-owner operational users are never sent to financial onboarding.
 *
 * Monitoring:
 * - Marco Zero remains immutable historical baseline.
 * - 30 / 60 / 90 day snapshots are generated at most once per period.
 * - Revenue is always scoped from the tenant-aware sales parent table.
 */

const PERIODS = [
  {label:"30_DAYS",days:30},
  {label:"60_DAYS",days:60},
  {label:"90_DAYS",days:90}
];

function num(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

function tableColumns(table){
  return new Set(
    db.prepare(`PRAGMA table_info(${table})`)
      .all()
      .map(x=>x.name)
  );
}

function dateDiffDays(from,to=new Date()){
  if(!from)return 0;

  const start=new Date(
    String(from).replace(" ","T")+"Z"
  );

  if(Number.isNaN(start.getTime())){
    return 0;
  }

  return Math.floor(
    (to.getTime()-start.getTime()) /
    86400000
  );
}

function resolveCommercialContext(userId,tenantId){

  const membership=db.prepare(`
    SELECT
      stu.tenant_role,
      stu.active membership_active,
      t.status tenant_status,
      t.owner_user_id
    FROM saas_tenant_users stu
    JOIN saas_tenants t
      ON t.id=stu.tenant_id
    WHERE stu.tenant_id=?
      AND stu.user_id=?
      AND stu.active=1
    LIMIT 1
  `).get(tenantId,userId);

  if(!membership){
    return {
      tenant_id:tenantId,
      membership:false,
      tenant_role:null,
      tenant_status:null,
      subscription_status:null,
      plan_code:null,
      plan_name:null,
      growth_enabled:false,
      onboarding_status:null,
      current_step:null,
      first_access_required:false
    };
  }

  const subscription=db.prepare(`
    SELECT
      s.id subscription_id,
      s.status subscription_status,
      p.code plan_code,
      p.name plan_name,
      p.features_json
    FROM saas_subscriptions s
    JOIN saas_plans p
      ON p.id=s.plan_id
    WHERE s.tenant_id=?
    ORDER BY
      CASE s.status
        WHEN 'ACTIVE' THEN 1
        WHEN 'TRIAL' THEN 2
        WHEN 'PENDING' THEN 3
        WHEN 'PAST_DUE' THEN 4
        ELSE 5
      END,
      s.id DESC
    LIMIT 1
  `).get(tenantId);

  const onboarding=db.prepare(`
    SELECT
      onboarding_status,
      current_step,
      completed_at
    FROM nexus_business_onboarding
    WHERE tenant_id=?
  `).get(tenantId);

  let features={};

  try{
    features=subscription?.features_json
      ?JSON.parse(subscription.features_json)
      :{};
  }catch{
    features={};
  }

  const growthEnabled=
    features.growth===true ||
    features?.growth_intelligence?.enabled===true;

  const isOwner=
    String(membership.tenant_role||"")
      .toUpperCase()==="OWNER";

  const commercialActive=
    String(membership.tenant_status||"")
      .toUpperCase()==="ACTIVE" &&
    ["ACTIVE","TRIAL"].includes(
      String(subscription?.subscription_status||"")
        .toUpperCase()
    );

  const completed=
    String(onboarding?.onboarding_status||"")
      .toUpperCase()==="COMPLETED";

  return {
    tenant_id:tenantId,
    membership:true,
    tenant_role:membership.tenant_role,
    tenant_status:membership.tenant_status,
    subscription_id:subscription?.subscription_id||null,
    subscription_status:subscription?.subscription_status||null,
    plan_code:subscription?.plan_code||null,
    plan_name:subscription?.plan_name||null,
    growth_enabled:growthEnabled,
    onboarding_status:onboarding?.onboarding_status||null,
    current_step:onboarding?.current_step||1,

    first_access_required:Boolean(
      isOwner &&
      commercialActive &&
      growthEnabled &&
      !completed
    )
  };
}

function aggregatePeriod(tenantId,startDate,endDate){

  const salesCols=tableColumns("sales");

  if(!salesCols.has("tenant_id")){
    throw new Error("SALES_TENANT_ID_REQUIRED");
  }

  const revenueRow=db.prepare(`
    SELECT
      COALESCE(SUM(total + COALESCE(tip_amount,0)),0) revenue,
      COUNT(*) sales_count
    FROM sales
    WHERE tenant_id=?
      AND status='PAID'
      AND datetime(created_at)>=datetime(?)
      AND datetime(created_at)<datetime(?)
  `).get(
    tenantId,
    startDate,
    endDate
  );

  const revenue=num(revenueRow?.revenue);
  const salesCount=num(revenueRow?.sales_count);

  const averageTicket=
    salesCount>0
      ?revenue/salesCount
      :0;

  let expenses=0;

  const expenseCols=tableColumns("expenses");

  if(
    expenseCols.has("tenant_id") &&
    expenseCols.has("amount")
  ){

    const dateColumn=
      expenseCols.has("expense_date")
        ?"expense_date"
        :expenseCols.has("created_at")
          ?"created_at"
          :null;

    if(dateColumn){

      expenses=num(
        db.prepare(`
          SELECT COALESCE(SUM(amount),0) total
          FROM expenses
          WHERE tenant_id=?
            AND datetime(${dateColumn})>=datetime(?)
            AND datetime(${dateColumn})<datetime(?)
        `).get(
          tenantId,
          startDate,
          endDate
        )?.total
      );
    }
  }

  let inventoryValue=0;

  const productCols=tableColumns("products");

  if(
    productCols.has("tenant_id") &&
    productCols.has("stock") &&
    productCols.has("cost")
  ){

    inventoryValue=num(
      db.prepare(`
        SELECT
          COALESCE(
            SUM(
              COALESCE(stock,0) *
              COALESCE(cost,0)
            ),
            0
          ) total
        FROM products
        WHERE tenant_id=?
          AND active=1
      `).get(tenantId)?.total
    );
  }

  return {
    revenue,
    sales_count:salesCount,
    average_ticket:averageTicket,
    expenses,
    inventory_value:inventoryValue
  };
}

function latestAssessment(tenantId){

  return db.prepare(`
    SELECT *
    FROM nexus_growth_assessments
    WHERE tenant_id=?
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
}

function baseline(tenantId){

  return db.prepare(`
    SELECT *
    FROM nexus_growth_baselines
    WHERE tenant_id=?
      AND active=1
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
}

function marcoZero(tenantId){

  return db.prepare(`
    SELECT *
    FROM nexus_growth_snapshots
    WHERE tenant_id=?
      AND period_label='MARCO_ZERO'
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
}

function calculateFollowupScore({
  baselineRow,
  marcoZeroRow,
  current
}){

  const baselineRevenue=
    Math.max(
      1,
      num(
        baselineRow?.current_monthly_revenue ||
        marcoZeroRow?.revenue
      )
    );

  const revenueRatio=
    current.revenue/baselineRevenue;

  const revenueScore=
    Math.max(
      0,
      Math.min(
        100,
        50 + ((revenueRatio-1)*100)
      )
    );

  const expenseRatio=
    current.revenue>0
      ?current.expenses/current.revenue
      :1;

  const efficiencyScore=
    Math.max(
      0,
      Math.min(
        100,
        100-(expenseRatio*100)
      )
    );

  const ticketBase=
    Math.max(
      1,
      num(
        baselineRow?.average_ticket ||
        marcoZeroRow?.average_ticket
      )
    );

  const ticketRatio=
    current.average_ticket/ticketBase;

  const ticketScore=
    Math.max(
      0,
      Math.min(
        100,
        50 + ((ticketRatio-1)*100)
      )
    );

  return Number(
    (
      revenueScore*0.50 +
      efficiencyScore*0.25 +
      ticketScore*0.25
    ).toFixed(2)
  );
}

function createDueSnapshots(tenantId){

  const mz=marcoZero(tenantId);

  if(!mz){
    return {
      created:[],
      reason:"MARCO_ZERO_REQUIRED"
    };
  }

  const base=baseline(tenantId);

  if(!base){
    return {
      created:[],
      reason:"BASELINE_REQUIRED"
    };
  }

  const ageDays=dateDiffDays(
    mz.created_at ||
    mz.snapshot_date
  );

  const created=[];

  const insert=db.prepare(`
    INSERT INTO nexus_growth_snapshots(
      tenant_id,
      snapshot_date,
      period_label,
      revenue,
      average_ticket,
      customers,
      gross_margin_percent,
      available_cash,
      working_capital,
      total_debt,
      inventory_value,
      expenses,
      growth_score,
      source,
      metrics_json
    )
    VALUES(
      ?,
      date('now'),
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      'SYSTEM',
      ?
    )
  `);

  const tx=db.transaction(()=>{

    for(const period of PERIODS){

      if(ageDays<period.days){
        continue;
      }

      const exists=db.prepare(`
        SELECT id
        FROM nexus_growth_snapshots
        WHERE tenant_id=?
          AND period_label=?
        LIMIT 1
      `).get(
        tenantId,
        period.label
      );

      if(exists){
        continue;
      }

      const end=new Date();

      const start=
        new Date(
          end.getTime() -
          period.days*86400000
        );

      const metrics=
        aggregatePeriod(
          tenantId,
          start.toISOString(),
          end.toISOString()
        );

      const score=
        calculateFollowupScore({
          baselineRow:base,
          marcoZeroRow:mz,
          current:metrics
        });

      const info=insert.run(
        tenantId,
        period.label,
        metrics.revenue,
        metrics.average_ticket,
        metrics.sales_count,
        base.gross_margin_percent,
        base.available_cash,
        base.working_capital,
        base.total_debt,
        metrics.inventory_value,
        metrics.expenses,
        score,
        JSON.stringify({
          period_days:period.days,
          start:start.toISOString(),
          end:end.toISOString(),
          revenue:metrics.revenue,
          sales_count:metrics.sales_count,
          average_ticket:metrics.average_ticket,
          expenses:metrics.expenses,
          inventory_value:metrics.inventory_value,
          guaranteed_result:false,
          methodology:
            "Tenant-scoped operational comparison against Marco Zero."
        })
      );

      created.push({
        id:Number(info.lastInsertRowid),
        period_label:period.label,
        growth_score:score
      });
    }
  });

  tx();

  return {
    created,
    age_days:ageDays
  };
}

function monitoringStatus(tenantId){

  const mz=marcoZero(tenantId);

  if(!mz){
    return {
      marco_zero:false,
      age_days:0,
      snapshots:[]
    };
  }

  const ageDays=dateDiffDays(
    mz.created_at ||
    mz.snapshot_date
  );

  const snapshots=db.prepare(`
    SELECT
      id,
      snapshot_date,
      period_label,
      revenue,
      average_ticket,
      customers,
      expenses,
      inventory_value,
      growth_score,
      source,
      created_at
    FROM nexus_growth_snapshots
    WHERE tenant_id=?
    ORDER BY id
  `).all(tenantId);

  return {
    marco_zero:true,
    age_days:ageDays,
    next_checkpoint:
      ageDays<30
        ?30
        :ageDays<60
          ?60
          :ageDays<90
            ?90
            :null,
    snapshots
  };
}

export function registerFirstAccessGrowthV1(
  app,
  {minRole}
){

  app.get(
    "/api/first-access/status",
    (req,res)=>{
      try{

        const commercial=
          resolveCommercialContext(
            req.user.id,
            req.tenantId
          );

        const monitor=
          monitoringStatus(
            req.tenantId
          );

        res.json({
          ok:true,
          commercial,
          monitor
        });

      }catch(error){

        res.status(500).json({
          error:"FIRST_ACCESS_STATUS_ERROR",
          message:error.message
        });
      }
    }
  );


  app.post(
    "/api/growth-v1/monitor/run",
    minRole(80),
    (req,res)=>{
      try{

        const commercial=
          resolveCommercialContext(
            req.user.id,
            req.tenantId
          );

        if(
          String(
            commercial.tenant_role||""
          ).toUpperCase()!=="OWNER"
        ){
          return res.status(403).json({
            error:"OWNER_REQUIRED"
          });
        }

        const result=
          createDueSnapshots(
            req.tenantId
          );

        res.json({
          ok:true,
          result,
          monitor:
            monitoringStatus(
              req.tenantId
            )
        });

      }catch(error){

        res.status(500).json({
          error:"GROWTH_MONITOR_ERROR",
          message:error.message
        });
      }
    }
  );
}

export {
  resolveCommercialContext,
  createDueSnapshots,
  monitoringStatus
};