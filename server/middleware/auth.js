/**
 * JWT অথেন্টিকেশন — লগইনের পর ক্লায়েন্ট Bearer টোকেন পাঠায়।
 * tryVerifyToken  — ঐচ্ছিক (সেটিংস GET-এ admin চেনার জন্য)
 * requireAuth     — লগইন বাধ্যতামূলক
 * requireAdmin    — role === 'admin' লাগে
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';

function tryVerifyToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.authUser = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.authUser?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
}

module.exports = { JWT_SECRET, tryVerifyToken, requireAuth, requireAdmin };
