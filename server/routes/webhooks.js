const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const { mapSteadfastStatusToOrderStatus } = require('../utils/steadfast');

const router = express.Router();

const LOG_DIR = path.join(__dirname, '..', 'logs');
/** Production tracking log — path: server/logs/steadfast_webhook.log */
const STEADFAST_WEBHOOK_LOG = path.join(LOG_DIR, 'steadfast_webhook.log');

async function settingsMap() {
  const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
  const s = {};
  rows.forEach((r) => {
    s[r.setting_key] = r.setting_value;
  });
  return s;
}

/**
 * Log incoming Steadfast webhook for debugging (console + append-only file).
 * Does not write the raw Bearer token; only whether Authorization was present.
 */
function logSteadfastIncoming(req, body) {
  const entry = {
    ts: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl || req.path,
    ip: req.ip,
    authorizationPresent: Boolean(
      String(req.headers.authorization || req.headers.Authorization || '').trim()
    ),
    contentType: req.headers['content-type'] || null,
    body: body && typeof body === 'object' ? body : { _raw: body },
  };
  const line = JSON.stringify(entry) + '\n';
  console.log('[Steadfast webhook]', entry);

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(STEADFAST_WEBHOOK_LOG, line, 'utf8');
  } catch (e) {
    console.error('Steadfast webhook: could not write log file', STEADFAST_WEBHOOK_LOG, e.message);
  }
}

/**
 * SteadFast merchant panel: Callback URL + Bearer Auth Token (same token stored as steadfast_webhook_bearer_token).
 * POST /api/webhooks/steadfast
 *
 * Body: prefer `invoice_id` (or `invoice`) and `status` to match & update the order.
 * Also supports: consignment_id, tracking_code (see below).
 */
router.post('/steadfast', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  logSteadfastIncoming(req, body);

  try {
    const settings = await settingsMap();
    const expected = String(settings.steadfast_webhook_bearer_token ?? '').trim();
    if (!expected) {
      return res.status(503).json({
        message: 'Steadfast webhook bearer token not set — configure steadfast_webhook_bearer_token in admin settings',
      });
    }

    const auth = String(req.headers.authorization || req.headers.Authorization || '').trim();
    if (auth !== `Bearer ${expected}`) {
      console.warn('[Steadfast webhook] Unauthorized — bearer token mismatch or missing');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoice =
      body.invoice_id != null
        ? String(body.invoice_id).trim()
        : body.invoice != null
          ? String(body.invoice).trim()
          : '';

    const consignment_id = body.consignment_id != null ? String(body.consignment_id).trim() : '';
    const tracking_code = body.tracking_code != null ? String(body.tracking_code).trim() : '';

    const steadfastRawStatus =
      body.status ?? body.delivery_status ?? body.consignment?.status ?? body.data?.consignment?.status;
    const steadfastStatus =
      steadfastRawStatus != null && steadfastRawStatus !== '' ? String(steadfastRawStatus) : '';

    let rows = [];

    if (invoice) {
      ;[rows] = await db.query('SELECT id, status FROM orders WHERE steadfast_invoice = ? LIMIT 2', [invoice]);
    }

    if (!rows.length && consignment_id) {
      ;[rows] = await db.query(
        `SELECT id, status FROM orders
         WHERE steadfast_consignment_id = ?
            OR CAST(tracking_number AS CHAR) = ?
         LIMIT 2`,
        [consignment_id, consignment_id]
      );
    }

    if (!rows.length && tracking_code) {
      ;[rows] = await db.query('SELECT id, status FROM orders WHERE CAST(tracking_number AS CHAR) = ? LIMIT 2', [
        tracking_code,
      ]);
    }

    if (!rows.length) {
      return res.status(404).json({
        message: 'No matching order (expected invoice_id / invoice, consignment_id, or tracking_code in payload)',
      });
    }

    if (rows.length > 1) {
      return res.status(409).json({ message: 'Ambiguous webhook — multiple orders matched' });
    }

    const orderId = rows[0].id;
    const mapped = steadfastStatus ? mapSteadfastStatusToOrderStatus(steadfastStatus) : null;

    try {
      if (mapped && mapped !== rows[0].status) {
        await db.query('UPDATE orders SET status = ?, courier_dispatch_error = NULL WHERE id = ?', [mapped, orderId]);
      } else if (steadfastStatus) {
        await db.query('UPDATE orders SET courier_dispatch_error = NULL WHERE id = ?', [orderId]);
      }
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        if (mapped && mapped !== rows[0].status) {
          await db.query('UPDATE orders SET status = ? WHERE id = ?', [mapped, orderId]);
        }
      } else {
        throw e;
      }
    }

    const responsePayload = {
      status: 'success',
      orderId,
      mappedStatus: mapped,
      steadfastStatus: steadfastStatus || undefined,
    };
    console.log('[Steadfast webhook] OK', responsePayload);

    res.json(responsePayload);
  } catch (error) {
    console.error('Steadfast webhook error', error);
    res.status(500).json({ error: error.message || 'Webhook handler failed' });
  }
});

module.exports = router;
