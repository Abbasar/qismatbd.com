const axios = require('axios');
const db = require('../db');

/** Merchant REST API (DNS resolves). Older docs used portal.steadfast.com.bd — that host is NXDOMAIN in public DNS. */
const DEFAULT_BASE = 'https://portal.packzy.com/api/v1';

/**
 * Normalize saved base URL: empty → default; legacy dead host → Packzy portal.
 * @returns {string} base without trailing slash
 */
function resolveSteadfastBaseUrl(steadfastApiBaseUrlSetting) {
    const trimmed = steadfastApiBaseUrlSetting != null ? String(steadfastApiBaseUrlSetting).trim() : '';
    let base = (trimmed || DEFAULT_BASE).replace(/\/$/, '');
    if (/portal\.steadfast\.com\.bd/i.test(base)) {
        base = DEFAULT_BASE.replace(/\/$/, '');
    }
    return base;
}

/**
 * Steadfast portal API: Api-Key + Secret-Key headers on create/status/balance endpoints.
 * Inbound webhooks (Bearer token): POST {BACKEND_URL}/api/webhooks/steadfast — register URL + Auth Token in the Steadfast merchant panel.
 */

const getSettings = async () => {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach((row) => {
        settings[row.setting_key] = row.setting_value;
    });
    return settings;
};

const steadfastHeaders = (apiKey, secretKey) => ({
    'Api-Key': String(apiKey ?? '').trim(),
    'Secret-Key': String(secretKey ?? '').trim(),
    'Content-Type': 'application/json',
});

/** BD mobile: 11 digits, no leading +88 in body (API requirement). */
function normalizeBdPhone(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length >= 11) return d.slice(-11);
    if (d.length >= 10) return d.slice(-10);
    return d;
}

function parseOrderItems(order) {
    let items = order.items;
    if (items == null) return [];
    if (typeof items === 'string') {
        try {
            items = JSON.parse(items);
        } catch {
            return [];
        }
    }
    return Array.isArray(items) ? items : [];
}

function buildItemDescription(order, settings) {
    const tpl = settings.steadfast_item_description_template;
    if (tpl && String(tpl).trim()) {
        const items = parseOrderItems(order);
        const summary = items
            .map((i) => `${i.name || 'Item'} x${i.quantity || 1}`)
            .join(', ')
            .slice(0, 400);
        return String(tpl)
            .replace(/\{items\}/g, summary)
            .replace(/\{order_id\}/g, String(order.id || ''))
            .slice(0, 500);
    }
    const items = parseOrderItems(order);
    const summary = items
        .map((i) => `${i.name || 'Item'} x${i.quantity || 1}`)
        .join(', ')
        .slice(0, 500);
    return summary || 'Order items';
}

function deliveryTypeFromOrder(order, settings) {
    if (settings.steadfast_send_delivery_type === 'false') return undefined;
    const m = String(order.delivery_method || '').toLowerCase().trim();
    if (m === 'point') return 1;
    return 0;
}

function totalLotFromOrder(order, settings) {
    const def = Number(settings.steadfast_total_lot_default);
    if (Number.isFinite(def) && def > 0) return Math.floor(def);
    const items = parseOrderItems(order);
    const sum = items.reduce((a, i) => a + Math.max(1, Math.floor(Number(i.quantity) || 1)), 0);
    return Math.max(1, sum);
}

/**
 * Steadfast success payloads vary; normalize consignment + success flag.
 */
function extractConsignment(result) {
    if (!result || typeof result !== 'object') return null;
    return (
        result.consignment ||
        result.data?.consignment ||
        result.order?.consignment ||
        result.result?.consignment ||
        null
    );
}

function isSteadfastCreateSuccess(result, cons) {
    if (cons && (cons.tracking_code != null || cons.consignment_id != null)) {
        if (result.success === false) return false;
        const err = result.errors || result.error;
        if (err) {
            const es = typeof err === 'string' ? err : JSON.stringify(err);
            if (String(es).toLowerCase().includes('fail')) return false;
        }
        return true;
    }
    const st = result.status;
    if (Number(st) === 200 || st === 200 || st === '200') return !!cons;
    if (result.success === true) return !!cons;
    return false;
}

function buildSteadfastPayload(order, settings, invoice) {
    const note =
        (order.note && String(order.note).trim()) ||
        (settings.steadfast_default_note && String(settings.steadfast_default_note).trim()) ||
        'Handle with care';

    const payload = {
        invoice,
        recipient_name: order.customer_name,
        recipient_phone: normalizeBdPhone(order.customer_phone),
        recipient_address: String(order.customer_address || '').slice(0, 250),
        cod_amount: order.payment_type === 'COD' ? Number(order.total_price) || 0 : 0,
        note: String(note).slice(0, 500),
    };

    const email = order.customer_email && String(order.customer_email).trim();
    if (email && email.includes('@')) {
        payload.recipient_email = email.slice(0, 150);
    }

    const alt = settings.steadfast_alternative_phone && normalizeBdPhone(settings.steadfast_alternative_phone);
    if (alt && alt.length >= 10) {
        payload.alternative_phone = alt.length === 11 ? alt : alt.slice(-11);
    }

    payload.item_description = buildItemDescription(order, settings);
    payload.total_lot = Math.max(1, Math.floor(totalLotFromOrder(order, settings)));

    const dt = deliveryTypeFromOrder(order, settings);
    if (dt === 0 || dt === 1) {
        payload.delivery_type = dt;
    }

    return payload;
}

function interpretCreateResponse(apiData, invoice) {
    const cons = extractConsignment(apiData);
    if (isSteadfastCreateSuccess(apiData, cons) && cons) {
        const trackingCode = cons.tracking_code != null ? String(cons.tracking_code).trim() : '';
        const consignmentId = cons.consignment_id != null ? String(cons.consignment_id) : '';
        const tracking_number = trackingCode || consignmentId;
        if (!tracking_number) {
            return {
                ok: false,
                message: 'Steadfast returned no tracking code or consignment id',
                raw: apiData,
                invoice,
            };
        }
        return {
            ok: true,
            tracking_number,
            invoice,
            consignmentId: consignmentId || null,
            tracking_code: trackingCode || null,
            consignment: cons,
            raw: apiData,
        };
    }
    return {
        ok: false,
        message: apiData?.message || 'Courier API did not return success',
        error: apiData?.errors || apiData?.error || apiData,
        raw: apiData,
        invoice,
    };
}

/**
 * Creates consignment at Steadfast. Returns `{ data: api body, invoice }`.
 */
const createSteadfastOrder = async (order) => {
    const settings = await getSettings();
    const apiKey = String(settings.steadfast_api_key ?? '').trim();
    const secretKey = String(settings.steadfast_secret_key ?? '').trim();

    if (!apiKey || !secretKey) {
        const err = new Error('Steadfast API key or secret missing in Settings');
        err.code = 'STEADFAST_CONFIG';
        throw err;
    }

    const baseTrim = resolveSteadfastBaseUrl(settings.steadfast_api_base_url);

    const config = {
        headers: steadfastHeaders(apiKey, secretKey),
    };

    /** Unique invoice — avoids duplicate rejection on Steadfast if re-sent. */
    const invoice = `Q${order.id}-${Date.now()}`;

    const payload = buildSteadfastPayload(order, settings, invoice);

    try {
        const response = await axios.post(`${baseTrim}/create_order`, payload, config);
        return { data: response.data, invoice };
    } catch (error) {
        console.error('Steadfast Courier Error:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Single code path for manual + auto dispatch: call API and persist success/failure on the order row.
 */
async function dispatchOrderToSteadfast(order) {
    try {
        const { data, invoice } = await createSteadfastOrder(order);
        const parsed = interpretCreateResponse(data, invoice);
        if (parsed.ok) {
            await applySteadfastDispatchSuccess(order.id, parsed);
        } else {
            await recordSteadfastDispatchError(order.id, parsed.message);
        }
        return parsed;
    } catch (error) {
        const msg =
            error.response?.data?.message ||
            (error.code === 'STEADFAST_CONFIG' ? error.message : '') ||
            error.message ||
            'Steadfast API error';
        await recordSteadfastDispatchError(order.id, msg);
        throw error;
    }
}

async function resolveSteadfastCourierId(conn) {
    const c = conn || db;
    const [rows] = await c.query(
        "SELECT id FROM couriers WHERE name = 'Steadfast' AND is_active = 1 LIMIT 1"
    );
    if (rows.length) return rows[0].id;
    const [fallback] = await c.query("SELECT id FROM couriers WHERE name = 'Steadfast' LIMIT 1");
    return fallback.length ? fallback[0].id : null;
}

async function applySteadfastDispatchSuccess(orderId, success) {
    const courierId = await resolveSteadfastCourierId();
    const consId = success.consignmentId != null ? String(success.consignmentId).slice(0, 80) : null;
    const inv = success.invoice != null ? String(success.invoice).slice(0, 150) : null;
    try {
        await db.query(
            `UPDATE orders SET status = 'Shipped', courier_name = 'Steadfast', tracking_number = ?,
         steadfast_invoice = ?, steadfast_consignment_id = ?, courier_id = COALESCE(?, courier_id),
         courier_dispatch_error = NULL
         WHERE id = ?`,
            [success.tracking_number, inv, consId, courierId, orderId]
        );
    } catch (e) {
        if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        await db.query(
            `UPDATE orders SET status = 'Shipped', courier_name = 'Steadfast', tracking_number = ?,
         courier_id = COALESCE(?, courier_id), courier_dispatch_error = NULL WHERE id = ?`,
            [success.tracking_number, courierId, orderId]
        );
    }
}

async function recordSteadfastDispatchError(orderId, message) {
    const msg = String(message || 'Steadfast dispatch failed').slice(0, 2000);
    try {
        await db.query('UPDATE orders SET courier_dispatch_error = ? WHERE id = ?', [msg, orderId]);
    } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
            console.warn('orders.courier_dispatch_error column missing — run server/structure.sql');
        } else {
            throw e;
        }
    }
}

/** True when Steadfast should auto-send on Processing (`auto_send_steadfast` or legacy toggle). */
function isAutoSendSteadfastEnabled(settings) {
    return (
        String(settings.auto_send_steadfast || '').trim() === 'true' ||
        String(settings.steadfast_auto_dispatch_on_confirm || '').trim() === 'true'
    );
}

/**
 * Auto dispatch when `auto_send_steadfast` (or legacy `steadfast_auto_dispatch_on_confirm`) is enabled.
 * Only for orders in `Processing` with no tracking / invoice yet. Runs `createSteadfastOrder` via `dispatchOrderToSteadfast`.
 */
async function maybeAutoDispatchSteadfast(orderId) {
    const [rows] = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!rows.length) return { skipped: true, reason: 'no_order' };
    const order = rows[0];
    if (order.status !== 'Processing') return { skipped: true, reason: 'not_processing' };

    const settings = await getSettings();
    if (!isAutoSendSteadfastEnabled(settings)) {
        return { skipped: true, reason: 'auto_dispatch_off' };
    }

    const tn = order.tracking_number != null ? String(order.tracking_number).trim() : '';
    const inv = order.steadfast_invoice != null ? String(order.steadfast_invoice).trim() : '';
    if (tn || inv) return { skipped: true, reason: 'already_dispatched' };

    if (!settings.steadfast_api_key || !settings.steadfast_secret_key) {
        return { skipped: true, reason: 'no_credentials' };
    }

    try {
        const parsed = await dispatchOrderToSteadfast(order);
        return parsed.ok ? { ok: true, ...parsed } : { ok: false, ...parsed };
    } catch (error) {
        console.error('Steadfast auto-dispatch failed', orderId, error.response?.data || error.message);
        const message =
            error.response?.data?.message ||
            error.message ||
            (typeof error.response?.data === 'string' ? error.response.data : '') ||
            'Steadfast dispatch failed';
        return { ok: false, error: error.response?.data || error.message, message };
    }
}

async function steadfastApiConfig() {
    const settings = await getSettings();
    const apiKey = String(settings.steadfast_api_key ?? '').trim();
    const secretKey = String(settings.steadfast_secret_key ?? '').trim();
    if (!apiKey || !secretKey) {
        const err = new Error('Steadfast API key or secret missing in Settings');
        err.code = 'STEADFAST_CONFIG';
        throw err;
    }
    const baseTrim = resolveSteadfastBaseUrl(settings.steadfast_api_base_url);
    const config = { headers: steadfastHeaders(apiKey, secretKey) };
    return { baseTrim, config };
}

/**
 * Status for a storefront order row: tracking code, consignment id, then invoice slug we stored at Steadfast.
 */
async function fetchSteadfastDeliveryStatus(order) {
    const { baseTrim, config } = await steadfastApiConfig();

    const urls = [];
    const tn = order.tracking_number != null ? String(order.tracking_number).trim() : '';
    const cid = order.steadfast_consignment_id != null ? String(order.steadfast_consignment_id).trim() : '';
    const inv = order.steadfast_invoice != null ? String(order.steadfast_invoice).trim() : '';

    if (tn) {
        urls.push(`${baseTrim}/status_by_trackingcode/${encodeURIComponent(tn)}`);
        urls.push(`${baseTrim}/status_by_cid/${encodeURIComponent(tn)}`);
    }
    if (cid && cid !== tn) {
        urls.push(`${baseTrim}/status_by_cid/${encodeURIComponent(cid)}`);
    }
    if (inv) {
        urls.push(`${baseTrim}/status_by_invoice/${encodeURIComponent(inv)}`);
    }

    if (!urls.length) {
        const err = new Error('Need tracking number, consignment id, or steadfast invoice on the order');
        err.code = 'STEADFAST_INPUT';
        throw err;
    }

    let lastErr;
    const seen = new Set();
    for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        try {
            const { data } = await axios.get(url, config);
            return data;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

/**
 * Probe by tracking code only (backward compat — admin sync uses fetchSteadfastDeliveryStatus).
 */
const fetchSteadfastStatus = async (tnOrCode) => {
    const trimmed = String(tnOrCode || '').trim();
    if (!trimmed) {
        const err = new Error('Need tracking code or consignment id');
        err.code = 'STEADFAST_INPUT';
        throw err;
    }
    const { baseTrim, config } = await steadfastApiConfig();
    const urls = [
        `${baseTrim}/status_by_trackingcode/${encodeURIComponent(trimmed)}`,
        `${baseTrim}/status_by_cid/${encodeURIComponent(trimmed)}`,
    ];
    let lastErr;
    for (const url of urls) {
        try {
            const { data } = await axios.get(url, config);
            return data;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
};

async function fetchSteadfastBalance() {
    const { baseTrim, config } = await steadfastApiConfig();
    const { data } = await axios.get(`${baseTrim}/get_balance`, config);
    const balance =
        data?.balance ??
        data?.data?.balance ??
        data?.current_balance ??
        data?.data?.current_balance ??
        data?.wallet_balance;
    const currency = data?.currency ?? data?.data?.currency;
    return { raw: data, balance: balance != null ? balance : undefined, currency };
}

/**
 * Map Steadfast delivery status string → our orders.status (or null to keep unchanged).
 */
function mapSteadfastStatusToOrderStatus(steadfastStatus) {
    const s = String(steadfastStatus || '').toLowerCase();
    if (!s) return null;
    if (s.includes('delivered') || s === 'delivered') return 'Delivered';
    if (s.includes('cancel')) return 'Cancelled';
    if (s.includes('partial')) return 'Processing';
    if (s.includes('hold') || s.includes('return')) return 'Processing';
    if (s.includes('review') || s.includes('pending') || s.includes('pick') || s.includes('transit') || s.includes('hub')) {
        return 'Shipped';
    }
    return null;
}

/**
 * Use wallet balance endpoint — only valid keys get 2xx; avoids false 401 from status APIs on bogus tracking codes.
 */
async function testSteadfastConnection() {
    const settings = await getSettings();
    const apiKey = String(settings.steadfast_api_key ?? '').trim();
    const secretKey = String(settings.steadfast_secret_key ?? '').trim();
    if (!apiKey || !secretKey) {
        const err = new Error('Configure API Key and Secret first');
        err.code = 'STEADFAST_CONFIG';
        throw err;
    }
    const baseTrim = resolveSteadfastBaseUrl(settings.steadfast_api_base_url);
    const url = `${baseTrim}/get_balance`;
    let res;
    try {
        res = await axios.get(url, {
            headers: steadfastHeaders(apiKey, secretKey),
            validateStatus: () => true,
            timeout: 15000,
        });
    } catch (e) {
        const msg =
            e.code === 'ECONNABORTED'
                ? 'Request timed out — check API base URL and network'
                : e.message || 'Could not reach Steadfast API';
        const err = new Error(msg);
        err.code = 'STEADFAST_NETWORK';
        throw err;
    }
    const { status, data } = res;
    if (status === 401 || status === 403) {
        const err = new Error('Steadfast rejected credentials (check API URL, key, and secret)');
        err.code = 'STEADFAST_AUTH';
        throw err;
    }
    if (status >= 200 && status < 300) {
        return { ok: true, httpStatus: status, message: 'Credentials accepted by Steadfast API' };
    }
    const hint =
        data && typeof data === 'object'
            ? data.message || data.error || (Array.isArray(data.errors) ? data.errors.join(', ') : '')
            : typeof data === 'string'
              ? data
              : '';
    const err = new Error(
        hint ? `Steadfast API returned ${status}: ${hint}` : `Unexpected HTTP ${status} from get_balance (${url})`
    );
    err.code = 'STEADFAST_UNEXPECTED';
    throw err;
}

module.exports = {
    createSteadfastOrder,
    dispatchOrderToSteadfast,
    fetchSteadfastStatus,
    fetchSteadfastDeliveryStatus,
    fetchSteadfastBalance,
    mapSteadfastStatusToOrderStatus,
    extractConsignment,
    isSteadfastCreateSuccess,
    interpretCreateResponse,
    maybeAutoDispatchSteadfast,
    testSteadfastConnection,
};
