import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { getAuthHeader, getCurrentUser, saveCurrentUser } from '../utils/auth';

function parseOrderItems(rawItems) {
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems !== 'string') return [];
  try {
    const parsed = JSON.parse(rawItems);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function MyAccount() {
  const user = getCurrentUser();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [trackingState, setTrackingState] = useState({});
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    address: '',
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadOrders = async () => {
      if (!user?.id) {
        setLoadingOrders(false);
        return;
      }
      try {
        const response = await fetchWithTimeout(apiUrl(`/api/orders/user/${user.id}`), {
          headers: getAuthHeader(),
        });
        if (!response.ok) throw new Error('Unable to load orders');
        const data = await response.json();
        setOrders(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Order load error:', error);
      } finally {
        setLoadingOrders(false);
      }
    };
    loadOrders();
  }, [user?.id]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
    const delivered = orders.filter((order) => order.status === 'Delivered').length;
    return { totalOrders, totalSpent, delivered };
  }, [orders]);

  const enrichedOrders = useMemo(
    () =>
      orders.map((order) => {
        const totalPrice = Number(order.total_price || 0);
        const amountPaid = Math.min(Math.max(Number(order.amount_paid || 0), 0), totalPrice);
        const dueAmount = Math.max(totalPrice - amountPaid, 0);
        return {
          ...order,
          parsedItems: parseOrderItems(order.items),
          amountPaid,
          dueAmount,
        };
      }),
    [orders]
  );

  const handleProfileSave = (event) => {
    event.preventDefault();
    if (!user) return;
    saveCurrentUser({ ...user, name: profile.name, email: profile.email });
    localStorage.setItem(
      `qismat-customer-profile-${user.id}`,
      JSON.stringify({ phone: profile.phone, address: profile.address })
    );
    setMessage('Profile updated successfully.');
    window.setTimeout(() => setMessage(''), 1800);
  };

  const handleTrackOrder = async (orderId, trackingNumber) => {
    if (!trackingNumber) return;

    setTrackingState((prev) => ({
      ...prev,
      [orderId]: { loading: true, error: '', data: prev[orderId]?.data || null },
    }));

    try {
      const response = await fetchWithTimeout(apiUrl(`/api/orders/track/${encodeURIComponent(trackingNumber)}`));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to track order');

      setTrackingState((prev) => ({
        ...prev,
        [orderId]: { loading: false, error: '', data },
      }));
    } catch (error) {
      setTrackingState((prev) => ({
        ...prev,
        [orderId]: { loading: false, error: error.message || 'Unable to track order', data: null },
      }));
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    const saved = JSON.parse(localStorage.getItem(`qismat-customer-profile-${user.id}`) || 'null');
    if (saved) {
      setProfile((prev) => ({ ...prev, phone: saved.phone || '', address: saved.address || '' }));
    }
  }, [user?.id]);

  return (
    <div className="space-y-5 fade-in-up sm:space-y-6">
      <section className="rounded-sm border border-stone-200 bg-white p-5 shadow-sm md:p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-sage-600">Customer Zone</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-900">My Account</h1>
        <p className="mt-2 text-stone-600">Manage profile information, review purchases, and track your order progress.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-sm border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-500">Total Orders</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">{stats.totalOrders}</p>
          </div>
          <div className="rounded-sm border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-500">Delivered</p>
            <p className="mt-2 text-2xl font-semibold text-sage-600">{stats.delivered}</p>
          </div>
          <div className="rounded-sm border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-500">Total Spent</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">৳{stats.totalSpent.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <form onSubmit={handleProfileSave} className="space-y-3 rounded-sm border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">Profile Details</h2>
          <input
            value={profile.name}
            onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            placeholder="Full name"
            className="w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
          />
          <input
            value={profile.email}
            onChange={(event) => setProfile({ ...profile, email: event.target.value })}
            placeholder="Email address"
            className="w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
          />
          <input
            value={profile.phone}
            onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
            placeholder="Phone number"
            className="w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
          />
          <textarea
            value={profile.address}
            onChange={(event) => setProfile({ ...profile, address: event.target.value })}
            placeholder="Default address"
            rows="3"
            className="w-full rounded-sm border border-stone-200 bg-stone-50 px-4 py-3"
          />
          {message && <p className="rounded-sm bg-sage-50 px-4 py-3 text-sm text-sage-700">{message}</p>}
          <button className="w-full rounded-sm bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">
            Save profile
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/shop" className="rounded-sm border border-stone-300 px-4 py-2 text-center text-sm font-semibold text-stone-700 hover:bg-stone-100">
              Continue Shopping
            </Link>
            <Link to="/checkout" className="rounded-sm border border-stone-300 px-4 py-2 text-center text-sm font-semibold text-stone-700 hover:bg-stone-100">
              Quick Checkout
            </Link>
          </div>
        </form>

        <div className="space-y-3 rounded-sm border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-stone-900">My Orders</h2>
          {loadingOrders ? (
            <p className="text-stone-600">Loading your orders...</p>
          ) : enrichedOrders.length === 0 ? (
            <div className="rounded-sm border border-dashed border-stone-300 p-6 text-center">
              <p className="text-stone-700">No orders yet.</p>
              <Link to="/shop" className="mt-3 inline-block text-sm font-semibold text-sage-600 hover:text-sage-700">
                Start shopping
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {enrichedOrders.map((order) => (
                <article key={order.id} className="rounded-sm border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-stone-900">Order #{order.id}</p>
                    <span className="rounded-sm bg-white px-3 py-1 text-xs font-semibold text-stone-700">{order.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-stone-600">Placed on {new Date(order.created_at).toLocaleDateString()}</p>
                  {order.parsedItems.length > 0 ? (
                    <div className="mt-3 rounded-sm border border-stone-200 bg-white px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Ordered Items</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {order.parsedItems.map((item, index) => (
                          <span
                            key={`${order.id}-item-${index}`}
                            className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800"
                          >
                            {item.name || 'Unnamed item'}
                            {item.quantity ? ` x${item.quantity}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-stone-600">Payment: {order.payment_type}</p>
                    <p className="font-semibold text-stone-900">৳{Number(order.total_price).toFixed(2)}</p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Paid</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-900">৳{order.amountPaid.toFixed(2)}</p>
                    </div>
                    <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Due</p>
                      <p className="mt-1 text-sm font-semibold text-amber-900">৳{order.dueAmount.toFixed(2)}</p>
                    </div>
                  </div>
                  {order.tracking_number ? (
                    <div className="mt-3 rounded-sm border border-stone-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-stone-500">
                          Tracking: <span className="font-mono font-semibold text-stone-700">{order.tracking_number}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => handleTrackOrder(order.id, order.tracking_number)}
                          className="rounded-sm border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100"
                        >
                          {trackingState[order.id]?.loading ? 'Tracking...' : 'Track Order'}
                        </button>
                      </div>
                      {trackingState[order.id]?.error ? (
                        <p className="mt-2 text-xs text-rose-600">{trackingState[order.id].error}</p>
                      ) : null}
                      {trackingState[order.id]?.data ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-sm border border-stone-200 bg-stone-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Current Status</p>
                            <p className="mt-1 text-sm font-semibold text-stone-900">
                              {trackingState[order.id].data.status || order.status}
                            </p>
                          </div>
                          <div className="rounded-sm border border-stone-200 bg-stone-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Courier</p>
                            <p className="mt-1 text-sm font-semibold text-stone-900">
                              {trackingState[order.id].data.courier_name || order.courier_name || 'Not assigned'}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default MyAccount;