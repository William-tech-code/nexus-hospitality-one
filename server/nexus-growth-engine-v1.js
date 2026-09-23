function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((n(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n(value)));
}

function divide(a, b, fallback = 0) {
  const d = n(b);
  return d === 0 ? fallback : n(a) / d;
}

function totalInvestment(b) {
  return round(
    n(b.initial_investment) +
    n(b.renovation_investment) +
    n(b.equipment_investment) +
    n(b.initial_inventory_investment) +
    n(b.other_initial_investment)
  );
}

function fixedCosts(b) {
  return round(
    n(b.monthly_rent) +
    n(b.monthly_payroll) +
    n(b.monthly_utilities) +
    n(b.monthly_marketing) +
    n(b.monthly_other_fixed_costs) +
    n(b.monthly_debt_service)
  );
}

function variableRate(b) {
  const revenue = n(b.current_monthly_revenue);

  if (n(b.cmv_percent) > 0) {
    return clamp(n(b.cmv_percent) / 100, 0, 0.95);
  }

  if (revenue > 0 && n(b.monthly_variable_costs) > 0) {
    return clamp(
      n(b.monthly_variable_costs) / revenue,
      0,
      0.95
    );
  }

  if (n(b.gross_margin_percent) > 0) {
    return clamp(
      1 - n(b.gross_margin_percent) / 100,
      0,
      0.95
    );
  }

  return 0;
}

function contributionMargin(b) {
  return clamp(1 - variableRate(b), 0.05, 1);
}

function breakEvenRevenue(b) {
  const margin = contributionMargin(b);

  return round(
    margin > 0
      ? fixedCosts(b) / margin
      : 0
  );
}

function operatingResult(b) {
  const revenue = n(b.current_monthly_revenue);

  return round(
    revenue -
    revenue * variableRate(b) -
    fixedCosts(b)
  );
}

function workingCapitalMonths(b) {
  const monthlyOutflow =
    fixedCosts(b) +
    n(b.monthly_variable_costs);

  const available =
    n(b.working_capital) +
    n(b.available_cash);

  return round(
    divide(
      available,
      monthlyOutflow,
      0
    )
  );
}

function liquidityScore(b) {
  const months = workingCapitalMonths(b);

  if (months >= 6) return 100;
  if (months >= 4) return 90;
  if (months >= 3) return 80;
  if (months >= 2) return 65;
  if (months >= 1) return 45;
  if (months > 0) return 25;

  return 10;
}

function debtScore(b) {
  const revenue = n(b.current_monthly_revenue);
  const debtService = n(b.monthly_debt_service);

  if (debtService <= 0) return 100;
  if (revenue <= 0) return 20;

  const ratio = debtService / revenue;

  if (ratio <= 0.05) return 95;
  if (ratio <= 0.10) return 85;
  if (ratio <= 0.15) return 70;
  if (ratio <= 0.20) return 55;
  if (ratio <= 0.30) return 35;

  return 15;
}

function marginScore(b) {
  const margin =
    n(b.gross_margin_percent) > 0
      ? n(b.gross_margin_percent)
      : contributionMargin(b) * 100;

  if (margin >= 65) return 100;
  if (margin >= 55) return 90;
  if (margin >= 45) return 80;
  if (margin >= 35) return 65;
  if (margin >= 25) return 45;
  if (margin > 0) return 25;

  return 10;
}

function breakEvenScore(b) {
  const revenue = n(b.current_monthly_revenue);
  const point = breakEvenRevenue(b);

  if (revenue <= 0 || point <= 0) return 20;

  const coverage = revenue / point;

  if (coverage >= 1.50) return 100;
  if (coverage >= 1.30) return 90;
  if (coverage >= 1.15) return 80;
  if (coverage >= 1.00) return 65;
  if (coverage >= 0.90) return 45;
  if (coverage >= 0.75) return 30;

  return 15;
}

function revenueScore(b) {
  const revenue = n(b.current_monthly_revenue);

  if (revenue <= 0) return 20;

  const margin = operatingResult(b) / revenue;

  if (margin >= 0.20) return 100;
  if (margin >= 0.15) return 90;
  if (margin >= 0.10) return 80;
  if (margin >= 0.05) return 65;
  if (margin >= 0) return 50;
  if (margin >= -0.10) return 30;

  return 15;
}

function operationalScore(b) {
  let score = 40;

  if (n(b.average_ticket) > 0) score += 15;
  if (n(b.customers_per_month) > 0) score += 15;
  if (n(b.operating_days_per_month) >= 20) score += 10;
  if (n(b.seats_capacity) > 0) score += 10;
  if (n(b.employees_count) > 0) score += 10;

  return clamp(score);
}

function inventoryScore(b) {
  const inventory = n(b.initial_inventory_investment);
  const revenue = n(b.current_monthly_revenue);

  if (inventory <= 0 || revenue <= 0) return 50;

  const ratio = inventory / revenue;

  if (ratio <= 0.15) return 90;
  if (ratio <= 0.30) return 100;
  if (ratio <= 0.50) return 80;
  if (ratio <= 0.75) return 60;
  if (ratio <= 1.00) return 40;

  return 25;
}

function viability(score) {
  if (score >= 85) return "VERY_HIGH";
  if (score >= 70) return "HIGH";
  if (score >= 55) return "MODERATE";
  if (score >= 40) return "ATTENTION";
  return "CRITICAL";
}

function calculateTarget(b, target = {}) {
  const baselineRevenue =
    n(target.baseline_revenue) ||
    n(b.current_monthly_revenue);

  const type =
    String(target.target_type || "2X")
      .trim()
      .toUpperCase();

  let multiplier = n(target.multiplier);

  if (!multiplier) {
    if (type === "2X") multiplier = 2;
    if (type === "3X") multiplier = 3;
  }

  let targetRevenue =
    n(target.target_revenue);

  if (!targetRevenue && multiplier > 0) {
    targetRevenue =
      baselineRevenue * multiplier;
  }

  if (
    type === "CUSTOM" &&
    targetRevenue <= 0
  ) {
    throw new Error("TARGET_REVENUE_REQUIRED");
  }

  if (targetRevenue <= baselineRevenue) {
    throw new Error(
      "TARGET_MUST_EXCEED_BASELINE"
    );
  }

  return {
    target_type: type,
    baseline_revenue:
      round(baselineRevenue),

    target_revenue:
      round(targetRevenue),

    multiplier:
      round(
        multiplier ||
        divide(
          targetRevenue,
          baselineRevenue,
          0
        )
      ),

    revenue_gap:
      round(
        targetRevenue -
        baselineRevenue
      ),

    required_growth_percent:
      baselineRevenue > 0
        ? round(
            (
              targetRevenue /
              baselineRevenue -
              1
            ) * 100
          )
        : 0
  };
}

function calculateScore(b) {
  const components = {
    liquidity: liquidityScore(b),
    debt: debtScore(b),
    margin: marginScore(b),
    break_even: breakEvenScore(b),
    working_capital: liquidityScore(b),
    revenue: revenueScore(b),
    operational: operationalScore(b),
    inventory: inventoryScore(b)
  };

  const weights = {
    liquidity: 0.15,
    debt: 0.15,
    margin: 0.15,
    break_even: 0.15,
    working_capital: 0.10,
    revenue: 0.15,
    operational: 0.10,
    inventory: 0.05
  };

  let score = 0;

  for (const key of Object.keys(weights)) {
    score +=
      components[key] *
      weights[key];
  }

  score = round(score);

  return {
    score,
    components,
    viability_level:
      viability(score)
  };
}

function buildScenarios(b, target) {
  const current =
    n(b.current_monthly_revenue);

  const currentTicket =
    n(b.average_ticket);

  const currentCustomers =
    n(b.customers_per_month);

  const targetRevenue =
    n(target.target_revenue);

  const fallbackTicket =
    currentTicket ||
    divide(
      current,
      currentCustomers,
      0
    );

  const definitions = [
    {
      type: "CONSERVATIVE",
      progress: 0.50,
      ticket: 1.08
    },
    {
      type: "BASE",
      progress: 0.75,
      ticket: 1.15
    },
    {
      type: "EXPANSION",
      progress: 1.00,
      ticket: 1.25
    }
  ];

  return definitions.map(x => {
    const revenue =
      round(
        current +
        (
          targetRevenue -
          current
        ) * x.progress
      );

    const ticket =
      round(
        fallbackTicket *
        x.ticket
      );

    const customers =
      ticket > 0
        ? Math.ceil(
            revenue / ticket
          )
        : 0;

    const projectedProfit =
      round(
        revenue *
        contributionMargin(b) -
        fixedCosts(b)
      );

    return {
      scenario_type: x.type,
      projected_revenue: revenue,
      projected_ticket: ticket,
      projected_customers: customers,
      projected_margin_percent:
        round(
          contributionMargin(b) * 100
        ),
      projected_monthly_profit:
        projectedProfit,

      assumptions: {
        target_progress_percent:
          round(x.progress * 100),

        ticket_growth_percent:
          round(
            (x.ticket - 1) * 100
          )
      }
    };
  });
}

function recommendation(
  category,
  priority,
  title,
  description,
  rationale,
  impact,
  metricKey = null,
  targetValue = null
) {
  return {
    category,
    priority,
    title,
    description,
    rationale,
    expected_impact: impact,
    metric_key: metricKey,
    target_value: targetValue
  };
}

function buildRecommendations(
  b,
  assessment,
  target
) {
  const c = assessment.components;
  const list = [];

  if (c.liquidity < 55) {
    list.push(
      recommendation(
        "WORKING_CAPITAL",
        "CRITICAL",
        "Reforçar capital de giro",
        "Priorizar liquidez antes de acelerar novos investimentos.",
        "A reserva operacional informada está abaixo da faixa de segurança utilizada pelo cenário.",
        "Aumentar resistência a oscilações de caixa.",
        "working_capital_months",
        3
      )
    );
  }

  if (c.debt < 55) {
    list.push(
      recommendation(
        "DEBT",
        "HIGH",
        "Reduzir pressão das dívidas",
        "Revisar parcelas, juros e cronograma de pagamento.",
        "O serviço mensal da dívida pressiona o faturamento informado.",
        "Liberar fluxo de caixa para operação e crescimento.",
        "monthly_debt_service"
      )
    );
  }

  if (c.break_even < 65) {
    list.push(
      recommendation(
        "BREAK_EVEN",
        "HIGH",
        "Criar margem acima do ponto de equilíbrio",
        "Elevar receita e/ou margem antes de acelerar despesas de expansão.",
        "O faturamento está próximo ou abaixo da faixa de equilíbrio calculada.",
        "Aumentar segurança operacional.",
        "break_even_revenue",
        assessment.break_even_revenue
      )
    );
  }

  if (c.margin < 65) {
    list.push(
      recommendation(
        "MARGIN",
        "HIGH",
        "Revisar margem e mix",
        "Analisar preço, custo, fichas técnicas e produtos de baixa contribuição.",
        "A margem atual reduz a capacidade de converter crescimento em caixa.",
        "Aumentar contribuição por venda.",
        "gross_margin_percent",
        45
      )
    );
  }

  if (n(b.average_ticket) > 0) {
    list.push(
      recommendation(
        "AVERAGE_TICKET",
        "MEDIUM",
        "Elevar ticket médio",
        "Utilizar combos, venda complementar, mix e treinamento de atendimento.",
        "A meta não precisa depender somente de aumento de fluxo.",
        "Aumentar receita por atendimento.",
        "average_ticket",
        round(
          n(b.average_ticket) *
          1.15
        )
      )
    );
  }

  if (n(b.customers_per_month) > 0) {
    list.push(
      recommendation(
        "CUSTOMERS",
        "MEDIUM",
        "Aumentar frequência de clientes",
        "Trabalhar dias e horários ociosos e acompanhar conversão.",
        "O crescimento pode combinar maior ticket com maior volume rentável.",
        "Elevar fluxo sem sacrificar margem.",
        "customers_per_month",
        Math.ceil(
          n(b.customers_per_month) *
          1.15
        )
      )
    );
  }

  if (list.length < 3) {
    list.push(
      recommendation(
        "MANAGEMENT",
        "MEDIUM",
        "Acompanhar indicadores semanalmente",
        "Revisar receita, ticket, margem, caixa, estoque e despesas.",
        "Acompanhamento frequente permite corrigir desvios mais cedo.",
        "Melhorar previsibilidade da operação.",
        "growth_score",
        80
      )
    );
  }

  return list.slice(0, 8);
}

export function analyzeGrowth(
  baseline = {},
  targetInput = {}
) {
  const target =
    calculateTarget(
      baseline,
      targetInput
    );

  const score =
    calculateScore(baseline);

  const assessment = {
    growth_score:
      score.score,

    liquidity_score:
      score.components.liquidity,

    debt_score:
      score.components.debt,

    margin_score:
      score.components.margin,

    break_even_score:
      score.components.break_even,

    working_capital_score:
      score.components.working_capital,

    revenue_score:
      score.components.revenue,

    operational_score:
      score.components.operational,

    inventory_score:
      score.components.inventory,

    viability_level:
      score.viability_level,

    break_even_revenue:
      breakEvenRevenue(baseline),

    working_capital_months:
      workingCapitalMonths(baseline),

    revenue_gap:
      target.revenue_gap,

    required_growth_percent:
      target.required_growth_percent,

    total_investment:
      totalInvestment(baseline),

    monthly_fixed_costs:
      fixedCosts(baseline),

    estimated_operating_result:
      operatingResult(baseline),

    components:
      score.components,

    assumptions: {
      methodology:
        "NEXUS_GROWTH_SCORE_V1",

      nature:
        "SCENARIO_ANALYSIS",

      guaranteed_result:
        false,

      disclaimer:
        "Cenarios condicionais baseados nos dados informados e operacionais. Nao constituem garantia de faturamento, lucro ou crescimento."
    }
  };

  return {
    target,
    assessment,

    scenarios:
      buildScenarios(
        baseline,
        target
      ),

    recommendations:
      buildRecommendations(
        baseline,
        assessment,
        target
      )
  };
}

export {
  totalInvestment,
  fixedCosts,
  breakEvenRevenue,
  operatingResult,
  workingCapitalMonths,
  calculateTarget,
  calculateScore,
  buildScenarios,
  buildRecommendations
};