import Database from "better-sqlite3";

const db = new Database(process.argv[2], {
  readonly: true,
  fileMustExist: true
});

try {

  const rows = db.prepare(`
    SELECT
      id,
      sale_id,
      document_type,
      status,
      mode,
      printer_name,
      attempts,
      error_message,
      created_at,
      printed_at
    FROM print_jobs
    ORDER BY id DESC
    LIMIT 20
  `).all();

  console.log(
    JSON.stringify(rows, null, 2)
  );

}
finally {
  db.close();
}
