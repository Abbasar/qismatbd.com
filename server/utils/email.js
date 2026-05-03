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

const sendOrderEmail = async (customerEmail, orderDetails) => {
    try {
        const settings = await getEmailSettings();
        if (!settings.smtp_user || !settings.smtp_pass) {
            console.warn('SMTP settings not configured. Skipping email.');
            return;
        }

        const transporter = createTransport(settings);

        const mailOptions = {
            from: `"Qismat Store" <${settings.smtp_user}>`,
            to: [customerEmail, settings.admin_email].filter(Boolean),
            subject: `Order Confirmation - #${orderDetails.id}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #10b981; text-align: center;">Order Confirmed!</h2>
                    <p>Hello ${orderDetails.customer_name},</p>
                    <p>Thank you for your order. We are processing it now.</p>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Order Summary</h3>
                        <p><strong>Order ID:</strong> #${orderDetails.id}</p>
                        <p><strong>Total Amount:</strong> ৳${orderDetails.total_price}</p>
                        <p><strong>Payment Method:</strong> ${orderDetails.payment_type}</p>
                        <p><strong>Address:</strong> ${orderDetails.customer_address}</p>
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
