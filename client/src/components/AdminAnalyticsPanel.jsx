import { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import {
  ADMIN_ANALYTICS_PREFS_LS_KEY,
  ORDER_STATUSES,
  defaultAdminAnalyticsPrefs,
  filterOrdersForAnalytics,
  computeAdjustedRevenue,
} from '../utils/adminAnalytics';

const STATUS_COLORS = {
  Pending: '#ca8a04',
  Processing: '#2563eb',
  Shipped: '#7c3aed',
  Delivered: '#16a34a',
  Cancelled: '#dc2626',
};

function orderDay(o) {
  return String(o?.created_at ?? '').slice(0, 10);
}

function piePaths(slices, cx, cy, r) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  return slices.map((d) => {
    const slice = (d.value / total) * 2 * Math.PI;
    const start = angle;
    angle += slice;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { ...d, path };
  });
}

/** Matches server IN_STOCK_SENTINEL */
const IN_STOCK_SENTINEL = 9999;

function stockToAvailability(product) {
  const stock = Number(product?.stock);
  if (stock > 0) return 'in';
  if (product?.preorder_available_date && String(product.preorder_available_date).trim()) return 'preorder';
  return 'out';
}

export default function AdminAnalyticsPanel({
  orders,
  products,
  users,
  authHeaders,
  onRefresh,
  exportToCsv,
  analyticsPrefs: prefs,
  setAnalyticsPrefs: setPrefs,
}) {
  const setField = useCallback((key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, [setPrefs]);

  const filteredOrders = useMemo(() => filterOrdersForAnalytics(orders, prefs), [orders, prefs]);

  const { rawRevenue, adjustedRevenue } = useMemo(
    () => computeAdjustedRevenue(filteredOrders, prefs),
    [filteredOrders, prefs]
  );

  const analytics = useMemo(() => {
    const delivered = filteredOrders.filter((o) => o.status === 'Delivered').length;
    const pending = filteredOrders.filter((o) => o.status === 'Pending').length;
    const cancelled = filteredOrders.filter((o) => o.status === 'Cancelled').length;
    const outStrict = products.filter((p) => stockToAvailability(p) === 'out').length;
    const outLoose = products.filter((p) => Number(p.stock) <= 0).length;
    const outOfStock = prefs.countPreorderAsOut ? outLoose : outStrict;
    const n = filteredOrders.length;
    const avgOrderValue = n ? adjustedRevenue / n : 0;
    return {
      delivered,
      pending,
      cancelled,
      outOfStock,
      avgOrderValue,
      orderCount: n,
    };
  }, [filteredOrders, products, adjustedRevenue, prefs.countPreorderAsOut]);

  const statusCounts = useMemo(() => {
    const map = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    filteredOrders.forEach((o) => {
      if (map[o.status] != null) map[o.status] += 1;
    });
    return ORDER_STATUSES.map((status) => ({
      status,
      value: map[status],
      color: STATUS_COLORS[status] || '#64748b',
    })).filter((x) => x.value > 0);
  }, [filteredOrders]);

  const salesByDay = useMemo(() => {
    const n = Math.min(90, Math.max(1, Math.floor(Number(prefs.trendDays)) || 7));
    const keys = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      keys.push(d.toISOString().slice(0, 10));
    }
    const map = Object.fromEntries(keys.map((k) => [k, 0]));
    filteredOrders.forEach((o) => {
      const day = orderDay(o);
      if (day in map) map[day] += Number(o.total_price || 0);
    });
    const max = Math.max(...Object.values(map), 1);
    return keys.map((day) => ({ day, amount: map[day], pct: (map[day] / max) * 100 }));
  }, [filteredOrders, prefs.trendDays]);

  const linePoints = useMemo(() => {
    if (!salesByDay.length) return '';
    const w = 360;
    const h = 100;
    const pad = 8;
    const max = Math.max(...salesByDay.map((d) => d.amount), 1);
    return salesByDay
      .map((d, i) => {
        const x = pad + (i / Math.max(salesByDay.length - 1, 1)) * (w - pad * 2);
        const y = h - pad - (d.amount / max) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [salesByDay]);

  const resetFiltersAndMath = () => {
    const next = defaultAdminAnalyticsPrefs();
    setPrefs(next);
    localStorage.removeItem(ADMIN_ANALYTICS_PREFS_LS_KEY);
    toast.success('Analytics filters and calculations reset');
  };

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date();
    if (days === null) {
      setPrefs((p) => ({ ...p, dateFrom: '', dateTo: '' }));
      return;
    }
    start.setDate(start.getDate() - (days - 1));
    setPrefs((p) => ({
      ...p,
      dateFrom: start.toISOString().slice(0, 10),
      dateTo: end.toISOString().slice(0, 10),
    }));
  };

  const toggleStatusExclude = (status) => {
    setPrefs((p) => {
      const ex = Array.isArray(p.excludedStatuses) ? [...p.excludedStatuses] : [];
      const next = ex.includes(status) ? ex.filter((s) => s !== status) : [...ex, status];
      return { ...p, excludedStatuses: next };
    });
  };

  const statusLabel =
    prefs.excludedStatuses?.length > 0
      ? `Hidden: ${prefs.excludedStatuses.join(', ')}`
      : 'All statuses (none hidden)';

  const exportFilteredOrdersCsv = () => {
    exportToCsv('analytics-filtered-orders.csv', [
      ['ID', 'Created', 'Customer', 'Phone', 'Status', 'Total (৳)'],
      ...filteredOrders.map((o) => [
        o.id,
        orderDay(o),
        o.customer_name,
        o.customer_phone,
        o.status,
        o.total_price,
      ]),
    ]);
    toast.success('CSV downloaded');
  };

  const buildSummaryRows = () => [
    ['Date from', prefs.dateFrom || '—'],
    ['Date to', prefs.dateTo || '—'],
    ['Statuses', statusLabel],
    ['Trend window (days)', String(prefs.trendDays)],
    ['Revenue multiplier %', String(prefs.revenueMultiplierPct)],
    ['Revenue flat adjust (৳)', String(prefs.revenueFlatAdjust)],
    ['Raw revenue (৳)', rawRevenue.toFixed(2)],
    ['Adjusted revenue (৳)', adjustedRevenue.toFixed(2)],
    ['Orders in scope', String(analytics.orderCount)],
    ['Delivered', String(analytics.delivered)],
    ['Pending', String(analytics.pending)],
    ['Cancelled', String(analytics.cancelled)],
    ['Out of stock (products)', String(analytics.outOfStock)],
    ['Avg order value (৳)', analytics.avgOrderValue.toFixed(2)],
  ];

  const exportAnalyticsExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const sum = wb.addWorksheet('Summary');
      sum.addRow(['Qismat — Analytics export', new Date().toISOString()]);
      sum.addRow([]);
      buildSummaryRows().forEach((r) => sum.addRow(r));
      const ord = wb.addWorksheet('Orders');
      ord.addRow(['ID', 'Created', 'Customer', 'Phone', 'Status', 'Total']);
      filteredOrders.forEach((o) => {
        ord.addRow([o.id, orderDay(o), o.customer_name, o.customer_phone, o.status, Number(o.total_price || 0)]);
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel file downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Excel export failed');
    }
  };

  const exportAnalyticsPdf = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('Qismat — Business analytics', 14, 16);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
      autoTable(doc, {
        startY: 26,
        head: [['Metric', 'Value']],
        body: buildSummaryRows(),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [15, 23, 42] },
      });
      const finalY = doc.lastAutoTable?.finalY || 40;
      autoTable(doc, {
        startY: finalY + 10,
        head: [['ID', 'Date', 'Customer', 'Status', 'Total']],
        body: filteredOrders.slice(0, 200).map((o) => [
          o.id,
          orderDay(o),
          String(o.customer_name || '').slice(0, 28),
          o.status,
          Number(o.total_price || 0).toFixed(2),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [15, 23, 42] },
      });
      if (filteredOrders.length > 200) {
        doc.setFontSize(8);
        doc.text(`…and ${filteredOrders.length - 200} more rows (export Excel for full list).`, 14, doc.lastAutoTable.finalY + 8);
      }
      doc.save(`analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF downloaded');
    } catch (e) {
      console.error(e);
      toast.error('PDF export failed');
    }
  };

  const deleteAllOrders = async () => {
    const typed = window.prompt(
      'This permanently deletes every order from the database. Type exactly: DELETE ALL ORDERS'
    );
    if (typed !== 'DELETE ALL ORDERS') {
      if (typed != null) toast.error('Phrase did not match — nothing was deleted');
      return;
    }
    if (!window.confirm('Last chance: all orders and linked payment rows will be removed. Continue?')) return;
    try {
      const res = await fetchWithTimeout(apiUrl('/api/orders/admin/all'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ confirmPhrase: 'DELETE ALL ORDERS' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || res.statusText);
      toast.success(data.message || `Removed ${data.deleted ?? 0} orders`);
      onRefresh?.();
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not delete orders');
    }
  };

  const pie = piePaths(statusCounts, 100, 100, 78);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Business analytics</h2>
          <p className="mt-1 text-sm text-slate-600">
            Filter orders by date and status, tune how revenue is calculated, export reports, and reset the workspace or
            order history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetFiltersAndMath}
            className="rounded-sm border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            Reset filters &amp; math
          </button>
        </div>
      </div>

      <div className="rounded-sm border border-slate-200 bg-slate-50/80 p-5">
        <p className="text-sm font-semibold text-slate-900">Filters</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date from
            <input
              type="date"
              value={prefs.dateFrom}
              onChange={(e) => setField('dateFrom', e.target.value)}
              className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date to
            <input
              type="date"
              value={prefs.dateTo}
              onChange={(e) => setField('dateTo', e.target.value)}
              className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick range</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setQuickRange(d)}
                  className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Last {d} days
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuickRange(null)}
                className="rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                All time
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order status</p>
          <p className="mt-1 text-[11px] text-slate-500">Included by default. Click a status to hide it from totals and charts.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ORDER_STATUSES.map((s) => {
              const hidden = prefs.excludedStatuses?.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatusExclude(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    !hidden
                      ? 'border-slate-800 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-400 line-through'
                  }`}
                  style={!hidden ? { boxShadow: `inset 0 0 0 1px ${STATUS_COLORS[s]}` } : undefined}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Trend chart length (days)
            <select
              value={prefs.trendDays}
              onChange={(e) => setField('trendDays', Number(e.target.value))}
              className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Revenue multiplier (%)
            <input
              type="number"
              min={0}
              step={1}
              value={prefs.revenueMultiplierPct}
              onChange={(e) => setField('revenueMultiplierPct', e.target.value)}
              className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Revenue flat adjust (৳)
            <input
              type="number"
              step={0.01}
              value={prefs.revenueFlatAdjust}
              onChange={(e) => setField('revenueFlatAdjust', e.target.value)}
              className="mt-1 w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={prefs.countPreorderAsOut}
            onChange={(e) => setField('countPreorderAsOut', e.target.checked)}
            className="rounded border-slate-300"
          />
          Count preorder (stock 0 + date) as &quot;out of stock&quot; in the inventory card
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Adjusted revenue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">৳{adjustedRevenue.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Raw: ৳{rawRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Delivered</p>
          <p className="mt-2 text-2xl font-semibold text-sage-600">{analytics.delivered}</p>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="mt-2 text-2xl font-semibold text-peach-700">{analytics.pending}</p>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Avg order (adjusted)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">৳{analytics.avgOrderValue.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-slate-500">{analytics.orderCount} orders in scope</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Cancelled (in scope)</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{analytics.cancelled}</p>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Out of stock (products)</p>
          <p className="mt-2 text-2xl font-semibold text-brand-600">{analytics.outOfStock}</p>
          <p className="mt-1 text-[11px] text-slate-500">Sentinel in-stock = {IN_STOCK_SENTINEL}</p>
        </div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Products / users</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{products.length} SKUs</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-sm border border-slate-200 bg-white p-6 shadow-sm"
        >
          <p className="text-sm font-semibold text-slate-900">Sales trend (bar)</p>
          <p className="text-xs text-slate-500">Filtered orders — ৳ by day</p>
          <div className="mt-6 flex h-52 items-end gap-1 sm:gap-2">
            {salesByDay.map(({ day, amount, pct }) => (
              <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-10 rounded-t-xl bg-gradient-to-t from-slate-900 to-brand-500 transition-all sm:max-w-12"
                  style={{ height: `${Math.max(pct, 4)}%` }}
                  title={`${day}: ৳${amount.toFixed(0)}`}
                />
                <span className="truncate text-[10px] font-medium text-slate-400">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="rounded-sm border border-slate-200 bg-white p-6 shadow-sm"
        >
          <p className="text-sm font-semibold text-slate-900">Sales trend (line)</p>
          <p className="text-xs text-slate-500">Same data as bars</p>
          <div className="mt-4">
            <svg viewBox="0 0 360 108" className="h-44 w-full text-brand-600">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={linePoints}
              />
            </svg>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="rounded-sm border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Orders by status (pie)</p>
            <p className="text-xs text-slate-500">Filtered set — slice area = count</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center sm:gap-10">
          <svg width="200" height="200" viewBox="0 0 200 200" className="shrink-0">
            {pie.length === 0 ? (
              <text x="100" y="100" textAnchor="middle" className="fill-slate-400 text-xs">
                No orders in scope
              </text>
            ) : (
              pie.map((s) => <path key={s.status} d={s.path} fill={s.color} stroke="#fff" strokeWidth="1" />)
            )}
          </svg>
          <ul className="flex flex-col gap-2 text-sm">
            {statusCounts.map((s) => (
              <li key={s.status} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="font-medium text-slate-800">{s.status}</span>
                <span className="text-slate-500">({s.value})</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <div>
        <p className="text-sm font-semibold text-slate-900">Export</p>
        <p className="text-xs text-slate-500">Reports use the current filters and adjusted revenue summary.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportFilteredOrdersCsv}
            className="rounded-sm bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Filtered orders CSV
          </button>
          <button
            type="button"
            onClick={() => {
              exportToCsv('analytics-summary.csv', [['Metric', 'Value'], ...buildSummaryRows()]);
              toast.success('Summary CSV downloaded');
            }}
            className="rounded-sm bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Summary CSV
          </button>
          <button
            type="button"
            onClick={exportAnalyticsExcel}
            className="rounded-sm border border-emerald-700 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
          >
            Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={exportAnalyticsPdf}
            className="rounded-sm border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-900 hover:bg-red-100"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() =>
              exportToCsv('products-export.csv', [
                ['ID', 'Name', 'Price', 'Stock'],
                ...products.map((p) => [p.id, p.name, p.price, p.stock]),
              ])
            }
            className="rounded-sm border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            All products CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportToCsv('orders-export.csv', [
                ['ID', 'Customer', 'Status', 'Total'],
                ...orders.map((o) => [o.id, o.customer_name, o.status, o.total_price]),
              ])
            }
            className="rounded-sm border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            All orders CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportToCsv('users-export.csv', [
                ['ID', 'Name', 'Email', 'Role'],
                ...(users || []).map((u) => [u.id, u.name, u.email, u.role]),
              ])
            }
            className="rounded-sm border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            All users CSV
          </button>
        </div>
      </div>

      <div className="rounded-sm border border-red-200 bg-red-50/60 p-5">
        <p className="text-sm font-semibold text-red-900">Danger zone — database</p>
        <p className="mt-1 text-xs text-red-800/90">
          Deletes every order row (payment rows cascade). Products, users, and settings are untouched. You will be asked to
          type a confirmation phrase.
        </p>
        <button
          type="button"
          onClick={deleteAllOrders}
          className="mt-4 rounded-sm border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-900 hover:bg-red-100"
        >
          Delete all orders &amp; restart analytics data
        </button>
      </div>
    </div>
  );
}
