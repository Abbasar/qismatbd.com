const isProd = process.env.NODE_ENV === 'production';

/** Generic message for API clients; full error only in development. */
function sendServerError(res, message, err) {
  console.error(message, err);
  const body = { message };
  if (!isProd && err?.message) body.error = err.message;
  return res.status(500).json(body);
}

module.exports = { sendServerError, isProd };
