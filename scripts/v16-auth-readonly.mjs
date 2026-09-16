import { db } from '../server/db.js';

const cols = db.prepare(`
  PRAGMA table_info(users)
`).all().map(x => x.name);

const wanted = [
  'id',
  'name',
  'email',
  'role',
  'active',
  'force_password_change',
  'last_login_at'
].filter(x => cols.includes(x));

console.log('\n=== USUARIOS ===');

const users = db.prepare(`
  SELECT ${wanted.join(', ')}
  FROM users
  ORDER BY id
`).all();

console.table(users);

const owner = db.prepare(`
  SELECT id, name, email, role, active
  FROM users
  WHERE role = 'OWNER'
    AND active = 1
  ORDER BY id
  LIMIT 1
`).get();

console.log('\n=== OWNER ATIVO ===');

if (owner) {
  console.table([owner]);
  console.log('OWNER_ATIVO_LOCALIZADO');
} else {
  console.log('OWNER_ATIVO_NAO_LOCALIZADO');
}

console.log('\nZERO ALTERACOES NO BANCO');
