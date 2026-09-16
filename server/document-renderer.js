/*
==============================================================
 NEXUS HOSPITALITY ONE
 DOCUMENT RENDERER V2.1.4
==============================================================
 Renderer textual neutro.

 Nenhuma impressora fisica e acionada neste modulo.
==============================================================
*/

function money(value) {

  return Number(value || 0)
    .toLocaleString(
      "pt-BR",
      {
        style: "currency",
        currency: "BRL"
      }
    );
}

function dateTime(value) {

  if (!value) {
    return "-";
  }

  const normalized =
    String(value).includes("T")
      ? String(value)
      : String(value).replace(" ", "T") + "Z";

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("pt-BR");
}

function center(value, width = 42) {

  const text = String(value || "");

  if (text.length >= width) {
    return text;
  }

  const left =
    Math.floor((width - text.length) / 2);

  return " ".repeat(left) + text;
}

function line(char = "-", width = 42) {
  return char.repeat(width);
}

function productName(item, products) {

  const product =
    products?.find(
      p => Number(p.id) === Number(item.product_id)
    );

  return product?.name ||
    `PRODUTO #${item.product_id}`;
}

export function renderPickupCustomer({
  sale,
  items = [],
  products = []
}) {

  if (!sale) {
    throw new Error("SALE_REQUIRED");
  }

  const code =
    sale.release_code ||
    `VENDA-${sale.id}`;

  const out = [];

  out.push(center("PARADA OBRIGATORIA"));
  out.push(center("FICHA DE RETIRADA"));
  out.push(line("="));

  out.push("");
  out.push(center(code, 42));
  out.push("");

  out.push(`VENDA: #${sale.id}`);

  if (sale.table_label) {
    out.push(`MESA/COMANDA: ${sale.table_label}`);
  }

  if (sale.customer_name) {
    out.push(`CLIENTE: ${sale.customer_name}`);
  }

  out.push(line());

  for (const item of items) {

    out.push(
      `${item.qty}x ${productName(item, products)}`
    );
  }

  out.push(line());

  out.push(
    center(
      "ENTREGUE ESTA FICHA NA RETIRADA"
    )
  );

  out.push(
    center(
      "APRESENTE ESTA FICHA NA RETIRADA"
    )
  );

  out.push(line("="));

  return out.join("\n");
}

export function renderProduction({
  sale,
  items = [],
  products = []
}) {

  if (!sale) {
    throw new Error("SALE_REQUIRED");
  }

  const out = [];

  out.push(center("PARADA OBRIGATORIA"));
  out.push(center("PRODUCAO / BALCAO"));
  out.push(line("="));

  out.push(
    `RETIRADA: ${
      sale.release_code ||
      `VENDA-${sale.id}`
    }`
  );

  out.push(`VENDA: #${sale.id}`);

  if (sale.table_label) {
    out.push(`MESA/COMANDA: ${sale.table_label}`);
  }

  out.push(line());

  for (const item of items) {

    out.push(
      `${item.qty}x ${productName(item, products)}`
    );
  }

  out.push(line());

  out.push(
    `CRIADA: ${dateTime(sale.created_at)}`
  );

  out.push(line("="));

  return out.join("\n");
}

export function renderReceipt({
  sale,
  items = [],
  payments = [],
  products = [],
  operator = null
}) {

  if (!sale) {
    throw new Error("SALE_REQUIRED");
  }

  const out = [];

  out.push(center("PARADA OBRIGATORIA"));
  out.push(center("COMPROVANTE DA VENDA"));
  out.push(line("="));

  out.push(`VENDA: #${sale.id}`);
  out.push(`DATA: ${dateTime(sale.created_at)}`);

  if (operator?.name) {
    out.push(`OPERADOR: ${operator.name}`);
  }

  if (sale.customer_name) {
    out.push(`CLIENTE: ${sale.customer_name}`);
  }

  if (sale.table_label) {
    out.push(`MESA/COMANDA: ${sale.table_label}`);
  }

  out.push(line());

  for (const item of items) {

    const name =
      productName(item, products);

    const subtotal =
      Number(item.qty || 0) *
      Number(item.unit_price || 0);

    out.push(
      `${item.qty}x ${name}`
    );

    out.push(
      `   ${money(item.unit_price)} = ${money(subtotal)}`
    );
  }

  out.push(line());

  out.push(
    `TOTAL: ${money(sale.total)}`
  );

  if (Number(sale.tip_amount || 0) > 0) {
    out.push(
      `GORJETA: ${money(sale.tip_amount)}`
    );
  }

  if (payments.length) {

    out.push(line());
    out.push("PAGAMENTO:");

    for (const payment of payments) {

      out.push(
        `${payment.method}: ${money(payment.amount)}`
      );
    }
  }

  /*
    Troco historico nao e recalculado aqui.
    O renderer apenas representa o registro.
    A correcao operacional sera feita no POS.
  */

  if (
    Number(sale.received_amount || 0) > 0
  ) {

    out.push(
      `RECEBIDO: ${money(sale.received_amount)}`
    );

    out.push(
      `TROCO REGISTRADO: ${money(sale.change_amount)}`
    );
  }

  if (sale.release_code) {

    out.push(line());

    out.push(
      `RETIRADA: ${sale.release_code}`
    );
  }

  out.push(line("="));
  out.push(center("OBRIGADO PELA PREFERENCIA"));

  return out.join("\n");
}

export function renderEventTicket({
  ticket,
  event,
  lot = null
}) {

  if (!ticket) {
    throw new Error("TICKET_REQUIRED");
  }

  if (!event) {
    throw new Error("EVENT_REQUIRED");
  }

  const out = [];

  out.push(center("PARADA OBRIGATORIA"));
  out.push(center("INGRESSO"));
  out.push(line("="));

  out.push("");
  out.push(center(event.title || "EVENTO"));
  out.push("");

  if (event.artist_name) {
    out.push(
      center(event.artist_name)
    );
  }

  out.push(line());

  out.push(
    `CODIGO: ${ticket.ticket_code}`
  );

  if (ticket.attendee_name) {
    out.push(
      `TITULAR: ${ticket.attendee_name}`
    );
  }

  if (ticket.ticket_type) {
    out.push(
      `TIPO: ${ticket.ticket_type}`
    );
  }

  if (lot?.name) {
    out.push(
      `LOTE: ${lot.name}`
    );
  }

  out.push(
    `VALOR: ${money(ticket.price)}`
  );

  if (event.starts_at) {
    out.push(
      `DATA: ${dateTime(event.starts_at)}`
    );
  }

  if (event.venue_name) {
    out.push(
      `LOCAL: ${event.venue_name}`
    );
  }

  out.push(line());

  out.push(
    center("APRESENTE ESTE INGRESSO NA ENTRADA")
  );

  out.push(
    center("VALIDO PARA UMA UNICA ENTRADA")
  );

  if (ticket.qr_payload) {

    out.push("");
    out.push(
      center("[ QR CODE DISPONIVEL ]")
    );
  }

  out.push("");
  out.push(
    center(ticket.ticket_code)
  );

  out.push(line("="));

  return out.join("\n");
}
