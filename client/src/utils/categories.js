/**
 * Optional Bengali copy for hero / shop labels (key = normalized category name).
 */
const CATEGORY_BN_BY_KEY = {
  mango: '(আম)',
  dates: '(খেজুর)',
  pickle: '(আচার)',
  banana: '(কলা)',
  'dragon fruit': '(ড্রাগন ফল)',
  'dragonfruit': '(ড্রাগন ফল)',
  citrus: '(সাইট্রাস)',
  general: '(সাধারণ)',
};

/**
 * English title + optional Bengali in parentheses, e.g. "Mango (আম)".
 */
export function formatCategoryHeroLabel(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  const bn = CATEGORY_BN_BY_KEY[key];
  return bn ? `${raw} ${bn}` : raw;
}

/**
 * GET /api/products/meta/categories returns `{ categories, images }`.
 * Older servers may still return a plain string[] — normalize here.
 */
export function parseCategoriesApiResponse(data) {
  if (Array.isArray(data)) {
    return { categories: data, images: {} };
  }
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const raw = data?.images;
  const images =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  return { categories, images };
}
