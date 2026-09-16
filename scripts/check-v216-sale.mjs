import Database from "better-sqlite3";

const dbPath = process.argv[2];

const db = new Database(
  dbPath,
  {
    readonly: true,
    fileMustExist: true
  }
);

try {

  const integrity =
    db.pragma(
      "integrity_check",
      { simple: true }
    );

  const sale =
    db.prepare(`
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
    "DATABASE_INTEGRITY=" +
    integrity
  );

  console.log(
    "ULTIMA_VENDA=" +
    JSON.stringify(sale || null)
  );

  if (!sale) {
    console.log("RESULTADO=VENDA_NAO_ENCONTRADA");
    process.exitCode = 1;
  }
  else {

    const jobs =
      db.prepare(`
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
        ORDER BY id ASC
      `).all(sale.id);

    console.log("");
    console.log(
      "DOCUMENTOS=" +
      JSON.stringify(jobs)
    );

    console.log("");
    console.log(
      "TOTAL_DOCUMENTOS=" +
      jobs.length
    );

    const types =
      jobs.map(
        job => job.document_type
      );

    console.log(
      "TIPOS=" +
      JSON.stringify(types)
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

    console.log(
      "DOCUMENTOS_3=" +
      (documentsOK ? "PASS" : "FAIL")
    );

    const releaseOK =
      sale.released_at == null &&
      sale.released_by == null;

    console.log(
      "LIBERACAO_AUTOMATICA=" +
      (
        releaseOK
          ? "NAO - PASS"
          : "SIM - PRECISA_CORRIGIR"
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

    const simulationOK =
      jobs.length === 3 &&
      jobs.every(
        job =>
          job.mode === "SIMULATION"
      );

    console.log(
      "SIMULATION_MODE=" +
      (
        simulationOK
          ? "PASS"
          : "FAIL"
      )
    );

    console.log("");
    console.log(
      "RESULTADO_FINAL=" +
      (
        documentsOK &&
        releaseOK &&
        simulationOK
          ? "V2.1.6_OPERATIONAL_PASS"
          : "REVISAO_NECESSARIA"
      )
    );
  }

}
finally {

  db.close();

}
