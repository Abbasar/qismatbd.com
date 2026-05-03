const express = require('express');
const router = express.Router();
const db = require('../db');
const { tryVerifyToken, requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const { testSteadfastConnection, fetchSteadfastBalance } = require('../utils/steadfast');

/** Safe for unauthenticated storefront / checkout / theme bootstrap only. */
const PUBLIC_SETTING_KEYS = new Set([
    'shipping_inside_dhaka',
    'shipping_outside_dhaka',
    'shipping_inside_point',
    'shipping_inside_home',
    'shipping_outside_point',
    'shipping_outside_home',
    'inside_dhaka_districts',
    'facebook_pixel_id',
    'bkash_mode',
    'nagad_mode',
    'bkash_number',
    'nagad_number',
    'is_payment_enabled',
    'theme_primary_color',
    'theme_sidebar_color',
    'store_business_address',
    'store_phone_tel',
    'store_whatsapp_tel',
    'store_facebook_url',
    'store_messenger_url',
    'store_logo_url',
    'hero_slides',
    'advertise_unboxing_hero_image',
    'advertise_newsletter_bg_image',
]);

/** Admin GET masking — show last 4 only; avoids echoing full secrets to the browser. */
const SECRET_SETTING_KEYS = new Set([
  'steadfast_api_key',
  'steadfast_secret_key',
  'steadfast_webhook_bearer_token',
]);

/** Visible tail length for masked Steadfast secrets in GET responses */
const MASK_TAIL_LEN = 4;
/** Obfuscation length (e.g. ************5678) */
const MASK_STAR_RUN = 12;

function maskSecretValue(raw) {
    const v = String(raw ?? '');
    if (!v) return '';
    if (v.length <= MASK_TAIL_LEN) return '*'.repeat(MASK_STAR_RUN + MASK_TAIL_LEN);
    return '*'.repeat(MASK_STAR_RUN) + v.slice(-MASK_TAIL_LEN);
}

/** Block saving the masked placeholder back from the UI (would overwrite the DB). */
function looksLikeMaskedSteadfastSecret(value) {
    const s = String(value ?? '').trim();
    /** Need room for ≥6 mask chars + 4-char tail (supports legacy ••••••••5678 and ************5678). */
    if (!s || s.length < MASK_TAIL_LEN + 6) return false;
    const head = s.slice(0, -MASK_TAIL_LEN);
    const tail = s.slice(-MASK_TAIL_LEN);
    if (!tail || /[^A-Za-z0-9_-]/.test(tail)) return false;
    return /^[*•]{6,}$/.test(head);
}

/** Keys where empty PUT must not clear the DB — keep existing value. */
const STEADFAST_KEY_PRESERVE_IF_EMPTY = new Set([
    'steadfast_api_key',
    'steadfast_secret_key',
    'steadfast_webhook_bearer_token',
]);

/** Non-secret Steadfast keys accepted on PUT /steadfast (bulk save), excluding API base (handled first) and auto_send (mirrors checkbox). */
const STEADFAST_BULK_PUBLIC_KEYS = [
    'steadfast_default_note',
    'steadfast_alternative_phone',
    'steadfast_item_description_template',
    'steadfast_total_lot_default',
    'steadfast_send_delivery_type',
    'steadfast_auto_dispatch_on_confirm',
];

const STEADFAST_BULK_SECRET_KEYS = ['steadfast_api_key', 'steadfast_secret_key', 'steadfast_webhook_bearer_token'];

function normalizeSteadfastApiBaseUrlInput(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { value: '' };
    try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return { error: 'API base URL must be http(s)' };
        }
        return { value: raw.replace(/\/$/, '') };
    } catch {
        return { error: 'Invalid API base URL' };
    }
}

router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM settings');
        const decoded = tryVerifyToken(req);
        if (decoded?.role === 'admin') {
            const rawMap = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
            const sanitized = rows.map((r) =>
                SECRET_SETTING_KEYS.has(r.setting_key)
                    ? { ...r, setting_value: maskSecretValue(r.setting_value) }
                    : r
            );
            const extras = [
                {
                    setting_key: 'steadfast_api_key_set',
                    setting_value: String(!!String(rawMap.steadfast_api_key ?? '').trim()),
                },
                {
                    setting_key: 'steadfast_secret_key_set',
                    setting_value: String(!!String(rawMap.steadfast_secret_key ?? '').trim()),
                },
                {
                    setting_key: 'steadfast_webhook_bearer_token_set',
                    setting_value: String(!!String(rawMap.steadfast_webhook_bearer_token ?? '').trim()),
                },
            ];
            return res.json([...sanitized, ...extras]);
        }
        const filtered = rows.filter((row) => PUBLIC_SETTING_KEYS.has(row.setting_key));
        res.json(filtered);
    } catch (error) {
        return sendServerError(res, 'Unable to load settings', error);
    }
});

router.post('/steadfast-test', requireAuth, requireAdmin, async (req, res) => {
    try {
        const out = await testSteadfastConnection();
        res.json(out);
    } catch (error) {
        const code = error.code || 'STEADFAST_TEST';
        const status = code === 'STEADFAST_CONFIG' ? 400 : 502;
        res.status(status).json({
            message: error.message || 'Unable to reach Steadfast API',
            code,
        });
    }
});

router.post('/steadfast-balance', requireAuth, requireAdmin, async (req, res) => {
    try {
        const out = await fetchSteadfastBalance();
        res.json(out);
    } catch (error) {
        const code = error.code || 'STEADFAST_BALANCE';
        const status = code === 'STEADFAST_CONFIG' ? 400 : 502;
        res.status(status).json({
            message: error.response?.data?.message || error.message || 'Unable to fetch Steadfast balance',
            code,
            details: error.response?.data,
        });
    }
});

/**
 * One-shot Steadfast setup (admin). Non-secrets always updated; secrets updated only when a new
 * full value is sent (empty or masked-looking = keep existing).
 */
router.put('/steadfast', requireAuth, requireAdmin, async (req, res) => {
    try {
        const b = req.body && typeof req.body === 'object' ? req.body : {};

        const baseNorm = normalizeSteadfastApiBaseUrlInput(b.steadfast_api_base_url);
        if (baseNorm.error) {
            return res.status(400).json({ message: baseNorm.error });
        }

        const lotRaw =
            b.steadfast_total_lot_default != null ? String(b.steadfast_total_lot_default).trim() : '';
        if (lotRaw !== '' && (!Number.isFinite(Number(lotRaw)) || Number(lotRaw) < 1)) {
            return res.status(400).json({ message: 'Total lot must be a positive number or blank' });
        }

        const upsert = async (key, value) => {
            await db.query(
                'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                [key, value]
            );
        };

        await upsert('steadfast_api_base_url', baseNorm.value);

        for (const k of STEADFAST_BULK_PUBLIC_KEYS) {
            const v = b[k] != null ? String(b[k]) : '';
            await upsert(k, v);
        }

        const auto =
            String(b.steadfast_auto_dispatch_on_confirm ?? '')
                .trim()
                .toLowerCase() === 'true'
                ? 'true'
                : 'false';
        await upsert('auto_send_steadfast', auto);

        for (const sk of STEADFAST_BULK_SECRET_KEYS) {
            const incoming = b[sk] != null ? String(b[sk]) : '';
            const trimmed = incoming.trim();
            if (!trimmed || looksLikeMaskedSteadfastSecret(trimmed)) {
                continue;
            }
            await upsert(sk, trimmed.slice(0, 512));
        }

        res.json({ message: 'Steadfast settings saved', ok: true });
    } catch (error) {
        return sendServerError(res, 'Unable to save Steadfast settings', error);
    }
});

router.put('/:key', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        let value = req.body?.value != null ? String(req.body.value) : '';

        if (SECRET_SETTING_KEYS.has(key)) {
            if (looksLikeMaskedSteadfastSecret(value)) {
                return res.json({
                    message: 'Masked display only — enter a full key to change it',
                });
            }
            const trimmedPut = value.trim();
            if (trimmedPut === '') {
                if (STEADFAST_KEY_PRESERVE_IF_EMPTY.has(key)) {
                    return res.json({ message: 'Setting unchanged — empty input keeps the saved key' });
                }
                return res.json({ message: 'Setting unchanged' });
            }
            value = trimmedPut.slice(0, 512);
        }

        if (key === 'steadfast_api_base_url' && value.trim()) {
            const t = value.trim();
            try {
                const u = new URL(t);
                if (u.protocol !== 'https:' && u.protocol !== 'http:') {
                    return res.status(400).json({ message: 'API base URL must be http(s)' });
                }
            } catch {
                return res.status(400).json({ message: 'Invalid API base URL' });
            }
            value = t.replace(/\/$/, '');
        }

        if (
            key === 'steadfast_total_lot_default' &&
            value.trim() !== '' &&
            (!Number.isFinite(Number(value)) || Number(value) < 1)
        ) {
            return res.status(400).json({ message: 'Total lot must be a positive number or blank' });
        }

        await db.query(
            'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            [key, value]
        );
        res.json({ message: 'Setting updated' });
    } catch (error) {
        return sendServerError(res, 'Unable to update setting', error);
    }
});

module.exports = router;
