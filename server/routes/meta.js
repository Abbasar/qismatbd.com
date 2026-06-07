/**
 * Meta CAPI bridge — browser sends PageView with event_id; server adds real client_ip.
 */
const express = require('express');
const { sendFacebookWebEvent } = require('../utils/facebookCapi');
const { getClientIp } = require('../utils/clientIp');
const { sendServerError } = require('../utils/httpError');

const router = express.Router();

const ALLOWED_EVENTS = new Set(['PageView']);

router.post('/event', async (req, res) => {
  try {
    const { event_name, event_id, event_source_url, fbp, fbc } = req.body || {};
    const name = event_name && String(event_name).trim();
    const id = event_id && String(event_id).trim();

    if (!name || !ALLOWED_EVENTS.has(name)) {
      return res.status(400).json({ message: 'Unsupported event_name' });
    }
    if (!id || id.length > 128) {
      return res.status(400).json({ message: 'event_id required' });
    }

    sendFacebookWebEvent({
      eventName: name,
      eventId: id,
      eventSourceUrl: event_source_url,
      fbp,
      fbc,
      clientIp: getClientIp(req),
      userAgent: req.headers['user-agent'],
    }).catch(() => {});

    res.json({ ok: true });
  } catch (error) {
    return sendServerError(res, 'Meta event failed', error);
  }
});

module.exports = router;
