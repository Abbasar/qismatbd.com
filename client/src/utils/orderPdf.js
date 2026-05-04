import { toast } from 'sonner';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseOrderItems(order) {
  let raw = order?.items;
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function deliverySummary(order) {
  if (order.delivery_method === 'point') return 'Inside Dhaka · Point delivery';
  if (order.delivery_method === 'home') return 'Inside Dhaka · Home delivery';
  const addr = String(order.customer_address || '');
  if (addr.includes('(Outside Dhaka)')) return 'Outside Dhaka';
  if (addr.includes('(Inside Dhaka)')) return 'Inside Dhaka';
  return '—';
}

function formatPlacedAt(value) {
  if (value == null || value === '') return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * Builds a printable invoice PDF for a single order (admin).
 */
export async function downloadOrderPdf(order) {
  try {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const maxTextW = pageW - margin * 2;
    let y = 16;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Order #${order.id}`, margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Status: ${order.status || '—'}`, margin, y);
    y += 6;
    doc.text(`Placed: ${formatPlacedAt(order.created_at)}`, margin, y);
    y += 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Customer', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = [
      `${order.customer_name || '—'} · ${order.customer_phone || '—'}`,
      order.customer_email ? `Email: ${order.customer_email}` : null,
      `Payment: ${order.payment_type || '—'}`,
      `Paid: ৳${Number(order.amount_paid != null ? order.amount_paid : 0).toFixed(2)} · Due: ৳${Math.max(
        0,
        Number(order.total_price || 0) - (Number.isFinite(Number(order.amount_paid)) ? Number(order.amount_paid) : 0)
      ).toFixed(2)}`,
      `Delivery: ${deliverySummary(order)}`,
    ].filter(Boolean);
    for (const line of lines) {
      const parts = doc.splitTextToSize(line, maxTextW);
      doc.text(parts, margin, y);
      y += parts.length * 5;
    }
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text('Delivery address', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const addr = String(order.customer_address || 'No address provided');
    const addrLines = doc.splitTextToSize(addr, maxTextW);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 5 + 6;

    const extras = [];
    if (order.coupon_code) extras.push(`Coupon: ${order.coupon_code}`);
    if (order.bkash_number) extras.push(`bKash / note: ${order.bkash_number}`);
    if (order.tracking_number) {
      extras.push(`Tracking: ${order.tracking_number}${order.courier_name ? ` · ${order.courier_name}` : ''}`);
    }
    if (order.steadfast_invoice) extras.push(`Steadfast invoice: ${order.steadfast_invoice}`);
    const ret = String(order.return_status || 'none').toLowerCase();
    if (ret !== 'none') extras.push(`Return: ${ret}`);
    if (ret !== 'none' && order.return_notes) {
      extras.push(`Return notes: ${order.return_notes}`);
    }
    if (order.status === 'Cancelled' && order.cancellation_reason) {
      extras.push(`Cancellation: ${order.cancellation_reason}`);
    }
    if (order.courier_dispatch_error) extras.push(`Courier error: ${order.courier_dispatch_error}`);

    if (extras.length) {
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      for (const ex of extras) {
        const pl = doc.splitTextToSize(ex, maxTextW);
        doc.text(pl, margin, y);
        y += pl.length * 4.5;
      }
      doc.setTextColor(0, 0, 0);
      y += 4;
    }

    const lineItems = parseOrderItems(order);
    const tableBody = lineItems.map((it) => {
      const variant = [it.selectedSize, it.selectedColor].filter(Boolean).join(' · ');
      const name = variant ? `${it.name} (${variant})` : it.name;
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const line = qty * price;
      return [name, String(qty), price.toFixed(2), line.toFixed(2)];
    });

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Qty', 'Unit (৳)', 'Line (৳)']],
      body: tableBody.length
        ? tableBody
        : [['No line items stored for this order', '—', '—', '—']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: maxTextW - 52 },
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 20 },
      },
    });

    const afterTable = (doc.lastAutoTable?.finalY || y) + 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryY = afterTable;
    doc.text(`Subtotal: ৳${Number(order.subtotal ?? 0).toFixed(2)}`, margin, summaryY);
    doc.text(`Shipping: ৳${Number(order.shipping_fee ?? 0).toFixed(2)}`, margin, summaryY + 6);
    if (Number(order.discount_amount) > 0) {
      doc.setTextColor(22, 101, 52);
      doc.text(`Discount: −৳${Number(order.discount_amount).toFixed(2)}`, margin, summaryY + 12);
      doc.setTextColor(0, 0, 0);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`Order total: ৳${Number(order.total_price || 0).toFixed(2)}`, margin, summaryY + (Number(order.discount_amount) > 0 ? 20 : 12));

    doc.save(`order-${order.id}.pdf`);
    toast.success('PDF downloaded');
  } catch (e) {
    console.error(e);
    toast.error('Could not generate PDF');
  }
}

/**
 * Opens a print-friendly invoice in a new tab and invokes the browser print dialog.
 */
export function printOrderSheet(order) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=840,height=960');
  if (!w) {
    toast.error('Pop-up was blocked. Allow pop-ups for this site to print.');
    return;
  }

  const lineItems = parseOrderItems(order);
  const rows =
    lineItems.length > 0
      ? lineItems
          .map((it) => {
            const variant = [it.selectedSize, it.selectedColor].filter(Boolean).join(' · ');
            const name = variant ? `${it.name} (${variant})` : it.name;
            const qty = Number(it.quantity) || 0;
            const price = Number(it.price) || 0;
            const line = qty * price;
            return `<tr><td>${esc(name)}</td><td class="c">${qty}</td><td class="r">৳${price.toFixed(2)}</td><td class="r">৳${line.toFixed(2)}</td></tr>`;
          })
          .join('')
      : `<tr><td colspan="4">${esc('No line items stored for this order')}</td></tr>`;

  const extras = [];
  if (order.coupon_code) extras.push(`Coupon: ${order.coupon_code}`);
  if (order.bkash_number) extras.push(`bKash / note: ${order.bkash_number}`);
  if (order.tracking_number) {
    extras.push(`Tracking: ${order.tracking_number}${order.courier_name ? ` · ${order.courier_name}` : ''}`);
  }
  if (order.steadfast_invoice) extras.push(`Steadfast invoice: ${order.steadfast_invoice}`);
  const ret = String(order.return_status || 'none').toLowerCase();
  if (ret !== 'none') extras.push(`Return: ${ret}`);
  if (ret !== 'none' && order.return_notes) extras.push(`Return notes: ${order.return_notes}`);
  if (order.status === 'Cancelled' && order.cancellation_reason) {
    extras.push(`Cancellation: ${order.cancellation_reason}`);
  }
  if (order.courier_dispatch_error) extras.push(`Courier error: ${order.courier_dispatch_error}`);

  const paid = Number(order.amount_paid != null ? order.amount_paid : 0);
  const due = Math.max(
    0,
    Number(order.total_price || 0) - (Number.isFinite(paid) ? paid : 0)
  );

  const extrasHtml = extras.length
    ? `<div class="extras">${extras.map((x) => `<p>${esc(x)}</p>`).join('')}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(`Order #${order.id}`)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 14mm; color: #0f172a; font-size: 10.5pt; line-height: 1.45; }
    h1 { font-size: 17pt; margin: 0 0 6px; }
    .muted { color: #64748b; font-size: 10pt; margin: 0 0 14px; }
    h2 { font-size: 11pt; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
    p { margin: 4px 0; }
    .box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin: 8px 0; background: #fafafa; }
    .extras p { font-size: 9.5pt; color: #334155; margin: 3px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 8px; }
    th, td { border: 1px solid #e2e8f0; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #0f172a; color: #fff; font-weight: 600; }
    .c { text-align: center; width: 3rem; }
    .r { text-align: right; white-space: nowrap; width: 5.5rem; }
    .totals { margin-top: 14px; font-size: 10.5pt; }
    .totals p { display: flex; justify-content: space-between; max-width: 280px; margin-left: auto; }
    .totals .grand { font-weight: 700; font-size: 12pt; margin-top: 8px; padding-top: 8px; border-top: 2px solid #0f172a; }
    .discount { color: #166534; }
    .no-print { margin: 0 0 12px; font-size: 10pt; color: #64748b; }
    @media print { body { padding: 10mm; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <p class="no-print">Print dialog will open automatically. Choose your printer and press Print.</p>
  <h1>Order #${esc(String(order.id))}</h1>
  <p class="muted">Status: <strong>${esc(order.status || '—')}</strong> · Placed: ${esc(formatPlacedAt(order.created_at))}</p>

  <h2>Customer</h2>
  <p>${esc(order.customer_name || '—')} · ${esc(order.customer_phone || '—')}</p>
  ${order.customer_email ? `<p>${esc(`Email: ${order.customer_email}`)}</p>` : ''}
  <p>${esc(`Payment: ${order.payment_type || '—'}`)}</p>
  <p>${esc(`Paid: ৳${paid.toFixed(2)} · Due: ৳${due.toFixed(2)}`)}</p>
  <p>${esc(`Delivery: ${deliverySummary(order)}`)}</p>

  <h2>Delivery address</h2>
  <div class="box">${esc(String(order.customer_address || 'No address provided')).replace(/\n/g, '<br/>')}</div>

  ${extrasHtml}

  <h2>Line items</h2>
  <table>
    <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit (৳)</th><th class="r">Line (৳)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <p><span>Subtotal</span><span>৳${Number(order.subtotal ?? 0).toFixed(2)}</span></p>
    <p><span>Shipping</span><span>৳${Number(order.shipping_fee ?? 0).toFixed(2)}</span></p>
    ${
      Number(order.discount_amount) > 0
        ? `<p class="discount"><span>Discount</span><span>−৳${Number(order.discount_amount).toFixed(2)}</span></p>`
        : ''
    }
    <p class="grand"><span>Order total</span><span>৳${Number(order.total_price || 0).toFixed(2)}</span></p>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 150);
    });
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
