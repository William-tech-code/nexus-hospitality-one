import { db } from './db.js';

function txt(value){
  return String(value ?? '').trim();
}

function num(value, fallback = 0){
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0){
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolInt(value, fallback = 0){
  if(value === true || value === 1 || value === '1') return 1;
  if(value === false || value === 0 || value === '0') return 0;
  return fallback ? 1 : 0;
}

function nowIso(){
  return new Date().toISOString();
}

function normalizeCode(value){
  return txt(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 50);
}

function normalizePlanCode(value){
  return normalizeCode(value).replace(/-/g, '_');
}

function normalizeDiscountType(value){
  const type = txt(value).toUpperCase();
  return ['FIXED_PRICE','PERCENT','FIXED_DISCOUNT'].includes(type)
    ? type
    : 'FIXED_PRICE';
}

function calculatePromotion(plan, promotion){
  const base = Number(plan.monthly_price || 0);

  if(!promotion){
    return {
      base_price: base,
      effective_price: base,
      discount_amount: 0,
      promotion: null
    };
  }

  let effective = base;

  if(promotion.discount_type === 'FIXED_PRICE'){
    effective = Math.max(0, Number(promotion.discount_value || 0));
  }

  if(promotion.discount_type === 'PERCENT'){
    const pct = Math.min(100, Math.max(0, Number(promotion.discount_value || 0)));
    effective = Math.max(0, base - (base * pct / 100));
  }

  if(promotion.discount_type === 'FIXED_DISCOUNT'){
    effective = Math.max(0, base - Number(promotion.discount_value || 0));
  }

  return {
    base_price: Number(base.toFixed(2)),
    effective_price: Number(effective.toFixed(2)),
    discount_amount: Number((base - effective).toFixed(2)),
    promotion: {
      id: promotion.id,
      name: promotion.name,
      code: promotion.code,
      discount_type: promotion.discount_type,
      discount_value: promotion.discount_value,
      benefit_months: promotion.benefit_months,
      starts_at: promotion.starts_at,
      ends_at: promotion.ends_at,
      max_redemptions: promotion.max_redemptions,
      redemption_count: promotion.redemption_count,
      new_customers_only: !!promotion.new_customers_only
    }
  };
}

function currentPromotionForPlan(planId){
  return db.prepare(`
    SELECT *
    FROM saas_promotions
    WHERE active = 1
      AND (plan_id IS NULL OR plan_id = ?)
      AND (starts_at IS NULL OR datetime(starts_at) <= datetime('now'))
      AND (ends_at IS NULL OR datetime(ends_at) >= datetime('now'))
      AND (
        max_redemptions IS NULL
        OR redemption_count < max_redemptions
      )
    ORDER BY
      CASE WHEN plan_id = ? THEN 0 ELSE 1 END,
      priority DESC,
      id DESC
    LIMIT 1
  `).get(planId, planId);
}

function serializePlan(plan){
  const promotion = currentPromotionForPlan(plan.id);
  const pricing = calculatePromotion(plan, promotion);

  let features = {};

  try{
    features = JSON.parse(plan.features_json || '{}');
  }catch{
    features = {};
  }

  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    tagline: plan.tagline,
    description: plan.description,
    monthly_price: Number(plan.monthly_price || 0),
    annual_price: plan.annual_price == null
      ? null
      : Number(plan.annual_price),
    currency: plan.currency,
    featured: !!plan.featured,
    sort_order: plan.sort_order,
    features,
    pricing
  };
}

function initSaasCommercialSchema(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS saas_plans(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT,
      description TEXT,
      monthly_price REAL NOT NULL DEFAULT 0,
      annual_price REAL,
      currency TEXT NOT NULL DEFAULT 'BRL',
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      features_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saas_promotions(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER,
      name TEXT NOT NULL,
      code TEXT UNIQUE,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'FIXED_PRICE',
      discount_value REAL NOT NULL DEFAULT 0,
      benefit_months INTEGER,
      starts_at TEXT,
      ends_at TEXT,
      max_redemptions INTEGER,
      redemption_count INTEGER NOT NULL DEFAULT 0,
      new_customers_only INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(plan_id) REFERENCES saas_plans(id)
    );

    CREATE INDEX IF NOT EXISTS idx_saas_plans_active
      ON saas_plans(active, sort_order);

    CREATE INDEX IF NOT EXISTS idx_saas_promotions_active
      ON saas_promotions(active, plan_id, starts_at, ends_at);
  `);

  const seedPlan = db.prepare(`
    INSERT INTO saas_plans(
      code,
      name,
      tagline,
      description,
      monthly_price,
      currency,
      featured,
      active,
      sort_order,
      features_json
    )
    VALUES(?,?,?,?,?,'BRL',?,1,?,?)
    ON CONFLICT(code) DO NOTHING
  `);

  seedPlan.run(
    'ESSENTIAL',
    'NEXUS Essential',
    'Operacao profissional para estabelecimentos em crescimento.',
    'Base operacional do NEXUS Hospitality One.',
    856.00,
    0,
    10,
    JSON.stringify({
      pos: true,
      salon: true,
      inventory: true,
      beverages_and_doses: true,
      financial: 'CORE',
      events: 'LIMITED',
      tickets: false,
      gate_scanner: false,
      intelligence: 'CORE',
      support: 'STANDARD'
    })
  );

  seedPlan.run(
    'PROFESSIONAL',
    'NEXUS Professional',
    'Gestao, eventos e inteligencia em uma unica plataforma.',
    'Plano completo para operacoes que utilizam eventos e ingressos.',
    1356.00,
    1,
    20,
    JSON.stringify({
      pos: true,
      salon: true,
      inventory: true,
      beverages_and_doses: true,
      financial: 'FULL',
      events: true,
      tickets: true,
      online_ticket_sales: true,
      qr_code: true,
      gate_scanner: true,
      audit: true,
      intelligence: 'FULL',
      support: 'PRIORITY'
    })
  );

  seedPlan.run(
    'ENTERPRISE',
    'NEXUS Enterprise',
    'Controle avancado para operacoes de maior escala.',
    'Camada superior do NEXUS Hospitality One.',
    1956.00,
    0,
    30,
    JSON.stringify({
      pos: true,
      salon: true,
      inventory: true,
      beverages_and_doses: true,
      financial: 'ADVANCED',
      events: true,
      tickets: true,
      online_ticket_sales: true,
      qr_code: true,
      gate_scanner: true,
      audit: true,
      intelligence: 'ADVANCED',
      support: 'PREMIUM',
      multi_unit_ready: true
    })
  );
}

function requireAdmin(req, res, next){
  const role = txt(req.user?.role).toUpperCase();

  if(!['OWNER','ADMIN'].includes(role)){
    return res.status(403).json({
      error: 'SAAS_ADMIN_REQUIRED'
    });
  }

  next();
}

export function registerSaasCommercialCore(app, auth){
  initSaasCommercialSchema();

  // ============================================================
  // PUBLIC
  // ============================================================

  app.get('/api/public/saas/plans', (_req, res) => {
    const plans = db.prepare(`
      SELECT *
      FROM saas_plans
      WHERE active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

    res.json({
      product: 'NEXUS Hospitality One',
      currency: 'BRL',
      billing: 'MONTHLY',
      plans: plans.map(serializePlan),
      generated_at: nowIso()
    });
  });

  app.get('/api/public/saas/plans/:code', (req, res) => {
    const code = normalizePlanCode(req.params.code);

    const plan = db.prepare(`
      SELECT *
      FROM saas_plans
      WHERE code = ?
        AND active = 1
    `).get(code);

    if(!plan){
      return res.status(404).json({
        error: 'PLAN_NOT_FOUND'
      });
    }

    res.json(serializePlan(plan));
  });

  app.get('/api/public/saas/promotions/:code', (req, res) => {
    const code = normalizeCode(req.params.code);

    const promotion = db.prepare(`
      SELECT p.*, sp.code AS plan_code, sp.name AS plan_name,
             sp.monthly_price
      FROM saas_promotions p
      LEFT JOIN saas_plans sp ON sp.id = p.plan_id
      WHERE p.code = ?
        AND p.active = 1
        AND (p.starts_at IS NULL OR datetime(p.starts_at) <= datetime('now'))
        AND (p.ends_at IS NULL OR datetime(p.ends_at) >= datetime('now'))
        AND (
          p.max_redemptions IS NULL
          OR p.redemption_count < p.max_redemptions
        )
      LIMIT 1
    `).get(code);

    if(!promotion){
      return res.status(404).json({
        error: 'PROMOTION_NOT_FOUND_OR_INACTIVE'
      });
    }

    res.json(promotion);
  });

  // ============================================================
  // ADMIN
  // ============================================================

  app.get(
    '/api/saas/admin/plans',
    auth,
    requireAdmin,
    (_req, res) => {
      const plans = db.prepare(`
        SELECT *
        FROM saas_plans
        ORDER BY sort_order ASC, id ASC
      `).all();

      res.json(plans.map(serializePlan));
    }
  );

  app.patch(
    '/api/saas/admin/plans/:id',
    auth,
    requireAdmin,
    (req, res) => {
      const id = integer(req.params.id);

      const current = db.prepare(`
        SELECT *
        FROM saas_plans
        WHERE id = ?
      `).get(id);

      if(!current){
        return res.status(404).json({
          error: 'PLAN_NOT_FOUND'
        });
      }

      const body = req.body || {};

      const name = body.name === undefined
        ? current.name
        : txt(body.name);

      const tagline = body.tagline === undefined
        ? current.tagline
        : txt(body.tagline) || null;

      const description = body.description === undefined
        ? current.description
        : txt(body.description) || null;

      const monthlyPrice = body.monthly_price === undefined
        ? current.monthly_price
        : Math.max(0, num(body.monthly_price));

      const annualPrice = body.annual_price === undefined
        ? current.annual_price
        : (
            body.annual_price === null ||
            body.annual_price === ''
              ? null
              : Math.max(0, num(body.annual_price))
          );

      const featured = body.featured === undefined
        ? current.featured
        : boolInt(body.featured);

      const active = body.active === undefined
        ? current.active
        : boolInt(body.active);

      const sortOrder = body.sort_order === undefined
        ? current.sort_order
        : integer(body.sort_order);

      let featuresJson = current.features_json;

      if(body.features !== undefined){
        featuresJson = JSON.stringify(body.features || {});
      }

      db.prepare(`
        UPDATE saas_plans
        SET name = ?,
            tagline = ?,
            description = ?,
            monthly_price = ?,
            annual_price = ?,
            featured = ?,
            active = ?,
            sort_order = ?,
            features_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name,
        tagline,
        description,
        monthlyPrice,
        annualPrice,
        featured,
        active,
        sortOrder,
        featuresJson,
        id
      );

      const updated = db.prepare(`
        SELECT *
        FROM saas_plans
        WHERE id = ?
      `).get(id);

      res.json({
        ok: true,
        plan: serializePlan(updated)
      });
    }
  );

  app.get(
    '/api/saas/admin/promotions',
    auth,
    requireAdmin,
    (_req, res) => {
      const rows = db.prepare(`
        SELECT p.*,
               sp.code AS plan_code,
               sp.name AS plan_name,
               sp.monthly_price AS plan_monthly_price
        FROM saas_promotions p
        LEFT JOIN saas_plans sp ON sp.id = p.plan_id
        ORDER BY p.active DESC, p.priority DESC, p.id DESC
      `).all();

      res.json(rows);
    }
  );

  app.post(
    '/api/saas/admin/promotions',
    auth,
    requireAdmin,
    (req, res) => {
      const body = req.body || {};

      const name = txt(body.name);

      if(!name){
        return res.status(400).json({
          error: 'PROMOTION_NAME_REQUIRED'
        });
      }

      let planId = null;

      if(body.plan_id !== undefined && body.plan_id !== null && body.plan_id !== ''){
        planId = integer(body.plan_id);

        const plan = db.prepare(`
          SELECT id
          FROM saas_plans
          WHERE id = ?
        `).get(planId);

        if(!plan){
          return res.status(400).json({
            error: 'INVALID_PLAN'
          });
        }
      }

      const code = body.code
        ? normalizeCode(body.code)
        : null;

      const discountType = normalizeDiscountType(body.discount_type);
      const discountValue = Math.max(0, num(body.discount_value));

      if(discountType === 'PERCENT' && discountValue > 100){
        return res.status(400).json({
          error: 'INVALID_PERCENT'
        });
      }

      const benefitMonths =
        body.benefit_months === undefined ||
        body.benefit_months === null ||
        body.benefit_months === ''
          ? null
          : Math.max(1, integer(body.benefit_months, 1));

      const maxRedemptions =
        body.max_redemptions === undefined ||
        body.max_redemptions === null ||
        body.max_redemptions === ''
          ? null
          : Math.max(1, integer(body.max_redemptions, 1));

      try{
        const info = db.prepare(`
          INSERT INTO saas_promotions(
            plan_id,
            name,
            code,
            description,
            discount_type,
            discount_value,
            benefit_months,
            starts_at,
            ends_at,
            max_redemptions,
            new_customers_only,
            priority,
            active
          )
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          planId,
          name,
          code,
          txt(body.description) || null,
          discountType,
          discountValue,
          benefitMonths,
          txt(body.starts_at) || null,
          txt(body.ends_at) || null,
          maxRedemptions,
          body.new_customers_only === undefined
            ? 1
            : boolInt(body.new_customers_only),
          integer(body.priority),
          body.active === undefined
            ? 1
            : boolInt(body.active)
        );

        const promotion = db.prepare(`
          SELECT *
          FROM saas_promotions
          WHERE id = ?
        `).get(info.lastInsertRowid);

        res.status(201).json({
          ok: true,
          promotion
        });
      }catch(error){
        if(
          String(error.message || '')
            .toUpperCase()
            .includes('UNIQUE')
        ){
          return res.status(409).json({
            error: 'PROMOTION_CODE_ALREADY_EXISTS'
          });
        }

        throw error;
      }
    }
  );

  app.patch(
    '/api/saas/admin/promotions/:id',
    auth,
    requireAdmin,
    (req, res) => {
      const id = integer(req.params.id);

      const current = db.prepare(`
        SELECT *
        FROM saas_promotions
        WHERE id = ?
      `).get(id);

      if(!current){
        return res.status(404).json({
          error: 'PROMOTION_NOT_FOUND'
        });
      }

      const body = req.body || {};

      let planId = current.plan_id;

      if(body.plan_id !== undefined){
        if(body.plan_id === null || body.plan_id === ''){
          planId = null;
        }else{
          planId = integer(body.plan_id);

          const plan = db.prepare(`
            SELECT id
            FROM saas_plans
            WHERE id = ?
          `).get(planId);

          if(!plan){
            return res.status(400).json({
              error: 'INVALID_PLAN'
            });
          }
        }
      }

      const name = body.name === undefined
        ? current.name
        : txt(body.name);

      if(!name){
        return res.status(400).json({
          error: 'PROMOTION_NAME_REQUIRED'
        });
      }

      const code = body.code === undefined
        ? current.code
        : (
            body.code === null || body.code === ''
              ? null
              : normalizeCode(body.code)
          );

      const discountType = body.discount_type === undefined
        ? current.discount_type
        : normalizeDiscountType(body.discount_type);

      const discountValue = body.discount_value === undefined
        ? current.discount_value
        : Math.max(0, num(body.discount_value));

      if(discountType === 'PERCENT' && discountValue > 100){
        return res.status(400).json({
          error: 'INVALID_PERCENT'
        });
      }

      const benefitMonths = body.benefit_months === undefined
        ? current.benefit_months
        : (
            body.benefit_months === null ||
            body.benefit_months === ''
              ? null
              : Math.max(1, integer(body.benefit_months, 1))
          );

      const maxRedemptions = body.max_redemptions === undefined
        ? current.max_redemptions
        : (
            body.max_redemptions === null ||
            body.max_redemptions === ''
              ? null
              : Math.max(1, integer(body.max_redemptions, 1))
          );

      try{
        db.prepare(`
          UPDATE saas_promotions
          SET plan_id = ?,
              name = ?,
              code = ?,
              description = ?,
              discount_type = ?,
              discount_value = ?,
              benefit_months = ?,
              starts_at = ?,
              ends_at = ?,
              max_redemptions = ?,
              new_customers_only = ?,
              priority = ?,
              active = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          planId,
          name,
          code,
          body.description === undefined
            ? current.description
            : txt(body.description) || null,
          discountType,
          discountValue,
          benefitMonths,
          body.starts_at === undefined
            ? current.starts_at
            : txt(body.starts_at) || null,
          body.ends_at === undefined
            ? current.ends_at
            : txt(body.ends_at) || null,
          maxRedemptions,
          body.new_customers_only === undefined
            ? current.new_customers_only
            : boolInt(body.new_customers_only),
          body.priority === undefined
            ? current.priority
            : integer(body.priority),
          body.active === undefined
            ? current.active
            : boolInt(body.active),
          id
        );

        const updated = db.prepare(`
          SELECT *
          FROM saas_promotions
          WHERE id = ?
        `).get(id);

        res.json({
          ok: true,
          promotion: updated
        });
      }catch(error){
        if(
          String(error.message || '')
            .toUpperCase()
            .includes('UNIQUE')
        ){
          return res.status(409).json({
            error: 'PROMOTION_CODE_ALREADY_EXISTS'
          });
        }

        throw error;
      }
    }
  );

  console.log('NEXUS SAAS COMMERCIAL CORE V1 ONLINE');
}
