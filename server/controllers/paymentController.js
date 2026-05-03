const SSLCommerzPayment = require('sslcommerz-lts');
const db = require('../db');
const backendBaseUrl = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');

const getSettings = async () => {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
    });
    return settings;
};

const initPayment = async (orderData) => {
    const settings = await getSettings();
    const store_id = settings.ssl_store_id;
    const store_passwd = settings.ssl_store_password;
    const is_live = settings.ssl_is_live === 'true';

    const data = {
        total_amount: orderData.total_price,
        currency: 'BDT',
        tran_id: `REF_${Date.now()}_${orderData.id}`,
        success_url: `${backendBaseUrl}/api/payment/success/${orderData.id}`,
        fail_url: `${backendBaseUrl}/api/payment/fail/${orderData.id}`,
        cancel_url: `${backendBaseUrl}/api/payment/cancel/${orderData.id}`,
        ipn_url: `${backendBaseUrl}/api/payment/ipn`,
        shipping_method: 'Courier',
        product_name: 'E-commerce Product',
        product_category: 'General',
        product_profile: 'general',
        cus_name: orderData.customer_name,
        cus_email: orderData.customer_email || 'customer@example.com',
        cus_add1: orderData.customer_address,
        cus_phone: orderData.customer_phone,
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    return sslcz.init(data);
};

async function getSslCommerzSettings() {
    const settings = await getSettings();
    return {
        store_id: settings.ssl_store_id,
        store_passwd: settings.ssl_store_password,
        is_live: settings.ssl_is_live === 'true',
    };
}

module.exports = {
    initPayment,
    getSslCommerzSettings,
};
