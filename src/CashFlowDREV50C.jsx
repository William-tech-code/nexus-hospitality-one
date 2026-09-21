import React,{
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  cashFlowDREV50C
} from "./api";

import "./CashFlowDREV50C.css";

const money=value=>
  Number(value||0).toLocaleString(
    "pt-BR",
    {
      style:"currency",
      currency:"BRL"
    }
  );

const pct=value=>
  `${Number(value||0).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:1,
      maximumFractionDigits:1
    }
  )}%`;

function Metric({
  label,
  value,
  hint,
  tone=""
}){
  return(
    <article className={`r5-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}

function Row({
  label,
  value,
  strong=false,
  negative=false
}){
  return(
    <div className={`r5-row ${strong?"strong":""}`}>
      <span>{label}</span>
      <b className={negative?"negative":""}>
        {value}
      </b>
    </div>
  );
}

export default function CashFlowDREV50C(){

  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    try{
      setLoading(true);
      setError("");

      const response=
        await cashFlowDREV50C();

      setData(response);
    }catch(err){
      setError(
        err?.message ||
        "Não foi possível carregar a inteligência financeira."
      );
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{
    load();
  },[load]);

  const d=
    data?.dre_30_days || {};

  const dm=
    data?.dre_current_month || {};

  const cf=
    data?.cash_flow_30_days || {};

  const cfm=
    data?.cash_flow_current_month || {};

  const commitments=
    data?.commitments || {};

  const reserves=
    data?.reserves || {};

  const settlement=
    data?.settlement?.payment_methods_30_days || [];

  const pressureLabel=useMemo(()=>{

    const map={
      NO_ACTIVITY:"Sem movimento",
      NEGATIVE:"Fluxo negativo",
      CRITICAL:"Pressão crítica",
      HIGH:"Pressão elevada",
      ATTENTION:"Atenção",
      CONTROLLED:"Controlado"
    };

    return map[cf.pressure] || cf.pressure || "—";

  },[cf.pressure]);

  if(loading){
    return(
      <section className="r5-shell">
        <div className="r5-loading">
          Consolidando DRE e fluxo de caixa...
        </div>
      </section>
    );
  }

  if(error){
    return(
      <section className="r5-shell">
        <div className="r5-error">
          <strong>Cash Flow Intelligence</strong>
          <span>{error}</span>
          <button onClick={load}>
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  return(
    <section className="r5-shell">

      <header className="r5-hero">
        <div>
          <span className="r5-eyebrow">
            NEXUS FINANCIAL INTELLIGENCE • V5.0C-R5
          </span>

          <h2>
            Cash Flow Intelligence
            <em> + DRE Gerencial</em>
          </h2>

          <p>
            Resultado, caixa realizado e compromissos
            futuros separados por natureza financeira.
          </p>
        </div>

        <div className="r5-hero-actions">
          <div className={`r5-pressure ${String(cf.pressure||"").toLowerCase()}`}>
            <small>PRESSÃO DE CAIXA</small>
            <strong>{pressureLabel}</strong>
          </div>

          <button onClick={load}>
            Atualizar visão
          </button>
        </div>
      </header>

      <div className="r5-truth-banner">
        <div>
          <b>Financial Truth</b>
          <span>
            Faturamento, resultado, caixa e dívida não são
            tratados como a mesma coisa.
          </span>
        </div>

        <span className="r5-truth-chip">
          SEM DUPLA CONTAGEM
        </span>
      </div>

      <div className="r5-kpis">

        <Metric
          label="Receita • 30 dias"
          value={money(d.revenue)}
          hint="Somente vendas PAID"
        />

        <Metric
          label="Lucro bruto"
          value={money(d.gross_profit)}
          hint={`CMV ${pct(d.cmv_percent)}`}
        />

        <Metric
          label="Resultado operacional"
          value={money(d.operating_result)}
          hint={`Margem ${pct(d.operating_margin_percent)}`}
          tone={
            Number(d.operating_result)<0
              ?"danger"
              :"success"
          }
        />

        <Metric
          label="Fluxo líquido realizado"
          value={money(cf.net_flow)}
          hint="Recebimentos − saídas registradas"
          tone={
            Number(cf.net_flow)<0
              ?"danger"
              :"success"
          }
        />

      </div>

      <div className="r5-grid">

        <article className="r5-card">

          <div className="r5-card-head">
            <div>
              <span>DRE GERENCIAL</span>
              <h3>Últimos 30 dias</h3>
            </div>

            <div className="r5-pill">
              COMPETÊNCIA GERENCIAL
            </div>
          </div>

          <div className="r5-statement">

            <Row
              label="Receita"
              value={money(d.revenue)}
            />

            <Row
              label="(−) CMV"
              value={money(d.cmv)}
              negative
            />

            <Row
              label="Lucro bruto"
              value={money(d.gross_profit)}
              strong
            />

            <Row
              label="(−) Despesas operacionais"
              value={money(d.operating_expenses)}
              negative
            />

            <Row
              label="Resultado operacional"
              value={money(d.operating_result)}
              strong
            />

            <div className="r5-separator"/>

            <Row
              label="Investimentos"
              value={money(d.investments)}
            />

            <Row
              label="Reformas"
              value={money(d.renovations)}
            />

            <Row
              label="Compras avulsas"
              value={money(d.adhoc_purchases)}
            />

            <Row
              label="Extraordinários"
              value={money(d.extraordinary)}
              negative
            />

            <Row
              label="Resultado gerencial"
              value={money(d.managerial_result)}
              strong
              negative={Number(d.managerial_result)<0}
            />

          </div>

          <footer className="r5-card-foot">
            Na ausência de uma data contábil de competência
            dedicada, despesas usam vencimento e, na ausência
            dele, data de cadastro.
          </footer>

        </article>

        <article className="r5-card">

          <div className="r5-card-head">
            <div>
              <span>FLUXO DE CAIXA</span>
              <h3>Realizado • 30 dias</h3>
            </div>

            <div className="r5-pill">
              CAIXA REALIZADO
            </div>
          </div>

          <div className="r5-statement">

            <Row
              label="Entradas por vendas PAID"
              value={money(cf.inflow_paid_sales)}
            />

            <Row
              label="Despesas operacionais pagas"
              value={money(cf.paid_operating_expenses)}
              negative
            />

            <Row
              label="Investimentos pagos"
              value={money(cf.paid_investments)}
              negative
            />

            <Row
              label="Reformas pagas"
              value={money(cf.paid_renovations)}
              negative
            />

            <Row
              label="Compras avulsas pagas"
              value={money(cf.paid_adhoc_purchases)}
              negative
            />

            <Row
              label="Pagamentos de dívidas"
              value={money(cf.debt_payments)}
              negative
            />

            <div className="r5-separator"/>

            <Row
              label="Saídas realizadas"
              value={money(cf.actual_outflow)}
              strong
              negative
            />

            <Row
              label="Fluxo líquido"
              value={money(cf.net_flow)}
              strong
              negative={Number(cf.net_flow)<0}
            />

          </div>

          <footer className="r5-card-foot">
            Dívida paga afeta caixa, mas não é classificada
            automaticamente como despesa operacional.
          </footer>

        </article>

      </div>

      <div className="r5-grid">

        <article className="r5-card">

          <div className="r5-card-head">
            <div>
              <span>MÊS ATUAL</span>
              <h3>Resultado gerencial</h3>
            </div>
          </div>

          <div className="r5-mini-grid">

            <Metric
              label="Receita"
              value={money(dm.revenue)}
            />

            <Metric
              label="CMV"
              value={money(dm.cmv)}
            />

            <Metric
              label="Resultado operacional"
              value={money(dm.operating_result)}
            />

            <Metric
              label="Resultado gerencial"
              value={money(dm.managerial_result)}
              tone={
                Number(dm.managerial_result)<0
                  ?"danger"
                  :"success"
              }
            />

          </div>

        </article>

        <article className="r5-card">

          <div className="r5-card-head">
            <div>
              <span>MÊS ATUAL</span>
              <h3>Caixa realizado</h3>
            </div>
          </div>

          <div className="r5-mini-grid">

            <Metric
              label="Entradas"
              value={money(cfm.inflow_paid_sales)}
            />

            <Metric
              label="Saídas"
              value={money(cfm.actual_outflow)}
            />

            <Metric
              label="Dívidas pagas"
              value={money(cfm.debt_payments)}
            />

            <Metric
              label="Fluxo líquido"
              value={money(cfm.net_flow)}
              tone={
                Number(cfm.net_flow)<0
                  ?"danger"
                  :"success"
              }
            />

          </div>

        </article>

      </div>

      <article className="r5-card">

        <div className="r5-card-head">
          <div>
            <span>PRESSÃO FUTURA</span>
            <h3>Compromissos registrados</h3>
          </div>

          <div className="r5-pill warning">
            NÃO CONSOLIDADO
          </div>
        </div>

        <div className="r5-commitments">

          <Metric
            label="Dívidas em aberto"
            value={money(commitments.open_debt)}
          />

          <Metric
            label="Despesas não pagas"
            value={money(commitments.unpaid_expenses)}
          />

          <Metric
            label="Obrigações legadas"
            value={money(commitments.open_legacy_obligations)}
          />

          <Metric
            label="Procurement ORDERED"
            value={money(commitments.procurement_ordered)}
          />

          <Metric
            label="Reservado"
            value={money(reserves.reserved)}
            hint={`Meta ${money(reserves.target)}`}
          />

        </div>

        <div className="r5-warning">
          <strong>Proteção contra dupla contagem</strong>
          <span>
            O NEXUS não soma automaticamente dívidas,
            despesas, obrigações e pedidos de compra,
            pois a mesma obrigação econômica pode ter sido
            registrada em mais de uma origem.
          </span>
        </div>

      </article>

      <div className="r5-grid">

        <article className="r5-card">

          <div className="r5-card-head">
            <div>
              <span>RECEBIMENTOS</span>
              <h3>Composição • 30 dias</h3>
            </div>
          </div>

          {settlement.length===0 ? (
            <div className="r5-empty">
              Nenhum recebimento registrado no período.
            </div>
          ):(
            <div className="r5-methods">
              {settlement.map((item,index)=>(
                <div
                  className="r5-method"
                  key={`${item.method}-${index}`}
                >
                  <span>
                    {item.method || "Não informado"}
                  </span>
                  <strong>
                    {money(item.amount)}
                  </strong>
                </div>
              ))}
            </div>
          )}

          <footer className="r5-card-foot">
            Divisões de pagamento explicam a composição
            da venda e não geram uma segunda receita.
          </footer>

        </article>

        <article className="r5-card">

          <div className="r5-card-head">
            <div>
              <span>CAIXA FÍSICO</span>
              <h3>Controle operacional</h3>
            </div>
          </div>

          <div className="r5-statement">

            <Row
              label="Caixas abertos"
              value={
                String(
                  data?.physical_cash
                    ?.open_session_count || 0
                )
              }
            />

            <Row
              label="Suprimentos • 30 dias"
              value={money(
                data?.physical_cash
                  ?.adjustments
                  ?.supply_30_days
              )}
            />

            <Row
              label="Sangrias • 30 dias"
              value={money(
                data?.physical_cash
                  ?.adjustments
                  ?.withdrawal_30_days
              )}
            />

            <Row
              label="Ajuste líquido"
              value={money(
                data?.physical_cash
                  ?.adjustments
                  ?.net_adjustment_30_days
              )}
              strong
            />

          </div>

          <div className="r5-safe">
            <b>Saldo disponível não inferido</b>
            <span>
              O painel não transforma faturamento,
              projeção ou sessão aberta em saldo bancário
              ou dinheiro disponível.
            </span>
          </div>

        </article>

      </div>

      <article className="r5-card r5-methodology">

        <div className="r5-card-head">
          <div>
            <span>METODOLOGIA</span>
            <h3>Como o NEXUS interpreta os números</h3>
          </div>
        </div>

        <div className="r5-notes">
          {(data?.notes || []).map((note,index)=>(
            <div key={index}>
              <b>{String(index+1).padStart(2,"0")}</b>
              <span>{note}</span>
            </div>
          ))}
        </div>

      </article>

    </section>
  );
}
