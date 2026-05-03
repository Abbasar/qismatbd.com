const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');

const sha256Hex = (s) =>
  crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');

const normalizePhoneDigits = (phone) => String(phone || '').replace(/\D/g, '').slice(-11);

async function getFacebookSettings() {
  const [rows] = await db.query(
    `SELECT setting_key, setting_value FROM settings WHERE setting_key IN (
      "facebook_pixel_id",
      "facebook_capi_access_token",
      "facebook_test_event_code"
    )`
  );
  const m = {};
  rows.forEach((r) => {
    m[r.setting_key] = r.setting_value;
  });
  return m;
}

/**
 * Server-side Meta Conversions API Purchase (dedup with client Pixel via event_id).
 */
async function sendFacebookPurchaseEvent({
  orderId,
  value,
  currency = 'BDT',
  email,
  phone,
  fbc,
  fbp,
  clientIp,
  userAgent,
}) {
  try {
    const s = await getFacebookSettings();
    const pixelId = s.facebook_pixel_id && String(s.facebook_pixel_id).trim();
    const token = s.facebook_capi_access_token && String(s.facebook_capi_access_token).trim();
    if (!pixelId || !token) return { skipped: true, reason: 'missing_config' };

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = `purchase-order-${orderId}`;

    const user_data = {};
    if (email && String(email).includes('@')) {
      user_data.em = [sha256Hex(email)];
    }
    const phDigits = normalizePhoneDigits(phone);
    if (phDigits.length >= 10) {
      user_data.ph = [sha256Hex(phDigits)];
    }
    if (fbc && String(fbc).trim()) user_data.fbc = String(fbc).trim();
    if (fbp && String(fbp).trim()) user_data.fbp = String(fbp).trim();
    if (clientIp && String(clientIp).trim()) user_data.client_ip_address = String(clientIp).trim().split(',')[0].trim();
    if (userAgent && String(userAgent).trim()) user_data.client_user_agent = String(userAgent).slice(0, 512);

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: eventTime,
          action_source: 'website',
          event_id: eventId,
          user_data,
          custom_data: {
            currency,
            value: Number(value) || 0,
          },
        },
      ],
    };

    const testCode = s.facebook_test_event_code && String(s.facebook_test_event_code).trim();
    if (testCode) payload.test_event_code = testCode;

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events`;
    const { data } = await axios.post(url, payload, {
      params: { access_token: token },
      timeout: 12000,
    });
    return { ok: true, data };
  } catch (e) {
    console.error('Facebook CAPI Purchase error:', e.response?.data || e.message);
    return { ok: false, error: e.response?.data || e.message };
  }
}

module.exports = { sendFacebookPurchaseEvent, sha256Hex };
