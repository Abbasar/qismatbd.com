const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const path = require('path');
const productRoutes = require('./routes/products');
const brandRoutes = require('./routes/brands');
const userRoutes = require('./routes/users');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');
const reviewRoutes = require('./routes/reviews');
const courierRoutes = require('./routes/couriers');
const paymentRoutes = require('./routes/payment');
const settingsRoutes = require('./routes/settings');
const wishlistRoutes = require('./routes/wishlist');
const couponRoutes = require('./routes/coupons');
const newsletterRoutes = require('./routes/newsletter');
const notificationRoutes = require('./routes/notifications');
const locationsRoutes = require('./routes/locations');
const uploadRoutes = require('./routes/upload');
const galleryRoutes = require('./routes/gallery');
const webhookRoutes = require('./routes/webhooks');
const db = require('./db');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { sendServerError, isProd } = require('./utils/httpError');

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  const sec = process.env.JWT_SECRET;
  if (!sec || sec === 'dev-only-change-me') {
    console.error('FATAL: Set a strong JWT_SECRET in production.');
    process.exit(1);
  }
}

const app = express();

/** Local dev / XAMPP — port 80 and :5173 are different browser origins. */
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost',
  'http://127.0.0.1',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN;
  const fromEnv =
    raw && String(raw).trim()
      ? String(raw)
          .split(',')
          .map((s) => s.trim().replace(/\/$/, ''))
          .filter(Boolean)
      : [];
  if (isProd) {
    return fromEnv.length ? fromEnv : DEFAULT_CORS_ORIGINS;
  }
  // Non-production: union so `.env` with only :5173 still allows XAMPP on http://localhost
  return [...new Set([...DEFAULT_CORS_ORIGINS, ...fromEnv])];
}

const corsAllowed = new Set(parseCorsOrigins());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser or same-origin proxy — no Origin header
      if (!origin) return callback(null, true);
      if (corsAllowed.has(origin)) return callback(null, true);
      // Dev: any localhost / loopback port (LAN IP must still be listed in CORS_ORIGIN)
      if (process.env.NODE_ENV !== 'production') {
        try {
          const { hostname } = new URL(origin);
          if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return callback(null, true);
          }
        } catch {
          /* ignore */
        }
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/webhooks', webhookRoutes);
/** After specific `/api/...` mounts so paths like `/api/upload/*` are not delegated here first. */
app.use('/api', notificationRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check DB failed', error);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      ...(!isProd && error?.message && { message: error.message }),
    });
  }
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [products] = await db.query('SELECT COUNT(*) AS totalProducts FROM products');
    const [users] = await db.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [orders] = await db.query('SELECT COUNT(*) AS totalOrders FROM orders');

    res.json({
      totalProducts: products[0].totalProducts,
      totalUsers: users[0].totalUsers,
      totalOrders: orders[0].totalOrders,
    });
  } catch (error) {
    return sendServerError(res, 'Cannot load overview', error);
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
