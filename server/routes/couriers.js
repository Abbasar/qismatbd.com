const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const router = express.Router();

/** Public: active couriers + per-zone shipping (checkout). */
router.get('/delivery-options', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, shipping_inside_dhaka, shipping_outside_dhaka, base_rate 
       FROM couriers WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json(rows);
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      try {
        const [rows] = await db.query('SELECT id, name, base_rate FROM couriers WHERE is_active = 1 ORDER BY name ASC');
        return res.json(
          rows.map((r) => ({
            ...r,
            shipping_inside_dhaka: null,
            shipping_outside_dhaka: null,
          }))
        );
      } catch (e) {
        return sendServerError(res, 'Unable to load delivery options', e);
      }
    }
    return sendServerError(res, 'Unable to load delivery options', error);
  }
});

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM couriers ORDER BY name');
    res.json(rows);
  } catch (error) {
    return sendServerError(res, 'Unable to load couriers', error);
  }
});

router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM couriers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Courier not found' });
    res.json(rows[0]);
  } catch (error) {
    return sendServerError(res, 'Unable to load courier', error);
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, base_rate, shipping_inside_dhaka, shipping_outside_dhaka } = req.body;
    try {
      const [result] = await db.query(
        `INSERT INTO couriers (name, phone, email, base_rate, shipping_inside_dhaka, shipping_outside_dhaka) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          name,
          phone,
          email,
          base_rate ?? 0,
          shipping_inside_dhaka === '' || shipping_inside_dhaka == null ? null : Number(shipping_inside_dhaka),
          shipping_outside_dhaka === '' || shipping_outside_dhaka == null ? null : Number(shipping_outside_dhaka),
        ]
      );
      return res.json({
        id: result.insertId,
        name,
        phone,
        email,
        base_rate,
        shipping_inside_dhaka,
        shipping_outside_dhaka,
      });
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        const [result] = await db.query(
          'INSERT INTO couriers (name, phone, email, base_rate) VALUES (?, ?, ?, ?)',
          [name, phone, email, base_rate ?? 0]
        );
        return res.json({ id: result.insertId, name, phone, email, base_rate });
      }
      throw e;
    }
  } catch (error) {
    return sendServerError(res, 'Unable to create courier', error);
  }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, base_rate, shipping_inside_dhaka, shipping_outside_dhaka } = req.body;
    try {
      await db.query(
        `UPDATE couriers SET name = ?, phone = ?, email = ?, base_rate = ?, shipping_inside_dhaka = ?, shipping_outside_dhaka = ? WHERE id = ?`,
        [
          name,
          phone,
          email,
          base_rate,
          shipping_inside_dhaka === '' || shipping_inside_dhaka == null ? null : Number(shipping_inside_dhaka),
          shipping_outside_dhaka === '' || shipping_outside_dhaka == null ? null : Number(shipping_outside_dhaka),
          req.params.id,
        ]
      );
      return res.json({ message: 'Courier updated' });
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        await db.query('UPDATE couriers SET name = ?, phone = ?, email = ?, base_rate = ? WHERE id = ?', [
          name,
          phone,
          email,
          base_rate,
          req.params.id,
        ]);
        return res.json({ message: 'Courier updated' });
      }
      throw e;
    }
  } catch (error) {
    return sendServerError(res, 'Unable to update courier', error);
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM couriers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Courier deleted' });
  } catch (error) {
    return sendServerError(res, 'Unable to delete courier', error);
  }
});

module.exports = router;
