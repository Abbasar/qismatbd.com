import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { getAuthHeader } from '../utils/auth';
import { getCurrentUser } from '../utils/auth';

function OrderSuccess() {
  const location = useLocation();
  const purchasePixelFired = useRef(false);
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState(location.state?.order || null);
  const [orderLoadFailed, setOrderLoadFailed] = useState(false);
  const user = getCurrentUser();
  const orderId = useMemo(() => location.state?.orderId || searchParams.get('orderId'), [location.state, searchParams]);

  useEffect(() => {
    const loadOrder = async () => {
      if (order) return;
      if (!orderId) {
        setOrderLoadFailed(true);
        return;
      }
      try {
        const response = await fetchWithTimeout(apiUrl(`/api/orders/${orderId}`), { headers: getAuthHeader() });
        if (!response.ok) throw new Error('Unable to load order');
        setOrder(await response.json());
      } catch (error) {
        console.error('Order load error:', error);
        setOrderLoadFailed(true);
      }
    };
    loadOrder();
  }, [orderId, order]);

  useEffect(() => {
    if (purchasePixelFired.current) return;
    const total = order?.total_price ?? location.state?.totalPrice;
    const oid = order?.id ?? orderId;
    if (total == null || !oid || typeof window === 'undefined' || typeof window.fbq !== 'function') return;
    purchasePixelFired.current = true;
    const eventID = `purchase-order-${oid}`;
    window.fbq(
      'track',
      'Purchase',
      { value: Number(total), currency: 'BDT' },
      { eventID }
    );
  }, [order, orderId, location.state]);

  const parsedItems = useMemo(() => {
    if (!order?.items) return [];
    if (Array.isArray(order.items)) return order.items;
    try {
      return JSON.parse(order.items);
    } catch {
      return [];
    }
  }, [order?.items]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 fade-in-up sm:space-y-5">
      <section className="rounded-sm border border-sage-200 bg-sage-50 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-sage-700">Order Complete</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-900">Thank you for your purchase</h1>
        <p className="mt-3 text-stone-700">
          Your order has been placed successfully. We will contact you soon for confirmation and delivery updates.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/account" className="rounded-sm bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Go to My Account
          </Link>
          {user?.role === 'admin' ? (
            <Link to="/admin" className="rounded-sm border border-sage-300 bg-white px-5 py-2 text-sm font-semibold text-sage-700 hover:bg-sage-50">
              Go to Admin Orders
            </Link>
          ) : null}
          <Link to="/shop" className="rounded-sm border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-white">
            Continue Shopping
          </Link>
        </div>
      </section>

      <section className="rounded-sm border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <h2 className="text-2xl font-semibold text-stone-900">Receipt</h2>
          <span className="rounded-sm bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
            Order #{order?.id || orderId || '-'}
          </span>
        </div>

        {!order && !orderLoadFailed ? (
          <p className="pt-6 text-stone-600">Loading receipt details...</p>
        ) : orderLoadFailed && !order ? (
          <p className="pt-6 text-stone-600">
            Could not load receipt details (API unreachable or order not found). Your order may still be placed — check{' '}
            <Link to="/account" className="font-semibold text-brand-600 hover:text-brand-700">
              My Account
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-4 pt-4 sm:pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-stone-500">Customer</p>
                <p className="font-semibold text-stone-900">{order.customer_name}</p>
                <p className="text-sm text-stone-600">{order.customer_phone}</p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Payment</p>
                <p className="font-semibold text-stone-900">{order.payment_type}</p>
                <p className="text-sm text-stone-600">Status: {order.status}</p>
              </div>
            </div>

            <div className="rounded-sm border border-stone-200">
              <div className="border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold text-stone-700">
                Purchased Items
              </div>
              <div className="space-y-3 p-4">
                {parsedItems.length ? (
                  parsedItems.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">{item.name} x {item.quantity}</span>
                      <span className="font-semibold text-stone-900">৳{(Number(item.price) * Number(item.quantity)).toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-600">No item details available.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-stone-200 pt-4">
              <span className="text-lg font-semibold text-stone-900">Total Paid</span>
              <span className="text-xl font-semibold text-sage-600">৳{Number(order.total_price || 0).toFixed(2)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-sm border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <div className="rounded-sm border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Customer process</p>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            <li>1. Order placed and saved successfully.</li>
            <li>2. You can see live status in My Account.</li>
            <li>3. When admin dispatches, tracking number appears there.</li>
            <li>4. You will receive order update communications from the store.</li>
          </ul>
        </div>
        <div className="rounded-sm border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Admin process</p>
          <ul className="mt-3 space-y-2 text-sm text-stone-700">
            <li>1. New order is visible instantly in Admin → Orders.</li>
            <li>2. Admin can move status: Pending → Processing → Shipped → Delivered.</li>
            <li>3. Courier dispatch from admin sets tracking details.</li>
            <li>4. Customer account reflects each status update automatically.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export default OrderSuccess;