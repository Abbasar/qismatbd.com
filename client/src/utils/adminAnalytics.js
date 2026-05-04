export const ADMIN_ANALYTICS_PREFS_LS_KEY = 'qismat_admin_analytics_v1';

export const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

export function defaultAdminAnalyticsPrefs() {
  return {
    dateFrom: '',
    dateTo: '',
    trendDays: 7,
    excludedStatuses: [],
    revenueMultiplierPct: 100,
    revenueFlatAdjust: 0,
    countPreorderAsOut: true,
  };
}

export function loadAdminAnalyticsPrefs() {
  try {
    const raw = localStorage.getItem(ADMIN_ANALYTICS_PREFS_LS_KEY);
    if (!raw) return defaultAdminAnalyticsPrefs();
    const p = JSON.parse(raw);
    const base = { ...defaultAdminAnalyticsPrefs(), ...p };
    if (Array.isArray(p.statusMask) && p.statusMask.length > 0 && !Array.isArray(p.excludedStatuses)) {
      base.excludedStatuses = ORDER_STATUSES.filter((s) => !p.statusMask.includes(s));
    }
    delete base.statusMask;
    if (!Array.isArray(base.excludedStatuses)) base.excludedStatuses = [];
    return base;
  } catch {
    return defaultAdminAnalyticsPrefs();
  }
}

function orderDay(o) {
  return String(o?.created_at ?? '').slice(0, 10);
}

export function filterOrdersForAnalytics(orders, prefs) {
  const ex = Array.isArray(prefs?.excludedStatuses) ? prefs.excludedStatuses : [];
  return orders.filter((o) => {
    const day = orderDay(o);
    if (prefs.dateFrom && day && day < prefs.dateFrom) return false;
    if (prefs.dateTo && day && day > prefs.dateTo) return false;
    if (ex.length && ex.includes(o.status)) return false;
    return true;
  });
}

export function computeAdjustedRevenue(filteredOrders, prefs) {
  const rawRevenue = filteredOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
  const mult = Number(prefs.revenueMultiplierPct);
  const safeMult = Number.isFinite(mult) ? Math.max(0, mult) / 100 : 1;
  const flat = Number(prefs.revenueFlatAdjust);
  const safeFlat = Number.isFinite(flat) ? flat : 0;
  const adjustedRevenue = rawRevenue * safeMult + safeFlat;
  return { rawRevenue, adjustedRevenue, safeMult, safeFlat };
}

/** True when revenue card should show a “filtered” hint (not plain store-wide totals). */
export function analyticsPrefsAffectsRevenueDisplay(prefs) {
  const d = defaultAdminAnalyticsPrefs();
  return (
    !!prefs.dateFrom ||
    !!prefs.dateTo ||
    (prefs.excludedStatuses?.length ?? 0) > 0 ||
    Number(prefs.revenueMultiplierPct) !== Number(d.revenueMultiplierPct) ||
    Number(prefs.revenueFlatAdjust || 0) !== Number(d.revenueFlatAdjust || 0)
  );
}
