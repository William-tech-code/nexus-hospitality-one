import crypto from 'node:crypto';

export function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password,stored=''){
  const [salt,expected]=String(stored).split(':');
  if(!salt||!expected) return false;
  const actual=crypto.scryptSync(String(password),salt,64);
  const exp=Buffer.from(expected,'hex');
  return actual.length===exp.length && crypto.timingSafeEqual(actual,exp);
}
export function sessionToken(){return crypto.randomBytes(36).toString('base64url')}
export function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex')}
