const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dir = "./data";

const files = fs.readdirSync(dir)
  .filter(x => x.endsWith(".sqlite"))
  .sort();

console.log("\n=== DIAGNOSTICO DOS BANCOS ===\n");

for (const file of files) {
  const full = path.join(dir, file);

  console.log("------------------------------------------");
  console.log("ARQUIVO:", file);

  try {
    const db = new Database(full, {
      readonly: true,
      fileMustExist: true
    });

    const integrity = db.pragma("integrity_check", {
      simple: true
    });

    console.log("INTEGRITY:", integrity);

    for (const table of ["users", "products", "sales"]) {
      try {
        const n =
          db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;

        console.log(table.toUpperCase() + ":", n);
      } catch {
        console.log(table.toUpperCase() + ": N/A");
      }
    }

    db.close();

  } catch (err) {
    console.log("ERRO:", err.message);
  }
}

console.log("------------------------------------------");
