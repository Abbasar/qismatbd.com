const express = require('express');
const SSLCommerzPayment = require('sslcommerz-lts');
const router = express.Router();
const db = require('../db');
const { getSslCommerzSettings } = require('../controllers/paymentController');
const { sendFacebookPurchaseEvent } = require('../utils/facebookCapi');
const { maybeAutoDispatchSteadfast } = require('../utils/steadfast');

function clientIp(req) {
    const x = req.headers['x-forwarded-for'];
    if (x) return String(x).split(',')[0].trim();
    return req.socket?.remoteAddress || '';
}

const frontendBaseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

function redirectFail(orderId) {
    const q = orderId ? `?error=payment_failed&orderId=${orderId}` : '?error=payment_failed';
    return `${frontendBaseUrl}/checkout${q}`;
}

router.post('/success/:orderId', async (req, res) => {
    const orderId = Number(req.params.orderId);
    const val_id = req.body.val_id;

    try {
        if (!orderId || !val_id) {
            return res.redirect(redirectFail(orderId || ''));
        }

        const [orders] = await db.query(
            'SELECT id, total_price, status FROM orders WHERE id = ? LIMIT 1',
            [orderId]
        );
        if (!orders.length) {
            return res.redirect(redirectFail(orderId));
        }

        const order = orders[0];
        const sslSettings = await getSslCommerzSettings();
        if (!sslSettings.store_id || !sslSettings.store_passwd) {
            console.error('SSLCommerz store credentials missing in settings');
            return res.status(500).send('Payment gateway not configured');
        }

        const sslcz = new SSLCommerzPayment(
            sslSettings.store_id,
            sslSettings.store_passwd,
            sslSettings.is_live
        );

        const validation = await sslcz.validate({ val_id });
        const ok =
            validation &&
            typeof validation === 'object' &&
            (validation.status === 'VALID' || validation.status === 'VALIDATED');

        if (!ok) {
            console.error('SSLCommerz validation failed', validation);
            return res.redirect(redirectFail(orderId));
        }

        const paidAmount = Number(validation.amount);
        const expected = Number(order.total_price);
        if (!Number.isFinite(paidAmount) || Math.abs(expected - paidAmount) > 0.05) {
            console.error('Payment amount mismatch', { expected, paidAmount, orderId });
            return res.redirect(redirectFail(orderId));
        }

        const tran_id = validation.tran_id || req.body.tran_id || '';
        const card_type = validation.card_type || req.body.card_type || 'Online';

        try {
            await db.query(
                'UPDATE orders SET status = "Processing", amount_paid = ? WHERE id = ?',
                [paidAmount, orderId]
            );
        } catch (e) {
            if (e.code === 'ER_BAD_FIELD_ERROR') {
                await db.query('UPDATE orders SET status = "Processing" WHERE id = ?', [orderId]);
            } else {
                throw e;
            }
        }

        maybeAutoDispatchSteadfast(orderId).catch(() => {});

        await db.query(
            'INSERT INTO payments (order_id, amount, method, status, transaction_id, paid_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [orderId, paidAmount, card_type, 'Paid', tran_id]
        );

        const [paidRows] = await db.query(
            'SELECT customer_email, customer_phone, total_price FROM orders WHERE id = ? LIMIT 1',
            [orderId]
        );
        const pr = paidRows[0];
        if (pr) {
            sendFacebookPurchaseEvent({
                orderId,
                value: pr.total_price,
                email: pr.customer_email,
                phone: pr.customer_phone,
                clientIp: clientIp(req),
                userAgent: req.headers['user-agent'],
            }).catch(() => {});
        }

        res.redirect(`${frontendBaseUrl}/order-success?orderId=${orderId}`);
    } catch (error) {
        console.error('Payment Success Error:', error);
        res.redirect(redirectFail(orderId));
    }
});

router.post('/fail/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        res.redirect(`${frontendBaseUrl}/checkout?error=payment_failed&orderId=${orderId}`);
    } catch (error) {
        console.error('Payment Fail Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/cancel/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        res.redirect(`${frontendBaseUrl}/checkout?error=payment_cancelled&orderId=${orderId}`);
    } catch (error) {
        console.error('Payment Cancel Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/ipn', async (req, res) => {
    console.log('IPN Received:', req.body);
    res.status(200).send('OK');
});

module.exports = router;
