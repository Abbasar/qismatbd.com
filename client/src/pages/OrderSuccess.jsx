import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { getAuthHeader } from '../utils/auth';
import { getCurrentUser } from '../utils/auth';
import { addToCart, buyNow } from '../utils/cart';
import { canPurchaseProduct, withDefaultUnitSelection } from '../utils/productAvailability';
import { resolveImageUrl } from '../utils/image';
import { toast } from 'sonner';

function OrderSuccess() {
  const location = useLocation();
  const purchasePixelFired = useRef(false);
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState(location.state?.order || null);
  const [orderLoadFailed, setOrderLoadFailed] = useState(false);
  const [suggestedProducts, setSuggestedProducts] = useState([]);
  const navigate = useNavigate();
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

  const pricing = useMemo(() => {
    const itemsSubtotalFallback = parsedItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
    const subtotalRaw = Number(order?.subtotal);
    const shippingRaw = Number(order?.shipping_fee);
    const discountRaw = Number(order?.discount_amount);
    const subtotal = Number.isFinite(subtotalRaw) ? subtotalRaw : itemsSubtotalFallback;
    const shippingFee = Number.isFinite(shippingRaw) ? shippingRaw : 0;
    const discountAmount = Number.isFinite(discountRaw) ? discountRaw : 0;
    const computedTotal = Math.max(0, subtotal + shippingFee - discountAmount);
    const fallbackTotal = Number(order?.total_price ?? location.state?.totalPrice);
    const total = Number.isFinite(fallbackTotal) && !Number.isFinite(subtotalRaw)
      ? fallbackTotal
      : computedTotal;
    return { subtotal, shippingFee, discountAmount, total };
  }, [order, location.state, parsedItems]);

  useEffect(() => {
    const loadSuggestedProducts = async () => {
      try {
        const response = await fetchWithTimeout(apiUrl('/api/products'));
        if (!response.ok) return;
        const data = await response.json().catch(() => []);
        if (!Array.isArray(data)) return;
        const orderedIds = new Set(parsedItems.map((item) => Number(item.id)).filter((id) => Number.isFinite(id)));
        const sameCategory = data.filter(
          (product) =>
            !orderedIds.has(Number(product.id)) &&
            parsedItems.some((item) => String(item.category || '').trim() === String(product.category || '').trim())
        );
        const byId = new Map();
        for (const product of [...sameCategory, ...data]) {
          const id = Number(product.id);
          if (!Number.isFinite(id) || orderedIds.has(id) || byId.has(id)) continue;
          byId.set(id, product);
        }
        setSuggestedProducts(Array.from(byId.values()).slice(0, 12));
      } catch {
        setSuggestedProducts([]);
      }
    };
    loadSuggestedProducts();
  }, [parsedItems]);

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

            <div className="space-y-2 border-t border-stone-200 pt-4">
              <div className="flex items-center justify-between text-sm text-stone-700">
                <span>Items Subtotal</span>
                <span>৳{pricing.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-stone-700">
                <span>Delivery Charge</span>
                <span>৳{pricing.shippingFee.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-stone-700">
                <span>Discount</span>
                <span>-৳{pricing.discountAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-stone-200 pt-2">
                <span className="text-lg font-semibold text-stone-900">Total Amount</span>
                <span className="text-xl font-semibold text-sage-600">৳{pricing.total.toFixed(2)}</span>
              </div>
            </div>
            {suggestedProducts.length > 0 ? (
              <div className="border-t border-stone-200 pt-5">
                <h3 className="text-lg font-semibold text-stone-900">Continue shopping</h3>
                <p className="mt-1 text-sm text-stone-600">
                  Explore a few more picks while your current order is being processed.
                </p>
                <Swiper
                  slidesPerView={2}
                  spaceBetween={10}
                  breakpoints={{
                    480: { slidesPerView: 2, spaceBetween: 12 },
                    640: { slidesPerView: 2.2, spaceBetween: 14 },
                    768: { slidesPerView: 2.5, spaceBetween: 14 },
                  }}
                  className="mt-4 !pb-1"
                >
                  {suggestedProducts.map((product) => {
                    const quickLine = withDefaultUnitSelection(product);
                    return (
                      <SwiperSlide key={product.id} className="!h-auto">
                        <div className="flex h-full flex-col overflow-hidden rounded-sm border border-stone-200 bg-white">
                          <Link to={`/product/${product.id}`} className="block">
                            <img
                              src={resolveImageUrl(product.image)}
                              alt={product.name}
                              className="h-28 w-full object-cover sm:h-36"
                            />
                          </Link>
                          <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                            <Link to={`/product/${product.id}`} className="line-clamp-2 text-xs font-semibold text-stone-900 hover:text-brand-700 sm:text-sm">
                              {product.name}
                            </Link>
                            <p className="mt-1 text-xs text-stone-600 sm:text-sm">
                              ৳{Number(quickLine.price || product.price || 0).toFixed(2)}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                buyNow({ ...quickLine, quantity: 1 });
                                navigate('/checkout');
                              }}
                              disabled={!canPurchaseProduct(product)}
                              className="mt-2 rounded-sm border border-brand-600 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-50 disabled:border-stone-300 disabled:text-stone-400 sm:px-3 sm:py-2 sm:text-xs"
                            >
                              Buy now
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                addToCart({ ...quickLine, quantity: 1 });
                                toast.success('Added to cart');
                              }}
                              disabled={!canPurchaseProduct(product)}
                              className="mt-2 rounded-sm bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700 disabled:bg-stone-300 sm:mt-3 sm:px-3 sm:py-2 sm:text-xs"
                            >
                              Add to cart
                            </button>
                          </div>
                        </div>
                      </SwiperSlide>
                    );
                  })}
                </Swiper>
              </div>
            ) : null}
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