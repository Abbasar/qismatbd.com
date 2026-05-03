/**
 * Computes cart subtotal from DB prices and eligible subtotal for scoped coupons.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} conn
 * @param {Array<{ id?: number, product_id?: number, quantity?: number }>} cartItems
 * @param {object} couponRow — row from `coupons` with optional restrict_product_ids / restrict_categories (JSON)
 * @returns {{ full: number, eligible: number, lines: Array<{ productId: number, line: number, category: string }> }}
 */
async function computeCartSubtotalsForCoupon(conn, cartItems, couponRow) {
  let full = 0;
  const lines = [];

  for (const item of cartItems) {
    const pid = item.id ?? item.product_id;
    if (pid == null) continue;
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const [prows] = await conn.query('SELECT id, price, category FROM products WHERE id = ?', [pid]);
    if (!prows.length) continue;
    const p = prows[0];
    const line = Number(p.price) * qty;
    full += line;
    lines.push({
      productId: Number(p.id),
      line: Number(line.toFixed(2)),
      category: String(p.category || '').trim(),
    });
  }

  full = Number(full.toFixed(2));

  let pidRestrictions = couponRow?.restrict_product_ids;
  let catRestrictions = couponRow?.restrict_categories;
  if (typeof pidRestrictions === 'string') {
    try {
      pidRestrictions = JSON.parse(pidRestrictions);
    } catch {
      pidRestrictions = null;
    }
  }
  if (typeof catRestrictions === 'string') {
    try {
      catRestrictions = JSON.parse(catRestrictions);
    } catch {
      catRestrictions = null;
    }
  }

  const hasPids = Array.isArray(pidRestrictions) && pidRestrictions.length > 0;
  const hasCats = Array.isArray(catRestrictions) && catRestrictions.length > 0;

  if (!hasPids && !hasCats) {
    return { full, eligible: full, lines };
  }

  const pidSet = hasPids ? new Set(pidRestrictions.map((x) => Number(x))) : null;
  const catSet = hasCats
    ? new Set(catRestrictions.map((c) => String(c).trim().toLowerCase()))
    : null;

  let eligible = 0;
  for (const ln of lines) {
    const inP = hasPids && pidSet.has(Number(ln.productId));
    const inC = hasCats && catSet.has(String(ln.category || '').toLowerCase());
    if (hasPids && hasCats) {
      if (inP || inC) eligible += ln.line;
    } else if (hasPids) {
      if (inP) eligible += ln.line;
    } else if (hasCats) {
      if (inC) eligible += ln.line;
    }
  }

  return { full, eligible: Number(eligible.toFixed(2)), lines };
}

module.exports = { computeCartSubtotalsForCoupon };
