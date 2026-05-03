const express = require('express');
const db = require('../db');

const router = express.Router();

const emailOk = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

router.post('/subscribe', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!emailOk(email)) {
      return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    }

    await db.query(
      'INSERT INTO newsletter_subscribers (email) VALUES (?) ON DUPLICATE KEY UPDATE email = email',
      [email]
    );
    res.json({ ok: true, message: 'You are subscribed.' });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({ ok: false, message: 'Newsletter is not configured. Run database migration.' });
    }
    res.status(500).json({ ok: false, message: 'Unable to subscribe', error: error.message });
  }
});

module.exports = router;
