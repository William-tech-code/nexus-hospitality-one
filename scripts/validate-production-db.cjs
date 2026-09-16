const Database = require("better-sqlite3");

const db = new Database("./data/nexus-hospitality.sqlite", {
  readonly: true,
  fileMustExist: true
});

const integrity = db.pragma("integrity_check", { simple: true });
const users = db.prepare("SELECT COUNT(*) n FROM users").get().n;
const products = db.prepare("SELECT COUNT(*) n FROM products").get().n;
const sales = db.prepare("SELECT COUNT(*) n FROM sales").get().n;

console.log("INTEGRITY:", integrity);
console.log("USERS:", users);
console.log("PRODUCTS:", products);
console.log("SALES:", sales);

if (
  integrity !== "ok" ||
  users !== 1 ||
  products !== 8 ||
  sales !== 0
) {
  console.error("VALIDACAO_PRODUCAO_FALHOU");
  process.exit(1);
}

console.log("BASE_OFICIAL_PRODUCAO_OK");

db.close();
