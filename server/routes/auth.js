const express = require('express');
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { sendWelcomeEmail, sendPasswordResetEmail, sendEmailVerificationCode } = require('../utils/email');
const { createAdminNotification } = require('../utils/notifications');
const { JWT_SECRET } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const router = express.Router();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isStrongPassword = (password) => {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  return /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
};

const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const sanitizeUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
});

const createVerificationCode = () => String(crypto.randomInt(100000, 1000000));
const hashVerificationCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const verifyGoogleToken = async (credential) => {
  const token = String(credential || '').trim();
  if (!token) {
    return { ok: false, message: 'Google credential is required' };
  }

  let payload;
  try {
    const response = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
      params: { id_token: token },
      timeout: 10000,
    });
    payload = response.data;
  } catch (error) {
    const googleMessage =
      error?.response?.data?.error_description ||
      error?.response?.data?.error ||
      'Google token validation failed';
    return { ok: false, message: googleMessage };
  }
  if (!payload?.email) {
    return { ok: false, message: 'Google account email not available' };
  }
  if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
    return { ok: false, message: 'Google token audience mismatch' };
  }
  if (payload.email_verified !== 'true') {
    return { ok: false, message: 'Google email is not verified' };
  }
  return {
    ok: true,
    email: String(payload.email).toLowerCase(),
    name: String(payload.name || payload.given_name || 'Google User'),
  };
};

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!EMAIL_RE.test(String(email || '').trim())) {
      return res.status(400).json({ message: 'Please enter a valid email' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    const [rows] = await db.query(
      'SELECT id, name, email, role, password FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
      [String(email).trim().toLowerCase()]
    );
    if (!rows.length) {
      const [inactive] = await db.query(
        'SELECT id FROM users WHERE email = ? AND is_active = 0 LIMIT 1',
        [String(email).trim().toLowerCase()]
      );
      if (inactive.length) {
        return res.status(403).json({ message: 'Please verify your email first' });
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const userRow = rows[0];
    let valid = false;
    if (String(userRow.password || '').startsWith('$2')) {
      valid = await bcrypt.compare(password, userRow.password);
    } else if (userRow.password === password) {
      // Backward-compatible upgrade from legacy plain-text rows.
      valid = true;
      const newHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, userRow.id]);
    }
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const user = sanitizeUser(userRow);
    const token = signToken(user);
    res.json({ user, token });
  } catch (error) {
    return sendServerError(res, 'Unable to login', error);
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanName.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' });
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: 'Password must be 8+ chars with upper, lower, and number',
      });
    }
    const [existing] = await db.query('SELECT id, is_active FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
    const hashed = await bcrypt.hash(password, 10);
    let userId;
    if (existing.length) {
      if (existing[0].is_active) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      userId = existing[0].id;
      await db.query(
        'UPDATE users SET name = ?, password = ?, role = "customer" WHERE id = ?',
        [cleanName, hashed, userId]
      );
    } else {
      const [result] = await db.query(
        'INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 0)',
        [cleanName, cleanEmail, hashed, 'customer']
      );
      userId = result.insertId;
    }

    const code = createVerificationCode();
    await db.query('DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL', [userId]);
    await db.query(
      `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)`,
      [userId, hashVerificationCode(code)]
    );
    await sendEmailVerificationCode({ email: cleanEmail, name: cleanName, code });
    res.json({
      message: 'Verification code sent to your email',
      requiresVerification: true,
      email: cleanEmail,
    });
  } catch (error) {
    return sendServerError(res, 'Unable to register', error);
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ message: 'Please enter a valid email' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter a valid 6-digit code' });

    const [users] = await db.query('SELECT id, name, email, role, is_active FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
    if (!users.length) return res.status(404).json({ message: 'Account not found' });
    const user = users[0];
    if (user.is_active) {
      const token = signToken(sanitizeUser(user));
      return res.json({ user: sanitizeUser(user), token, message: 'Email already verified' });
    }

    const [codes] = await db.query(
      `SELECT id, code_hash, attempts
       FROM email_verifications
       WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [user.id]
    );
    if (!codes.length) return res.status(400).json({ message: 'Verification code expired. Please resend code.' });

    const row = codes[0];
    const incomingHash = hashVerificationCode(code);
    if (incomingHash !== row.code_hash) {
      await db.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    await db.query('UPDATE users SET is_active = 1 WHERE id = ?', [user.id]);
    await db.query('UPDATE email_verifications SET used_at = NOW() WHERE id = ?', [row.id]);
    await createAdminNotification({
      type: 'user',
      title: 'New customer registered',
      message: `${user.name} (${user.email}) verified email and activated account`,
      entityType: 'user',
      entityId: user.id,
    });
    await sendWelcomeEmail(user.email, user.name);
    const cleanUser = sanitizeUser({ ...user, is_active: 1 });
    const token = signToken(cleanUser);
    res.json({ user: cleanUser, token, message: 'Email verified successfully' });
  } catch (error) {
    return sendServerError(res, 'Unable to verify email', error);
  }
});

router.post('/resend-verification-code', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ message: 'Please enter a valid email' });
    const [users] = await db.query('SELECT id, name, email, is_active FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
    if (!users.length) return res.status(404).json({ message: 'Account not found' });
    const user = users[0];
    if (user.is_active) return res.status(400).json({ message: 'Account is already verified' });

    const code = createVerificationCode();
    await db.query('DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL', [user.id]);
    await db.query(
      `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)`,
      [user.id, hashVerificationCode(code)]
    );
    await sendEmailVerificationCode({ email: user.email, name: user.name, code });
    res.json({ message: 'Verification code resent' });
  } catch (error) {
    return sendServerError(res, 'Unable to resend code', error);
  }
});

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    const verified = await verifyGoogleToken(credential);
    if (!verified.ok) {
      return res.status(400).json({ message: verified.message || 'Google login failed' });
    }

    const [existing] = await db.query(
      'SELECT id, name, email, role, is_active FROM users WHERE email = ? LIMIT 1',
      [verified.email]
    );

    let userRow;
    if (existing.length) {
      userRow = existing[0];
      if (!userRow.is_active) {
        return res.status(403).json({ message: 'Account is inactive' });
      }
      if (!userRow.name || userRow.name === 'Google User') {
        await db.query('UPDATE users SET name = ? WHERE id = ?', [verified.name, userRow.id]);
        userRow.name = verified.name;
      }
    } else {
      const generatedPassword = crypto.randomBytes(32).toString('hex');
      const hashed = await bcrypt.hash(generatedPassword, 10);
      const [result] = await db.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [verified.name, verified.email, hashed, 'customer']
      );
      userRow = { id: result.insertId, name: verified.name, email: verified.email, role: 'customer', is_active: 1 };
      await createAdminNotification({
        type: 'user',
        title: 'New customer registered',
        message: `${verified.name} (${verified.email}) joined with Google`,
        entityType: 'user',
        entityId: userRow.id,
      });
      await sendWelcomeEmail(verified.email, verified.name);
    }

    const user = sanitizeUser(userRow);
    const token = signToken(user);
    res.json({ user, token });
  } catch (error) {
    return sendServerError(res, 'Unable to login with Google', error);
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.query('SELECT id, name, email, role FROM users WHERE id = ? AND is_active = 1', [decoded.id]);
    if (!rows.length) return res.status(401).json({ message: 'Session expired' });
    res.json({ user: rows[0] });
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email' });
    }
    const [users] = await db.query('SELECT id, name, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1', [cleanEmail]);
    if (!users.length) {
      return res.json({ message: 'If this email exists, reset instructions were sent.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.query('DELETE FROM password_resets WHERE user_id = ?', [users[0].id]);
    await db.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 20 MINUTE))',
      [users[0].id, tokenHash]
    );
    await sendPasswordResetEmail({
      email: users[0].email,
      name: users[0].name,
      token: rawToken,
    });
    res.json({ message: 'If this email exists, reset instructions were sent.' });
  } catch (error) {
    return sendServerError(res, 'Unable to process request', error);
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) return res.status(400).json({ message: 'Invalid reset link' });
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: 'Password must be 8+ chars with upper, lower, and number',
      });
    }
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const [rows] = await db.query(
      `SELECT pr.id, pr.user_id
       FROM password_resets pr
       WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) {
      return res.status(400).json({ message: 'Reset link expired or invalid' });
    }
    const reset = rows[0];
    const hashed = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, reset.user_id]);
    await db.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [reset.id]);
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    return sendServerError(res, 'Unable to reset password', error);
  }
});

module.exports = router;
