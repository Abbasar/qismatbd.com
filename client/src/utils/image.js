import { API_BASE } from './api';

/** Main image or first gallery entry (matches API `normalizeProduct` `images` list). */
export function pickProductCoverImage(product) {
  if (!product || typeof product !== 'object') return '';
  const fromMerged = Array.isArray(product.images)
    ? product.images.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (fromMerged.length) return fromMerged[0];
  return String(product.image || '').trim();
}

export const resolveImageUrl = (image) => {
  if (!image) return 'https://via.placeholder.com/600x400';
  let s = String(image).trim();
  if (!s) return 'https://via.placeholder.com/600x400';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  // DB sometimes stores "uploads/foo.jpg" without a leading slash
  if (!s.startsWith('/') && /^uploads[/\\]/i.test(s)) {
    s = `/${s.replace(/\\/g, '/')}`;
  }
  if (s.startsWith('/images/')) return s;
  if (s.startsWith('/uploads/')) return `${API_BASE}${s}`;
  return `${API_BASE}/uploads/${s}`;
};
