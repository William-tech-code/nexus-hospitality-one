import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import {hashPassword} from './security.js';

const dataDir=process.env.NEXUS_DATA_DIR||path.resolve(process.cwd(),'data');
fs.mkdirSync(dataDir,{recursive:true});
export const db=new Database(path.join(dataDir,'nexus-hospitality.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function addColumn(table,column,definition){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function initDb(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);

    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CASHIER',active INTEGER NOT NULL DEFAULT 1,
      force_password_change INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_login_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS employees(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE,name TEXT NOT NULL,role_label TEXT NOT NULL,
      phone TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT NOT NULL,entity TEXT NOT NULL,
      entity_id TEXT,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products(
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT NOT NULL,barcode TEXT,
      image_url TEXT,description TEXT,unit_type TEXT NOT NULL DEFAULT 'UNIT',package_ml REAL,
      dose_ml REAL,price REAL NOT NULL DEFAULT 0,cost REAL NOT NULL DEFAULT 0,stock REAL NOT NULL DEFAULT 0,
      minimum_stock REAL NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stock_movements(
      id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,type TEXT NOT NULL,qty REAL NOT NULL,
      reference_type TEXT,reference_id TEXT,user_id INTEGER,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cash_sessions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',
      opening_amount REAL NOT NULL DEFAULT 0,closing_amount REAL,expected_amount REAL,
      opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,closed_at TEXT,notes TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS sales(
      id INTEGER PRIMARY KEY AUTOINCREMENT,total REAL NOT NULL DEFAULT 0,payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PAID',table_label TEXT,customer_name TEXT,cash_session_id INTEGER,
      user_id INTEGER,employee_id INTEGER,tip_amount REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(cash_session_id) REFERENCES cash_sessions(id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(employee_id) REFERENCES employees(id)
    );
    CREATE TABLE IF NOT EXISTS sale_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL,product_id INTEGER NOT NULL,qty REAL NOT NULL,
      unit_price REAL NOT NULL,unit_cost REAL NOT NULL,FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS tips(
      id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER,employee_id INTEGER,amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'SALE',status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sale_id) REFERENCES sales(id),FOREIGN KEY(employee_id) REFERENCES employees(id)
    );
    CREATE TABLE IF NOT EXISTS incentive_rules(
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,scope TEXT NOT NULL DEFAULT 'ANY',scope_value TEXT,
      reward_type TEXT NOT NULL DEFAULT 'FIXED_PER_UNIT',reward_value REAL NOT NULL DEFAULT 0,
      target_qty REAL,target_revenue REAL,start_date TEXT,end_date TEXT,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS employee_rewards(
      id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id INTEGER NOT NULL,sale_id INTEGER,rule_id INTEGER,
      type TEXT NOT NULL,amount REAL NOT NULL DEFAULT 0,description TEXT,status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(employee_id) REFERENCES employees(id),FOREIGN KEY(sale_id) REFERENCES sales(id),FOREIGN KEY(rule_id) REFERENCES incentive_rules(id)
    );

    CREATE TABLE IF NOT EXISTS expenses(
      id INTEGER PRIMARY KEY AUTOINCREMENT,description TEXT NOT NULL,category TEXT NOT NULL,amount REAL NOT NULL,
      due_date TEXT,paid INTEGER NOT NULL DEFAULT 0,paid_at TEXT,recurring INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS goals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'BUSINESS',target_value REAL NOT NULL DEFAULT 0,
      current_value REAL NOT NULL DEFAULT 0,deadline TEXT,employee_id INTEGER,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(employee_id) REFERENCES employees(id)
    );
    CREATE TABLE IF NOT EXISTS orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,label TEXT NOT NULL,customer_name TEXT,status TEXT NOT NULL DEFAULT 'OPEN',
      subtotal REAL NOT NULL DEFAULT 0,employee_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(employee_id) REFERENCES employees(id)
    );
    CREATE TABLE IF NOT EXISTS order_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,qty REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS suppliers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,contact TEXT,phone TEXT,email TEXT,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS purchase_quotes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'OPEN',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,event_type TEXT NOT NULL DEFAULT 'SHOW',venue_name TEXT,
      starts_at TEXT,ends_at TEXT,status TEXT NOT NULL DEFAULT 'DRAFT',artist_name TEXT,image_url TEXT,
      capacity INTEGER,cost_estimate REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tickets(
      id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,attendee_name TEXT,ticket_code TEXT NOT NULL UNIQUE,
      ticket_type TEXT,price REAL NOT NULL DEFAULT 0,payment_status TEXT NOT NULL DEFAULT 'PENDING',checkin_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS invoices(
      id INTEGER PRIMARY KEY AUTOINCREMENT,supplier TEXT NOT NULL,invoice_number TEXT,amount REAL NOT NULL DEFAULT 0,
      issue_date TEXT,entry_type TEXT NOT NULL DEFAULT 'PURCHASE',notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dining_tables(
      id INTEGER PRIMARY KEY AUTOINCREMENT,label TEXT NOT NULL UNIQUE,area TEXT,capacity INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'FREE',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_payments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,method TEXT NOT NULL,amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quote_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,quote_id INTEGER NOT NULL,supplier_id INTEGER NOT NULL,product_id INTEGER,
      description TEXT NOT NULL,qty REAL NOT NULL DEFAULT 1,unit_price REAL NOT NULL DEFAULT 0,freight REAL NOT NULL DEFAULT 0,
      lead_days INTEGER,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(quote_id) REFERENCES purchase_quotes(id) ON DELETE CASCADE,FOREIGN KEY(supplier_id) REFERENCES suppliers(id),FOREIGN KEY(product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS purchase_orders(
      id INTEGER PRIMARY KEY AUTOINCREMENT,supplier_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'DRAFT',total REAL NOT NULL DEFAULT 0,
      expected_at TEXT,received_at TEXT,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    );
    CREATE TABLE IF NOT EXISTS purchase_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,purchase_order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,qty REAL NOT NULL,
      unit_cost REAL NOT NULL,received_qty REAL NOT NULL DEFAULT 0,FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  // Migração segura da V0.1.
  addColumn('products','barcode','TEXT'); addColumn('products','image_url','TEXT'); addColumn('products','description','TEXT');
  addColumn('products','unit_type',"TEXT NOT NULL DEFAULT 'UNIT'"); addColumn('products','package_ml','REAL'); addColumn('products','dose_ml','REAL');
  addColumn('sales','cash_session_id','INTEGER'); addColumn('sales','user_id','INTEGER'); addColumn('sales','employee_id','INTEGER'); addColumn('sales','tip_amount','REAL NOT NULL DEFAULT 0');
  addColumn('expenses','paid_at','TEXT'); addColumn('goals','employee_id','INTEGER'); addColumn('orders','employee_id','INTEGER');
  addColumn('products','stock_factor','REAL NOT NULL DEFAULT 1');
  addColumn('products','stock_unit',"TEXT NOT NULL DEFAULT 'UN'");
  addColumn('order_items','status',"TEXT NOT NULL DEFAULT 'NEW'");
  addColumn('order_items','employee_id','INTEGER'); addColumn('order_items','sale_mode',"TEXT NOT NULL DEFAULT 'UNIT'");
  addColumn('orders','table_id','INTEGER'); addColumn('orders','closed_at','TEXT'); addColumn('orders','notes','TEXT');

  const defaults={business_name:'Meu Bar & Restaurante',reserve_percent:'10',tax_percent:'6',salary_percent:'15',owner_percent:'8',reinvest_percent:'12',daily_goal:'1000',schema_version:'1.0.0'};
  const put=db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  Object.entries(defaults).forEach(([k,v])=>put.run(k,v));
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('schema_version','1.0.0')").run();

  if(!db.prepare('SELECT COUNT(*) n FROM dining_tables').get().n){
    const addTable=db.prepare('INSERT INTO dining_tables(label,area,capacity) VALUES(?,?,?)');
    for(let i=1;i<=12;i++) addTable.run(`Mesa ${String(i).padStart(2,'0')}`, i<=6?'Salão':'Área externa', 4);
  }

  if(!db.prepare('SELECT COUNT(*) n FROM users').get().n){
    const info=db.prepare('INSERT INTO users(name,email,password_hash,role,force_password_change) VALUES(?,?,?,?,1)')
      .run('Administrador NEXUS','admin@nexus.local',hashPassword('Nexus@2026!'),'OWNER');
    db.prepare('INSERT INTO employees(user_id,name,role_label) VALUES(?,?,?)').run(info.lastInsertRowid,'Administrador NEXUS','Proprietário');
  }

  if(!db.prepare('SELECT COUNT(*) n FROM products').get().n){
    const ins=db.prepare('INSERT INTO products(name,category,price,cost,stock,minimum_stock,unit_type) VALUES(?,?,?,?,?,?,?)');
    const seed=[['Cerveja Long Neck','Bebidas',9,4.5,48,12,'UNIT'],['Litrão','Bebidas',15,7,30,8,'UNIT'],['Refrigerante Lata','Bebidas',7,3.1,36,10,'UNIT'],['Batata Frita','Porções',27,9.5,20,5,'UNIT'],['Calabresa','Porções',30,11,18,5,'UNIT'],['Espetinho Carne','Espetinhos',10,4.2,35,10,'UNIT'],['Pastel Carne','Pastéis',12,4.8,24,8,'UNIT']];
    db.transaction(()=>seed.forEach(p=>ins.run(...p)))();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      recipe_type TEXT NOT NULL DEFAULT 'FOOD',
      yield_qty REAL NOT NULL DEFAULT 1,
      instructions TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      ingredient_product_id INTEGER NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'UNIT',
      waste_percent REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY(ingredient_product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS stock_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      expected_qty REAL NOT NULL,
      counted_qty REAL NOT NULL,
      variance_qty REAL NOT NULL,
      reason TEXT DEFAULT '',
      user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payment_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS smart_closings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cash_session_id INTEGER,
      revenue REAL DEFAULT 0,
      cogs REAL DEFAULT 0,
      expenses REAL DEFAULT 0,
      obligations REAL DEFAULT 0,
      safety_reserve REAL DEFAULT 0,
      reinvestment REAL DEFAULT 0,
      safe_owner_withdrawal REAL DEFAULT 0,
      risk_level TEXT DEFAULT 'MEDIUM',
      rationale TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare('INSERT OR IGNORE INTO schema_versions(version) VALUES(4)').run();
}

export function setting(key,fallback=''){return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback}
