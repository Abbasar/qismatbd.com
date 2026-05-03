const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const { computeCartSubtotalsForCoupon } = require('../utils/couponScope');

const router = express.Router();

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

function parseRestrictPayload(body) {
  let restrict_product_ids = body.restrict_product_ids;
  let restrict_categories = body.restrict_categories;
  if (restrict_product_ids == null || restrict_product_ids === '') restrict_product_ids = null;
  if (restrict_categories == null || restrict_categories === '') restrict_categories = null;
  if (typeof restrict_product_ids === 'string') {
    try {
      restrict_product_ids = JSON.parse(restrict_product_ids);
    } catch {
      restrict_product_ids = restrict_product_ids.split(/[\s,]+/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
    }
  }
  if (typeof restrict_categories === 'string') {
    restrict_categories = restrict_categories.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(restrict_product_ids)) {
    restrict_product_ids = restrict_product_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  } else {
    restrict_product_ids = null;
  }
  if (Array.isArray(restrict_categories)) {
    restrict_categories = restrict_categories.map((s) => String(s).trim()).filter(Boolean);
  } else {
    restrict_categories = null;
  }
  const pidJson = restrict_product_ids?.length ? JSON.stringify(restrict_product_ids) : null;
  const catJson = restrict_categories?.length ? JSON.stringify(restrict_categories) : null;
  return { pidJson, catJson };
}

/** Public: validate coupon (optional cart items for scoped coupons). */
router.post('/validate', async (req, res) => {
  let conn;
  try {
    const { code, subtotal, items } = req.body;
    const sub = Number(subtotal);
    if (!code || Number.isNaN(sub) || sub < 0) {
      return res.status(400).json({ valid: false, message: 'Invalid request' });
    }

    conn = await db.getConnection();
    const [rows] = await conn.query(
      `SELECT * FROM coupons 
       WHERE UPPER(code) = ? AND is_active = 1 
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)`,
      [normalizeCode(code)]
    );

    if (!rows.length) {
      conn.release();
      return res.json({ valid: false, message: 'Invalid, expired, or not applicable coupon' });
    }

    const c = rows[0];
    let pIds = c.restrict_product_ids;
    let cats = c.restrict_categories;
    if (typeof pIds === 'string') {
      try {
        pIds = JSON.parse(pIds);
      } catch {
        pIds = null;
      }
    }
    if (typeof cats === 'string') {
      try {
        cats = JSON.parse(cats);
      } catch {
        cats = null;
      }
    }
    const hasRestrictions =
      (Array.isArray(pIds) && pIds.length > 0) || (Array.isArray(cats) && cats.length > 0);

    const cartItems = Array.isArray(items) && items.length ? items : null;
    if (hasRestrictions && !cartItems) {
      conn.release();
      return res.json({
        valid: false,
        message: 'This coupon applies to specific products or categories — add items to your cart first.',
      });
    }

    let eligible = sub;
    let full = sub;
    if (cartItems) {
      const calc = await computeCartSubtotalsForCoupon(conn, cartItems, c);
      eligible = calc.eligible;
      full = calc.full;
    }

    if (eligible < Number(c.min_subtotal || 0)) {
      conn.release();
      return res.json({
        valid: false,
        message: `Minimum order amount for this coupon is ৳${Number(c.min_subtotal).toFixed(2)} (applies to eligible items)`,
      });
    }

    let discount = 0;
    if (c.discount_type === 'percent') {
      discount = (eligible * Number(c.discount_value)) / 100;
    } else {
      discount = Number(c.discount_value);
    }
    discount = Math.min(Math.max(discount, 0), eligible);
    discount = Number(discount.toFixed(2));

    conn.release();
    conn = null;

    res.json({
      valid: true,
      code: c.code,
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      discount_amount: discount,
      eligible_subtotal: eligible,
      cart_subtotal: full,
    });
  } catch (error) {
    if (conn) {
      try {
        conn.release();
      } catch {
        /* ignore */
      }
    }
    console.error('Coupon validate error', error);
    return res.status(500).json({ valid: false, message: 'Unable to validate coupon' });
  }
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, code, discount_type, discount_value, min_subtotal, max_uses, used_count, expires_at, is_active,
              restrict_product_ids, restrict_categories, created_at
       FROM coupons ORDER BY id DESC`
    );
    res.json(rows);
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await db.query(
        'SELECT id, code, discount_type, discount_value, min_subtotal, max_uses, used_count, expires_at, is_active, created_at FROM coupons ORDER BY id DESC'
      );
      return res.json(rows.map((r) => ({ ...r, restrict_product_ids: null, restrict_categories: null })));
    }
    return sendServerError(res, 'Unable to load coupons', error);
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      code,
      discount_type,
      discount_value,
      min_subtotal,
      max_uses,
      expires_at,
      is_active,
    } = req.body;
    if (!code || !discount_type || discount_value == null) {
      return res.status(400).json({ message: 'Code, discount type and value are required' });
    }
    const { pidJson, catJson } = parseRestrictPayload(req.body);
    const [result] = await db.query(
      `INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, max_uses, expires_at, is_active, restrict_product_ids, restrict_categories)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizeCode(code),
        discount_type,
        discount_value,
        min_subtotal ?? 0,
        max_uses || null,
        expires_at || null,
        is_active === false || is_active === 0 ? 0 : 1,
        pidJson,
        catJson,
      ]
    );
    res.json({ id: result.insertId, message: 'Coupon created' });
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(400).json({
        message: 'Run database migration (structure.sql) for coupon product/category restrictions.',
      });
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }
    return sendServerError(res, 'Unable to create coupon', error);
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      code,
      discount_type,
      discount_value,
      min_subtotal,
      max_uses,
      expires_at,
      is_active,
    } = req.body;
    const { pidJson, catJson } = parseRestrictPayload(req.body);
    await db.query(
      `UPDATE coupons SET code = ?, discount_type = ?, discount_value = ?, min_subtotal = ?, max_uses = ?, expires_at = ?, is_active = ?,
       restrict_product_ids = ?, restrict_categories = ?
       WHERE id = ?`,
      [
        normalizeCode(code),
        discount_type,
        discount_value,
        min_subtotal ?? 0,
        max_uses || null,
        expires_at || null,
        is_active === false || is_active === 0 ? 0 : 1,
        pidJson,
        catJson,
        req.params.id,
      ]
    );
    res.json({ message: 'Coupon updated' });
  } catch (error) {
    return sendServerError(res, 'Unable to update coupon', error);
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    res.json({ message: 'Coupon deleted' });
  } catch (error) {
    return sendServerError(res, 'Unable to delete coupon', error);
  }
});

module.exports = router;
