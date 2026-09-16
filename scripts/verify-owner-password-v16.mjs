import { db } from '../server/db.js';
import { verifyPassword } from '../server/auth.js';

const password =
  process.env.NEXUS_OWNER_TEST_PASSWORD || '';

const owner = db.prepare(`
  SELECT *
  FROM users
  WHERE email='admin@nexus.local'
  LIMIT 1
`).get();

if (!owner) {
  console.error('OWNER_NAO_LOCALIZADO');
  process.exit(50);
}

let ok = false;

try {
  ok = await verifyPassword(
    password,
    owner.password_hash
  );
}
catch (error) {
  console.error(
    'VERIFY_PASSWORD_ERROR:',
    error?.message || error
  );
  process.exit(51);
}

console.log('');
console.log('OWNER ID:',owner.id);
console.log('OWNER ROLE:',owner.role);
console.log('OWNER ACTIVE:',owner.active);
console.log('PASSWORD MATCH:',Boolean(ok));

if (!ok) {
  console.error('');
  console.error('OWNER_PASSWORD_MISMATCH');
  process.exit(52);
}

console.log('');
console.log('OWNER PASSWORD: VALID');
