const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '..', 'uploads');
try {
  fs.mkdirSync(uploadsRoot, { recursive: true });
} catch {
  /* ignore */
}

/** Multer passes parse/file errors here so the client gets JSON instead of HTML 500. */
function runMulter(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err.name === 'MulterError') {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 6MB)'
            : err.message || 'Upload error';
        return res.status(400).json({ message: msg });
      }
      return res.status(400).json({ message: err.message || 'Upload rejected' });
    });
  };
}

const ADVERTISE_SETTING_KEYS = new Set(['advertise_unboxing_hero_image', 'advertise_newsletter_bg_image']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `hero-${unique}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `logo-${unique}${safeExt}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

const advertiseStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `advertise-${unique}${safeExt}`);
  },
});

const uploadAdvertise = multer({
  storage: advertiseStorage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

/** Single hero/homepage slide image — admin only. */
router.post('/hero', requireAuth, requireAdmin, runMulter(upload.single('image')), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file' });
    }
    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
  } catch (error) {
    return sendServerError(res, 'Upload failed', error);
  }
});

/** Header/footer/login branding — admin only. */
router.post('/logo', requireAuth, requireAdmin, runMulter(uploadLogo.single('image')), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file' });
    }
    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
  } catch (error) {
    return sendServerError(res, 'Upload failed', error);
  }
});

/**
 * Homepage “Advertise” images — saves file and writes settings in one step.
 * Query: ?key=advertise_unboxing_hero_image | advertise_newsletter_bg_image
 */
router.post(
  '/advertise',
  requireAuth,
  requireAdmin,
  runMulter(uploadAdvertise.single('image')),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file' });
      }
      const key = String(req.query.key || '').trim();
      if (!ADVERTISE_SETTING_KEYS.has(key)) {
        return res.status(400).json({
          message: 'Missing or invalid key. Use ?key=advertise_unboxing_hero_image or advertise_newsletter_bg_image',
        });
      }
      const url = `/uploads/${req.file.filename}`;
      await db.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [key, url]
      );
      return res.json({ url, key, message: 'Saved' });
    } catch (error) {
      return sendServerError(res, 'Unable to save advertise image', error);
    }
  }
);

module.exports = router;
