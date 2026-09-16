import Database from "better-sqlite3";

const dbPath = process.argv[2];

const db = new Database(dbPath, {
  readonly: true,
  fileMustExist: true
});

try {

  const integrity = db.pragma(
    "integrity_check",
    { simple: true }
  );

  console.log("");
  console.log("DATABASE_INTEGRITY=" + integrity);

  const sale = db.prepare(`
    SELECT
      id,
      total,
      payment_method,
      status,
      received_amount,
      change_amount,
      release_code,
      released_at,
      released_by,
      created_at
    FROM sales
    ORDER BY id DESC
    LIMIT 1
  `).get();

  console.log("");
  console.log(
    "ULTIMA_VENDA=" +
    JSON.stringify(sale || null)
  );

  if (!sale) {
    console.log("RESULTADO_FINAL=VENDA_NAO_ENCONTRADA");
    process.exitCode = 1;
  }
  else {

    const items = db.prepare(`
      SELECT *
      FROM sale_items
      WHERE sale_id=?
      ORDER BY id
    `).all(sale.id);

    const payments = db.prepare(`
      SELECT *
      FROM payment_splits
      WHERE sale_id=?
      ORDER BY id
    `).all(sale.id);

    const jobs = db.prepare(`
      SELECT
        id,
        sale_id,
        document_type,
        status,
        mode,
        attempts,
        requested_by,
        idempotency_key,
        created_at
      FROM print_jobs
      WHERE sale_id=?
      ORDER BY id
    `).all(sale.id);

    console.log("");
    console.log(
      "ITENS=" +
      JSON.stringify(items)
    );

    console.log("");
    console.log(
      "PAGAMENTOS=" +
      JSON.stringify(payments)
    );

    console.log("");
    console.log(
      "DOCUMENTOS=" +
      JSON.stringify(jobs)
    );

    console.log("");
    console.log("TOTAL_ITENS=" + items.length);
    console.log("TOTAL_PAGAMENTOS=" + payments.length);
    console.log("TOTAL_DOCUMENTOS=" + jobs.length);

    const types = jobs.map(
      job => job.document_type
    );

    const expected = [
      "PICKUP_CUSTOMER",
      "PRODUCTION",
      "RECEIPT"
    ];

    const documentsOK =
      jobs.length === 3 &&
      expected.every(
        type =>
          types.filter(
            value => value === type
          ).length === 1
      );

    const releaseOK =
      sale.released_at == null &&
      sale.released_by == null;

    const saleOK =
      sale.status === "PAID";

    const itemsOK =
      items.length > 0;

    const paymentsOK =
      payments.length > 0;

    const simulationOK =
      jobs.length === 3 &&
      jobs.every(
        job => job.mode === "SIMULATION"
      );

    const notPrintedOK =
      jobs.length === 3 &&
      jobs.every(
        job => job.status !== "PRINTED"
      );

    const uniqueKeys =
      new Set(
        jobs.map(
          job => job.idempotency_key
        )
      );

    const idempotencyOK =
      jobs.length === 3 &&
      uniqueKeys.size === 3 &&
      jobs.every(
        job =>
          typeof job.idempotency_key === "string" &&
          job.idempotency_key.length > 0
      );

    console.log("");
    console.log(
      "VENDA_PAID=" +
      (saleOK ? "PASS" : "FAIL")
    );

    console.log(
      "ITENS_REGISTRADOS=" +
      (itemsOK ? "PASS" : "FAIL")
    );

    console.log(
      "PAGAMENTO_REGISTRADO=" +
      (paymentsOK ? "PASS" : "FAIL")
    );

    console.log(
      "DOCUMENTOS_3=" +
      (documentsOK ? "PASS" : "FAIL")
    );

    console.log(
      "PICKUP_CUSTOMER=" +
      (
        types.includes("PICKUP_CUSTOMER")
          ? "PASS"
          : "FAIL"
      )
    );

    console.log(
      "PRODUCTION=" +
      (
        types.includes("PRODUCTION")
          ? "PASS"
          : "FAIL"
      )
    );

    console.log(
      "RECEIPT=" +
      (
        types.includes("RECEIPT")
          ? "PASS"
          : "FAIL"
      )
    );

    console.log(
      "LIBERACAO_AUTOMATICA=" +
      (
        releaseOK
          ? "NAO - PASS"
          : "SIM - FAIL"
      )
    );

    console.log(
      "RELEASED_AT=" +
      (
        sale.released_at == null
          ? "NULL"
          : sale.released_at
      )
    );

    console.log(
      "RELEASED_BY=" +
      (
        sale.released_by == null
          ? "NULL"
          : sale.released_by
      )
    );

    console.log(
      "DOCUMENTOS_SIMULACAO=" +
      (simulationOK ? "PASS" : "FAIL")
    );

    console.log(
      "IMPRESSAO_FISICA_AINDA_NAO_MARCADA=" +
      (notPrintedOK ? "PASS" : "FAIL")
    );

    console.log(
      "IDEMPOTENCIA=" +
      (idempotencyOK ? "PASS" : "FAIL")
    );

    const finalOK =
      integrity === "ok" &&
      saleOK &&
      itemsOK &&
      paymentsOK &&
      documentsOK &&
      releaseOK &&
      simulationOK &&
      notPrintedOK &&
      idempotencyOK;

    console.log("");
    console.log("============================================================");

    console.log(
      "RESULTADO_FINAL=" +
      (
        finalOK
          ? "V2.1.7_OPERATIONAL_PASS"
          : "REVISAO_NECESSARIA"
      )
    );

    console.log("============================================================");
  }

}
finally {
  db.close();
}
