/**
 * Visitor IP for Meta CAPI / logging — works behind cPanel, nginx, Cloudflare.
 * Meta: client_ip_address must be real IPv4/IPv6, never hashed.
 */

const PRIVATE_IPV4 =
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0$)/;
const PRIVATE_IPV6 = /^(::1$|::$|^fe80:|^fc00:|^fd)/i;

function normalizeIp(raw) {
  if (!raw) return '';
  let ip = String(raw).trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.includes('%')) ip = ip.split('%')[0];
  return ip;
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip.includes(':')) return PRIVATE_IPV6.test(ip);
  return PRIVATE_IPV4.test(ip);
}

function isValidIp(ip) {
  if (!ip) return false;
  if (ip.includes(':')) {
    return /^[0-9a-f:]+$/i.test(ip) && ip.length <= 45;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function pickFromForwarded(header) {
  if (!header) return '';
  const parts = String(header)
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean);
  const publicIp = parts.find((ip) => isValidIp(ip) && !isPrivateIp(ip));
  if (publicIp) return publicIp;
  const anyValid = parts.find((ip) => isValidIp(ip));
  return anyValid || parts[0] || '';
}

/**
 * Best-effort real client IP (prefer public; IPv6 OK per Meta docs).
 */
function getClientIp(req) {
  if (!req) return '';

  const headers = [
    'cf-connecting-ip',
    'true-client-ip',
    'x-real-ip',
    'x-forwarded-for',
    'x-client-ip',
  ];

  for (const name of headers) {
    const val = req.headers[name];
    if (!val) continue;
    const ip =
      name === 'x-forwarded-for' ? pickFromForwarded(val) : normalizeIp(String(val).split(',')[0]);
    if (isValidIp(ip)) return ip;
  }

  const candidates = [req.ip, req.socket?.remoteAddress, req.connection?.remoteAddress].filter(Boolean);
  for (const raw of candidates) {
    const ip = normalizeIp(raw);
    if (isValidIp(ip)) return ip;
  }

  return '';
}

module.exports = { getClientIp, normalizeIp, isPrivateIp, isValidIp };
