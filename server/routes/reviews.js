const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const router = express.Router();

router.get('/product/:productId', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, u.name as user_name FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ? ORDER BY r.created_at DESC`,
      [req.params.productId]
    );
    res.json(rows);
  } catch (error) {
    return sendServerError(res, 'Unable to load reviews', error);
  }
});

/** Public: recent approved reviews for storefront carousel (defined before GET /:id). */
router.get('/storefront', async (req, res) => {
  try {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 16));
    const sql = `
      SELECT r.id, r.rating, r.title, r.comment, r.created_at,
             u.name AS user_name,
             p.id AS product_id, p.name AS product_name, p.image AS product_image
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      JOIN products p ON p.id = r.product_id
      WHERE COALESCE(r.is_approved, 1) = 1
      ORDER BY r.created_at DESC
      LIMIT ?`;
    const [rows] = await db.query(sql, [limit]);
    res.json(rows);
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 16));
        const [rows] = await db.query(
          `SELECT r.id, r.rating, r.title, r.comment, r.created_at,
                  u.name AS user_name,
                  p.id AS product_id, p.name AS product_name, p.image AS product_image
           FROM reviews r
           JOIN users u ON u.id = r.user_id
           JOIN products p ON p.id = r.product_id
           ORDER BY r.created_at DESC
           LIMIT ?`,
          [limit]
        );
        return res.json(rows);
      } catch (e2) {
        return sendServerError(res, 'Unable to load storefront reviews', e2);
      }
    }
    return sendServerError(res, 'Unable to load storefront reviews', error);
  }
});

router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, u.name AS user_name, u.email AS user_email, p.name AS product_name
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       JOIN products p ON p.id = r.product_id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    return sendServerError(res, 'Unable to load reviews', error);
  }
});

router.post('/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const product_id = Number(req.body.product_id);
    const user_id = Number(req.body.user_id);
    const rating = Number(req.body.rating);
    const title = req.body.title != null ? String(req.body.title).trim() : '';
    const comment = String(req.body.comment || '').trim();

    if (!product_id || !user_id) {
      return res.status(400).json({ message: 'Product and customer are required' });
    }
    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const [pRows] = await db.query('SELECT id FROM products WHERE id = ?', [product_id]);
    if (!pRows.length) return res.status(400).json({ message: 'Product not found' });
    const [uRows] = await db.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!uRows.length) return res.status(400).json({ message: 'User not found' });

    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE product_id = ? AND user_id = ? LIMIT 1',
      [product_id, user_id]
    );
    if (existing.length) {
      return res.status(400).json({ message: 'That customer already has a review on this product' });
    }

    const [result] = await db.query(
      'INSERT INTO reviews (product_id, user_id, rating, title, comment) VALUES (?, ?, ?, ?, ?)',
      [product_id, user_id, rating, title || null, comment]
    );
    res.json({ id: result.insertId, product_id, user_id, rating, title: title || null, comment });
  } catch (error) {
    return sendServerError(res, 'Unable to create review', error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, u.name as user_name FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Review not found' });
    res.json(rows[0]);
  } catch (error) {
    return sendServerError(res, 'Unable to load review', error);
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const user_id = Number(req.authUser?.id);
    if (!Number.isFinite(user_id) || user_id <= 0) {
      return res.status(401).json({ message: 'Invalid session — please log in again' });
    }

    const product_id = Number(req.body.product_id);
    const rating = Number(req.body.rating);
    const titleRaw = req.body.title != null ? String(req.body.title).trim() : '';
    const comment = String(req.body.comment ?? '').trim();

    if (!Number.isFinite(product_id) || product_id <= 0) {
      return res.status(400).json({ message: 'Valid product is required' });
    }
    if (!comment) {
      return res.status(400).json({ message: 'Comment is required' });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const [pRows] = await db.query('SELECT id FROM products WHERE id = ? LIMIT 1', [product_id]);
    if (!pRows.length) {
      return res.status(400).json({ message: 'Product not found' });
    }

    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE product_id = ? AND user_id = ? LIMIT 1',
      [product_id, user_id]
    );
    if (existing.length) {
      return res.status(400).json({ message: 'You already reviewed this product' });
    }

    const title = titleRaw ? titleRaw.slice(0, 255) : null;

    const [result] = await db.query(
      'INSERT INTO reviews (product_id, user_id, rating, title, comment) VALUES (?, ?, ?, ?, ?)',
      [product_id, user_id, Math.round(rating), title, comment]
    );

    res.json({ id: result.insertId, product_id, user_id, rating: Math.round(rating), title, comment });
  } catch (error) {
    return sendServerError(res, 'Unable to create review', error);
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const [owners] = await db.query('SELECT user_id FROM reviews WHERE id = ?', [req.params.id]);
    if (!owners.length) return res.status(404).json({ message: 'Review not found' });
    if (req.authUser.role !== 'admin' && Number(owners[0].user_id) !== Number(req.authUser.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { rating, title, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    await db.query(
      'UPDATE reviews SET rating = ?, title = ?, comment = ? WHERE id = ?',
      [rating, title, comment, req.params.id]
    );
    res.json({ message: 'Review updated' });
  } catch (error) {
    return sendServerError(res, 'Unable to update review', error);
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [owners] = await db.query('SELECT user_id FROM reviews WHERE id = ?', [req.params.id]);
    if (!owners.length) return res.status(404).json({ message: 'Review not found' });
    if (req.authUser.role !== 'admin' && Number(owners[0].user_id) !== Number(req.authUser.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await db.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    res.json({ message: 'Review deleted' });
  } catch (error) {
    return sendServerError(res, 'Unable to delete review', error);
  }
});

module.exports = router;
