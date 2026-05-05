import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getAuthHeader, getCurrentUser } from '../utils/auth';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { addToCart, getCart, updateQuantity, updateCartItem, cartLineKey, removeFromCart, CART_UPDATED_EVENT } from '../utils/cart';
import { CheckoutSkeleton } from '../components/Skeletons';
import { canPurchaseProduct, maxOrderQuantity, withDefaultUnitSelection } from '../utils/productAvailability';
import { resolveImageUrl } from '../utils/image';

const steps = ['Details, delivery & payment', 'Review'];

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : '';
}

function parseInsideDistricts(csv) {
  const raw =
    csv && String(csv).trim()
      ? String(csv)
      : 'Dhaka,Narayanganj,Gazipur,Munshiganj,Manikganj,Narsingdi';
  return raw
    .split(/[,|]/g)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function isInsideDhakaDistrict(districtName, settings) {
  if (!districtName || !String(districtName).trim()) return true;
  const n = String(districtName).trim().toLowerCase();
  const set = parseInsideDistricts(settings.inside_dhaka_districts);
  return set.some((s) => s === n || n.includes(s) || s.includes(n));
}

function Checkout() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [paymentType, setPaymentType] = useState('COD');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const [districtRows, setDistrictRows] = useState([]);
  const [upazilas, setUpazilas] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [upazilaLoading, setUpazilaLoading] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState('point');
  const [shippingFee, setShippingFee] = useState(0);
  const [settings, setSettings] = useState({});
  const [bkashNumber, setBkashNumber] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [catalogProducts, setCatalogProducts] = useState([]);
  const navigate = useNavigate();
  const user = getCurrentUser();

  const deliveryArea = useMemo(() => {
    if (!district.trim()) return 'Inside Dhaka';
    return isInsideDhakaDistrict(district, settings) ? 'Inside Dhaka' : 'Outside Dhaka';
  }, [district, settings]);

  const fullAddress = useMemo(() => {
    const parts = [streetAddress.trim(), thana, district].filter(Boolean);
    return parts.join(', ');
  }, [streetAddress, thana, district]);

  useEffect(() => {
    if (user?.name) setCustomerName(user.name);
  }, [user?.name]);

  useEffect(() => {
    const refreshItems = () => setItems(getCart());
    refreshItems();
    window.addEventListener(CART_UPDATED_EVENT, refreshItems);
    window.addEventListener('storage', refreshItems);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refreshItems);
      window.removeEventListener('storage', refreshItems);
    };
  }, []);

  useEffect(() => {
    const loadDistricts = async () => {
      setLocLoading(true);
      try {
        const res = await fetchWithTimeout(apiUrl('/api/locations/districts'));
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || `Districts failed (${res.status})`;
          toast.error(msg);
          setDistrictRows([]);
          return;
        }
        setDistrictRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        toast.error('Could not load district list');
        setDistrictRows([]);
      } finally {
        setLocLoading(false);
      }
    };
    loadDistricts();
  }, []);

  useEffect(() => {
    if (!district) {
      setUpazilas([]);
      setThana('');
      setUpazilaLoading(false);
      return;
    }
    let cancelled = false;
    setUpazilaLoading(true);
    (async () => {
      try {
        const res = await fetchWithTimeout(
          `${apiUrl('/api/locations/upazilas')}?district=${encodeURIComponent(district)}`
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || `Thana list failed (${res.status})`;
          if (!cancelled) {
            setUpazilas([]);
            toast.error(msg);
          }
          return;
        }
        if (!cancelled) setUpazilas(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setUpazilas([]);
          toast.error('Could not load thana / area list');
        }
      } finally {
        if (!cancelled) setUpazilaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [district]);

  useEffect(() => {
    if (thana && upazilas.length && !upazilas.includes(thana)) {
      setThana('');
    }
  }, [upazilas, thana]);

  useEffect(() => {
    const legacyInside = Number(settings.shipping_inside_dhaka || 60);
    const pointIn =
      settings.shipping_inside_point != null && String(settings.shipping_inside_point).trim() !== ''
        ? Number(settings.shipping_inside_point)
        : legacyInside;
    const homeIn =
      settings.shipping_inside_home != null && String(settings.shipping_inside_home).trim() !== ''
        ? Number(settings.shipping_inside_home)
        : legacyInside;
    const legacyOutside = Number(settings.shipping_outside_dhaka || 120);
    const pointOut =
      settings.shipping_outside_point != null && String(settings.shipping_outside_point).trim() !== ''
        ? Number(settings.shipping_outside_point)
        : legacyOutside;
    const homeOut =
      settings.shipping_outside_home != null && String(settings.shipping_outside_home).trim() !== ''
        ? Number(settings.shipping_outside_home)
        : legacyOutside;
    let fee;
    if (deliveryArea === 'Outside Dhaka') {
      fee = deliveryMethod === 'home' ? homeOut : pointOut;
    } else {
      fee = deliveryMethod === 'home' ? homeIn : pointIn;
    }
    setShippingFee(Number.isFinite(fee) ? fee : 0);
  }, [deliveryArea, deliveryMethod, settings]);

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, productsRes] = await Promise.all([
          fetchWithTimeout(apiUrl('/api/settings')),
          fetchWithTimeout(apiUrl('/api/products')),
        ]);
        const data = await settingsRes.json();
        const settingsObj = {};
        data.forEach((s) => {
          settingsObj[s.setting_key] = s.setting_value;
        });
        setSettings(settingsObj);
        if (productsRes.ok) {
          const products = await productsRes.json().catch(() => []);
          setCatalogProducts(Array.isArray(products) ? products : []);
        } else {
          setCatalogProducts([]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    load();

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'payment_failed') toast.error('Payment failed. Please try again.');
    if (error === 'payment_cancelled') toast.message('Payment was cancelled.');
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountPreview = appliedCoupon ? Number(appliedCoupon.discount_amount || 0) : 0;
  const totalPreview = Math.max(0, subtotal + shippingFee - discountPreview);
  const cartProductIds = useMemo(
    () => new Set(items.map((item) => Number(item.id)).filter((id) => Number.isFinite(id))),
    [items]
  );
  /** Cart এ নেই এমন সব product — আগে same-category, তারপর বাকি (duplicate ছাড়া)। */
  const browseMoreProducts = useMemo(() => {
    const notInCart = catalogProducts.filter((p) => !cartProductIds.has(Number(p.id)));
    const sameCategory = notInCart.filter((p) =>
      items.some((line) => (line.category || '') === (p.category || ''))
    );
    const byId = new Map();
    const pushInOrder = (arr) => {
      for (const p of arr) {
        const id = Number(p.id);
        if (!Number.isFinite(id) || byId.has(id)) continue;
        byId.set(id, p);
      }
    };
    pushInOrder(sameCategory);
    pushInOrder(notInCart);
    return Array.from(byId.values());
  }, [catalogProducts, cartProductIds, items]);

  const fieldsOk = useMemo(() => {
    const e = {};
    if (!customerName.trim()) e.customerName = 'Name is required';
    if (!customerPhone.trim()) e.customerPhone = 'Phone is required';
    else if (customerPhone.trim().length < 6) e.customerPhone = 'Enter a valid phone number';
    if (!streetAddress.trim()) e.streetAddress = 'Street / house address is required';
    else if (streetAddress.trim().length < 4) e.streetAddress = 'Please add a bit more detail';
    if (!district.trim()) e.district = 'Select district';
    if (!thana.trim()) e.thana = 'Select thana / area';
    if (!['point', 'home'].includes(deliveryMethod)) {
      e.deliveryMethod = 'Choose point or home delivery';
    }
    if (paymentType === 'Bkash' && settings.bkash_mode === 'manual' && !bkashNumber.trim()) {
      e.bkashNumber = 'Transaction ID is required';
    }
    if (paymentType === 'Nagad' && settings.nagad_mode === 'manual' && !bkashNumber.trim()) {
      e.bkashNumber = 'Transaction ID is required';
    }
    return e;
  }, [
    customerName,
    customerPhone,
    streetAddress,
    district,
    thana,
    paymentType,
    bkashNumber,
    settings,
    deliveryMethod,
  ]);

  const goNext = () => {
    if (step === 0) {
      const e = { ...fieldsOk };
      Object.keys(e).forEach((k) => {
        if (!e[k]) delete e[k];
      });
      if (Object.keys(e).length) {
        setErrors(e);
        toast.error('Please fix the highlighted fields');
        return;
      }
      setErrors({});
      setStep(1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const applyCoupon = async () => {
    if (!couponInput.trim()) {
      toast.error('Enter a coupon code');
      return;
    }
    setCouponBusy(true);
    try {
      const res = await fetch(apiUrl('/api/coupons/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponInput.trim(),
          subtotal,
          items: items.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            selectedSize: i.selectedSize,
            selectedOption: i.selectedOption,
            selectedColor: i.selectedColor,
          })),
        }),
      });
      const data = await res.json();
      if (!data.valid) {
        setAppliedCoupon(null);
        throw new Error(data.message || 'Invalid coupon');
      }
      setAppliedCoupon(data);
      toast.success(`Coupon applied: -৳${Number(data.discount_amount).toFixed(2)}`);
    } catch (err) {
      toast.error(err.message || 'Coupon failed');
    } finally {
      setCouponBusy(false);
    }
  };

  useEffect(() => {
    if (!appliedCoupon?.code) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(apiUrl('/api/coupons/validate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: appliedCoupon.code,
            subtotal,
            items: items.map((i) => ({
              id: i.id,
              quantity: i.quantity,
              selectedSize: i.selectedSize,
              selectedOption: i.selectedOption,
              selectedColor: i.selectedColor,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.valid) {
          setAppliedCoupon(data);
        } else {
          setAppliedCoupon(null);
        }
      } catch {
        if (!cancelled) setAppliedCoupon(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, subtotal, appliedCoupon?.code]);

  const adjustLineQuantity = (item, delta) => {
    const key = cartLineKey(item);
    const next = item.quantity + delta;
    if (next <= 0) {
      removeFromCart(key);
      return;
    }
    const cap = maxOrderQuantity(item);
    if (cap > 0 && next > cap) {
      toast.message('Maximum available quantity for this item');
      return;
    }
    updateQuantity(key, next);
  };

  const updateLineUnit = (item, unitLabel) => {
    const options = Array.isArray(item.pricing_options) ? item.pricing_options : [];
    const picked = options.find((opt) => String(opt?.label || '').trim() === String(unitLabel).trim());
    if (!picked) return;
    const pickedPrice = Number(picked.price);
    updateCartItem(cartLineKey(item), {
      selectedSize: unitLabel,
      price: Number.isFinite(pickedPrice) ? pickedPrice : Number(item.price),
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    const blocking = { ...fieldsOk };
    Object.keys(blocking).forEach((k) => {
      if (!blocking[k]) delete blocking[k];
    });
    if (Object.keys(blocking).length) {
      setErrors(blocking);
      toast.error('Please complete required fields');
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail: user?.email || null,
          customerAddress: `${fullAddress} (${deliveryArea})`,
          deliveryArea,
          deliveryMethod,
          paymentType,
          bKashNumber: bkashNumber,
          couponCode: appliedCoupon?.code || '',
          items,
          facebook_fbp: readCookie('_fbp'),
          facebook_fbc: readCookie('_fbc'),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Unable to place order');
      }

      localStorage.removeItem('qismat-cart');
      window.dispatchEvent(new CustomEvent('qismat-cart-updated', { detail: { items: [] } }));
      toast.success('Order placed successfully');

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        navigate(`/order-success?orderId=${data.orderId}`, {
          state: { orderId: data.orderId, totalPrice: data.totalPrice },
        });
      }
    } catch (err) {
      toast.error(err.message || 'Order failed');
    }
  };

  if (loading) {
    return <CheckoutSkeleton />;
  }

  return (
    <>
      <Helmet>
        <title>Checkout — Qismat</title>
        <meta name="description" content="Secure, distraction-free checkout at Qismat." />
      </Helmet>

      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Checkout</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-900 sm:text-4xl">Almost there</h1>
          <p className="mt-2 text-sm text-stone-600">
            Choose district &amp; thana / area, delivery type, and payment. Shipping follows your admin rates for both Dhaka
            and outside.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {steps.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (i <= step) setStep(i);
              }}
              className={`rounded-sm px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                i === step ? 'bg-brand-600 text-white' : i < step ? 'bg-stone-100 text-stone-700' : 'bg-white text-stone-400 ring-1 ring-stone-200'
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
          <section className="rounded-sm border border-stone-200/90 bg-white p-5 shadow-sm sm:p-6">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="s0"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <h2 className="text-xl font-semibold text-stone-900">Contact, delivery &amp; payment</h2>
                  <div>
                    <label className="text-sm font-medium text-stone-700">Full name</label>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className={`mt-1 w-full rounded-sm border bg-stone-50/80 px-4 py-3 text-sm outline-none transition focus:bg-white ${
                        errors.customerName ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200 focus:border-brand-400'
                      }`}
                    />
                    {errors.customerName && <p className="mt-1 text-xs text-brand-600">{errors.customerName}</p>}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-stone-700">Phone</label>
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className={`mt-1 w-full rounded-sm border bg-stone-50/80 px-4 py-3 text-sm outline-none transition focus:bg-white ${
                        errors.customerPhone ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200 focus:border-brand-400'
                      }`}
                      inputMode="tel"
                    />
                    {errors.customerPhone && <p className="mt-1 text-xs text-brand-600">{errors.customerPhone}</p>}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-stone-700">District</label>
                      <select
                        value={district}
                        onChange={(e) => {
                          setDistrict(e.target.value);
                          setThana('');
                        }}
                        className={`mt-1 w-full rounded-sm border bg-stone-50/80 px-4 py-3 text-sm outline-none focus:bg-white ${
                          errors.district ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200 focus:border-brand-400'
                        }`}
                        disabled={locLoading}
                      >
                        <option value="">{locLoading ? 'Loading…' : 'Select district'}</option>
                        {districtRows.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      {errors.district && <p className="mt-1 text-xs text-brand-600">{errors.district}</p>}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-stone-700">Thana / area</label>
                      <select
                        value={thana}
                        onChange={(e) => setThana(e.target.value)}
                        className={`mt-1 w-full rounded-sm border bg-stone-50/80 px-4 py-3 text-sm outline-none focus:bg-white ${
                          errors.thana ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200 focus:border-brand-400'
                        }`}
                        disabled={!district || upazilaLoading}
                      >
                        <option value="">
                          {!district
                            ? 'Select district first'
                            : upazilaLoading
                              ? 'Loading…'
                              : 'Select thana / area'}
                        </option>
                        {upazilas.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      {errors.thana && <p className="mt-1 text-xs text-brand-600">{errors.thana}</p>}
                    </div>
                  </div>

                  <p className="text-xs text-stone-500">
                    Delivery zone:{' '}
                    <span className="font-semibold text-stone-800">
                      {district ? deliveryArea : 'Select a district'}
                    </span>{' '}
                    (inside Dhaka districts are configured in Admin → Delivery)
                  </p>

                  <div>
                    <label className="text-sm font-medium text-stone-700">House, road, details</label>
                    <textarea
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      rows={3}
                      className={`mt-1 w-full rounded-sm border bg-stone-50/80 px-4 py-3 text-sm outline-none transition focus:bg-white ${
                        errors.streetAddress ? 'border-brand-400 ring-2 ring-brand-100' : 'border-stone-200 focus:border-brand-400'
                      }`}
                    />
                    {errors.streetAddress && <p className="mt-1 text-xs text-brand-600">{errors.streetAddress}</p>}
                  </div>

                  <div>
                    <p className="text-sm font-medium text-stone-700">Delivery type</p>
                    <p className="mt-1 text-xs text-stone-500">
                      Point (hub / courier point) or home — rates apply for both Inside and Outside Dhaka.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {[
                        { id: 'point', label: 'Point delivery' },
                        { id: 'home', label: 'Home delivery' },
                      ].map(({ id, label }) => (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-center justify-center rounded-sm border px-3 py-3 text-sm font-semibold transition ${
                            deliveryMethod === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name="deliveryMethod"
                            checked={deliveryMethod === id}
                            onChange={() => setDeliveryMethod(id)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {errors.deliveryMethod && <p className="mt-1 text-xs text-brand-600">{errors.deliveryMethod}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-stone-700">Payment method</label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value)}
                      className="mt-1 w-full rounded-sm border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm outline-none focus:border-brand-400"
                    >
                      <option value="COD">Cash on Delivery</option>
                      <option value="Online">Online Payment (Cards / MFS)</option>
                      <option value="Bkash">Bkash</option>
                      <option value="Nagad">Nagad</option>
                    </select>
                  </div>

                  {paymentType === 'Bkash' && settings.bkash_mode === 'manual' && (
                    <div className="rounded-sm bg-sage-50/60 p-4">
                      <p className="text-sm text-sage-900">
                        Send to <span className="font-semibold">{settings.bkash_number}</span>
                      </p>
                      <label className="mt-3 block text-xs font-semibold uppercase text-sage-800">Transaction ID</label>
                      <input
                        value={bkashNumber}
                        onChange={(e) => setBkashNumber(e.target.value)}
                        className={`mt-1 w-full rounded-sm border bg-white px-3 py-2 text-sm ${errors.bkashNumber ? 'border-brand-400' : 'border-sage-200'}`}
                      />
                      {errors.bkashNumber && <p className="mt-1 text-xs text-brand-600">{errors.bkashNumber}</p>}
                    </div>
                  )}

                  {paymentType === 'Nagad' && settings.nagad_mode === 'manual' && (
                    <div className="rounded-sm bg-peach-50/70 p-4">
                      <p className="text-sm text-peach-900">
                        Send to <span className="font-semibold">{settings.nagad_number}</span>
                      </p>
                      <label className="mt-3 block text-xs font-semibold uppercase text-peach-900">Transaction ID</label>
                      <input
                        value={bkashNumber}
                        onChange={(e) => setBkashNumber(e.target.value)}
                        className={`mt-1 w-full rounded-sm border bg-white px-3 py-2 text-sm ${errors.bkashNumber ? 'border-brand-400' : 'border-peach-200'}`}
                      />
                      {errors.bkashNumber && <p className="mt-1 text-xs text-brand-600">{errors.bkashNumber}</p>}
                    </div>
                  )}

                  {(paymentType === 'Bkash' && settings.bkash_mode === 'api') || (paymentType === 'Nagad' && settings.nagad_mode === 'api') ? (
                    <p className="text-sm text-stone-500">You will be redirected to the gateway after review.</p>
                  ) : null}

                  <button type="button" onClick={goNext} className="w-full rounded-sm bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                    Continue to review
                  </button>
                </motion.div>
              )}

              {step === 1 && (
                <motion.form
                  key="s1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <h2 className="text-xl font-semibold text-stone-900">Review &amp; confirm</h2>

                  <div className="rounded-sm border border-stone-100 bg-stone-50/60 p-4 text-sm text-stone-700">
                    <p>
                      <span className="font-semibold text-stone-900">{customerName}</span> · {customerPhone}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{fullAddress}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-stone-500">
                      {deliveryMethod === 'home' ? 'Home delivery' : 'Point delivery'} · {deliveryArea} · {paymentType}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-stone-700">Coupon</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder="Code"
                        className="flex-1 rounded-sm border border-stone-200 bg-stone-50/80 px-4 py-2.5 text-sm outline-none focus:border-brand-400"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={couponBusy}
                        className="rounded-sm bg-white px-4 text-sm font-semibold text-stone-900 ring-1 ring-stone-200 hover:bg-stone-50 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                    {appliedCoupon && <p className="mt-2 text-xs font-medium text-sage-700">Applied {appliedCoupon.code}</p>}
                  </div>

                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(0)} className="flex-1 rounded-sm border border-stone-200 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                      Back
                    </button>
                    <button type="submit" className="flex-1 rounded-sm bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700">
                      Place order · ৳{totalPreview.toFixed(2)}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </section>

          <aside className="h-fit space-y-3 rounded-sm border border-stone-200/90 bg-white p-5 shadow-sm lg:sticky lg:top-28 sm:p-6">
            <h3 className="text-lg font-semibold text-stone-900">Order summary</h3>
            {items.length === 0 ? (
              <p className="text-sm text-stone-600">Your cart is empty.</p>
            ) : (
              <>
                <ul className="max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
                  {items.map((item) => {
                    const cap = maxOrderQuantity(item);
                    const atMax = cap > 0 && item.quantity >= cap;
                    return (
                      <li key={cartLineKey(item)} className="flex flex-col gap-2 border-b border-stone-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-stone-900">{item.name}</p>
                          {(item.selectedSize || item.selectedColor) && (
                            <p className="mt-0.5 text-xs text-stone-500">
                              {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {Array.isArray(item.pricing_options) && item.pricing_options.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.pricing_options.map((opt) => {
                                const unit = String(opt?.label || '').trim();
                                if (!unit) return null;
                                const unitPrice = Number(opt?.price);
                                const active = String(item.selectedSize || '').trim() === unit;
                                return (
                                  <button
                                    key={`${cartLineKey(item)}-${unit}`}
                                    type="button"
                                    onClick={() => updateLineUnit(item, unit)}
                                    className={`rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                                      active
                                        ? 'border-brand-600 bg-brand-600 text-white'
                                        : 'border-stone-200 text-stone-700 hover:border-stone-300'
                                    }`}
                                  >
                                    {unit}
                                    {Number.isFinite(unitPrice) ? (
                                      <span className={`ml-1 ${active ? 'text-white/90' : 'text-stone-500'}`}>
                                        ৳{unitPrice.toFixed(0)}
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          <p className="mt-1 text-xs text-stone-500">৳{Number(item.price).toFixed(2)} each</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="flex items-center gap-0.5 rounded-sm border border-stone-200 bg-white">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() => adjustLineQuantity(item, -1)}
                              className="flex h-9 w-9 items-center justify-center text-lg text-stone-700 transition hover:bg-stone-100"
                            >
                              −
                            </button>
                            <span className="min-w-[2.5ch] text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() => adjustLineQuantity(item, 1)}
                              disabled={atMax}
                              className="flex h-9 w-9 items-center justify-center text-lg text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                            >
                              +
                            </button>
                          </div>
                          <span className="min-w-[4.5rem] text-right font-semibold text-stone-900 tabular-nums">
                            ৳{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="space-y-2 border-t border-stone-100 pt-3 text-sm text-stone-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>৳{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>৳{shippingFee.toFixed(2)}</span>
                  </div>
                  {appliedCoupon ? (
                    <div className="flex justify-between text-sage-700">
                      <span>Discount</span>
                      <span>-৳{discountPreview.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-stone-100 pt-2 text-base font-semibold text-stone-900">
                    <span>Total</span>
                    <span>৳{totalPreview.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs text-stone-500">Final totals are verified on the server when you pay.</p>
                {browseMoreProducts.length > 0 ? (
                  <div className="space-y-2 border-t border-stone-100 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-stone-900">Add more items</p>
                      <span className="text-[11px] text-stone-500">Scroll for all products</span>
                    </div>
                    <div
                      className="max-h-[252px] min-h-0 space-y-2 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
                      role="region"
                      aria-label="Browse more products to add"
                    >
                      {browseMoreProducts.map((product) => {
                        const quickLine = withDefaultUnitSelection(product);
                        return (
                          <div key={product.id} className="rounded-sm border border-stone-200/90 bg-stone-50/60 p-2">
                            <div className="flex items-center gap-2">
                              <Link to={`/product/${product.id}`} className="block h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-stone-200">
                                <img src={resolveImageUrl(product.image)} alt={product.name} className="h-full w-full object-cover" />
                              </Link>
                              <div className="min-w-0 flex-1">
                                <Link to={`/product/${product.id}`} className="line-clamp-1 text-xs font-semibold text-stone-900 hover:text-brand-700">
                                  {product.name}
                                </Link>
                                <p className="text-[11px] text-stone-600">৳{Number(quickLine.price || product.price || 0).toFixed(2)}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  addToCart({ ...quickLine, quantity: 1 });
                                  toast.success('Added to cart');
                                }}
                                disabled={!canPurchaseProduct(product)}
                                className="rounded-sm bg-brand-600 px-2 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-700 disabled:bg-stone-300"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

export default Checkout;
