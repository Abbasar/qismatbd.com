const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `brand-${unique}${safeExt}`);
  },
});

const uploadLogo = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

function runMulterSingle(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large (max 5MB)' });
      }
      return res.status(400).json({ message: err.message || 'Upload rejected' });
    });
  };
}

/** Public list for storefront filters and home. */
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, logo_url FROM brands ORDER BY name ASC'
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        logo_url: String(r.logo_url || '').trim(),
      }))
    );
  } catch (error) {
    if (error.code === '42S02') return res.json([]);
    return sendServerError(res, 'Unable to load brands', error);
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Brand name is required' });
    if (name.length > 120) return res.status(400).json({ message: 'Brand name is too long' });
    const [result] = await db.query('INSERT INTO brands (name, logo_url) VALUES (?, ?)', [name, '']);
    const [[row]] = await db.query('SELECT id, name, logo_url FROM brands WHERE id = ?', [result.insertId]);
    res.json({
      id: row.id,
      name: row.name,
      logo_url: String(row.logo_url || '').trim(),
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'A brand with this name already exists' });
    }
    if (error.code === '42S02') {
      return res.status(503).json({ message: 'Run database migration (structure.sql) to enable brands.' });
    }
    return sendServerError(res, 'Unable to create brand', error);
  }
});

router.post(
  '/:id/logo',
  requireAuth,
  requireAdmin,
  runMulterSingle(uploadLogo.single('logo')),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: 'Invalid brand id' });
      if (!req.file) return res.status(400).json({ message: 'No logo file' });
      const url = `/uploads/${req.file.filename}`;
      const [upd] = await db.query('UPDATE brands SET logo_url = ? WHERE id = ?', [url, id]);
      if (!upd.affectedRows) return res.status(404).json({ message: 'Brand not found' });
      const [[row]] = await db.query('SELECT id, name, logo_url FROM brands WHERE id = ?', [id]);
      res.json({
        id: row.id,
        name: row.name,
        logo_url: String(row.logo_url || '').trim(),
      });
    } catch (error) {
      return sendServerError(res, 'Unable to upload brand logo', error);
    }
  }
);

router.delete('/:id/logo', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: 'Invalid brand id' });
    const [upd] = await db.query('UPDATE brands SET logo_url = ? WHERE id = ?', ['', id]);
    if (!upd.affectedRows) return res.status(404).json({ message: 'Brand not found' });
    const [[row]] = await db.query('SELECT id, name, logo_url FROM brands WHERE id = ?', [id]);
    res.json({
      id: row.id,
      name: row.name,
      logo_url: '',
    });
  } catch (error) {
    return sendServerError(res, 'Unable to clear brand logo', error);
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ message: 'Invalid brand id' });
    try {
      await db.query('UPDATE products SET brand_id = NULL WHERE brand_id = ?', [id]);
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
    await db.query('DELETE FROM brands WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    return sendServerError(res, 'Unable to delete brand', error);
  }
});

module.exports = router;
