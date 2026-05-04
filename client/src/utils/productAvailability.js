/** Product has a future restock / ship-by date (pre-order). */
export function isPreorderProduct(product) {
  if (!product) return false;
  const d = product.preorder_available_date;
  return d != null && String(d).trim() !== '';
}

/**
 * Storefront stock badge — never shows unit counts.
 * "Pre-order" when out of stock but a preorder date is set (still purchasable).
 */
export function customerFacingStockLabel(product) {
  if (!product) return 'Out of stock';
  if (Number(product.stock) > 0) return 'In stock';
  if (isPreorderProduct(product)) return 'Pre-order';
  return 'Out of stock';
}

/** Customer can add to cart / pre-order (in stock OR pre-order with date). */
export function canPurchaseProduct(product) {
  if (!product) return false;
  if (Number(product.stock) > 0) return true;
  return isPreorderProduct(product);
}

export function formatPreorderDateLabel(isoDate) {
  if (!isoDate) return '';
  try {
    const s = String(isoDate).trim();
    const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(isoDate);
  }
}

/** Max units per line: real stock, or uncapped for pre-order-only items (client-side cap). */
export function maxOrderQuantity(product, preorderCap = 99) {
  if (!product) return 0;
  if (Number(product.stock) > 0) return Number(product.stock);
  if (isPreorderProduct(product)) return preorderCap;
  return 0;
}

/** Min/max selling price when `pricing_options` exists; otherwise base `price`. */
export function displayPriceRange(product) {
  if (!product) return { min: 0, max: 0, single: true };
  const opts = Array.isArray(product.pricing_options) ? product.pricing_options : [];
  const nums = opts
    .map((o) => Number(o?.price))
    .filter((n) => Number.isFinite(n));
  if (nums.length) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { min, max, single: min === max };
  }
  const p = Number(product.price);
  const base = Number.isFinite(p) ? p : 0;
  return { min: base, max: base, single: true };
}

/** For list quick-add: use first unit row so cart price / line key match checkout. */
export function withDefaultUnitSelection(product) {
  if (!product) return product;
  const opts = Array.isArray(product.pricing_options) ? product.pricing_options : [];
  if (!opts.length) return product;
  const first = opts[0];
  const label = String(first?.label || '').trim();
  const pr = Number(first?.price);
  return {
    ...product,
    price: Number.isFinite(pr) ? pr : Number(product.price),
    selectedSize: label || undefined,
  };
}
