import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import {
  hashPassword,
  verifyPassword
} from '../server/security.js';

const password = process.env.NEXUS_NEW_OWNER_PASSWORD;

if (!password || password.length < 10) {
  throw new Error('SENHA_INVALIDA');
}

const owner = db.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    active,
    password_hash
  FROM users
  WHERE id = 1
    AND role = 'OWNER'
    AND active = 1
`).get();

if (!owner) {
  throw new Error('OWNER_ID_1_NAO_ENCONTRADO');
}

const dbInfo = db.prepare(`
  PRAGMA database_list
`).all();

const mainDb = dbInfo.find(x => x.name === 'main');

if (!mainDb?.file) {
  throw new Error('CAMINHO_BANCO_NAO_LOCALIZADO');
}

const dbPath = path.resolve(mainDb.file);

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backupPath =
  `${dbPath}.BACKUP-BEFORE-OWNER-RESET-${stamp}`;

console.log('\nBanco ativo:');
console.log(dbPath);

console.log('\nCriando backup SQLite consistente...');

await db.backup(backupPath);

if (!fs.existsSync(backupPath)) {
  throw new Error('BACKUP_NAO_CRIADO');
}

console.log(`Backup: ${backupPath}`);

const newHash = hashPassword(password);

if (!verifyPassword(password, newHash)) {
  throw new Error('NOVO_HASH_NAO_VALIDADO');
}

const tx = db.transaction(() => {

  const result = db.prepare(`
    UPDATE users
    SET
      password_hash = ?,
      force_password_change = 0
    WHERE id = ?
      AND role = 'OWNER'
      AND active = 1
  `).run(newHash, owner.id);

  if (result.changes !== 1) {
    throw new Error('OWNER_NAO_ATUALIZADO');
  }

  db.prepare(`
    UPDATE sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND revoked_at IS NULL
  `).run(owner.id);

  try {
    db.prepare(`
      INSERT INTO audit_log(
        user_id,
        action,
        entity,
        entity_id,
        details
      )
      VALUES(?,?,?,?,?)
    `).run(
      owner.id,
      'OWNER_PASSWORD_ADMIN_RESET',
      'USER',
      String(owner.id),
      JSON.stringify({
        method: 'LOCAL_SECURE_RESET'
      })
    );
  } catch {}
});

tx();

const updated = db.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    active,
    force_password_change,
    password_hash
  FROM users
  WHERE id = ?
`).get(owner.id);

if (!verifyPassword(password, updated.password_hash)) {
  throw new Error('VALIDACAO_FINAL_DA_SENHA_FALHOU');
}

console.log('');
console.log('============================================');
console.log(' OWNER PASSWORD RESET: OK');
console.log(` ID: ${updated.id}`);
console.log(` EMAIL: ${updated.email}`);
console.log(` ROLE: ${updated.role}`);
console.log(' HASH VALIDADO: OK');
console.log(' SESSOES ANTIGAS REVOGADAS: OK');
console.log(' BACKUP DO BANCO: OK');
console.log(' SENHA NAO FOI EXIBIDA');
console.log('============================================');
