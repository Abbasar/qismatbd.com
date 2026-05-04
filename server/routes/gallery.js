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

function runMulter(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err.name === 'MulterError') {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large (max 100MB for video, 20MB for image)'
            : err.message || 'Upload error';
        return res.status(400).json({ message: msg });
      }
      return res.status(400).json({ message: err.message || 'Upload rejected' });
    });
  };
}

function toYouTubeEmbed(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (s.includes('youtube.com/embed/')) return s.split('&')[0];
  const short = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return `https://www.youtube.com/embed/${short[1]}`;
  const watch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watch) return `https://www.youtube.com/embed/${watch[1]}`;
  return '';
}

function toVimeoEmbed(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (s.includes('player.vimeo.com/video/')) return s.split('?')[0];
  const m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return '';
}

function normalizeVideoRemoteUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const yt = toYouTubeEmbed(s);
  if (yt) return yt;
  const vm = toVimeoEmbed(s);
  if (vm) return vm;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const kind = String(req.body?.kind || 'image').toLowerCase() === 'video' ? 'vid' : 'img';
    cb(null, `gallery-${kind}-${unique}${ext}`);
  },
});

const uploadGallery = multer({
  storage: galleryStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const kind = String(req.body?.kind || 'image').toLowerCase() === 'video' ? 'video' : 'image';
    if (kind === 'image') {
      if (file.mimetype.startsWith('image/')) return cb(null, true);
      return cb(new Error('Gallery images must be image files (JPG, PNG, WebP, etc.)'));
    }
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    return cb(new Error('Gallery video uploads must be video files (MP4, WebM, etc.)'));
  },
});

function uploadsPathFromSrc(src) {
  const s = String(src || '');
  if (!s.startsWith('/uploads/')) return null;
  const rel = s.replace(/^\/uploads\//, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return null;
  return path.join(uploadsRoot, rel);
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, kind, src, caption, sort_order, created_at FROM gallery_items ORDER BY sort_order DESC, id DESC'
    );
    res.json(rows);
  } catch (error) {
    return sendServerError(res, 'Cannot load gallery', error);
  }
});

router.post(
  '/',
  requireAuth,
  requireAdmin,
  runMulter(uploadGallery.single('file')),
  async (req, res) => {
    try {
      const kind = String(req.body?.kind || 'image').toLowerCase() === 'video' ? 'video' : 'image';
      const caption = String(req.body?.caption || '')
        .trim()
        .slice(0, 255);
      const embedRaw = String(req.body?.embed_url || '').trim();

      let src = '';

      if (kind === 'image') {
        if (!req.file) {
          return res.status(400).json({ message: 'Choose an image file to upload' });
        }
        src = `/uploads/${req.file.filename}`;
      } else {
        if (req.file) {
          src = `/uploads/${req.file.filename}`;
        } else {
          const normalized = normalizeVideoRemoteUrl(embedRaw);
          if (!normalized) {
            return res.status(400).json({
              message: 'Upload a video file, or paste a YouTube / Vimeo / direct video URL',
            });
          }
          src = normalized;
        }
      }

      const sortOrder = Date.now();
      const [ins] = await db.query(
        'INSERT INTO gallery_items (kind, src, caption, sort_order) VALUES (?, ?, ?, ?)',
        [kind, src, caption, sortOrder]
      );
      const [[row]] = await db.query('SELECT * FROM gallery_items WHERE id = ?', [ins.insertId]);
      res.status(201).json(row);
    } catch (error) {
      return sendServerError(res, 'Cannot add gallery item', error);
    }
  }
);

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  try {
    const [[row]] = await db.query('SELECT id, src FROM gallery_items WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ message: 'Not found' });

    await db.query('DELETE FROM gallery_items WHERE id = ?', [id]);

    const diskPath = uploadsPathFromSrc(row.src);
    if (diskPath) {
      try {
        fs.unlinkSync(diskPath);
      } catch {
        /* file missing — ignore */
      }
    }

    res.json({ ok: true, id });
  } catch (error) {
    return sendServerError(res, 'Cannot delete gallery item', error);
  }
});

module.exports = router;
