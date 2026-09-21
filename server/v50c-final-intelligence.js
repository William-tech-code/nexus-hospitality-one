/*
 * NEXUS HOSPITALITY ONE
 * V5.0C MASTER FINAL R8-R18
 *
 * Deterministic managerial intelligence.
 * Read-only analytics.
 * No automatic high-impact execution.
 */

export function createHospitalityFinalIntelligence({ db }) {

  const num = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const round = value =>
    Math.round((num(value) + Number.EPSILON) * 100) / 100;

  const clamp = (value,min,max) =>
    Math.min(max,Math.max(min,num(value)));

  const hasTable = table => {
    try {
      return !!db.prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
      ).get(table);
    } catch {
      return false;
    }
  };

  const columns = table => {
    if(!hasTable(table)) return [];
    try {
      return db.prepare(`PRAGMA table_info("${table}")`).all().map(x=>x.name);
    } catch {
      return [];
    }
  };

  const hasColumn = (table,column) =>
    columns(table).includes(column);

  const scalar = (sql,params={}) => {
    try {
      const row = db.prepare(sql).get(params);
      if(!row) return 0;
      const key = Object.keys(row)[0];
      return num(row[key]);
    } catch {
      return 0;
    }
  };

  const rows = (sql,params={}) => {
    try {
      return db.prepare(sql).all(params);
    } catch {
      return [];
    }
  };

  const paidSalesWhere = `
    UPPER(COALESCE(status,''))='PAID'
  `;

  function salesIntelligence(){

    if(!hasTable('sales')){
      return {
        available:false,
        reason:'SALES_TABLE_NOT_AVAILABLE'
      };
    }

    const revenue30 = scalar(`
      SELECT COALESCE(SUM(total),0)
      FROM sales
      WHERE ${paidSalesWhere}
        AND datetime(created_at)>=datetime('now','-30 days')
    `);

    const sales30 = scalar(`
      SELECT COUNT(*)
      FROM sales
      WHERE ${paidSalesWhere}
        AND datetime(created_at)>=datetime('now','-30 days')
    `);

    const revenue7 = scalar(`
      SELECT COALESCE(SUM(total),0)
      FROM sales
      WHERE ${paidSalesWhere}
        AND datetime(created_at)>=datetime('now','-7 days')
    `);

    const previous7 = scalar(`
      SELECT COALESCE(SUM(total),0)
      FROM sales
      WHERE ${paidSalesWhere}
        AND datetime(created_at)>=datetime('now','-14 days')
        AND datetime(created_at)<datetime('now','-7 days')
    `);

    const averageTicket =
      sales30 > 0
        ? round(revenue30 / sales30)
        : 0;

    const trend7 =
      previous7 > 0
        ? round(((revenue7-previous7)/previous7)*100)
        : null;

    const weekdays = rows(`
      SELECT
        CAST(strftime('%w',created_at) AS INTEGER) weekday,
        COUNT(*) sales_count,
        ROUND(COALESCE(SUM(total),0),2) revenue
      FROM sales
      WHERE ${paidSalesWhere}
        AND datetime(created_at)>=datetime('now','-90 days')
      GROUP BY strftime('%w',created_at)
      ORDER BY revenue DESC
    `);

    const hours = rows(`
      SELECT
        CAST(strftime('%H',created_at) AS INTEGER) hour,
        COUNT(*) sales_count,
        ROUND(COALESCE(SUM(total),0),2) revenue
      FROM sales
      WHERE ${paidSalesWhere}
        AND datetime(created_at)>=datetime('now','-90 days')
      GROUP BY strftime('%H',created_at)
      ORDER BY revenue DESC
    `);

    return {
      available:true,
      revenue_7:round(revenue7),
      revenue_30:round(revenue30),
      sales_30:sales30,
      average_ticket:averageTicket,
      trend_7_percent:trend7,
      weekday_performance:weekdays,
      hourly_performance:hours,
      strongest_weekday:weekdays[0] || null,
      strongest_hour:hours[0] || null,
      semantics:{
        revenue_basis:'PAID_SALES',
        payment_splits_added_to_revenue:false
      }
    };
  }

  function productIntelligence(){

    if(
      !hasTable('sale_items') ||
      !hasTable('sales') ||
      !hasTable('products')
    ){
      return {
        available:false,
        reason:'PRODUCT_SALES_SOURCE_NOT_AVAILABLE'
      };
    }

    const qtyColumn =
      hasColumn('sale_items','qty')
        ? 'qty'
        : (
            hasColumn('sale_items','quantity')
              ? 'quantity'
              : null
          );

    if(!qtyColumn){
      return {
        available:false,
        reason:'SALE_ITEM_QUANTITY_COLUMN_NOT_AVAILABLE'
      };
    }

    const data = rows(`
      SELECT
        p.id,
        p.name,
        p.category,
        p.price current_price,
        p.cost registered_cost,
        p.target_margin,
        p.suggested_price,
        ROUND(COALESCE(SUM(si.${qtyColumn}),0),3) qty_sold,
        ROUND(COALESCE(SUM(si.${qtyColumn} * si.unit_price),0),2) revenue,
        ROUND(COALESCE(SUM(si.${qtyColumn} * si.unit_cost),0),2) historical_cmv
      FROM sale_items si
      JOIN sales s ON s.id=si.sale_id
      JOIN products p ON p.id=si.product_id
      WHERE UPPER(COALESCE(s.status,''))='PAID'
        AND datetime(s.created_at)>=datetime('now','-90 days')
      GROUP BY
        p.id,
        p.name,
        p.category,
        p.price,
        p.cost,
        p.target_margin,
        p.suggested_price
      ORDER BY revenue DESC
    `).map(item=>{

      const revenue=num(item.revenue);
      const cmv=num(item.historical_cmv);
      const contribution=round(revenue-cmv);

      const margin =
        revenue > 0
          ? round((contribution/revenue)*100)
          : null;

      let classification='NO_SALES_DATA';

      if(revenue>0){
        if(margin>=60) classification='HIGH_MARGIN';
        else if(margin>=40) classification='HEALTHY_MARGIN';
        else if(margin>=25) classification='ATTENTION_MARGIN';
        else classification='LOW_MARGIN';
      }

      return {
        ...item,
        contribution,
        margin_percent:margin,
        classification
      };
    });

    const categoryMap={};

    for(const item of data){

      const category=item.category || 'SEM_CATEGORIA';

      if(!categoryMap[category]){
        categoryMap[category]={
          category,
          revenue:0,
          cmv:0,
          contribution:0,
          qty_sold:0
        };
      }

      categoryMap[category].revenue += num(item.revenue);
      categoryMap[category].cmv += num(item.historical_cmv);
      categoryMap[category].contribution += num(item.contribution);
      categoryMap[category].qty_sold += num(item.qty_sold);
    }

    const categories =
      Object.values(categoryMap)
        .map(x=>({
          ...x,
          revenue:round(x.revenue),
          cmv:round(x.cmv),
          contribution:round(x.contribution),
          qty_sold:round(x.qty_sold),
          margin_percent:
            x.revenue>0
              ? round((x.contribution/x.revenue)*100)
              : null
        }))
        .sort((a,b)=>b.revenue-a.revenue);

    return {
      available:true,
      period_days:90,
      products:data,
      categories,
      top_revenue_products:data.slice(0,10),
      low_margin_products:
        data
          .filter(x=>x.margin_percent!==null && x.margin_percent<25)
          .slice(0,10),
      semantics:{
        margin_type:'HISTORICAL_GROSS_CONTRIBUTION',
        cmv_basis:'SALE_ITEM_UNIT_COST',
        registered_product_cost_is_not_historical_cmv:true
      }
    };
  }

  function inventoryIntelligence(){

    if(!hasTable('products')){
      return {
        available:false,
        reason:'PRODUCTS_TABLE_NOT_AVAILABLE'
      };
    }

    const products = rows(`
      SELECT
        id,
        name,
        category,
        price,
        cost,
        stock,
        minimum_stock,
        active
      FROM products
      WHERE COALESCE(active,1)=1
      ORDER BY name
    `);

    let estimatedValue=0;
    let lowStock=0;
    let belowMinimumValue=0;

    const mapped=products.map(p=>{

      const stock=num(p.stock);
      const minimum=num(p.minimum_stock);
      const cost=num(p.cost);

      const value=round(stock*cost);

      estimatedValue+=value;

      const shortage=Math.max(minimum-stock,0);

      if(shortage>0){
        lowStock++;
        belowMinimumValue+=shortage*cost;
      }

      return {
        ...p,
        estimated_inventory_value:value,
        shortage_qty:round(shortage),
        below_minimum:shortage>0
      };
    });

    const losses30 =
      hasTable('inventory_losses')
        ? scalar(`
            SELECT COALESCE(SUM(total_cost),0)
            FROM inventory_losses
            WHERE datetime(created_at)>=datetime('now','-30 days')
          `)
        : 0;

    const movements30 =
      hasTable('stock_movements')
        ? scalar(`
            SELECT COUNT(*)
            FROM stock_movements
            WHERE datetime(created_at)>=datetime('now','-30 days')
          `)
        : 0;

    return {
      available:true,
      active_products:products.length,
      estimated_inventory_value:round(estimatedValue),
      low_stock_products:lowStock,
      estimated_replenishment_cost_to_minimum:
        round(belowMinimumValue),
      registered_losses_30:round(losses30),
      movements_30:movements30,
      products:mapped,
      semantics:{
        inventory_value_is_cash:false,
        valuation_basis:'REGISTERED_PRODUCT_COST_X_CURRENT_STOCK',
        replenishment_cost_is_estimate:true
      }
    };
  }

  function eventIntelligence(){

    const hasOrders=hasTable('ticket_orders');
    const hasTickets=hasTable('tickets');
    const hasLots=hasTable('ticket_lots');
    const hasAccess=hasTable('ticket_access_log');

    if(!hasOrders && !hasTickets){
      return {
        available:false,
        reason:'EVENT_TICKETING_SOURCE_NOT_AVAILABLE'
      };
    }

    const paidOrders =
      hasOrders
        ? scalar(`
            SELECT COUNT(*)
            FROM ticket_orders
            WHERE UPPER(COALESCE(payment_status,''))='PAID'
          `)
        : 0;

    const ticketRevenue =
      hasOrders
        ? scalar(`
            SELECT COALESCE(SUM(total),0)
            FROM ticket_orders
            WHERE UPPER(COALESCE(payment_status,''))='PAID'
          `)
        : 0;

    const issuedTickets =
      hasTickets
        ? scalar(`SELECT COUNT(*) FROM tickets`)
        : 0;

    const checkedIn =
      hasTickets && hasColumn('tickets','checkin_at')
        ? scalar(`
            SELECT COUNT(*)
            FROM tickets
            WHERE checkin_at IS NOT NULL
          `)
        : 0;

    const lots =
      hasLots
        ? rows(`
            SELECT
              id,
              event_id,
              name,
              price,
              quantity,
              sold,
              status
            FROM ticket_lots
            ORDER BY event_id,id
          `)
        : [];

    const accessAttempts =
      hasAccess
        ? scalar(`SELECT COUNT(*) FROM ticket_access_log`)
        : 0;

    return {
      available:true,
      paid_ticket_orders:paidOrders,
      ticket_revenue:round(ticketRevenue),
      issued_tickets:issuedTickets,
      checked_in:checkedIn,
      access_attempts:accessAttempts,
      lots,
      event_profit:null,
      semantics:{
        ticket_revenue_basis:'PAID_TICKET_ORDERS',
        event_cost_attribution_available:false,
        event_profit_calculated:false,
        invented_event_attribution:false
      }
    };
  }

  function goalsIntelligence(sales){

    if(!hasTable('goals')){
      return {
        available:false,
        reason:'GOALS_TABLE_NOT_AVAILABLE'
      };
    }

    const goals=rows(`
      SELECT
        id,
        title,
        type,
        target_value,
        current_value,
        deadline,
        active,
        created_at,
        employee_id
      FROM goals
      WHERE COALESCE(active,1)=1
      ORDER BY deadline IS NULL, deadline, id DESC
    `);

    const revenue30=num(sales?.revenue_30);
    const currentDaily=round(revenue30/30);

    const mapped=goals.map(goal=>{

      const target=num(goal.target_value);
      const storedCurrent=num(goal.current_value);

      let observedCurrent=storedCurrent;

      const type=String(goal.type||'').toUpperCase();

      if(
        type.includes('REVENUE') ||
        type.includes('FATUR') ||
        type.includes('VENDA')
      ){
        observedCurrent=revenue30;
      }

      const gap=Math.max(target-observedCurrent,0);

      let daysRemaining=null;
      let requiredDaily=null;

      if(goal.deadline){

        const deadline=new Date(goal.deadline);
        const now=new Date();

        if(!Number.isNaN(deadline.getTime())){

          daysRemaining=Math.max(
            Math.ceil(
              (deadline.getTime()-now.getTime()) /
              86400000
            ),
            0
          );

          requiredDaily =
            daysRemaining>0
              ? round(gap/daysRemaining)
              : (
                  gap>0
                    ? null
                    : 0
                );
        }
      }

      return {
        ...goal,
        observed_current_value:round(observedCurrent),
        gap:round(gap),
        days_remaining:daysRemaining,
        required_daily:requiredDaily,
        current_daily_pace:currentDaily,
        progress_percent:
          target>0
            ? round(clamp((observedCurrent/target)*100,0,999))
            : null
      };
    });

    return {
      available:true,
      active_goals:mapped.length,
      goals:mapped,
      semantics:{
        persisted_current_value_preserved:true,
        revenue_goal_observed_value_uses_paid_sales_30:true,
        projection_is_not_guarantee:true
      }
    };
  }

  function debtSnapshot(){

    const openDebt =
      hasTable('financial_debts')
        ? scalar(`
            SELECT COALESCE(SUM(current_balance),0)
            FROM financial_debts
            WHERE UPPER(COALESCE(status,''))='OPEN'
          `)
        : 0;

    const overdueDebt =
      hasTable('financial_debts')
        ? scalar(`
            SELECT COALESCE(SUM(current_balance),0)
            FROM financial_debts
            WHERE UPPER(COALESCE(status,''))='OPEN'
              AND due_date IS NOT NULL
              AND date(due_date)<date('now')
          `)
        : 0;

    return {
      open_debt:round(openDebt),
      overdue_debt:round(overdueDebt)
    };
  }

  function growthIntelligence({
    sales,
    products,
    inventory,
    events,
    debt
  }){

    const trend=num(sales?.trend_7_percent);

    const productRows=products?.products || [];

    const marginRows=
      productRows.filter(x=>x.margin_percent!==null);

    const avgMargin =
      marginRows.length
        ? round(
            marginRows.reduce(
              (sum,x)=>sum+num(x.margin_percent),
              0
            ) / marginRows.length
          )
        : null;

    const debtToRevenue =
      num(sales?.revenue_30)>0
        ? round(
            (num(debt.open_debt)/num(sales.revenue_30))*100
          )
        : null;

    let score=50;

    if(trend>=15) score+=12;
    else if(trend>0) score+=6;
    else if(trend<=-15) score-=12;
    else if(trend<0) score-=6;

    if(avgMargin!==null){
      if(avgMargin>=45) score+=10;
      else if(avgMargin<25) score-=10;
    }

    if(num(debt.overdue_debt)>0) score-=20;

    if(
      debtToRevenue!==null &&
      debtToRevenue>100
    ){
      score-=12;
    }

    if(num(inventory.low_stock_products)>0){
      score-=5;
    }

    if(num(events.ticket_revenue)>0){
      score+=5;
    }

    score=clamp(score,0,100);

    let readiness='STABILIZE';

    if(score>=80) readiness='STRONGER_READINESS';
    else if(score>=65) readiness='CONTROLLED_GROWTH';
    else if(score>=50) readiness='CONSOLIDATE_FIRST';

    const actions=[];

    if(num(debt.overdue_debt)>0){
      actions.push({
        priority:'P0',
        action:'REVIEW_OVERDUE_DEBT',
        human_authorization_required:true
      });
    }

    if(trend<0){
      actions.push({
        priority:'P1',
        action:'RECOVER_REVENUE_MOMENTUM',
        human_authorization_required:false
      });
    }

    if(
      avgMargin!==null &&
      avgMargin<30
    ){
      actions.push({
        priority:'P1',
        action:'REVIEW_PRODUCT_MARGIN',
        human_authorization_required:false
      });
    }

    if(num(inventory.low_stock_products)>0){
      actions.push({
        priority:'P1',
        action:'REVIEW_LOW_STOCK',
        human_authorization_required:false
      });
    }

    if(score>=65){
      actions.push({
        priority:'P2',
        action:'SIMULATE_GROWTH_BEFORE_COMMITTING_CAPITAL',
        human_authorization_required:true
      });
    }

    return {
      score:round(score),
      readiness,
      evidence:{
        revenue_trend_7_percent:
          sales?.trend_7_percent ?? null,
        average_product_margin_percent:
          avgMargin,
        open_debt:debt.open_debt,
        overdue_debt:debt.overdue_debt,
        debt_to_revenue_30_percent:
          debtToRevenue,
        low_stock_products:
          inventory.low_stock_products || 0,
        ticket_revenue:
          events.ticket_revenue || 0
      },
      actions,
      semantics:{
        score_is_managerial_heuristic:true,
        automatic_expansion_authorization:false,
        verified_available_capital:false,
        guaranteed_growth:false
      }
    };
  }

  function multiUnitFoundation(){

    const candidates=[
      'business_units',
      'units',
      'branches'
    ];

    const existing=
      candidates.filter(hasTable);

    return {
      current_mode:
        existing.length
          ? 'EXISTING_UNIT_STRUCTURE_DETECTED'
          : 'SINGLE_UNIT_PRESERVED',

      detected_unit_tables:existing,

      future_model:[
        'BAR',
        'EVENT',
        'FUTURE_UNIT'
      ],

      migration_policy:{
        destructive_retrofit:false,
        historical_records_rewritten:false,
        unit_id_forced_into_existing_tables:false,
        future_schema_migration_required:
          existing.length===0
      }
    };
  }

  function securityAudit(){

    const auditTable =
      hasTable('audit_logs')
        ? 'audit_logs'
        : (
            hasTable('audit_log')
              ? 'audit_log'
              : (
                  hasTable('financial_intelligence_audit')
                    ? 'financial_intelligence_audit'
                    : null
                )
          );

    return {
      users_available:hasTable('users'),
      sessions_available:hasTable('sessions'),
      audit_source:auditTable,
      sale_cancellations:
        hasTable('sale_cancellations'),
      sale_returns:
        hasTable('sale_returns'),
      sale_payment_reversals:
        hasTable('sale_payment_reversals'),
      return_payment_reversals:
        hasTable('sale_return_payment_reversals'),
      high_impact_actions:[
        'PAY_DEBT',
        'TRANSFER_MONEY',
        'CREATE_LOAN',
        'TAKE_CREDIT',
        'APPROVE_PURCHASE',
        'MAKE_INVESTMENT',
        'OPEN_NEW_UNIT',
        'HIRE_EMPLOYEE',
        'DISMISS_EMPLOYEE'
      ],
      execution_policy:
        'HUMAN_AUTHORIZATION_REQUIRED'
    };
  }

  function ownerCockpit(){

    const sales=salesIntelligence();
    const products=productIntelligence();
    const inventory=inventoryIntelligence();
    const events=eventIntelligence();
    const debt=debtSnapshot();
    const goals=goalsIntelligence(sales);

    const growth=growthIntelligence({
      sales,
      products,
      inventory,
      events,
      debt
    });

    const multiUnit=multiUnitFoundation();
    const security=securityAudit();

    const attention=[];

    if(num(debt.overdue_debt)>0){
      attention.push({
        priority:'P0',
        title:'Dívidas vencidas registradas',
        value:debt.overdue_debt
      });
    }

    if(
      sales.trend_7_percent!==null &&
      sales.trend_7_percent<0
    ){
      attention.push({
        priority:'P1',
        title:'Queda de faturamento no comparativo de 7 dias',
        value:sales.trend_7_percent
      });
    }

    if(num(inventory.low_stock_products)>0){
      attention.push({
        priority:'P1',
        title:'Produtos abaixo do estoque mínimo',
        value:inventory.low_stock_products
      });
    }

    const priorityOrder={
      P0:0,
      P1:1,
      P2:2,
      P3:3
    };

    attention.sort(
      (a,b)=>
        (priorityOrder[a.priority]??9) -
        (priorityOrder[b.priority]??9)
    );

    return {
      version:'V5.0C-MASTER-R8-R18',
      generated_at:new Date().toISOString(),

      executive:{
        revenue_30:sales.revenue_30 || 0,
        average_ticket:sales.average_ticket || 0,
        revenue_trend_7_percent:
          sales.trend_7_percent ?? null,
        open_debt:debt.open_debt,
        overdue_debt:debt.overdue_debt,
        inventory_value:
          inventory.estimated_inventory_value || 0,
        low_stock_products:
          inventory.low_stock_products || 0,
        ticket_revenue:
          events.ticket_revenue || 0,
        growth_score:growth.score,
        growth_readiness:growth.readiness,
        active_goals:goals.active_goals || 0
      },

      sales,
      product_profitability:products,
      inventory,
      events,
      goals,
      debt,
      growth,
      multi_unit:multiUnit,
      security,
      attention,

      integration:{
        financial_truth:'/api/v50c/financial-truth',
        financial_calendar:'/api/v50c/financial-calendar',
        cash_flow_dre:'/api/v50c/cash-flow-dre',
        financial_forecast:'/api/v50c/financial-forecast',
        financial_mentor:'/api/v50c/financial-mentor',
        final_intelligence:'/api/v50c/final-intelligence'
      },

      engine:{
        type:'DETERMINISTIC_HOSPITALITY_INTELLIGENCE',
        ai_required:false,
        automatic_high_impact_execution:false,
        human_authorization_required:true
      },

      semantics:{
        bank_balance_fabricated:false,
        inventory_value_is_cash:false,
        payment_splits_added_to_revenue:false,
        event_profit_invented:false,
        guaranteed_revenue:false,
        guaranteed_profit:false,
        guaranteed_liquidity:false,
        automatic_investment_capacity:false,
        automatic_borrowing_capacity:false,
        automatic_expansion_authorization:false,
        operational_homologation_executed:false,
        pos80_physical_validation:false
      }
    };
  }

  return {
    ownerCockpit
  };
}
