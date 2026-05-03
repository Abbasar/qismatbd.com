/**
 * In dev, same-origin `/api` → Vite proxy.
 * In prod: `VITE_API_URL` if set; empty string in `.env` means same-origin `/api` (Apache/nginx reverse proxy).
 * Otherwise default `http://localhost:4000`.
 */
export const API_BASE = import.meta.env.DEV
  ? ''
  : (() => {
      const v = import.meta.env.VITE_API_URL;
      if (v === '') return '';
      if (v != null && String(v).trim() !== '') return String(v).replace(/\/$/, '');
      return 'http://localhost:4000';
    })();

export const apiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const DEFAULT_FETCH_TIMEOUT_MS = 18_000;

/**
 * Browser fetch has no timeout; stalled TCP/proxy/API leaves spinners forever.
 * Abort after `ms` so UI can recover and show errors/empty state.
 */
export async function fetchWithTimeout(resource, init = {}, ms = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(resource, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
