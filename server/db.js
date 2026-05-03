const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'qismyirz_qismat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
};

let pool = mysql.createPool(config);

const isRecoverableError = (error) => {
  if (!error) return false;
  const recoverableCodes = new Set([
    'PROTOCOL_CONNECTION_LOST',
    'ECONNRESET',
    'ECONNREFUSED',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    'ETIMEDOUT',
  ]);
  return recoverableCodes.has(error.code);
};

const recreatePool = async () => {
  try {
    await pool.end();
  } catch (error) {
    console.warn('Previous DB pool close warning:', error.message);
  }
  pool = mysql.createPool(config);
};

const queryWithRetry = async (sql, params = []) => {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (!isRecoverableError(error)) throw error;
    console.warn(`DB recoverable error (${error.code}), recreating pool and retrying query.`);
    await recreatePool();
    return pool.query(sql, params);
  }
};

const executeWithRetry = async (sql, params = []) => {
  try {
    return await pool.execute(sql, params);
  } catch (error) {
    if (!isRecoverableError(error)) throw error;
    console.warn(`DB recoverable error (${error.code}), recreating pool and retrying execute.`);
    await recreatePool();
    return pool.execute(sql, params);
  }
};

const ping = async () => queryWithRetry('SELECT 1 AS ok');

module.exports = {
  query: queryWithRetry,
  execute: executeWithRetry,
  ping,
  getConnection: async () => pool.getConnection(),
};
