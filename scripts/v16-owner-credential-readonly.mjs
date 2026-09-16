import { db } from '../server/db.js';

const user = db.prepare(`
  SELECT
    id,
    name,
    email,
    role,
    active,
    force_password_change,
    password_hash
  FROM users
  WHERE lower(email) = lower(?)
  LIMIT 1
`).get('admin@nexus.local');

if (!user) {
  console.log('OWNER_NAO_ENCONTRADO');
  process.exitCode = 1;
} else {
  console.log({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    force_password_change: user.force_password_change,
    password_hash_presente: Boolean(user.password_hash),
    password_hash_tamanho:
      String(user.password_hash || '').length,
    password_hash_formato:
      String(user.password_hash || '').includes(':')
        ? 'COM_SEPARADOR'
        : 'SEM_SEPARADOR'
  });

  console.log('\nZERO ALTERACOES NO BANCO');
}
