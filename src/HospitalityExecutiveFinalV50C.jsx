import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  hospitalityFinalIntelligenceV50C
} from "./api";

import "./HospitalityExecutiveFinalV50C.css";

const money = value =>
  Number(value || 0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

const number = value =>
  Number(value || 0).toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits:2
    }
  );

const pct = value =>
  value === null ||
  value === undefined
    ? "—"
    : `${number(value)}%`;

function Metric({
  label,
  value,
  detail
}){

  return (
    <article className="nexus-final-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function Section({
  eyebrow,
  title,
  children
}){

  return (
    <section className="nexus-final-section">
      <header>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  );
}

export default function HospitalityExecutiveFinalV50C(){

  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{

    setLoading(true);
    setError("");

    try{

      const response=
        await hospitalityFinalIntelligenceV50C();

      setData(response);

    }catch(err){

      setError(
        err?.message ||
        "Não foi possível carregar a inteligência executiva."
      );

    }finally{
      setLoading(false);
    }

  },[]);

  useEffect(()=>{
    load();
  },[load]);

  const executive=data?.executive || {};
  const products=data?.product_profitability || {};
  const sales=data?.sales || {};
  const inventory=data?.inventory || {};
  const events=data?.events || {};
  const goals=data?.goals || {};
  const growth=data?.growth || {};
  const attention=data?.attention || [];

  const topProducts=useMemo(
    ()=>products?.top_revenue_products || [],
    [products]
  );

  if(loading){

    return (
      <section className="nexus-final-shell">
        <div className="nexus-final-loading">
          Consolidando inteligência executiva…
        </div>
      </section>
    );
  }

  if(error){

    return (
      <section className="nexus-final-shell">
        <div className="nexus-final-error">
          <strong>Inteligência executiva indisponível</strong>
          <span>{error}</span>
          <button onClick={load}>
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="nexus-final-shell">

      <div className="nexus-final-hero">

        <div>
          <span className="nexus-final-kicker">
            NEXUS HOSPITALITY ONE • OWNER INTELLIGENCE
          </span>

          <h2>
            Executive Command
          </h2>

          <p>
            Vendas, margem, estoque, eventos, metas,
            crescimento e pressão financeira em uma
            visão gerencial consolidada.
          </p>
        </div>

        <div className="nexus-final-hero-side">

          <span>Growth Readiness</span>

          <strong>
            {executive.growth_readiness || "—"}
          </strong>

          <div>
            Score {number(executive.growth_score)} / 100
          </div>

          <button onClick={load}>
            Recalcular
          </button>

        </div>
      </div>

      <div className="nexus-final-grid">

        <Metric
          label="Faturamento • 30 dias"
          value={money(executive.revenue_30)}
          detail="Vendas registradas como PAID"
        />

        <Metric
          label="Ticket médio"
          value={money(executive.average_ticket)}
          detail="Últimos 30 dias"
        />

        <Metric
          label="Tendência • 7 dias"
          value={pct(executive.revenue_trend_7_percent)}
          detail="Comparativo com os 7 dias anteriores"
        />

        <Metric
          label="Dívida aberta"
          value={money(executive.open_debt)}
          detail={`Vencida: ${money(executive.overdue_debt)}`}
        />

        <Metric
          label="Estoque estimado"
          value={money(executive.inventory_value)}
          detail="Custo cadastrado × estoque atual"
        />

        <Metric
          label="Produtos abaixo do mínimo"
          value={number(executive.low_stock_products)}
          detail="Atenção operacional"
        />

        <Metric
          label="Ingressos pagos"
          value={money(executive.ticket_revenue)}
          detail="Receita identificável de ticket_orders"
        />

        <Metric
          label="Metas ativas"
          value={number(executive.active_goals)}
          detail="Performance acompanhada"
        />

      </div>

      <Section
        eyebrow="PRIORIDADES"
        title="Fila Executiva de Atenção"
      >

        {attention.length === 0 ? (

          <div className="nexus-final-empty">
            Nenhuma prioridade crítica foi identificada
            nos dados registrados.
          </div>

        ) : (

          <div className="nexus-final-attention">

            {attention.map((item,index)=>(
              <article
                key={`${item.priority}-${index}`}
                className="nexus-final-attention-card"
              >
                <span>{item.priority}</span>
                <strong>{item.title}</strong>
                <small>
                  Evidência: {number(item.value)}
                </small>
              </article>
            ))}

          </div>
        )}

      </Section>

      <div className="nexus-final-two">

        <Section
          eyebrow="R9"
          title="Rentabilidade de Produtos"
        >

          <div className="nexus-final-table">

            <div className="nexus-final-table-head">
              <span>Produto</span>
              <span>Receita</span>
              <span>Margem</span>
            </div>

            {topProducts.length === 0 ? (

              <div className="nexus-final-empty">
                Ainda não há vendas PAID suficientes
                para formar o ranking.
              </div>

            ) : (

              topProducts.slice(0,8).map(item=>(
                <div
                  className="nexus-final-table-row"
                  key={item.id}
                >
                  <span>{item.name}</span>
                  <strong>{money(item.revenue)}</strong>
                  <span>{pct(item.margin_percent)}</span>
                </div>
              ))
            )}

          </div>

        </Section>

        <Section
          eyebrow="R10"
          title="Inteligência de Vendas"
        >

          <div className="nexus-final-facts">

            <div>
              <span>Vendas em 30 dias</span>
              <strong>{number(sales.sales_30)}</strong>
            </div>

            <div>
              <span>Melhor dia da semana</span>
              <strong>
                {
                  sales.strongest_weekday
                    ? `Dia ${sales.strongest_weekday.weekday}`
                    : "—"
                }
              </strong>
            </div>

            <div>
              <span>Melhor horário</span>
              <strong>
                {
                  sales.strongest_hour
                    ? `${sales.strongest_hour.hour}h`
                    : "—"
                }
              </strong>
            </div>

          </div>

        </Section>

      </div>

      <div className="nexus-final-two">

        <Section
          eyebrow="R11"
          title="Eventos"
        >

          <div className="nexus-final-facts">

            <div>
              <span>Pedidos pagos</span>
              <strong>
                {number(events.paid_ticket_orders)}
              </strong>
            </div>

            <div>
              <span>Ingressos emitidos</span>
              <strong>
                {number(events.issued_tickets)}
              </strong>
            </div>

            <div>
              <span>Check-ins</span>
              <strong>
                {number(events.checked_in)}
              </strong>
            </div>

            <div>
              <span>Receita identificada</span>
              <strong>
                {money(events.ticket_revenue)}
              </strong>
            </div>

          </div>

          <p className="nexus-final-note">
            Resultado líquido do evento não é inventado:
            só será apresentado quando houver vínculo
            comprovável dos custos ao evento.
          </p>

        </Section>

        <Section
          eyebrow="R12"
          title="Estoque & Capital Operacional"
        >

          <div className="nexus-final-facts">

            <div>
              <span>Valor estimado</span>
              <strong>
                {money(inventory.estimated_inventory_value)}
              </strong>
            </div>

            <div>
              <span>Reposição até mínimo</span>
              <strong>
                {money(
                  inventory.estimated_replenishment_cost_to_minimum
                )}
              </strong>
            </div>

            <div>
              <span>Perdas registradas • 30d</span>
              <strong>
                {money(inventory.registered_losses_30)}
              </strong>
            </div>

            <div>
              <span>Movimentações • 30d</span>
              <strong>
                {number(inventory.movements_30)}
              </strong>
            </div>

          </div>

        </Section>

      </div>

      <Section
        eyebrow="R13"
        title="Metas & Ritmo Necessário"
      >

        {(goals.goals || []).length === 0 ? (

          <div className="nexus-final-empty">
            Nenhuma meta ativa cadastrada.
          </div>

        ) : (

          <div className="nexus-final-goals">

            {goals.goals.map(goal=>(

              <article
                key={goal.id}
                className="nexus-final-goal"
              >

                <div>
                  <span>{goal.type || "META"}</span>
                  <strong>{goal.title}</strong>
                </div>

                <div>
                  <span>Meta</span>
                  <strong>
                    {money(goal.target_value)}
                  </strong>
                </div>

                <div>
                  <span>Realizado observado</span>
                  <strong>
                    {money(goal.observed_current_value)}
                  </strong>
                </div>

                <div>
                  <span>Gap</span>
                  <strong>
                    {money(goal.gap)}
                  </strong>
                </div>

                <div>
                  <span>Ritmo necessário</span>
                  <strong>
                    {
                      goal.required_daily === null
                        ? "—"
                        : money(goal.required_daily)
                    }
                  </strong>
                </div>

              </article>
            ))}

          </div>
        )}

      </Section>

      <Section
        eyebrow="R8"
        title="Growth & Expansion Intelligence"
      >

        <div className="nexus-final-growth">

          <div className="nexus-final-score">
            <strong>{number(growth.score)}</strong>
            <span>/ 100</span>
          </div>

          <div>
            <strong>
              {growth.readiness || "—"}
            </strong>

            <p>
              O indicador é gerencial e determinístico.
              Não representa autorização automática para
              investimento, crédito ou abertura de unidade.
            </p>
          </div>

        </div>

        <div className="nexus-final-actions">

          {(growth.actions || []).map(
            (action,index)=>(
              <article key={`${action.action}-${index}`}>
                <span>{action.priority}</span>
                <strong>{action.action}</strong>
                <small>
                  {
                    action.human_authorization_required
                      ? "Decisão humana obrigatória"
                      : "Recomendação gerencial"
                  }
                </small>
              </article>
            )
          )}

        </div>

      </Section>

      <Section
        eyebrow="R14–R18"
        title="Governança da Plataforma"
      >

        <div className="nexus-final-governance">

          <div>
            <span>Multi-unit</span>
            <strong>
              {data?.multi_unit?.current_mode || "—"}
            </strong>
          </div>

          <div>
            <span>Execução de alto impacto</span>
            <strong>
              {data?.security?.execution_policy || "—"}
            </strong>
          </div>

          <div>
            <span>Engine</span>
            <strong>
              {data?.engine?.type || "—"}
            </strong>
          </div>

          <div>
            <span>IA obrigatória</span>
            <strong>
              {data?.engine?.ai_required ? "SIM" : "NÃO"}
            </strong>
          </div>

        </div>

      </Section>

      <footer className="nexus-final-footer">

        <strong>
          NEXUS HOSPITALITY ONE • V5.0C MASTER FINAL
        </strong>

        <span>
          Dados gerenciais baseados exclusivamente nos
          registros disponíveis no sistema.
        </span>

        <span>
          Saldo bancário, lucro garantido, liquidez futura
          e capacidade automática de investimento não são
          inferidos.
        </span>

        <span>
          Homologação operacional e impressão física POS-80
          permanecem pendentes.
        </span>

      </footer>

    </section>
  );
}
