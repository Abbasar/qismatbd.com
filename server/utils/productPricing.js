/**
 * Per-unit / weight options: [{ label: "5kg", price: 100 }, ...] in products.pricing_options
 */

function parsePricingOptions(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && (x.label != null || x.price != null));
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {object} productRow - DB row with price, pricing_options
 * @param {{ selectedSize?: string, selectedOption?: string }} itemFromCart
 */
function resolveUnitPrice(productRow, itemFromCart) {
  const opts = parsePricingOptions(productRow.pricing_options);
  const label = String(itemFromCart?.selectedSize || itemFromCart?.selectedOption || '').trim();
  if (opts.length && label) {
    const o = opts.find((x) => String(x.label || '').trim() === label);
    if (o != null && o.price != null && o.price !== '') {
      const n = Number(o.price);
      if (Number.isFinite(n)) return n;
    }
  }
  return Number(productRow.price);
}

module.exports = { parsePricingOptions, resolveUnitPrice };
