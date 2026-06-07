/**
 * Meta Pixel / CAPI attribution helpers (no UI) — fbp, fbc, event_source_url, dedup event_id.
 */

export function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function writeCookie(name, value, maxAgeSec = 7776000) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSec}; path=/; SameSite=Lax`;
}

/** _fbc from cookie or fbclid URL param (Meta Parameter Builder pattern). */
export function getMetaFbc() {
  const existing = readCookie('_fbc');
  if (existing) return existing;
  if (typeof window === 'undefined') return '';
  const fbclid = new URLSearchParams(window.location.search).get('fbclid');
  if (!fbclid) return '';
  const fbc = `fb.1.${Date.now()}.${fbclid}`;
  writeCookie('_fbc', fbc);
  return fbc;
}

export function getMetaFbp() {
  return readCookie('_fbp');
}

export function getMetaEventSourceUrl() {
  if (typeof window === 'undefined') return '';
  return window.location.href.split('#')[0];
}

/** Unique event_id shared by browser Pixel + server CAPI for deduplication. */
export function createMetaEventId(prefix) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

/** Extra fields for POST /api/orders — improves CAPI match quality. */
export function metaOrderPayload() {
  return {
    facebook_fbp: getMetaFbp(),
    facebook_fbc: getMetaFbc(),
    facebook_event_source_url: getMetaEventSourceUrl(),
  };
}
