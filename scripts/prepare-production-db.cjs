const Database = require("better-sqlite3");

const FILE = "./data/nexus-hospitality-PRODUCAO-LIMPA.sqlite";
const db = new Database(FILE);

const clear = [
  "print_jobs",
  "sale_return_payment_reversals",
  "sale_payment_reversals",
  "asaas_webhook_events",
  "print_log",
  "change_corrections",
  "sale_cancellations",
  "sale_inventory_ledger",
  "sale_item_inventory_ledger",

  "ticket_orders",
  "public_orders",
  "financial_intelligence_reserves",
  "financial_intelligence_audit",
  "ticket_customer_claims",
  "sale_return_items",
  "fiscal_captures",
  "smart_closings",
  "payment_splits",
  "delivery_orders",
  "ticket_delivery_outbox",
  "employee_rewards",

  "quote_requests",
  "purchase_orders",
  "sale_returns",
  "tickets",
  "purchase_items",
  "sale_items",
  "sale_participants",
  "ticket_access_log",
  "ticket_customer_sessions",
  "public_order_items",
  "social_actions",
  "purchase_quotes",
  "expenses",
  "orders",
  "tips",
  "stock_counts",
  "cash_movements",
  "order_payments",
  "invoices",
  "sale_participant_payments",
  "ticket_customers",
  "sales",
  "audit_log",
  "order_items",
  "financial_obligations",
  "quote_items",
  "stock_movements",
  "quote_request_items",
  "sessions",
  "reservations",
  "cash_sessions",

  "delivery_items",
  "supplier_dispatches",
  "quote_supplier_prices",
  "purchase_quotes",
  "quote_invitations"
];

const exists = db.prepare(`
 SELECT 1
 FROM sqlite_master
 WHERE type='table' AND name=?
`);

const tx = db.transaction(() => {
  db.pragma("foreign_keys = OFF");

  for (const table of [...new Set(clear)]) {
    if (exists.get(table)) {
      db.prepare(`DELETE FROM "${table}"`).run();
    }
  }

  /*
   * PRODUCAO REAL:
   * produtos permanecem cadastrados,
   * mas quantidade fisica inicia em zero.
   */
  const productColumns = db
    .prepare(`PRAGMA table_info(products)`)
    .all()
    .map(x => x.name);

  for (const column of ["stock", "stock_qty", "quantity", "current_stock"]) {
    if (productColumns.includes(column)) {
      db.prepare(`UPDATE products SET "${column}"=0`).run();
    }
  }

  /*
   * Remove sequencias apenas das tabelas operacionais.
   * Assim a primeira venda real inicia uma nova sequencia.
   */
  if (exists.get("sqlite_sequence")) {
    for (const table of [...new Set(clear)]) {
      db.prepare(
        `DELETE FROM sqlite_sequence WHERE name=?`
      ).run(table);
    }
  }

  db.pragma("foreign_keys = ON");
});

try {
  tx();

  const integrity = db.pragma("integrity_check", {
    simple: true
  });

  console.log("");
  console.log("==============================================");
  console.log(" NEXUS HOSPITALITY - BASE PRODUCAO LIMPA");
  console.log("==============================================");
  console.log("Arquivo:", FILE);
  console.log("Integrity:", integrity);

  for (const table of [
    "sales",
    "sale_items",
    "payment_splits",
    "cash_sessions",
    "cash_movements",
    "sale_returns",
    "sale_cancellations",
    "stock_movements",
    "expenses",
    "financial_obligations",
    "financial_intelligence_reserves",
    "ticket_orders",
    "tickets",
    "ticket_access_log",
    "audit_log"
  ]) {
    if (exists.get(table)) {
      const total =
        db.prepare(`SELECT COUNT(*) total FROM "${table}"`).get().total;

      console.log(
        table.padEnd(36),
        total
      );
    }
  }

  console.log("");
  console.log(
    "USERS:",
    db.prepare("SELECT COUNT(*) total FROM users").get().total
  );

  console.log(
    "PRODUCTS:",
    db.prepare("SELECT COUNT(*) total FROM products").get().total
  );

  console.log(
    "SETTINGS:",
    db.prepare("SELECT COUNT(*) total FROM settings").get().total
  );

  console.log("");
  console.log("LIMPEZA_CONCLUIDA_COM_SUCESSO");

} catch (err) {
  console.error("");
  console.error("LIMPEZA_ABORTADA");
  console.error(err);
  process.exitCode = 1;
} finally {
  db.close();
}
