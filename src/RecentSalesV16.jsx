import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const brl = value =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

const dateTime = value => {
  if (!value) return 'â€”';

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
    return 'DEVOLUÃ‡ÃƒO PARCIAL';
  }

  if (sale?.released_at) return 'ENTREGUE';
  if (sale?.status === 'PAID') return 'PAGA';

  return sale?.status || 'â€”';
};

export default function RecentSalesV16({ user, refreshKey = 0 }) {
  const [sales, setSales] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError(err?.message || 'NÃ£o foi possÃ­vel carregar as vendas.');
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
      setError(err?.message || 'NÃ£o foi possÃ­vel abrir a venda.');
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

  return (
    <section className="recent-sales-v16">

      <header className="recent-sales-v16-head">
        <div>
          <span>NEXUS V1.6 â€¢ OPERAÃ‡ÃƒO AUDITADA</span>
          <h2>Ãšltimas Vendas</h2>
          <p>
            Consulte vendas, pagamentos, operador e situaÃ§Ã£o da retirada.
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

      <div className="recent-sales-v16-layout">

        <div className="recent-sales-v16-list">

          {!loading && sales.length === 0 && (
            <div className="recent-sales-v16-empty">
              Nenhuma venda encontrada.
            </div>
          )}

          {sales.map(sale => (
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
                     'NÃ£o informado'}
                  </b>
                </div>

                <div>
                  <small>DATA / HORA</small>
                  <b>{dateTime(selected.created_at)}</b>
                </div>

                <div>
                  <small>RETIRADA</small>
                  <b>{selected.release_code || 'â€”'}</b>
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
                <b>{user?.name || 'UsuÃ¡rio autenticado'}</b>
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

