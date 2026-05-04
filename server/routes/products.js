const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { createAdminNotification } = require('../utils/notifications');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'gallery', maxCount: 20 },
]);

/** Canonical ordered URLs/filenames: main first, extras without duplicates. */
const mergedImageList = (image, galleryArr) => {
  const keys = [];
  const seen = new Set();
  const main = typeof image === 'string' ? image.trim() : '';
  if (main) {
    keys.push(main);
    seen.add(main);
  }
  for (const g of galleryArr || []) {
    const s = typeof g === 'string' ? g.trim() : String(g || '').trim();
    if (s && !seen.has(s)) {
      keys.push(s);
      seen.add(s);
    }
  }
  return keys;
};

const parseArrayField = (val) => {
  if (val == null || val === '') return null;
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'object') return null;
  const s = String(val).trim();
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // comma-separated
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
};

const formatPreorderDate = (val) => {
  if (val == null || val === '') return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  return s.length >= 10 ? s.slice(0, 10) : s || null;
};

const normalizeProduct = (row) => {
  if (!row) return row;
  const o = { ...row };
  if (Object.prototype.hasOwnProperty.call(o, 'preorder_available_date')) {
    o.preorder_available_date = formatPreorderDate(o.preorder_available_date);
  }
  ['gallery', 'sizes', 'colors'].forEach((k) => {
    let v = o[k];
    if (v == null) {
      o[k] = [];
      return;
    }
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        o[k] = [];
        return;
      }
    }
    o[k] = Array.isArray(v) ? v : [];
  });
  o.images = mergedImageList(o.image, o.gallery);
  if (Object.prototype.hasOwnProperty.call(o, 'pricing_options')) {
    let v = o.pricing_options;
    if (v == null || v === '') {
      o.pricing_options = [];
    } else if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        o.pricing_options = Array.isArray(parsed) ? parsed : [];
      } catch {
        o.pricing_options = [];
      }
    } else {
      o.pricing_options = Array.isArray(v) ? v : [];
    }
  }
  const bidRaw = o.brand_id;
  const bid = bidRaw != null && bidRaw !== '' ? Number(bidRaw) : null;
  const hasJoinBrand =
    Object.prototype.hasOwnProperty.call(o, 'brand_name') ||
    Object.prototype.hasOwnProperty.call(o, 'brand_logo');
  if (Number.isFinite(bid) && bid > 0) {
    o.brand = {
      id: bid,
      name: hasJoinBrand ? String(o.brand_name ?? '').trim() : '',
      logo_url: hasJoinBrand ? String(o.brand_logo ?? '').trim() : '',
    };
    o.brand_id = bid;
  } else {
    o.brand = null;
    o.brand_id = null;
  }
  delete o.brand_name;
  delete o.brand_logo;
  return o;
};

const PRODUCT_FROM =
  'SELECT p.*, b.name AS brand_name, b.logo_url AS brand_logo FROM products p LEFT JOIN brands b ON b.id = p.brand_id';

async function queryProductsJoined(sqlWithJoin, params, fallbackSql, fallbackParams = params) {
  try {
    const [rows] = await db.query(sqlWithJoin, params);
    return rows;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' || e.code === '42S02') {
      const [rows] = await db.query(fallbackSql, fallbackParams);
      return rows;
    }
    throw e;
  }
}

const CATALOG_EXTRA_CATEGORIES_KEY = 'catalog_extra_categories';
const CATALOG_CATEGORY_IMAGES_KEY = 'catalog_category_images';
/** Stored DB value when admin selects "In stock" (enough for order quantity checks). */
const IN_STOCK_SENTINEL = 9999;

async function getCategoryImagesMapFromDb() {
  const [setRows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', [
    CATALOG_CATEGORY_IMAGES_KEY,
  ]);
  const raw = setRows[0]?.setting_value;
  if (!raw || typeof raw !== 'string') return {};
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object' && !Array.isArray(p)) return { ...p };
  } catch {
    /* ignore */
  }
  return {};
}

function normalizeCategoryImagesForResponse(mergedCategoryNames, rawMap) {
  const src = rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap) ? rawMap : {};
  const out = {};
  for (const name of mergedCategoryNames) {
    const key = Object.keys(src).find((k) => k.toLowerCase() === name.toLowerCase());
    if (key && String(src[key]).trim()) out[name] = String(src[key]).trim();
  }
  return out;
}

async function saveCategoryImagesMap(map) {
  await db.query(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [CATALOG_CATEGORY_IMAGES_KEY, JSON.stringify(map && typeof map === 'object' ? map : {})]
  );
}

async function getMergedCategoryNames() {
  const [rows] = await db.query(
    `SELECT DISTINCT TRIM(category) AS category FROM products
     WHERE category IS NOT NULL AND TRIM(category) <> ""
     ORDER BY category ASC`
  );
  const fromProducts = rows.map((r) => r.category).filter(Boolean);
  const [setRows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', [
    CATALOG_EXTRA_CATEGORIES_KEY,
  ]);
  let extra = [];
  if (setRows[0]?.setting_value) {
    try {
      const parsed = JSON.parse(setRows[0].setting_value);
      if (Array.isArray(parsed)) extra = parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      extra = [];
    }
  }
  /** Only General is seeded; all other names come from products + admin “extra” list. */
  const defaultSeeds = ['General'];
  const merged = [...new Set([...defaultSeeds, ...fromProducts, ...extra])]
    .map((s) => String(s).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return merged;
}

router.get('/meta/categories', async (req, res) => {
  try {
    const merged = await getMergedCategoryNames();
    const raw = await getCategoryImagesMapFromDb();
    const images = normalizeCategoryImagesForResponse(merged, raw);
    res.json({ categories: merged, images });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load categories', error: error.message });
  }
});

router.post('/meta/categories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    if (name.length > 120) return res.status(400).json({ message: 'Category name is too long' });

    const mergedBefore = await getMergedCategoryNames();
    if (mergedBefore.some((c) => c.toLowerCase() === name.toLowerCase())) {
      const rawImg = await getCategoryImagesMapFromDb();
      return res.json({
        ok: true,
        categories: mergedBefore,
        images: normalizeCategoryImagesForResponse(mergedBefore, rawImg),
        message: 'Category already exists',
      });
    }

    const [setRows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', [
      CATALOG_EXTRA_CATEGORIES_KEY,
    ]);
    let list = [];
    if (setRows[0]?.setting_value) {
      try {
        const parsed = JSON.parse(setRows[0].setting_value);
        if (Array.isArray(parsed)) list = parsed.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        list = [];
      }
    }
    list.push(name);
    await db.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [CATALOG_EXTRA_CATEGORIES_KEY, JSON.stringify(list)]
    );

    const merged = await getMergedCategoryNames();
    const rawImg = await getCategoryImagesMapFromDb();
    res.json({
      ok: true,
      categories: merged,
      images: normalizeCategoryImagesForResponse(merged, rawImg),
    });
  } catch (error) {
    return sendServerError(res, 'Unable to save category', error);
  }
});

router.delete('/meta/categories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    if (name.toLowerCase() === 'general') {
      return res.status(400).json({ message: 'Cannot delete the General category' });
    }

    const [setRows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', [
      CATALOG_EXTRA_CATEGORIES_KEY,
    ]);
    let list = [];
    if (setRows[0]?.setting_value) {
      try {
        const parsed = JSON.parse(setRows[0].setting_value);
        if (Array.isArray(parsed)) list = parsed.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        list = [];
      }
    }
    const lower = name.toLowerCase();
    list = list.filter((c) => String(c).trim().toLowerCase() !== lower);

    await db.query(
      'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [CATALOG_EXTRA_CATEGORIES_KEY, JSON.stringify(list)]
    );

    const imgRaw = await getCategoryImagesMapFromDb();
    const imgNext = {};
    for (const [k, v] of Object.entries(imgRaw)) {
      if (k.toLowerCase() !== lower) imgNext[k] = v;
    }
    await saveCategoryImagesMap(imgNext);

    const [updResult] = await db.query(
      'UPDATE products SET category = ? WHERE LOWER(TRIM(category)) = LOWER(TRIM(?))',
      ['General', name]
    );
    const reassigned = updResult && typeof updResult.affectedRows === 'number' ? updResult.affectedRows : 0;

    const merged = await getMergedCategoryNames();
    res.json({
      ok: true,
      categories: merged,
      images: normalizeCategoryImagesForResponse(merged, imgNext),
      reassigned,
    });
  } catch (error) {
    return sendServerError(res, 'Unable to delete category', error);
  }
});

router.post(
  '/meta/categories/image',
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large (max 5MB)' });
      }
      return res.status(400).json({ message: err.message || 'Upload rejected' });
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No image file' });
      const rawName = String(req.body.name || '').trim();
      if (!rawName) return res.status(400).json({ message: 'Category name is required' });
      const merged = await getMergedCategoryNames();
      const match = merged.find((c) => c.toLowerCase() === rawName.toLowerCase());
      if (!match) return res.status(400).json({ message: 'Unknown category' });
      const raw = await getCategoryImagesMapFromDb();
      const next = {};
      for (const [k, v] of Object.entries(raw)) {
        if (k.toLowerCase() !== match.toLowerCase()) next[k] = v;
      }
      next[match] = `/uploads/${req.file.filename}`;
      await saveCategoryImagesMap(next);
      const merged2 = await getMergedCategoryNames();
      res.json({
        ok: true,
        categories: merged2,
        images: normalizeCategoryImagesForResponse(merged2, next),
      });
    } catch (error) {
      return sendServerError(res, 'Unable to save category image', error);
    }
  }
);

router.delete('/meta/categories/image', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const raw = await getCategoryImagesMapFromDb();
    const next = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase() !== name.toLowerCase()) next[k] = v;
    }
    await saveCategoryImagesMap(next);
    const merged = await getMergedCategoryNames();
    res.json({
      ok: true,
      categories: merged,
      images: normalizeCategoryImagesForResponse(merged, next),
    });
  } catch (error) {
    return sendServerError(res, 'Unable to remove category image', error);
  }
});

router.get('/', async (req, res) => {
  try {
    const rows = await queryProductsJoined(
      `${PRODUCT_FROM} ORDER BY p.id DESC`,
      [],
      'SELECT * FROM products ORDER BY id DESC',
      []
    );
    res.json(rows.map(normalizeProduct));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load products', error: error.message });
  }
});

router.get('/highlights', async (req, res) => {
  try {
    const newArrivals = await queryProductsJoined(
      `${PRODUCT_FROM} ORDER BY p.created_at DESC, p.id DESC LIMIT 10`,
      [],
      'SELECT * FROM products ORDER BY created_at DESC, id DESC LIMIT 10',
      []
    );
    const popular = await queryProductsJoined(
      `SELECT p.*, b.name AS brand_name, b.logo_url AS brand_logo, COUNT(r.id) AS review_count
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN reviews r ON r.product_id = p.id
       GROUP BY p.id, b.name, b.logo_url
       ORDER BY review_count DESC, p.created_at DESC
       LIMIT 10`,
      [],
      `SELECT p.*, COUNT(r.id) AS review_count
       FROM products p
       LEFT JOIN reviews r ON r.product_id = p.id
       GROUP BY p.id
       ORDER BY review_count DESC, p.created_at DESC
       LIMIT 10`,
      []
    );
    res.json({
      newArrivals: newArrivals.map(normalizeProduct),
      popular: popular.map(normalizeProduct),
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load product highlights', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const rows = await queryProductsJoined(
      `${PRODUCT_FROM} WHERE p.id = ?`,
      [req.params.id],
      'SELECT * FROM products WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Product not found' });
    res.json(normalizeProduct(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Unable to load product', error: error.message });
  }
});

const parsePreorderBody = (body) => {
  const raw = body.preorder_available_date;
  if (raw === '' || raw === undefined || raw === null) return null;
  const s = String(raw).trim().slice(0, 10);
  return s || null;
};

const parseBrandId = (body) => {
  const raw = body.brand_id;
  if (raw === '' || raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parsePricingOptionsBody = (body) => {
  const raw = body.pricing_options_json;
  if (raw === '' || raw == null) return null;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(j)) return null;
    const cleaned = j
      .map((row) => ({
        label: String(row.label || '').trim(),
        price: row.price != null && row.price !== '' ? Number(row.price) : NaN,
      }))
      .filter((r) => r.label && Number.isFinite(r.price));
    return cleaned.length ? JSON.stringify(cleaned) : null;
  } catch {
    return null;
  }
};

router.post('/', requireAuth, requireAdmin, uploadFields, async (req, res) => {
  try {
    const { name, price, regular_price, description, stock, category } = req.body;
    const brandId = parseBrandId(req.body);
    const preorderDate = parsePreorderBody(req.body);
    const pricingOptionsJson = parsePricingOptionsBody(req.body);
    const reg =
      regular_price === '' || regular_price === undefined || regular_price === null
        ? null
        : Number(regular_price);
    const mainFile = req.files?.image?.[0];
    const image = mainFile?.filename || req.body.image || '';

    const sizes = parseArrayField(req.body.sizes);
    const colors = parseArrayField(req.body.colors);

    let gallery = parseArrayField(req.body.gallery_json) || [];
    if (req.files?.gallery?.length) {
      gallery = [...gallery, ...req.files.gallery.map((f) => f.filename)];
    }
    gallery = [...new Set(gallery)];

    const sizesJson = sizes && sizes.length ? JSON.stringify(sizes) : null;
    const colorsJson = colors && colors.length ? JSON.stringify(colors) : null;
    const galleryJson = gallery.length ? JSON.stringify(gallery) : null;

    let result;
    try {
      ;[result] = await db.query(
        `INSERT INTO products (name, price, regular_price, image, gallery, sizes, colors, pricing_options, description, stock, preorder_available_date, category, brand_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          price,
          reg,
          image,
          galleryJson,
          sizesJson,
          colorsJson,
          pricingOptionsJson,
          description,
          stock,
          preorderDate,
          category || 'General',
          brandId,
        ]
      );
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        try {
          ;[result] = await db.query(
            `INSERT INTO products (name, price, regular_price, image, gallery, sizes, colors, pricing_options, description, stock, preorder_available_date, category) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              name,
              price,
              reg,
              image,
              galleryJson,
              sizesJson,
              colorsJson,
              pricingOptionsJson,
              description,
              stock,
              preorderDate,
              category || 'General',
            ]
          );
        } catch (e2) {
          if (e2.code === 'ER_BAD_FIELD_ERROR') {
            ;[result] = await db.query(
              `INSERT INTO products (name, price, regular_price, image, gallery, sizes, colors, description, stock, preorder_available_date, category) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [name, price, reg, image, galleryJson, sizesJson, colorsJson, description, stock, preorderDate, category || 'General']
            );
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }

    await createAdminNotification({
      type: 'product',
      title: 'New product added',
      message: `${name} has been added to catalog`,
      entityType: 'product',
      entityId: result.insertId,
    });

    let pricingOptionsOut = [];
    if (pricingOptionsJson) {
      try {
        const p = JSON.parse(pricingOptionsJson);
        pricingOptionsOut = Array.isArray(p) ? p : [];
      } catch {
        pricingOptionsOut = [];
      }
    }
    const galleryOut = gallery || [];
    res.json({
      id: result.insertId,
      name,
      price,
      regular_price: reg,
      image,
      gallery: galleryOut,
      images: mergedImageList(image, galleryOut),
      sizes: sizes || [],
      colors: colors || [],
      pricing_options: pricingOptionsOut,
      description,
      stock,
      category: category || 'General',
      brand_id: brandId,
    });
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return sendServerError(
        res,
        'Database missing gallery/sizes/colors columns. Update database using server/structure.sql',
        error
      );
    }
    return sendServerError(res, 'Unable to create product', error);
  }
});

router.put('/:id', requireAuth, requireAdmin, uploadFields, async (req, res) => {
  try {
    const { name, price, regular_price, description, stock, category } = req.body;
    const brandId = parseBrandId(req.body);
    const preorderDate = parsePreorderBody(req.body);
    const pricingOptionsJson = parsePricingOptionsBody(req.body);
    const reg =
      regular_price === '' || regular_price === undefined || regular_price === null
        ? null
        : Number(regular_price);
    const [existingRows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existingRows.length) return res.status(404).json({ message: 'Product not found' });

    const existing = normalizeProduct(existingRows[0]);

    const mainFile = req.files?.image?.[0];
    const image = mainFile?.filename || req.body.image || existing.image || '';

    let gallery = [...(existing.gallery || [])];
    if (Object.prototype.hasOwnProperty.call(req.body, 'gallery_json')) {
      const parsed = parseArrayField(req.body.gallery_json);
      if (Array.isArray(parsed)) gallery = [...parsed];
    }
    if (req.files?.gallery?.length) {
      gallery = [...gallery, ...req.files.gallery.map((f) => f.filename)];
    }
    gallery = [...new Set(gallery)];

    let sizes = existing.sizes || [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'sizes')) {
      sizes = parseArrayField(req.body.sizes) || [];
    }

    let colors = existing.colors || [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'colors')) {
      colors = parseArrayField(req.body.colors) || [];
    }

    const sizesJson = sizes.length ? JSON.stringify(sizes) : null;
    const colorsJson = colors.length ? JSON.stringify(colors) : null;
    const galleryJson = gallery.length ? JSON.stringify(gallery) : null;

    try {
      await db.query(
        `UPDATE products SET name = ?, price = ?, regular_price = ?, image = ?, gallery = ?, sizes = ?, colors = ?, pricing_options = ?, description = ?, stock = ?, preorder_available_date = ?, category = ?, brand_id = ? WHERE id = ?`,
        [
          name,
          price,
          reg,
          image,
          galleryJson,
          sizesJson,
          colorsJson,
          pricingOptionsJson,
          description,
          stock,
          preorderDate,
          category || 'General',
          brandId,
          req.params.id,
        ]
      );
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        try {
          await db.query(
            `UPDATE products SET name = ?, price = ?, regular_price = ?, image = ?, gallery = ?, sizes = ?, colors = ?, pricing_options = ?, description = ?, stock = ?, preorder_available_date = ?, category = ? WHERE id = ?`,
            [
              name,
              price,
              reg,
              image,
              galleryJson,
              sizesJson,
              colorsJson,
              pricingOptionsJson,
              description,
              stock,
              preorderDate,
              category || 'General',
              req.params.id,
            ]
          );
        } catch (e2) {
          if (e2.code === 'ER_BAD_FIELD_ERROR') {
            await db.query(
              `UPDATE products SET name = ?, price = ?, image = ?, gallery = ?, sizes = ?, colors = ?, description = ?, stock = ?, preorder_available_date = ?, category = ? WHERE id = ?`,
              [name, price, image, galleryJson, sizesJson, colorsJson, description, stock, preorderDate, category || 'General', req.params.id]
            );
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }
    res.json({ message: 'Product updated' });
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return sendServerError(
        res,
        'Database missing gallery/sizes/colors columns. Update database using server/structure.sql',
        error
      );
    }
    return sendServerError(res, 'Unable to update product', error);
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    return sendServerError(res, 'Unable to delete product', error);
  }
});

module.exports = router;
