import React, { useMemo } from "react";
import "./NexusCommandCenterV4.css";

/*
 * NEXUS HOSPITALITY ONE
 * INTELLIGENCE COMMAND CENTER V4
 * PREMIUM EXECUTIVE EXPERIENCE
 *
 * Somente dados reais recebidos do núcleo operacional.
 */

const brl = (value = 0) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const pct = (value = 0) =>
  `${Number(value || 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`;

function Metric({
  label,
  value,
  meta,
  progress = null,
  featured = false,
}) {
  const safeProgress =
    progress === null
      ? null
      : Math.max(0, Math.min(100, Number(progress || 0)));

  return (
    <article className={`nx4-metric ${featured ? "featured" : ""}`}>
      <div className="nx4-metric-label">
        <span>{label}</span>
        <i />
      </div>

      <strong>{value}</strong>
      <small>{meta}</small>

      {safeProgress !== null && (
        <div className="nx4-progress">
          <span style={{ width: `${safeProgress}%` }} />
        </div>
      )}
    </article>
  );
}

function CardTitle({ eyebrow, title, info }) {
  return (
    <header className="nx4-card-title">
      <div>
        <small>{eyebrow}</small>
        <h3>{title}</h3>
      </div>

      {info && <span>{info}</span>}
    </header>
  );
}

export default function NexusCommandCenterV4({
  data,
  cash,
  closing,
  onNavigate,
}) {
  const snapshot = data?.snapshot || {};
  const growth = data?.growth || {};

  const lowStock = Array.isArray(snapshot.lowStock)
    ? snapshot.lowStock
    : [];

  const performance = Array.isArray(data?.performance)
    ? data.performance
    : [];

  const notes = Array.isArray(growth.notes)
    ? growth.notes
    : [];

  const score = Math.max(
    0,
    Math.min(100, Number(growth.score || 0))
  );

  const monthRevenue = Number(snapshot.monthRevenue || 0);
  const monthExpenses = Number(snapshot.monthExpenses || 0);
  const monthBalance = monthRevenue - monthExpenses;

  const intelligence = useMemo(() => {
    const signals = [];

    if (lowStock.length > 0) {
      signals.push({
        level: "critical",
        label: "ATENÇÃO",
        title: `${lowStock.length} item(ns) precisam de reposição`,
        description:
          "Produtos abaixo do nível mínimo exigem atenção operacional.",
        target: "estoque",
      });
    }

    if (Number(snapshot.goalProgress || 0) < 70) {
      signals.push({
        level: "opportunity",
        label: "OPORTUNIDADE",
        title: "Meta diária com espaço para crescimento",
        description: `A operação atingiu ${pct(
          snapshot.goalProgress
        )} da meta diária.`,
        target: "negocio",
      });
    }

    if (!cash) {
      signals.push({
        level: "operation",
        label: "OPERAÇÃO",
        title: "Caixa está fechado",
        description:
          "Abra uma sessão de caixa para registrar novas vendas.",
        target: "caixa",
      });
    }

    notes.slice(0, 3).forEach((note) => {
      const noteText = String(note);
      const normalizedNote = noteText
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      let target = "ia";
      let label = "NEXUS AI";

      if (
        /estoque|reposicao|ruptura|produto|inventario/.test(
          normalizedNote
        )
      ) {
        target = "estoque";
        label = "ESTOQUE";
      } else if (
        /meta diaria|meta do dia|objetivo diario/.test(
          normalizedNote
        )
      ) {
        target = "metas";
        label = "META";
      } else if (
        /ticket medio|venda|faturamento|receita|crescimento|combo/.test(
          normalizedNote
        )
      ) {
        target = "negocio";
        label = "CRESCIMENTO";
      } else if (
        /caixa|abertura|fechamento/.test(
          normalizedNote
        )
      ) {
        target = "caixa";
        label = "CAIXA";
      } else if (
        /equipe|performance|gorjeta|incentivo|comissao/.test(
          normalizedNote
        )
      ) {
        target = "performance";
        label = "PERFORMANCE";
      }

      signals.push({
        level: "ai",
        label,
        title: "Inteligência operacional",
        description: noteText,
        target,
      });
    });

    if (!signals.length) {
      signals.push({
        level: "stable",
        label: "ESTÁVEL",
        title: "Operação dentro do padrão",
        description:
          "Nenhuma anomalia prioritária foi identificada neste momento.",
        target: "ia",
      });
    }

    return signals.slice(0, 6);
  }, [cash, lowStock, notes, snapshot.goalProgress]);

  if (!data) return null;

  return (
    <section className="nx4-command-center">
      <div className="nx4-grid-background" />

      <header className="nx4-hero">
        <div className="nx4-hero-content">
          <div className="nx4-eyebrow">
            <span>NEXUS INTELLIGENCE</span>
            <i />
            <small>COMMAND CENTER V4</small>
          </div>

          <h1>
            Inteligência para
            <strong>comandar a operação.</strong>
          </h1>

          <p>
            Dados reais transformados em visão executiva para decisões
            financeiras, comerciais e operacionais.
          </p>

          <div className="nx4-system-status">
            <span className={cash ? "online" : "offline"}>
              <i />
              {cash ? "CAIXA OPERACIONAL" : "CAIXA FECHADO"}
            </span>

            <span className="online">
              <i />
              DADOS CONECTADOS
            </span>

            {closing && (
              <span className="online">
                <i />
                INTELLIGENCE LAYER
              </span>
            )}
          </div>
        </div>

        <div className="nx4-core-area">
          <div className="nx4-orbit nx4-orbit-1" />
          <div className="nx4-orbit nx4-orbit-2" />
          <div className="nx4-orbit nx4-orbit-3" />

          <div className="nx4-core">
            <small>INTELLIGENCE</small>
            <strong>{score}</strong>
            <span>SCORE</span>
          </div>
        </div>
      </header>

      <section className="nx4-kpis">
        <Metric
          label="FATURAMENTO HOJE"
          value={brl(snapshot.todayRevenue)}
          meta={`${pct(snapshot.goalProgress)} da meta diária`}
          progress={snapshot.goalProgress}
          featured
        />

        <Metric
          label="LUCRO BRUTO HOJE"
          value={brl(snapshot.grossProfitToday)}
          meta="Resultado operacional"
        />

        <Metric
          label="TICKET MÉDIO"
          value={brl(snapshot.averageTicket)}
          meta={`${snapshot.salesCount || 0} venda(s) hoje`}
        />

        <Metric
          label="RECEITA DO MÊS"
          value={brl(monthRevenue)}
          meta={`Despesas: ${brl(monthExpenses)}`}
        />

        <Metric
          label="SALDO OPERACIONAL"
          value={brl(monthBalance)}
          meta="Receitas menos despesas"
        />
      </section>

      <section className="nx4-main">
        <article className="nx4-card nx4-intelligence-card">
          <CardTitle
            eyebrow="NEXUS AI"
            title="Pulso da operação"
            info={`${intelligence.length} SINAL(IS)`}
          />

          <div className="nx4-ai-summary">
            <div className="nx4-ai-logo">N</div>

            <div>
              <small>LEITURA EXECUTIVA</small>

              <h3>
                {growth.headline ||
                  "Inteligência operacional conectada"}
              </h3>

              <p>
                O Command Center analisa os indicadores disponíveis e
                destaca os pontos que exigem atenção.
              </p>
            </div>
          </div>

          <div className="nx4-signals">
            {intelligence.map((signal, index) => (
              <button
                type="button"
                key={`${signal.label}-${index}`}
                className={`nx4-signal ${signal.level}`}
                onClick={() => onNavigate?.(signal.target)}
              >
                <span className="nx4-signal-type">
                  <i />
                  {signal.label}
                </span>

                <strong>{signal.title}</strong>

                <small>{signal.description}</small>

                <b>ANALISAR →</b>
              </button>
            ))}
          </div>
        </article>

        <article className="nx4-card nx4-health nx4-radar">
          <CardTitle
            eyebrow="OPERATION RADAR"
            title="Radar operacional"
            info="TEMPO REAL"
          />

          <div className="nx4-radar-head">
            <div className="nx4-radar-score">
              <small>STATUS EXECUTIVO</small>
              <strong>{score}</strong>
              <span>INTELLIGENCE SCORE</span>
            </div>

            <span
              className={`nx4-radar-state ${
                cash ? "active" : "inactive"
              }`}
            >
              <i />
              {cash ? "OPERAÇÃO ATIVA" : "CAIXA FECHADO"}
            </span>
          </div>

          <div className="nx4-radar-grid">
            <div className="nx4-radar-item">
              <span>Meta diária</span>

              <strong>
                {pct(snapshot.goalProgress)}
              </strong>

              <div className="nx4-radar-progress">
                <i
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        Number(snapshot.goalProgress || 0)
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="nx4-radar-item">
              <span>Vendas hoje</span>
              <strong>{snapshot.salesCount || 0}</strong>
              <small>transação(ões)</small>
            </div>

            <div className="nx4-radar-item">
              <span>Estoque crítico</span>
              <strong>{lowStock.length}</strong>
              <small>item(ns) em atenção</small>
            </div>

            <div className="nx4-radar-item">
              <span>Equipe</span>
              <strong>{performance.length}</strong>
              <small>registro(s) monitorado(s)</small>
            </div>
          </div>

          <div className="nx4-radar-actions">
            <button
              type="button"
              onClick={() => onNavigate?.("estoque")}
            >
              ESTOQUE
              <span>→</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate?.("performance")}
            >
              PERFORMANCE
              <span>→</span>
            </button>
          </div>
        </article>
      </section>

      <section className="nx4-bottom">
        <article className="nx4-card">
          <CardTitle
            eyebrow="INVENTORY RADAR"
            title="Estoque em atenção"
            info={`${lowStock.length} ALERTA(S)`}
          />

          <div className="nx4-stock-list">
            {lowStock.length ? (
              lowStock.slice(0, 5).map((item, index) => (
                <div key={item?.id || item?.name || index}>
                  <span>
                    {item?.name ||
                      item?.productName ||
                      "Produto"}
                  </span>

                  <strong>
                    {item?.stock ??
                      item?.quantity ??
                      item?.currentStock ??
                      "ATENÇÃO"}
                  </strong>
                </div>
              ))
            ) : (
              <div className="nx4-empty">
                Nenhum item crítico identificado.
              </div>
            )}
          </div>

          <button
            className="nx4-text-button"
            type="button"
            onClick={() => onNavigate?.("estoque")}
          >
            ABRIR ESTOQUE →
          </button>
        </article>

        <article className="nx4-card">
          <CardTitle
            eyebrow="PERFORMANCE"
            title="Equipe"
            info={`${performance.length} REGISTRO(S)`}
          />

          <div className="nx4-team">
            <strong>{performance.length}</strong>
            <span>
              colaborador(es) no radar operacional
            </span>
          </div>

          <button
            className="nx4-text-button"
            type="button"
            onClick={() => onNavigate?.("performance")}
          >
            ABRIR PERFORMANCE →
          </button>
        </article>

        <article className="nx4-card nx4-quick-card">
          <CardTitle
            eyebrow="QUICK CONTROL"
            title="Ações rápidas"
            info="NAVEGAÇÃO"
          />

          <div className="nx4-quick-actions">
            <button
              type="button"
              onClick={() => onNavigate?.("caixa")}
            >
              <span>01</span>
              <strong>Caixa</strong>
              <small>Vendas e operação</small>
            </button>

            <button
              type="button"
              onClick={() => onNavigate?.("ingressos")}
            >
              <span>02</span>
              <strong>Ingressos</strong>
              <small>Eventos e acessos</small>
            </button>

            <button
              type="button"
              onClick={() => onNavigate?.("financeiro")}
            >
              <span>03</span>
              <strong>Financeiro</strong>
              <small>Receitas e despesas</small>
            </button>

            <button
              type="button"
              onClick={() => onNavigate?.("ia")}
            >
              <span>04</span>
              <strong>NEXUS AI</strong>
              <small>Inteligência avançada</small>
            </button>
          </div>
        </article>
      </section>

      <footer className="nx4-footer">
        <div>
          <strong>NEXUS HOSPITALITY ONE</strong>
          <span>INTELLIGENCE COMMAND CENTER V4</span>
        </div>

        <p>
          Indicadores derivados dos dados reais disponíveis na operação.
        </p>

        <span className="nx4-live">
          <i />
          LIVE OPERATION
        </span>
      </footer>
    </section>
  );
}