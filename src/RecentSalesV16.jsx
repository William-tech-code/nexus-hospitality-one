import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const brl = value =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

const dateTime = value => {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('pt-BR');
};

const statusLabel = sale => {
  if (sale?.status === 'CANCELLED') return 'CANCELADA';

  if (sale?.return_coverage?.status === 'DEVOLVIDA') {
    return 'DEVOLVIDA';
  }

  if (sale?.return_coverage?.status === 'DEVOLUCAO_PARCIAL') {
    return 'DEVOLUÇÃO PARCIAL';
  }

  if (sale?.released_at) return 'ENTREGUE';
  if (sale?.status === 'PAID') return 'PAGA';

  return sale?.status || '—';
};

export default function RecentSalesV16({ user, refreshKey = 0 }) {
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('TODAY');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  async function loadSales() {
    setLoading(true);
    setError('');

    try {
      const response = await api.salesRecentV16();

      const rows =
        Array.isArray(response)
          ? response
          : Array.isArray(response?.sales)
            ? response.sales
            : Array.isArray(response?.data)
              ? response.data
              : Array.isArray(response?.items)
                ? response.items
                : [];

      setSales(rows);
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar as vendas.');
    } finally {
      setLoading(false);
    }
  }

  async function openSale(id) {
    setDetailLoading(true);
    setError('');

    try {
      const response = await api.saleV16(id);

      setSelected(
        response?.sale ||
        response
      );
    } catch (err) {
      setError(err?.message || 'Não foi possível abrir a venda.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function cancelSelectedSale() {
    if (!selected?.id) return;

    if (selected.status === 'CANCELLED') {
      setError('Esta venda ja esta cancelada.');
      return;
    }

    const reason = window.prompt(
      `Informe o motivo obrigatorio do cancelamento da venda #${selected.id}:`
    );

    if (!reason || !String(reason).trim()) {
      return;
    }

    const confirmed = window.confirm(
      `CONFIRMAR CANCELAMENTO DA VENDA #${selected.id}?

Total: ${brl(selected.total)}

Esta operacao sera registrada na auditoria e podera reverter estoque e pagamentos vinculados a venda.`
    );

    if (!confirmed) {
      return;
    }

    setDetailLoading(true);
    setError('');

    try {
      await api.cancelSaleV16(
        selected.id,
        String(reason).trim()
      );

      await loadSales();

      const response = await api.saleV16(selected.id);

      setSelected(
        response?.sale ||
        response
      );
    } catch (err) {
      setError(
        err?.message ||
        'Nao foi possivel cancelar a venda.'
      );
    } finally {
      setDetailLoading(false);
    }
  }


  // NEXUS_RETURN_UI_V221B2R
  async function returnSelectedSale() {
    if (!selected?.id) return;

    if (selected.status === 'CANCELLED') {
      setError('Venda cancelada nao pode receber devolucao.');
      return;
    }

    if (selected.status !== 'PAID') {
      setError('Somente vendas pagas podem receber devolucao.');
      return;
    }

    const availableItems = (selected.items || []).filter(
      item => Number(item.returnable_qty || 0) > 0
    );

    if (!availableItems.length) {
      setError('Esta venda nao possui itens disponiveis para devolucao.');
      return;
    }

    const requestedItems = [];

    for (const item of availableItems) {
      const available = Number(item.returnable_qty || 0);

      const answer = window.prompt(
        `DEVOLUCAO - VENDA #${selected.id}

Produto: ${item.name || `Item #${item.id}`}
Quantidade vendida: ${Number(item.qty || 0)}
Ja devolvida: ${Number(item.returned_qty || 0)}
Disponivel para devolver: ${available}

Informe a quantidade que deseja devolver.
Digite 0 para nao devolver este item:`,
        String(available)
      );

      if (answer === null) {
        return;
      }

      const normalized = String(answer)
        .trim()
        .replace(',', '.');

      const qty = Number(normalized);

      if (!Number.isFinite(qty) || qty < 0) {
        setError(
          `Quantidade invalida para ${item.name || `item #${item.id}`}.`
        );
        return;
      }

      if (qty > available + 0.000001) {
        setError(
          `Quantidade excede o saldo devolvivel de ${item.name || `item #${item.id}`}.`
        );
        return;
      }

      if (qty > 0) {
        requestedItems.push({
          sale_item_id: Number(item.id),
          qty: qty
        });
      }
    }

    if (!requestedItems.length) {
      setError('Nenhum item foi selecionado para devolucao.');
      return;
    }

    const reason = window.prompt(
      `Informe o motivo obrigatorio da devolucao da venda #${selected.id}:`
    );

    if (!reason || !String(reason).trim()) {
      return;
    }

    setDetailLoading(true);
    setError('');

    try {

      const payload = {
        reason: String(reason).trim(),
        items: requestedItems
      };

      const previewResponse =
        await api.returnPreviewV16(
          selected.id,
          payload
        );

      const preview =
        previewResponse?.preview ||
        previewResponse;

      const fallbackTotal =
        requestedItems.reduce(
          (sum, requested) => {
            const item = availableItems.find(
              candidate =>
                Number(candidate.id) ===
                Number(requested.sale_item_id)
            );

            return (
              sum +
              Number(requested.qty || 0) *
              Number(item?.unit_price || 0)
            );
          },
          0
        );

      const returnTotal =
        Number(preview?.return_total ?? preview?.total ?? fallbackTotal);

      const itemSummary =
        requestedItems
          .map(requested => {
            const item = availableItems.find(
              candidate =>
                Number(candidate.id) ===
                Number(requested.sale_item_id)
            );

            return (
              `${item?.name || `Item #${requested.sale_item_id}`} ` +
              `x ${requested.qty}`
            );
          })
          .join('\n');

      const confirmed = window.confirm(
        `CONFIRMAR DEVOLUCAO - VENDA #${selected.id}?

${itemSummary}

Valor da devolucao: ${brl(returnTotal)}

Motivo:
${String(reason).trim()}

A operacao sera registrada na auditoria.
O estoque e a reversao financeira serao processados pelo motor de devolucao.`
      );

      if (!confirmed) {
        return;
      }

      await api.returnSaleV16(
        selected.id,
        payload
      );

      const refreshed =
        await api.saleV16(selected.id);

      setSelected(
        refreshed?.sale ||
        refreshed
      );

      await loadSales();

      window.alert(
        `DEVOLUCAO REGISTRADA

Venda #${selected.id}
Valor: ${brl(returnTotal)}

Operacao concluida e auditada.`
      );

    } catch (err) {
      setError(
        err?.message ||
        'Nao foi possivel registrar a devolucao.'
      );
    } finally {
      setDetailLoading(false);
    }
  }
  useEffect(() => {
    loadSales();
  }, [refreshKey]);

  const payments = selected?.payments || [];
  const items = selected?.items || [];

  // NEXUS_SALES_DASHBOARD_V44
  const dashboard = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (period === 'TODAY') start.setHours(0, 0, 0, 0);
    if (period === '7D') start.setDate(now.getDate() - 6);
    if (period === '30D') start.setDate(now.getDate() - 29);
    if (period !== 'TODAY') start.setHours(0, 0, 0, 0);

    const inPeriod = sales.filter(sale => {
      const d = new Date(sale.created_at);
      return !Number.isNaN(d.getTime()) && d >= start && d <= now;
    });

    const returnedValue = sale => Number(sale?.return_coverage?.returned_value || 0);
    const netValue = sale => sale?.status === 'CANCELLED'
      ? 0
      : Math.max(0, Number(sale?.total || 0) - returnedValue(sale));

    const revenue = inPeriod.reduce((sum, sale) => sum + netValue(sale), 0);
    const validSales = inPeriod.filter(sale => sale?.status !== 'CANCELLED');
    const cancelled = inPeriod.filter(sale => sale?.status === 'CANCELLED').length;
    const returns = inPeriod.reduce((sum, sale) => sum + returnedValue(sale), 0);
    const ticket = validSales.length ? revenue / validSales.length : 0;

    const paymentTotals = { PIX: 0, DINHEIRO: 0, DEBITO: 0, CREDITO: 0 };
    inPeriod.forEach(sale => {
      if (sale?.status === 'CANCELLED') return;
      const raw = String(sale.payments || sale.payments_text || sale.payment_method || '').toUpperCase();
      Object.keys(paymentTotals).forEach(method => {
        const label = method === 'DEBITO' ? 'D[ÉE]BITO|DEBITO' : method === 'CREDITO' ? 'CR[ÉE]DITO|CREDITO' : method;
        const match = raw.match(new RegExp('(?:' + label + ')\\s+([0-9]+(?:[.,][0-9]+)?)'));
        if (match) paymentTotals[method] += Number(match[1].replace(',', '.')) || 0;
        else if (raw === method || (method === 'DEBITO' && raw.includes('DÉBITO')) || (method === 'CREDITO' && raw.includes('CRÉDITO'))) paymentTotals[method] += netValue(sale);
      });
    });

    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    inPeriod.forEach(sale => {
      const d = new Date(sale.created_at);
      if (!Number.isNaN(d.getTime()) && sale?.status !== 'CANCELLED') hours[d.getHours()].count += 1;
    });
    const activeHours = hours.filter(x => x.count > 0);
    const hourSeries = activeHours.length ? activeHours : hours.slice(17, 23);

    const days = {};
    inPeriod.forEach(sale => {
      if (sale?.status === 'CANCELLED') return;
      const d = new Date(sale.created_at);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      days[key] = (days[key] || 0) + netValue(sale);
    });
    const trend = Object.entries(days).map(([label, value]) => ({ label, value }));

    return { inPeriod, revenue, validSales, cancelled, returns, ticket, paymentTotals, hourSeries, trend };
  }, [sales, period]);

  const filteredSales = useMemo(() => dashboard.inPeriod.filter(sale => {
    const q = query.trim().toLowerCase();
    const status = statusLabel(sale);
    const payment = String(sale.payments || sale.payments_text || sale.payment_method || '').toUpperCase();
    const matchesQuery = !q || String(sale.id).includes(q) || String(sale.operator_name || '').toLowerCase().includes(q) || payment.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
    const matchesPayment = paymentFilter === 'ALL' || payment.includes(paymentFilter);
    return matchesQuery && matchesStatus && matchesPayment;
  }), [dashboard.inPeriod, query, statusFilter, paymentFilter]);

  const maxTrend = Math.max(1, ...dashboard.trend.map(x => x.value));
  const maxHour = Math.max(1, ...dashboard.hourSeries.map(x => x.count));
  const maxPayment = Math.max(1, ...Object.values(dashboard.paymentTotals));

  return (
    <section className="recent-sales-v16">

      <header className="recent-sales-v16-head">
        <div>
          <span>NEXUS V1.6 • OPERAÇÃO AUDITADA</span>
          <h2>Últimas Vendas</h2>
          <p>
            Histórico, desempenho e auditoria das operações do caixa.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSales}
          disabled={loading}
        >
          {loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}
        </button>
      </header>

      {error && (
        <div className="recent-sales-v16-error">
          {error}
        </div>
      )}

      <div className="nexus-sales-dashboard-v44">
        <div className="nexus-v44-toolbar">
          <div className="nexus-v44-periods">
            {[['TODAY','HOJE'],['7D','7 DIAS'],['30D','30 DIAS']].map(([id,label]) => (
              <button key={id} type="button" className={period === id ? 'active' : ''} onClick={() => setPeriod(id)}>{label}</button>
            ))}
          </div>
          <span>{dashboard.inPeriod.length} registro(s) no periodo</span>
        </div>

        <div className="nexus-v44-kpis">
          <div><small>FATURAMENTO LIQUIDO</small><strong>{brl(dashboard.revenue)}</strong></div>
          <div><small>VENDAS VALIDAS</small><strong>{dashboard.validSales.length}</strong></div>
          <div><small>TICKET MEDIO</small><strong>{brl(dashboard.ticket)}</strong></div>
          <div><small>CANCELADAS</small><strong>{dashboard.cancelled}</strong></div>
          <div><small>DEVOLUCOES</small><strong>{brl(dashboard.returns)}</strong></div>
        </div>

        <div className="nexus-v44-charts">
          <div className="nexus-v44-chart-card">
            <div className="nexus-v44-chart-title"><b>Faturamento</b><small>Evolucao do periodo</small></div>
            <div className="nexus-v44-mini-bars">
              {(dashboard.trend.length ? dashboard.trend : [{label:'Sem dados',value:0}]).map((x,i) => (
                <div className="nexus-v44-mini-col" key={x.label + i} title={`${x.label}: ${brl(x.value)}`}>
                  <i style={{height:`${Math.max(4,(x.value/maxTrend)*100)}%`}} />
                  <small>{x.label}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="nexus-v44-chart-card">
            <div className="nexus-v44-chart-title"><b>Pagamentos</b><small>Distribuicao</small></div>
            <div className="nexus-v44-pay-bars">
              {Object.entries(dashboard.paymentTotals).map(([method,value]) => (
                <div key={method}><span>{method}</span><i><b style={{width:`${(value/maxPayment)*100}%`}} /></i><strong>{brl(value)}</strong></div>
              ))}
            </div>
          </div>

          <div className="nexus-v44-chart-card">
            <div className="nexus-v44-chart-title"><b>Movimento</b><small>Vendas por horario</small></div>
            <div className="nexus-v44-mini-bars nexus-v44-hours">
              {dashboard.hourSeries.map(x => (
                <div className="nexus-v44-mini-col" key={x.hour} title={`${String(x.hour).padStart(2,'0')}h: ${x.count} venda(s)`}>
                  <i style={{height:`${Math.max(4,(x.count/maxHour)*100)}%`}} />
                  <small>{String(x.hour).padStart(2,'0')}h</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="nexus-v44-filters">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar venda, operador ou pagamento..." />
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="ALL">Todos os status</option><option value="PAGA">Paga</option><option value="ENTREGUE">Entregue</option><option value="CANCELADA">Cancelada</option><option value="DEVOLVIDA">Devolvida</option><option value="DEVOLUÇÃO PARCIAL">Devolucao parcial</option>
          </select>
          <select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}>
            <option value="ALL">Todos os pagamentos</option><option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option><option value="DEBITO">Debito</option><option value="CREDITO">Credito</option>
          </select>
        </div>
      </div>

      <style>{`
        /* NEXUS_V441_PREMIUM_POLISH */
        .recent-sales-v16{padding-top:2px!important}
        .recent-sales-v16-head{display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:18px!important;margin:0 0 12px!important;padding:0 0 12px!important;border-bottom:1px solid rgba(255,255,255,.055)!important}
        .recent-sales-v16-head>div{min-width:0!important}
        .recent-sales-v16-head span{display:block!important;margin:0 0 5px!important;color:#caa94c!important;font-size:9px!important;font-weight:800!important;letter-spacing:.18em!important;line-height:1.2!important}
        .recent-sales-v16-head h2{margin:0!important;font-size:24px!important;line-height:1.08!important;letter-spacing:-.025em!important;color:#f5f1e8!important}
        .recent-sales-v16-head p{margin:6px 0 0!important;font-size:12px!important;line-height:1.45!important;color:rgba(255,255,255,.56)!important}
        .recent-sales-v16-head>button{flex:0 0 auto!important;min-width:118px!important;height:38px!important;padding:0 15px!important;border-radius:11px!important;border:1px solid rgba(212,175,55,.38)!important;background:linear-gradient(180deg,rgba(212,175,55,.18),rgba(132,109,37,.10))!important;color:#e5c45b!important;font-size:10px!important;font-weight:900!important;letter-spacing:.08em!important;cursor:pointer!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)!important}
        .recent-sales-v16-head>button:hover:not(:disabled){border-color:rgba(229,196,91,.72)!important;background:linear-gradient(180deg,rgba(212,175,55,.25),rgba(132,109,37,.14))!important}
        .recent-sales-v16-head>button:disabled{opacity:.55!important;cursor:wait!important}
        .nexus-sales-dashboard-v44{margin:0 0 12px!important;padding:13px!important;border-radius:16px!important;box-shadow:0 10px 28px rgba(0,0,0,.18)!important}
        .nexus-v44-toolbar{margin-bottom:10px!important}
        .nexus-v44-kpis>div{min-height:58px!important;padding:11px 12px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
        .nexus-v44-charts{margin-top:8px!important}
        .nexus-v44-chart-card{min-height:116px!important;padding:10px 11px!important}
        .nexus-v44-mini-bars{height:68px!important}
        .nexus-v44-filters{grid-template-columns:minmax(280px,1fr) 190px 220px!important;margin-top:9px!important}
        .nexus-v44-filters input,.nexus-v44-filters select{height:40px!important;padding:0 12px!important;font-size:11px!important}
        .nexus-v44-filters select{padding-right:34px!important;white-space:nowrap!important;text-overflow:ellipsis!important}
        .recent-sales-v16-layout{display:grid!important;grid-template-columns:minmax(360px,.9fr) minmax(440px,1.1fr)!important;gap:10px!important;align-items:start!important;margin-top:0!important}
        .recent-sales-v16-list,.recent-sale-detail{min-height:150px!important;border:1px solid rgba(255,255,255,.065)!important;border-radius:14px!important;background:linear-gradient(145deg,rgba(18,18,20,.72),rgba(9,9,11,.78))!important;overflow:hidden!important}
        .recent-sales-v16-list{padding:8px!important}
        .recent-sale-detail{padding:12px!important}
        .recent-sales-v16-empty{min-height:124px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:18px!important;border:1px dashed rgba(212,175,55,.15)!important;border-radius:11px!important;background:rgba(255,255,255,.012)!important;color:rgba(255,255,255,.48)!important;font-size:11px!important;line-height:1.5!important}
        .recent-sale-row{border-radius:11px!important;margin-bottom:6px!important}
        .recent-sale-row:last-child{margin-bottom:0!important}
        @media(max-width:1200px){.nexus-v44-filters{grid-template-columns:minmax(240px,1fr) 175px 205px!important}.recent-sales-v16-layout{grid-template-columns:1fr!important}}
        @media(max-width:760px){.recent-sales-v16-head{align-items:flex-start!important;flex-direction:column!important}.recent-sales-v16-head>button{width:100%!important}.nexus-v44-filters{grid-template-columns:1fr!important}.recent-sales-v16-layout{grid-template-columns:1fr!important}}
        .nexus-sales-dashboard-v44{margin:14px 0 16px;padding:14px;border:1px solid rgba(212,175,55,.20);border-radius:18px;background:linear-gradient(145deg,rgba(18,18,20,.96),rgba(8,8,10,.96));box-shadow:0 12px 34px rgba(0,0,0,.20)}
        .nexus-v44-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.nexus-v44-toolbar>span{font-size:11px;opacity:.58}.nexus-v44-periods{display:flex;gap:6px}.nexus-v44-periods button{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);color:inherit;border-radius:9px;padding:7px 11px;font-size:10px;font-weight:800;cursor:pointer}.nexus-v44-periods button.active{border-color:rgba(212,175,55,.55);background:rgba(212,175,55,.12);color:#e5c45b}
        .nexus-v44-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.nexus-v44-kpis>div{padding:12px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07)}.nexus-v44-kpis small{display:block;font-size:9px;letter-spacing:.08em;opacity:.55;margin-bottom:6px}.nexus-v44-kpis strong{font-size:18px;line-height:1;color:#f4f4f4}
        .nexus-v44-charts{display:grid;grid-template-columns:1.2fr 1fr 1.2fr;gap:9px;margin-top:9px}.nexus-v44-chart-card{min-height:126px;padding:11px;border-radius:13px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.065);overflow:hidden}.nexus-v44-chart-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.nexus-v44-chart-title b{font-size:12px}.nexus-v44-chart-title small{font-size:9px;opacity:.48}
        .nexus-v44-mini-bars{height:78px;display:flex;align-items:flex-end;gap:5px}.nexus-v44-mini-col{height:100%;min-width:12px;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;gap:4px}.nexus-v44-mini-col i{display:block;min-height:3px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#e0be4f,#826b22);opacity:.88}.nexus-v44-mini-col small{text-align:center;font-size:8px;opacity:.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nexus-v44-hours{gap:3px}.nexus-v44-hours .nexus-v44-mini-col small{font-size:7px}
        .nexus-v44-pay-bars{display:grid;gap:7px}.nexus-v44-pay-bars>div{display:grid;grid-template-columns:58px 1fr 70px;align-items:center;gap:7px;font-size:9px}.nexus-v44-pay-bars>div>span{opacity:.65}.nexus-v44-pay-bars>div>i{height:6px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden}.nexus-v44-pay-bars>div>i>b{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#846d25,#e2c151)}.nexus-v44-pay-bars>div>strong{text-align:right;font-size:9px}
        .nexus-v44-filters{display:grid;grid-template-columns:minmax(220px,1fr) 170px 180px;gap:8px;margin-top:10px}.nexus-v44-filters input,.nexus-v44-filters select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.09);background:#111114;color:#f4f4f4;border-radius:10px;padding:10px 11px;outline:none}.nexus-v44-filters input:focus,.nexus-v44-filters select:focus{border-color:rgba(212,175,55,.5)}
        @media(max-width:1050px){.nexus-v44-kpis{grid-template-columns:repeat(3,1fr)}.nexus-v44-charts{grid-template-columns:1fr}.nexus-v44-filters{grid-template-columns:1fr 1fr}.nexus-v44-filters input{grid-column:1/-1}}
        @media(max-width:680px){.nexus-v44-kpis{grid-template-columns:1fr 1fr}.nexus-v44-toolbar{align-items:flex-start;flex-direction:column}.nexus-v44-filters{grid-template-columns:1fr}.nexus-v44-filters input{grid-column:auto}.nexus-v44-charts{grid-template-columns:1fr}.nexus-v44-chart-card{min-height:118px}}
      `}</style>

      <div className="recent-sales-v16-layout">

        <div className="recent-sales-v16-list">

          {!loading && filteredSales.length === 0 && (
            <div className="recent-sales-v16-empty">
              Nenhuma venda encontrada.
            </div>
          )}

          {filteredSales.map(sale => (
            <button
              type="button"
              key={sale.id}
              className={
                'recent-sale-row ' +
                (selected?.id === sale.id ? 'active' : '')
              }
              onClick={() => openSale(sale.id)}
            >
              <div>
                <strong>#{sale.id}</strong>
                <span>{dateTime(sale.created_at)}</span>
              </div>

              <div>
                <b>{brl(sale.total)}</b>
                <small>
                  {sale.payment_method ||
                   sale.payments_text ||
                   'Pagamento registrado'}
                </small>
              </div>

              <em
                className={
                  'sale-status ' +
                  String(statusLabel(sale)).toLowerCase()
                }
              >
                {statusLabel(sale)}
              </em>
            </button>
          ))}

        </div>

        <aside className="recent-sale-detail">

          {!selected && !detailLoading && (
            <div className="recent-sales-v16-empty">
              Selecione uma venda para visualizar os detalhes.
            </div>
          )}

          {detailLoading && (
            <div className="recent-sales-v16-empty">
              Carregando venda...
            </div>
          )}

          {selected && !detailLoading && (
            <>
              <div className="recent-sale-title">
                <div>
                  <span>VENDA</span>
                  <h3>#{selected.id}</h3>
                </div>

                <em
                  className={
                    'sale-status ' +
                    String(statusLabel(selected)).toLowerCase()
                  }
                >
                  {statusLabel(selected)}
                </em>
              </div>

              <div className="recent-sale-meta">
                <div>
                  <small>OPERADOR</small>
                  <b>
                    {selected.operator_name ||
                     selected.user_name ||
                     'Não informado'}
                  </b>
                </div>

                <div>
                  <small>DATA / HORA</small>
                  <b>{dateTime(selected.created_at)}</b>
                </div>

                <div>
                  <small>RETIRADA</small>
                  <b>{selected.release_code || '—'}</b>
                </div>

                <div>
                  <small>TROCO</small>
                  <b>{brl(selected.change_amount)}</b>
                </div>
              </div>

              <div className="recent-sale-items">
                <h4>Itens</h4>

                {items.map((item, index) => (
                  <div key={item.id || index}>
                    <span>
                      <b>{item.qty}x</b>
                      {' '}
                      {item.name || `Produto #${item.product_id}`}
                    </span>

                    <strong>
                      {brl(
                        Number(item.qty || 0) *
                        Number(item.unit_price || 0)
                      )}
                    </strong>
                  </div>
                ))}

                {!items.length && (
                  <p>Nenhum item retornado pela API.</p>
                )}
              </div>

              <div className="recent-sale-payments">
                <h4>Pagamentos</h4>

                {payments.map((payment, index) => (
                  <div key={payment.id || index}>
                    <span>{payment.method}</span>
                    <strong>{brl(payment.amount)}</strong>
                  </div>
                ))}

                {!payments.length && (
                  <p>Nenhum pagamento retornado pela API.</p>
                )}
              </div>

              <div className="recent-sale-total">
                <span>TOTAL DA VENDA</span>
                <strong>{brl(selected.total)}</strong>
              </div>

              <div className="recent-sale-audit">
                <small>OPERADOR ATUAL</small>
                <b>{user?.name || 'Usuário autenticado'}</b>
              </div>
              <button
                type="button"
                className={
                  selected.status === 'CANCELLED' ? 'recent-sale-cancel-disabled' : 'recent-sale-cancel'
                }
                disabled={
                  detailLoading ||
                  selected.status === 'CANCELLED'
                }
                onClick={cancelSelectedSale}
                title={
                  selected.status === 'CANCELLED' ? 'Venda ja cancelada' : 'Cancelar venda com motivo obrigatorio e registro de auditoria'
                }
              >
                {selected.status === 'CANCELLED' ? 'VENDA CANCELADA' : 'CANCELAR VENDA - AUDITADO'}
              </button>
              {/* NEXUS_RETURN_UI_V221B2R */}
              <button
                type="button"
                onClick={returnSelectedSale}
                disabled={
                  detailLoading ||
                  selected?.status !== 'PAID' ||
                  selected?.return_coverage?.status === 'DEVOLVIDA'
                }
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '13px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,.16)',
                  cursor:
                    detailLoading ||
                    selected?.status !== 'PAID' ||
                    selected?.return_coverage?.status === 'DEVOLVIDA' ? 'not-allowed' : 'pointer',
                  fontWeight: 800
                }}
              >
                {
                  selected?.return_coverage?.status === 'DEVOLVIDA' ? 'VENDA TOTALMENTE DEVOLVIDA' : selected?.return_coverage?.status === 'DEVOLUCAO_PARCIAL' ? 'REALIZAR NOVA DEVOLUCAO' : 'DEVOLVER ITENS - AUDITADO'
                }
              </button>

              {selected.status === 'CANCELLED' && (
                <div className="recent-sale-audit">
                  <small>MOTIVO DO CANCELAMENTO</small>
                  <b>
                    {selected.cancel_reason ||
                     'Motivo registrado na auditoria'}
                  </b>

                  <small>CANCELADA EM</small>
                  <b>{dateTime(selected.cancelled_at)}</b>

                  <small>CANCELADA POR</small>
                  <b>
                    {selected.cancelled_by_name ||
                     selected.cancelled_by ||
                     'Usuario registrado'}
                  </b>
                </div>
              )}
            </>
          )}

        </aside>

      </div>

    </section>
  );
}