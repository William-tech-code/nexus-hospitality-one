import crypto from "node:crypto";

/*
==============================================================
 NEXUS HOSPITALITY ONE
 PRINT JOBS ENGINE
 V2.1.3 ESM HOTFIX
==============================================================

- ESM nativo
- compatível com package.json type=module
- idempotência
- PICKUP
- RECEIPT
- SIMULATION separado de PRINTED
==============================================================
*/

const VALID_DOCUMENT_TYPES =
  new Set([
    "PICKUP",
    "PICKUP_CUSTOMER",
    "PRODUCTION",
    "RECEIPT",
    "EVENT_TICKET"
  ]);

const VALID_MODES =
  new Set([
    "SIMULATION",
    "DESKTOP"
  ]);

export function normalizeDocumentType(
  value
) {

  const type =
    String(value || "")
      .trim()
      .toUpperCase();

  if (!VALID_DOCUMENT_TYPES.has(type)) {

    throw new Error(
      "INVALID_PRINT_DOCUMENT_TYPE=" +
      type
    );
  }

  return type;
}

export function normalizeMode(value) {

  const mode =
    String(value || "SIMULATION")
      .trim()
      .toUpperCase();

  if (!VALID_MODES.has(mode)) {

    throw new Error(
      "INVALID_PRINT_MODE=" +
      mode
    );
  }

  return mode;
}

export function buildIdempotencyKey({
  saleId,
  documentType,
  purpose = "ORIGINAL"
}) {

  const source = [
    "NEXUS-HOSPITALITY",
    "SALE",
    String(saleId),
    normalizeDocumentType(
      documentType
    ),
    String(
      purpose || "ORIGINAL"
    )
      .trim()
      .toUpperCase()
  ].join(":");

  return crypto
    .createHash("sha256")
    .update(source)
    .digest("hex");
}

function safeJsonParse(value) {

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  }
  catch {
    return null;
  }
}

export function createPrintJobsEngine({
  db
}) {

  if (!db) {

    throw new Error(
      "PRINT_ENGINE_DATABASE_REQUIRED"
    );
  }

  function assertFoundation() {

    const table =
      db.prepare(`
        SELECT 1
          FROM sqlite_master
         WHERE type='table'
           AND name='print_jobs'
      `).get();

    if (!table) {

      throw new Error(
        "PRINT_JOBS_TABLE_NOT_FOUND"
      );
    }

    return true;
  }

  function getSale(saleId) {

    const id =
      Number(saleId);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      throw new Error(
        "INVALID_SALE_ID"
      );
    }

    const sale =
      db.prepare(`
        SELECT *
          FROM sales
         WHERE id=?
         LIMIT 1
      `).get(id);

    if (!sale) {

      throw new Error(
        "SALE_NOT_FOUND=" + id
      );
    }

    return sale;
  }

  function buildSalePayload(
    saleId
  ) {

    const sale =
      getSale(saleId);

    const items =
      db.prepare(`
        SELECT *
          FROM sale_items
         WHERE sale_id=?
         ORDER BY id ASC
      `).all(sale.id);

    let payments = [];

    try {

      payments =
        db.prepare(`
          SELECT *
            FROM payment_splits
           WHERE sale_id=?
           ORDER BY id ASC
        `).all(sale.id);
    }
    catch {
      payments = [];
    }

    return {
      schemaVersion: 1,
      generatedAt:
        new Date().toISOString(),

      sale: {
        ...sale
      },

      items,
      payments
    };
  }

  function findByIdempotencyKey(
    key
  ) {

    return db.prepare(`
      SELECT *
        FROM print_jobs
       WHERE idempotency_key=?
       LIMIT 1
    `).get(key);
  }

  function getJob(jobId) {

    const id =
      Number(jobId);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      throw new Error(
        "INVALID_PRINT_JOB_ID"
      );
    }

    const row =
      db.prepare(`
        SELECT *
          FROM print_jobs
         WHERE id=?
         LIMIT 1
      `).get(id);

    if (!row) {

      throw new Error(
        "PRINT_JOB_NOT_FOUND=" +
        id
      );
    }

    return {
      ...row,
      payload:
        safeJsonParse(
          row.payload_json
        )
    };
  }

  function listJobsForSale(
    saleId
  ) {

    const sale =
      getSale(saleId);

    return db.prepare(`
      SELECT *
        FROM print_jobs
       WHERE sale_id=?
       ORDER BY id ASC
    `).all(sale.id);
  }

  function queueJob({
    saleId,
    documentType,
    requestedBy = null,
    mode = "SIMULATION",
    purpose = "ORIGINAL"
  }) {

    assertFoundation();

    const sale =
      getSale(saleId);

    const type =
      normalizeDocumentType(
        documentType
      );

    const normalizedMode =
      normalizeMode(mode);

    const key =
      buildIdempotencyKey({
        saleId: sale.id,
        documentType: type,
        purpose
      });

    const existing =
      findByIdempotencyKey(
        key
      );

    if (existing) {

      return {
        created: false,
        idempotent: true,
        job:
          getJob(existing.id)
      };
    }

    const payload =
      buildSalePayload(
        sale.id
      );

    const insert =
      db.prepare(`
        INSERT INTO print_jobs (
          sale_id,
          document_type,
          status,
          mode,
          requested_by,
          attempts,
          idempotency_key,
          payload_json,
          created_at,
          updated_at
        )
        VALUES (
          @sale_id,
          @document_type,
          'QUEUED',
          @mode,
          @requested_by,
          0,
          @idempotency_key,
          @payload_json,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);

    const result =
      insert.run({
        sale_id:
          sale.id,

        document_type:
          type,

        mode:
          normalizedMode,

        requested_by:
          requestedBy == null
            ? null
            : Number(requestedBy),

        idempotency_key:
          key,

        payload_json:
          JSON.stringify(payload)
      });

    return {
      created: true,
      idempotent: false,
      job:
        getJob(
          Number(
            result.lastInsertRowid
          )
        )
    };
  }

  function queueSaleDocuments({
    saleId,
    requestedBy = null,
    mode = "SIMULATION"
  }) {

    /*
      NEXUS HOSPITALITY ONE V2.1.6

      Fluxo documental oficial da venda:

      1. PICKUP_CUSTOMER
         Ficha numerada entregue ao cliente.

      2. PRODUCTION
         Via operacional para preparo/producao.

      3. RECEIPT
         Comprovante da venda.

      A retirada fisica NAO depende de released_at.
      A fila possui idempotencia por venda/documento/purpose.
    */

    const transaction =
      db.transaction(() => {

        const pickupCustomer =
          queueJob({
            saleId,
            documentType:
              "PICKUP_CUSTOMER",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        const production =
          queueJob({
            saleId,
            documentType:
              "PRODUCTION",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        const receipt =
          queueJob({
            saleId,
            documentType:
              "RECEIPT",
            requestedBy,
            mode,
            purpose:
              "ORIGINAL"
          });

        return {
          pickup_customer:
            pickupCustomer,
          production,
          receipt
        };
      });

    return transaction();
  }

  function simulateJob(
    jobId
  ) {

    assertFoundation();

    const current =
      getJob(jobId);

    if (
      current.status ===
      "SIMULATED"
    ) {

      return {
        changed: false,
        job: current
      };
    }

    if (
      current.status ===
      "PRINTED"
    ) {

      throw new Error(
        "PRINTED_JOB_CANNOT_BE_SIMULATED"
      );
    }

    if (
      current.mode !==
      "SIMULATION"
    ) {

      throw new Error(
        "JOB_MODE_IS_NOT_SIMULATION"
      );
    }

    db.prepare(`
      UPDATE print_jobs
         SET status='SIMULATED',
             attempts=attempts+1,
             processed_at=CURRENT_TIMESTAMP,
             updated_at=CURRENT_TIMESTAMP,
             error_message=NULL
       WHERE id=?
    `).run(current.id);

    return {
      changed: true,
      job:
        getJob(current.id)
    };
  }

  function simulateSaleDocuments(
    saleId
  ) {

    const jobs =
      listJobsForSale(
        saleId
      );

    const result = [];

    for (const job of jobs) {

      if (
        job.mode !==
        "SIMULATION"
      ) {
        continue;
      }

      if (
        job.status ===
        "PRINTED"
      ) {
        continue;
      }

      result.push(
        simulateJob(job.id)
      );
    }

    return result;
  }

  function markFailed(
    jobId,
    errorMessage
  ) {

    const current =
      getJob(jobId);

    if (
      current.status ===
      "PRINTED"
    ) {

      throw new Error(
        "PRINTED_JOB_CANNOT_FAIL"
      );
    }

    db.prepare(`
      UPDATE print_jobs
         SET status='FAILED',
             attempts=attempts+1,
             processed_at=CURRENT_TIMESTAMP,
             error_message=?,
             updated_at=CURRENT_TIMESTAMP
       WHERE id=?
    `).run(
      String(
        errorMessage ||
        "UNKNOWN_PRINT_ERROR"
      ),
      current.id
    );

    return getJob(
      current.id
    );
  }

  /*
    ==========================================================
    NEXUS_SAFE_DESKTOP_STATE_MACHINE_V218F4
    ==========================================================

    Contrato fisico preparado sem executar impressao:

    QUEUED  -> PRINTED
    QUEUED  -> FAILED
    FAILED  -> QUEUED

    SIMULATED permanece exclusivo da simulacao.

    Nao existe PROCESSING porque o schema oficial
    de print_jobs nao possui esse estado.

    PRINTED somente devera ser chamado futuramente
    depois da confirmacao positiva do Electron/OS.
  */

  function beginDesktopAttempt(
    jobId,
    {
      printerName = null
    } = {}
  ) {

    const id =
      Number(jobId);

    if(
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new Error(
        'PRINT_JOB_ID_INVALID'
      );
    }

    const job =
      getJob(id);

    if(!job) {
      throw new Error(
        'PRINT_JOB_NOT_FOUND'
      );
    }

    if(
      job.status === 'PRINTED'
    ) {
      throw new Error(
        'PRINT_JOB_ALREADY_PRINTED'
      );
    }

    if(
      job.status === 'SIMULATED'
    ) {
      throw new Error(
        'SIMULATED_JOB_NOT_DESKTOP_READY'
      );
    }

    if(
      job.status !== 'QUEUED'
    ) {
      throw new Error(
        'PRINT_JOB_NOT_QUEUED'
      );
    }

    db.prepare(`
      UPDATE print_jobs
      SET
        attempts = attempts + 1,
        printer_name =
          COALESCE(
            ?,
            printer_name
          ),
        error_message = NULL,
        processed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      printerName
         ? String(printerName)
        : null,
      id
    );

    return getJob(id);
  }

  function markDesktopPrinted(
    jobId,
    {
      printerName = null
    } = {}
  ) {

    const id =
      Number(jobId);

    if(
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new Error(
        'PRINT_JOB_ID_INVALID'
      );
    }

    const job =
      getJob(id);

    if(!job) {
      throw new Error(
        'PRINT_JOB_NOT_FOUND'
      );
    }

    if(
      job.status === 'PRINTED'
    ) {
      return job;
    }

    if(
      job.status !== 'QUEUED'
    ) {
      throw new Error(
        'PRINT_JOB_NOT_QUEUED'
      );
    }

    if(
      Number(job.attempts || 0) < 1
    ) {
      throw new Error(
        'PRINT_ATTEMPT_REQUIRED'
      );
    }

    db.prepare(`
      UPDATE print_jobs
      SET
        status = 'PRINTED',
        mode = 'DESKTOP',
        printer_name =
          COALESCE(
            ?,
            printer_name
          ),
        error_message = NULL,
        printed_at = CURRENT_TIMESTAMP,
        processed_at =
          COALESCE(
            processed_at,
            CURRENT_TIMESTAMP
          ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      printerName
         ? String(printerName)
        : null,
      id
    );

    return getJob(id);
  }

  function markDesktopFailed(
    jobId,
    error,
    {
      printerName = null
    } = {}
  ) {

    const id =
      Number(jobId);

    if(
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new Error(
        'PRINT_JOB_ID_INVALID'
      );
    }

    const job =
      getJob(id);

    if(!job) {
      throw new Error(
        'PRINT_JOB_NOT_FOUND'
      );
    }

    if(
      job.status === 'PRINTED'
    ) {
      throw new Error(
        'PRINT_JOB_ALREADY_PRINTED'
      );
    }

    if(
      job.status !== 'QUEUED'
    ) {
      throw new Error(
        'PRINT_JOB_NOT_QUEUED'
      );
    }

    if(
      Number(job.attempts || 0) < 1
    ) {
      throw new Error(
        'PRINT_ATTEMPT_REQUIRED'
      );
    }

    const message =
      String(
        error?.message ||
        error ||
        'PRINT_FAILED'
      ).slice(
        0,
        1000
      );

    db.prepare(`
      UPDATE print_jobs
      SET
        status = 'FAILED',
        mode = 'DESKTOP',
        printer_name =
          COALESCE(
            ?,
            printer_name
          ),
        error_message = ?,
        processed_at =
          COALESCE(
            processed_at,
            CURRENT_TIMESTAMP
          ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      printerName
         ? String(printerName)
        : null,
      message,
      id
    );

    return getJob(id);
  }

  function retryDesktopJob(
    jobId
  ) {

    const id =
      Number(jobId);

    if(
      !Number.isInteger(id) ||
      id <= 0
    ) {
      throw new Error(
        'PRINT_JOB_ID_INVALID'
      );
    }

    const job =
      getJob(id);

    if(!job) {
      throw new Error(
        'PRINT_JOB_NOT_FOUND'
      );
    }

    if(
      job.status === 'PRINTED'
    ) {
      throw new Error(
        'PRINT_JOB_ALREADY_PRINTED'
      );
    }

    if(
      job.status !== 'FAILED'
    ) {
      throw new Error(
        'PRINT_JOB_NOT_FAILED'
      );
    }

    db.prepare(`
      UPDATE print_jobs
      SET
        status = 'QUEUED',
        mode = 'DESKTOP',
        error_message = NULL,
        processed_at = NULL,
        printed_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    return getJob(id);
  }

  function listDesktopPendingJobs(
    {
      limit = 50
    } = {}
  ) {

    const safeLimit =
      Math.max(
        1,
        Math.min(
          Number(limit) || 50,
          200
        )
      );

    return db.prepare(`
      SELECT *
      FROM print_jobs
      WHERE status IN (
        'QUEUED',
        'FAILED'
      )
      ORDER BY
        CASE
          WHEN status = 'QUEUED'
          THEN 0
          ELSE 1
        END,
        created_at ASC,
        id ASC
      LIMIT ?
    `).all(
      safeLimit
    );
  }

  return {
    beginDesktopAttempt,
    markDesktopPrinted,
    markDesktopFailed,
    retryDesktopJob,
    listDesktopPendingJobs,
    assertFoundation,
    getSale,
    getJob,
    listJobsForSale,
    buildSalePayload,
    queueJob,
    queueSaleDocuments,
    simulateJob,
    simulateSaleDocuments,
    markFailed
  };
}

