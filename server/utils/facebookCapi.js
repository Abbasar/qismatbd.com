/**
 * Meta Conversions API — Purchase, PageView, dedup via event_id + browser Pixel.
 * Docs: customer info, event_source_url, client_ip_address (never hash), fbp/fbc.
 */
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const { getClientIp } = require('./clientIp');

const GRAPH_VERSION = 'v21.0';

const sha256Hex = (s) =>
  crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');

/** Bangladesh phone → digits with 880 country code (Meta CAPI ph format). */
function normalizePhoneForMeta(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return `880${d.slice(1)}`;
  if (d.length === 10 && d.startsWith('1')) return `880${d}`;
  if (d.length === 11 && d.startsWith('01')) return `880${d.slice(1)}`;
  return d;
}

function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { fn: '', ln: '' };
  if (parts.length === 1) return { fn: parts[0], ln: '' };
  return { fn: parts[0], ln: parts.slice(1).join(' ') };
}

function locationFromDeliveryArea(area) {
  const a = String(area || '').trim().toLowerCase();
  if (a.includes('inside')) return { ct: 'dhaka', st: 'dhaka' };
  if (a.includes('outside')) return { ct: '', st: '' };
  return { ct: '', st: '' };
}

function parseOrderItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildPurchaseCustomData({ value, currency = 'BDT', orderId, items }) {
  const list = parseOrderItems(items);
  const contentIds = list
    .map((i) => (i?.id != null ? String(i.id) : ''))
    .filter(Boolean);
  const numItems = list.reduce((sum, i) => sum + Math.max(1, Math.floor(Number(i?.quantity) || 1)), 0);
  const custom = {
    currency,
    value: Number(value) || 0,
    content_type: 'product',
    num_items: numItems || undefined,
    order_id: orderId != null ? String(orderId) : undefined,
  };
  if (contentIds.length) custom.content_ids = contentIds;
  return custom;
}

/**
 * Meta customer information parameters (hashed PII + raw browser fields).
 */
function buildUserData({
  email,
  phone,
  firstName,
  lastName,
  deliveryArea,
  externalId,
  fbc,
  fbp,
  clientIp,
  userAgent,
  country = 'bd',
}) {
  const user_data = {};

  if (email && String(email).includes('@')) {
    user_data.em = [sha256Hex(email)];
  }

  const phDigits = normalizePhoneForMeta(phone);
  if (phDigits.length >= 11) {
    user_data.ph = [sha256Hex(phDigits)];
  }

  const fn = firstName != null ? String(firstName).trim() : '';
  const ln = lastName != null ? String(lastName).trim() : '';
  if (fn) user_data.fn = [sha256Hex(fn)];
  if (ln) user_data.ln = [sha256Hex(ln)];

  const loc = locationFromDeliveryArea(deliveryArea);
  if (loc.ct) user_data.ct = [sha256Hex(loc.ct)];
  if (loc.st) user_data.st = [sha256Hex(loc.st)];
  if (country) user_data.country = [sha256Hex(country)];

  if (externalId && String(externalId).trim()) {
    user_data.external_id = [sha256Hex(String(externalId).trim())];
  }

  if (fbc && String(fbc).trim()) user_data.fbc = String(fbc).trim();
  if (fbp && String(fbp).trim()) user_data.fbp = String(fbp).trim();

  const ip = clientIp && String(clientIp).trim();
  if (ip) user_data.client_ip_address = ip.split(',')[0].trim();

  if (userAgent && String(userAgent).trim()) {
    user_data.client_user_agent = String(userAgent).trim().slice(0, 512);
  }

  return user_data;
}

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

async function postFacebookEvents(payload) {
  const s = await getFacebookSettings();
  const pixelId = s.facebook_pixel_id && String(s.facebook_pixel_id).trim();
  const token = s.facebook_capi_access_token && String(s.facebook_capi_access_token).trim();
  if (!pixelId || !token) return { skipped: true, reason: 'missing_config' };

  const testCode = s.facebook_test_event_code && String(s.facebook_test_event_code).trim();
  if (testCode) payload.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`;
  const { data } = await axios.post(url, payload, {
    params: { access_token: token },
    timeout: 12000,
  });
  return { ok: true, data };
}

/**
 * Generic website event (PageView, etc.) — dedup with browser via matching event_id.
 */
async function sendFacebookWebEvent({
  eventName,
  eventId,
  eventSourceUrl,
  email,
  phone,
  firstName,
  lastName,
  deliveryArea,
  externalId,
  fbc,
  fbp,
  clientIp,
  userAgent,
  customData,
}) {
  try {
    if (!eventName || !eventId) return { skipped: true, reason: 'missing_event' };

    const user_data = buildUserData({
      email,
      phone,
      firstName,
      lastName,
      deliveryArea,
      externalId,
      fbc,
      fbp,
      clientIp,
      userAgent,
    });

    const event = {
      event_name: String(eventName),
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: String(eventId),
      user_data,
    };

    if (eventSourceUrl && String(eventSourceUrl).trim()) {
      event.event_source_url = String(eventSourceUrl).trim().slice(0, 2048);
    }
    if (customData && typeof customData === 'object' && Object.keys(customData).length) {
      event.custom_data = customData;
    }

    return await postFacebookEvents({ data: [event] });
  } catch (e) {
    console.error(`Facebook CAPI ${eventName} error:`, e.response?.data || e.message);
    return { ok: false, error: e.response?.data || e.message };
  }
}

/**
 * Purchase — event_id matches browser Pixel eventID for deduplication.
 */
async function sendFacebookPurchaseEvent({
  orderId,
  value,
  currency = 'BDT',
  email,
  phone,
  firstName,
  lastName,
  deliveryArea,
  externalId,
  fbc,
  fbp,
  clientIp,
  userAgent,
  eventSourceUrl,
  items,
}) {
  try {
    const eventId = `purchase-order-${orderId}`;
    const user_data = buildUserData({
      email,
      phone,
      firstName,
      lastName,
      deliveryArea,
      externalId,
      fbc,
      fbp,
      clientIp,
      userAgent,
    });

    const event = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: eventId,
      user_data,
      custom_data: buildPurchaseCustomData({ value, currency, orderId, items }),
    };

    if (eventSourceUrl && String(eventSourceUrl).trim()) {
      event.event_source_url = String(eventSourceUrl).trim().slice(0, 2048);
    }

    return await postFacebookEvents({ data: [event] });
  } catch (e) {
    console.error('Facebook CAPI Purchase error:', e.response?.data || e.message);
    return { ok: false, error: e.response?.data || e.message };
  }
}

/** Snapshot attribution at checkout (real browser request, before payment redirect). */
function captureAttributionFromRequest(req, body = {}) {
  const { fn, ln } = splitName(body.customerName);
  const userId = body.userId != null ? Number(body.userId) : null;
  return {
    meta_fbp: body.facebook_fbp && String(body.facebook_fbp).trim(),
    meta_fbc: body.facebook_fbc && String(body.facebook_fbc).trim(),
    meta_client_ip: getClientIp(req),
    meta_user_agent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 512) : '',
    meta_event_source_url:
      body.facebook_event_source_url && String(body.facebook_event_source_url).trim().slice(0, 2048),
    meta_delivery_area: body.deliveryArea ? String(body.deliveryArea).trim().slice(0, 80) : '',
    meta_external_id: Number.isFinite(userId) && userId > 0 ? `user-${userId}` : '',
    firstName: fn,
    lastName: ln,
  };
}

function purchasePayloadFromOrder(order) {
  const { fn, ln } = splitName(order.customer_name);
  return {
    orderId: order.id,
    value: order.total_price,
    email: order.customer_email,
    phone: order.customer_phone,
    firstName: fn,
    lastName: ln,
    deliveryArea: order.meta_delivery_area,
    externalId: order.meta_external_id || (order.user_id ? `user-${order.user_id}` : ''),
    fbc: order.meta_fbc,
    fbp: order.meta_fbp,
    clientIp: order.meta_client_ip,
    userAgent: order.meta_user_agent,
    eventSourceUrl: order.meta_event_source_url,
    items: order.items,
  };
}

async function markOrderCapiPurchaseSent(orderId) {
  await db.query('UPDATE orders SET meta_capi_purchase_sent = 1 WHERE id = ?', [orderId]);
}

async function sendOrderPurchaseCapi(order, { skipIfSent = true } = {}) {
  if (!order?.id) return { skipped: true, reason: 'no_order' };
  if (skipIfSent && Number(order.meta_capi_purchase_sent) === 1) {
    return { skipped: true, reason: 'already_sent' };
  }

  const result = await sendFacebookPurchaseEvent(purchasePayloadFromOrder(order));
  if (result.ok) {
    await markOrderCapiPurchaseSent(order.id);
  }
  return result;
}

module.exports = {
  sha256Hex,
  normalizePhoneForMeta,
  splitName,
  buildUserData,
  buildPurchaseCustomData,
  sendFacebookWebEvent,
  sendFacebookPurchaseEvent,
  captureAttributionFromRequest,
  purchasePayloadFromOrder,
  sendOrderPurchaseCapi,
  markOrderCapiPurchaseSent,
  getClientIp,
};
