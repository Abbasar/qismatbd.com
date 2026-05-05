const nodemailer = require('nodemailer');
const db = require('../db');

const getEmailSettings = async () => {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM settings WHERE setting_key IN ("smtp_user", "smtp_pass", "admin_email")');
    const settings = {};
    rows.forEach(row => settings[row.setting_key] = row.setting_value);
    return settings;
};

const createTransport = (settings) =>
    nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: settings.smtp_user,
            pass: settings.smtp_pass
        }
    });

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatMoney = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.00';
    return n.toFixed(2);
};

const sendOrderEmail = async (customerEmail, orderDetails) => {
    try {
        const settings = await getEmailSettings();
        if (!settings.smtp_user || !settings.smtp_pass) {
            console.warn('SMTP settings not configured. Skipping email.');
            return;
        }

        const transporter = createTransport(settings);

        const items = Array.isArray(orderDetails.items) ? orderDetails.items : [];
        const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
        const paymentTypeText = String(orderDetails.payment_type || '').trim();
        const isMobilePayment = ['bkash', 'nagad'].includes(paymentTypeText.toLowerCase());
        const transactionId = String(orderDetails.bkash_number || '').trim();
        const itemsHtml = items.length
            ? `
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr>
                            <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Product Name</th>
                            <th style="text-align:left;padding:8px;border-bottom:1px solid #e5e7eb;">Variant</th>
                            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb;">Quantity</th>
                            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb;">Unit</th>
                            <th style="text-align:right;padding:8px;border-bottom:1px solid #e5e7eb;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items
                            .map((item) => {
                                const qty = Math.max(1, Number(item.quantity) || 1);
                                const price = Number(item.price) || 0;
                                const line = qty * price;
                                const variant = [item.selectedSize, item.selectedColor]
                                    .filter(Boolean)
                                    .map((v) => escapeHtml(v))
                                    .join(' / ');
                                return `
                                    <tr>
                                        <td style="padding:8px;border-bottom:1px solid #f1f5f9;">${escapeHtml(item.name || '')}</td>
                                        <td style="padding:8px;border-bottom:1px solid #f1f5f9;">${variant || '-'}</td>
                                        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;">${qty}</td>
                                        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;">৳${formatMoney(price)}</td>
                                        <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;">৳${formatMoney(line)}</td>
                                    </tr>
                                `;
                            })
                            .join('')}
                    </tbody>
                </table>
            `
            : '<p style="margin:10px 0 0;color:#64748b;">No line items available.</p>';

        const mailOptions = {
            from: `"Qismat Store" <${settings.smtp_user}>`,
            to: [customerEmail, settings.admin_email].filter(Boolean),
            subject: `Order Confirmation - #${orderDetails.id}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #10b981; text-align: center;">Order Confirmed!</h2>
                    <p>Hello ${escapeHtml(orderDetails.customer_name || 'Customer')},</p>
                    <p>Thank you for your order. We are processing it now.</p>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Order Summary</h3>
                        <p><strong>Order ID:</strong> #${orderDetails.id}</p>
                        <p><strong>Customer Name:</strong> ${escapeHtml(orderDetails.customer_name || '-')}</p>
                        <p><strong>Customer Contact:</strong> ${escapeHtml(orderDetails.customer_phone || '-')}</p>
                        <p><strong>Email:</strong> ${escapeHtml(orderDetails.customer_email || '-')}</p>
                        <p><strong>Customer Address:</strong> ${escapeHtml(orderDetails.customer_address || '-')}</p>
                        <p><strong>Delivery Area:</strong> ${escapeHtml(orderDetails.delivery_area || '-')}</p>
                        <p><strong>Delivery Method:</strong> ${escapeHtml(orderDetails.delivery_method || '-')}</p>
                        <p><strong>Payment Method:</strong> ${escapeHtml(orderDetails.payment_type || '-')}</p>
                        ${isMobilePayment ? `<p><strong>Transaction ID:</strong> ${escapeHtml(transactionId || '-')}</p>` : ''}
                        <p><strong>Coupon:</strong> ${escapeHtml(orderDetails.coupon_code || '-')}</p>
                        <p><strong>Total Quantity:</strong> ${totalQuantity}</p>
                        <p><strong>Subtotal:</strong> ৳${formatMoney(orderDetails.subtotal)}</p>
                        <p><strong>Shipping:</strong> ৳${formatMoney(orderDetails.shipping_fee)}</p>
                        <p><strong>Discount:</strong> ৳${formatMoney(orderDetails.discount_amount)}</p>
                        <p><strong>Total Amount:</strong> ৳${formatMoney(orderDetails.total_price)}</p>
                    </div>
                    <div style="margin: 20px 0;">
                        <h3 style="margin:0 0 10px;">Items</h3>
                        ${itemsHtml}
                    </div>
                    <p style="text-align: center; color: #6b7280; font-size: 12px;">© 2026 Qismat E-commerce. All rights reserved.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Order email sent for order #${orderDetails.id}`);
    } catch (error) {
        console.error('Email Error:', error);
    }
};

const sendWelcomeEmail = async (email, name) => {
    try {
        const settings = await getEmailSettings();
        if (!settings.smtp_user || !settings.smtp_pass || !email) return;
        const transporter = createTransport(settings);
        await transporter.sendMail({
            from: `"Qismat Store" <${settings.smtp_user}>`,
            to: email,
            subject: 'Welcome to Qismat',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border:1px solid #e5e7eb; border-radius:8px; padding:24px;">
                    <h2 style="margin:0 0 12px;color:#0f172a;">Welcome, ${name || 'there'}!</h2>
                    <p style="color:#334155;">Your account is ready. Explore new arrivals, track orders, and save favorites.</p>
                    <p style="margin-top:20px;color:#64748b;font-size:12px;">Qismat Team</p>
                </div>
            `
        });
    } catch (error) {
        console.error('Welcome email error:', error);
    }
};

const sendPasswordResetEmail = async ({ email, name, token }) => {
    try {
        const settings = await getEmailSettings();
        if (!settings.smtp_user || !settings.smtp_pass || !email || !token) return;
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const transporter = createTransport(settings);
        await transporter.sendMail({
            from: `"Qismat Store" <${settings.smtp_user}>`,
            to: email,
            subject: 'Reset your Qismat password',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border:1px solid #e5e7eb; border-radius:8px; padding:24px;">
                    <h2 style="margin:0 0 12px;color:#0f172a;">Password reset requested</h2>
                    <p style="color:#334155;">Hi ${name || 'there'}, click the button below to set a new password. This link expires in 20 minutes.</p>
                    <a href="${resetUrl}" style="display:inline-block;margin-top:14px;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:4px;">Reset password</a>
                    <p style="margin-top:14px;color:#64748b;font-size:12px;">If you did not request this, ignore this email.</p>
                </div>
            `
        });
    } catch (error) {
        console.error('Reset email error:', error);
    }
};

const sendEmailVerificationCode = async ({ email, name, code }) => {
    try {
        const settings = await getEmailSettings();
        if (!settings.smtp_user || !settings.smtp_pass || !email || !code) return;
        const transporter = createTransport(settings);
        await transporter.sendMail({
            from: `"Qismat Store" <${settings.smtp_user}>`,
            to: email,
            subject: 'Verify your email - Qismat',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border:1px solid #e5e7eb; border-radius:8px; padding:24px;">
                    <h2 style="margin:0 0 12px;color:#0f172a;">Email verification</h2>
                    <p style="color:#334155;">Hi ${name || 'there'}, use this verification code to activate your account:</p>
                    <div style="margin:18px 0;padding:12px 16px;border:1px dashed #94a3b8;border-radius:8px;background:#f8fafc;text-align:center;">
                        <p style="margin:0;font-size:28px;letter-spacing:6px;font-weight:700;color:#0f172a;">${code}</p>
                    </div>
                    <p style="color:#64748b;font-size:13px;">This code expires in 10 minutes. If you did not request this, ignore this email.</p>
                </div>
            `
        });
    } catch (error) {
        console.error('Email verification error:', error);
    }
};

module.exports = {
    sendOrderEmail,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendEmailVerificationCode,
};
