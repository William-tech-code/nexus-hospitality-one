import {db, initDb} from '../server/db.js';
import {hashPassword} from '../server/security.js';

initDb();
const email='admin@nexus.local';
const password='Nexus@2026!';
const existing=db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email);
let userId;
if(existing){
  userId=existing.id;
  db.prepare(`UPDATE users SET name=?, password_hash=?, role='OWNER', active=1, force_password_change=1 WHERE id=?`)
    .run('Administrador NEXUS',hashPassword(password),userId);
}else{
  const info=db.prepare(`INSERT INTO users(name,email,password_hash,role,active,force_password_change) VALUES(?,?,?,'OWNER',1,1)`)
    .run('Administrador NEXUS',email,hashPassword(password));
  userId=info.lastInsertRowid;
}
const emp=db.prepare('SELECT id FROM employees WHERE user_id=?').get(userId);
if(!emp) db.prepare('INSERT INTO employees(user_id,name,role_label,active) VALUES(?,?,?,1)').run(userId,'Administrador NEXUS','Proprietário');
db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
console.log(`ADMIN_RECOVERED ${email} USER_ID=${userId}`);
