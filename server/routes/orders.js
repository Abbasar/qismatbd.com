const express = require('express');
const db = require('../db');
const { initPayment } = require('../controllers/paymentController');
const {
  dispatchOrderToSteadfast,
  fetchSteadfastDeliveryStatus,
  mapSteadfastStatusToOrderStatus,
  maybeAutoDispatchSteadfast,
} = require('../utils/steadfast');
const { resolveUnitPrice } = require('../utils/productPricing');
const { sendOrderEmail } = require('../utils/email');
const { createAdminNotification } = require('../utils/notifications');
const { tryVerifyToken, requireAuth, requireAdmin } = require('../middleware/auth');
const { sendServerError } = require('../utils/httpError');
const { computeCartSubtotalsForCoupon } = require('../utils/couponScope');
const { sendFacebookPurchaseEvent } = require('../utils/facebookCapi');
const router = express.Router();

function clientIp(req) {
  const x = req.headers['x-forwarded-for'];
  if (x) return String(x).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    return sendServerError(res, 'Unable to load orders', error);
  }
});

router.get('/user/:userId', requireAuth, async (req, res) => {
  try {
    const uid = Number(req.params.userId);
    if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== uid) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const [rows] = await db.query(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [uid]
    );
    res.json(rows);
  } catch (error) {
    return sendServerError(res, 'Unable to load user orders', error);
  }
});

router.get('/track/:tracking_number', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, customer_name, status, courier_name, tracking_number FROM orders WHERE tracking_number = ?',
      [req.params.tracking_number]
    );

    if (!rows.length) return res.status(404).json({ message: 'Tracking number not found' });
    res.json(rows[0]);
  } catch (error) {
    return sendServerError(res, 'Unable to track order', error);
  }
});

/** Bulk SteadFast create_order for many shop orders at once (max 75 ids per request). */
router.post('/steadfast/bulk-dispatch', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rawIds = req.body?.orderIds;
    const ids = Array.isArray(rawIds)
      ? rawIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const uniq = [...new Set(ids)].slice(0, 75);
    if (!uniq.length) {
      return res.status(400).json({ message: 'orderIds must be a non-empty array of order ids (max 75)' });
    }

    const results = [];
    for (const oid of uniq) {
      try {
        const [orows] = await db.query('SELECT * FROM orders WHERE id = ?', [oid]);
        if (!orows.length) {
          results.push({ id: oid, ok: false, message: 'Order not found' });
          continue;
        }
        const order = orows[0];
        const hasRef =
          (order.tracking_number && String(order.tracking_number).trim()) ||
          (order.steadfast_invoice && String(order.steadfast_invoice).trim());
        if (hasRef) {
          results.push({ id: oid, ok: false, skipped: true, message: 'Already has tracking or SteadFast invoice' });
          continue;
        }
        const parsed = await dispatchOrderToSteadfast(order);
        results.push(
          parsed.ok
            ? { id: oid, ok: true, tracking_number: parsed.tracking_number, steadfast_invoice: parsed.invoice }
            : { id: oid, ok: false, message: parsed.message || 'Courier API rejected' }
        );
      } catch (e) {
        results.push({
          id: oid,
          ok: false,
          message: e.response?.data?.message || e.message || 'Dispatch error',
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    res.json({
      message: `Bulk dispatch finished — ${okCount}/${results.length} OK`,
      okCount,
      results,
    });
  } catch (error) {
    return sendServerError(res, 'Unable to run bulk dispatch', error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });
    const order = rows[0];
    if (order.user_id != null) {
      const decoded = tryVerifyToken(req);
      if (!decoded) {
        return res.status(401).json({ message: 'Login required to view this order' });
      }
      if (decoded.role !== 'admin' && Number(decoded.id) !== Number(order.user_id)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }
    res.json(order);
  } catch (error) {
    return sendServerError(res, 'Unable to load order', error);
  }
});

router.post('/', async (req, res) => {
  let conn;
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      paymentType,
      bKashNumber,
      items,
      deliveryArea,
      deliveryMethod,
      couponCode,
      facebook_fbp,
      facebook_fbc,
    } = req.body;

    const sessionUser = tryVerifyToken(req);
    const resolvedUserId = sessionUser?.id != null ? Number(sessionUser.id) : null;

    if (!customerName || !customerPhone || !customerAddress || !paymentType || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'Missing required order fields' });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    let cid = null;
    /** Prefer Steadfast when active so courier_id aligns with courier API dispatch (not merely lowest id). */
    const [pickCourier] = await conn.query(
      'SELECT id FROM couriers WHERE is_active = 1 ORDER BY CASE WHEN `name` = ? THEN 0 ELSE 1 END, id ASC LIMIT 1',
      ['Steadfast']
    );
    if (pickCourier.length) cid = Number(pickCourier[0].id);

    const sanitizedItems = [];
    let subtotal = 0;
    for (const item of items) {
      const pid = item.id;
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const [prows] = await conn.query(
        'SELECT id, price, name, image, stock, preorder_available_date, pricing_options FROM products WHERE id = ?',
        [pid]
      );
      if (!prows.length) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ message: `Product not found: ${pid}` });
      }
      const p = prows[0];
      const stockNum = Number(p.stock);
      const hasPreorder =
        p.preorder_available_date != null && String(p.preorder_available_date).trim() !== '';
      const stockOk = stockNum >= qty;
      const preorderOk = hasPreorder && stockNum === 0;
      if (!stockOk && !preorderOk) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ message: `Insufficient stock for ${p.name}` });
      }
      const linePrice = Number(resolveUnitPrice(p, item).toFixed(2));
      subtotal += linePrice * qty;
      sanitizedItems.push({
        id: p.id,
        name: p.name,
        price: linePrice,
        quantity: qty,
        image: p.image,
        selectedSize: item.selectedSize || null,
        selectedColor: item.selectedColor || null,
      });
    }

    subtotal = Number(subtotal.toFixed(2));

    const [settingsRows] = await conn.query(
      `SELECT setting_key, setting_value FROM settings WHERE setting_key IN (
        "shipping_inside_dhaka",
        "shipping_inside_point",
        "shipping_inside_home",
        "shipping_outside_dhaka",
        "shipping_outside_point",
        "shipping_outside_home",
        "bkash_mode",
        "nagad_mode"
      )`
    );
    const settings = {};
    settingsRows.forEach((s) => {
      settings[s.setting_key] = s.setting_value;
    });

    let courierRows = [];
    if (Number.isFinite(cid)) {
      ;[courierRows] = await conn.query(
        'SELECT id, name, is_active FROM couriers WHERE id = ? LIMIT 1',
        [cid]
      );
    }
    const courierRow =
      courierRows.length && courierRows[0].is_active
        ? courierRows[0]
        : { id: null, name: null };

    const legacyInside = Number(settings.shipping_inside_dhaka || 60);
    const ratePoint =
      settings.shipping_inside_point != null && String(settings.shipping_inside_point).trim() !== ''
        ? Number(settings.shipping_inside_point)
        : legacyInside;
    const rateHome =
      settings.shipping_inside_home != null && String(settings.shipping_inside_home).trim() !== ''
        ? Number(settings.shipping_inside_home)
        : legacyInside;
    const legacyOutside = Number(settings.shipping_outside_dhaka || 120);
    const rateOutsidePoint =
      settings.shipping_outside_point != null && String(settings.shipping_outside_point).trim() !== ''
        ? Number(settings.shipping_outside_point)
        : legacyOutside;
    const rateOutsideHome =
      settings.shipping_outside_home != null && String(settings.shipping_outside_home).trim() !== ''
        ? Number(settings.shipping_outside_home)
        : legacyOutside;

    const area = deliveryArea === 'Outside Dhaka' ? 'Outside Dhaka' : 'Inside Dhaka';
    const methodRaw = deliveryMethod != null ? String(deliveryMethod).toLowerCase().trim() : '';
    const methodNorm = methodRaw === 'home' ? 'home' : 'point';
    let resolvedMethod = null;
    let shippingFee;
    if (area === 'Outside Dhaka') {
      if (methodNorm === 'home') {
        shippingFee = rateOutsideHome;
        resolvedMethod = 'home';
      } else {
        shippingFee = rateOutsidePoint;
        resolvedMethod = 'point';
      }
    } else if (methodNorm === 'home') {
      shippingFee = rateHome;
      resolvedMethod = 'home';
    } else {
      shippingFee = ratePoint;
      resolvedMethod = 'point';
    }
    shippingFee = Number(shippingFee.toFixed(2));

    let discountAmount = 0;
    let appliedCouponCode = null;
    let couponId = null;

    const rawCoupon = couponCode && String(couponCode).trim();
    if (rawCoupon) {
      try {
        const code = rawCoupon.toUpperCase();
        const [crows] = await conn.query(
          `SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1 
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR used_count < max_uses)`,
          [code]
        );
        if (!crows.length) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ message: 'Invalid or expired coupon' });
        }
        const c = crows[0];
        const { eligible } = await computeCartSubtotalsForCoupon(conn, items, c);
        if (eligible < Number(c.min_subtotal || 0)) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            message: `Minimum amount for this coupon is ৳${Number(c.min_subtotal).toFixed(2)} (eligible items)`,
          });
        }
        couponId = c.id;
        if (c.discount_type === 'percent') {
          discountAmount = (eligible * Number(c.discount_value)) / 100;
        } else {
          discountAmount = Number(c.discount_value);
        }
        discountAmount = Math.min(Math.max(discountAmount, 0), eligible);
        discountAmount = Number(discountAmount.toFixed(2));
        appliedCouponCode = c.code;
      } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') {
          await conn.rollback();
          conn.release();
          return res.status(503).json({
            message: 'Coupons not configured. Update database using server/structure.sql',
          });
        }
        throw e;
      }
    }

    const totalPrice = Number(Math.max(0, subtotal + shippingFee - discountAmount).toFixed(2));

    const insertParams = [
      Number.isFinite(resolvedUserId) ? resolvedUserId : null,
      courierRow.id != null ? Number(courierRow.id) : null,
      courierRow.name || null,
      customerName,
      customerPhone,
      customerEmail || null,
      customerAddress,
      resolvedMethod,
      paymentType,
      bKashNumber || null,
      appliedCouponCode,
      JSON.stringify(sanitizedItems),
      subtotal,
      shippingFee,
      discountAmount,
      totalPrice,
      'Pending',
    ];

    let result;
    try {
      ;[result] = await conn.query(
        `INSERT INTO orders 
         (user_id, courier_id, courier_name, customer_name, customer_phone, customer_email, customer_address, delivery_method, payment_type, bkash_number, coupon_code, items, subtotal, shipping_fee, discount_amount, total_price, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        insertParams
      );
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        ;[result] = await conn.query(
          `INSERT INTO orders 
           (user_id, courier_id, courier_name, customer_name, customer_phone, customer_email, customer_address, payment_type, bkash_number, coupon_code, items, subtotal, shipping_fee, discount_amount, total_price, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insertParams[0],
            insertParams[1],
            insertParams[2],
            insertParams[3],
            insertParams[4],
            insertParams[5],
            insertParams[6],
            insertParams[8],
            insertParams[9],
            insertParams[10],
            insertParams[11],
            insertParams[12],
            insertParams[13],
            insertParams[14],
            insertParams[15],
            insertParams[16],
          ]
        );
      } else {
        throw e;
      }
    }

    if (couponId) {
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [couponId]);
    }

    await conn.commit();
    conn.release();
    conn = null;

    const orderId = result.insertId;
    await createAdminNotification({
      type: 'order',
      title: 'New order placed',
      message: `Order #${orderId} from ${customerName} (৳${totalPrice.toFixed(2)})`,
      entityType: 'order',
      entityId: orderId,
    });

    const [settingsRows2] = await db.query(
      'SELECT setting_key, setting_value FROM settings WHERE setting_key IN ("bkash_mode", "nagad_mode")'
    );
    const paySettings = {};
    settingsRows2.forEach((s) => {
      paySettings[s.setting_key] = s.setting_value;
    });

    const isApiPayment =
      paymentType === 'Online' ||
      (paymentType === 'Bkash' && paySettings.bkash_mode === 'api') ||
      (paymentType === 'Nagad' && paySettings.nagad_mode === 'api');

    if (isApiPayment) {
      const paymentResponse = await initPayment({
        id: orderId,
        total_price: totalPrice,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_address: customerAddress,
        customer_phone: customerPhone,
      });

      if (paymentResponse.GatewayPageURL) {
        return res.json({
          orderId,
          paymentUrl: paymentResponse.GatewayPageURL,
          message: 'Redirecting to payment gateway',
          subtotal,
          shippingFee,
          discountAmount,
          totalPrice,
        });
      }
      throw new Error('Could not generate payment URL');
    }

    sendOrderEmail(customerEmail, {
      id: orderId,
      customer_name: customerName,
      total_price: totalPrice,
      payment_type: paymentType,
      customer_address: customerAddress,
    });

    sendFacebookPurchaseEvent({
      orderId,
      value: totalPrice,
      email: customerEmail,
      phone: customerPhone,
      fbc: facebook_fbc,
      fbp: facebook_fbp,
      clientIp: clientIp(req),
      userAgent: req.headers['user-agent'],
    }).catch(() => {});

    res.json({
      orderId,
      message: 'Order placed successfully',
      subtotal,
      shippingFee,
      discountAmount,
      totalPrice,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      try {
        conn.release();
      } catch {
        /* ignore */
      }
    }
    return sendServerError(res, 'Unable to place order', error);
  }
});

router.put('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, courier_name, tracking_number } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    const allowed = new Set(['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']);
    if (!allowed.has(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    const [result] = await db.query(
      'UPDATE orders SET status = ?, courier_name = ?, tracking_number = ? WHERE id = ?',
      [status, courier_name || null, tracking_number || null, req.params.id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Order not found' });
    }

    let steadfastAuto = null;
    if (status === 'Processing') {
      steadfastAuto = await maybeAutoDispatchSteadfast(req.params.id);
    }

    res.json({
      message: 'Order updated',
      steadfast_auto_dispatch: steadfastAuto,
    });
  } catch (error) {
    return sendServerError(res, 'Unable to update order', error);
  }
});

router.post('/:id/dispatch', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });

    const order = rows[0];
    const parsed = await dispatchOrderToSteadfast(order);

    if (parsed.ok) {
      return res.json({
        message: 'Order dispatched to Steadfast',
        tracking_number: parsed.tracking_number,
        steadfast_invoice: parsed.invoice,
        consignment_id: parsed.consignmentId || undefined,
        tracking_code: parsed.tracking_code || undefined,
        steadfast_consignment: parsed.consignment,
      });
    }
    return res.status(400).json({
      message: parsed.message || 'Courier API did not return success',
      steadfast_invoice: parsed.invoice || undefined,
      error: parsed.error || parsed.raw,
    });
  } catch (error) {
    if (error.response?.data) {
      return res.status(502).json({
        message: error.response.data.message || 'Steadfast API error',
        details: error.response.data,
      });
    }
    return sendServerError(res, 'Unable to dispatch order', error);
  }
});

/** Pull latest delivery status from Steadfast and update local order when mapped (e.g. Delivered). */
router.post('/:id/sync-steadfast', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });

    const order = rows[0];
    const tn = order.tracking_number != null ? String(order.tracking_number).trim() : '';
    const inv = order.steadfast_invoice != null ? String(order.steadfast_invoice).trim() : '';
    const cid = order.steadfast_consignment_id != null ? String(order.steadfast_consignment_id).trim() : '';
    if (!tn && !inv && !cid) {
      return res.status(400).json({
        message: 'No Steadfast tracking, invoice, or consignment id on this order. Dispatch to Steadfast first.',
      });
    }

    const data = await fetchSteadfastDeliveryStatus(order);

    const steadfastStatus =
      data?.consignment?.status ||
      data?.data?.consignment?.status ||
      data?.delivery_status ||
      data?.status;

    const mapped = mapSteadfastStatusToOrderStatus(steadfastStatus);
    try {
      if (mapped) {
        await db.query('UPDATE orders SET status = ?, courier_dispatch_error = NULL WHERE id = ?', [
          mapped,
          req.params.id,
        ]);
      } else {
        await db.query('UPDATE orders SET courier_dispatch_error = NULL WHERE id = ?', [req.params.id]);
      }
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      if (mapped) {
        await db.query('UPDATE orders SET status = ? WHERE id = ?', [mapped, req.params.id]);
      }
    }

    res.json({
      message: mapped ? `Synced — status updated to ${mapped}` : 'Synced — no status change',
      steadfast: data,
      mappedStatus: mapped,
      rawStatus: steadfastStatus,
    });
  } catch (error) {
    if (error.response?.data) {
      return res.status(502).json({
        message: error.response.data.message || 'Steadfast status API error',
        details: error.response.data,
      });
    }
    return sendServerError(res, 'Unable to sync Steadfast status', error);
  }
});

module.exports = router;
