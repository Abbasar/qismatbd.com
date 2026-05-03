/** Normalize JSON columns from MySQL for client-style product objects (wishlist, etc.). */
function parseProductRow(row) {
  if (!row) return row;
  const o = { ...row };
  ['gallery', 'sizes', 'colors'].forEach((k) => {
    let v = o[k];
    if (v == null || v === '') {
      o[k] = [];
      return;
    }
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        o[k] = [];
        return;
      }
    }
    o[k] = Array.isArray(v) ? v : [];
  });
  let po = o.pricing_options;
  if (po == null || po === '') {
    o.pricing_options = [];
  } else if (typeof po === 'string') {
    try {
      const parsed = JSON.parse(po);
      o.pricing_options = Array.isArray(parsed) ? parsed : [];
    } catch {
      o.pricing_options = [];
    }
  } else {
    o.pricing_options = Array.isArray(po) ? po : [];
  }
  return o;
}

module.exports = { parseProductRow };
