/**
 * ============================================================
 * ল্যান্ডিং পেজ ইন-পেজ চেকআউট (/lp/:id)
 * ============================================================
 * এক পণ্য, সরল ফর্ম → POST /api/orders (Checkout.jsx-এর মতো)
 * জেলা/উপজেলা, শিপিং, কুপন, Facebook _fbp/_fbc কুকি পাঠায়
 * ============================================================
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { getAuthHeader, getCurrentUser } from '../utils/auth';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { resolveImageUrl } from '../utils/image';
import { cartLineKey } from '../utils/cart';
import { maxOrderQuantity } from '../utils/productAvailability';

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

const fieldClass = (err) =>
  `mt-1.5 w-full rounded-sm border bg-white px-4 py-3 text-sm outline-none transition focus:ring-2 ${
    err ? 'border-brand-400 ring-brand-100' : 'border-stone-200 focus:border-brand-400 focus:ring-brand-50'
  }`;

export default function LandingCheckout({ orderItems, showPreorder, onQuantityChange }) {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const [settings, setSettings] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const [districtRows, setDistrictRows] = useState([]);
  const [upazilas, setUpazilas] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [upazilaLoading, setUpazilaLoading] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState('home');
  const [paymentType, setPaymentType] = useState('COD');
  const [bkashNumber, setBkashNumber] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (user?.name) setCustomerName(user.name);
  }, [user?.name]);

  useEffect(() => {
    (async () => {
      setSettingsLoading(true);
      setLocLoading(true);
      try {
        const [settingsRes, distRes] = await Promise.all([
          fetchWithTimeout(apiUrl('/api/settings')),
          fetchWithTimeout(apiUrl('/api/locations/districts')),
        ]);
        const data = await settingsRes.json();
        const settingsObj = {};
        if (Array.isArray(data)) {
          data.forEach((s) => {
            settingsObj[s.setting_key] = s.setting_value;
          });
        }
        setSettings(settingsObj);
        const distData = await distRes.json().catch(() => []);
        setDistrictRows(Array.isArray(distData) ? distData : []);
      } catch {
        toast.error('Checkout settings load failed');
      } finally {
        setSettingsLoading(false);
        setLocLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!district) {
      setUpazilas([]);
      setThana('');
      return;
    }
    let cancelled = false;
    setUpazilaLoading(true);
    (async () => {
      try {
        const res = await fetchWithTimeout(
          `${apiUrl('/api/locations/upazilas')}?district=${encodeURIComponent(district)}`
        );
        const data = await res.json().catch(() => []);
        if (!cancelled) setUpazilas(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setUpazilas([]);
      } finally {
        if (!cancelled) setUpazilaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [district]);

  const deliveryArea = useMemo(() => {
    if (!district.trim()) return 'Inside Dhaka';
    return isInsideDhakaDistrict(district, settings) ? 'Inside Dhaka' : 'Outside Dhaka';
  }, [district, settings]);

  const fullAddress = useMemo(() => {
    return [streetAddress.trim(), thana, district].filter(Boolean).join(', ');
  }, [streetAddress, thana, district]);

  const subtotal = orderItems.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );

  const shippingFee = useMemo(() => {
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
    const fee =
      deliveryArea === 'Outside Dhaka'
        ? deliveryMethod === 'home'
          ? homeOut
          : pointOut
        : deliveryMethod === 'home'
          ? homeIn
          : pointIn;
    return Number.isFinite(fee) ? fee : 0;
  }, [deliveryArea, deliveryMethod, settings]);

  const discount = appliedCoupon ? Number(appliedCoupon.discount_amount || 0) : 0;
  const total = Math.max(0, subtotal + shippingFee - discount);

  const fieldsOk = useMemo(() => {
    const e = {};
    if (!customerName.trim()) e.customerName = 'নাম লিখুন';
    if (!customerPhone.trim()) e.customerPhone = 'ফোন লিখুন';
    else if (customerPhone.trim().length < 6) e.customerPhone = 'সঠিক ফোন দিন';
    if (!streetAddress.trim()) e.streetAddress = 'ঠিকানা লিখুন';
    if (!district.trim()) e.district = 'জেলা বেছে নিন';
    if (!thana.trim()) e.thana = 'থানা বেছে নিন';
    if (paymentType === 'Bkash' && settings.bkash_mode === 'manual' && !bkashNumber.trim()) {
      e.bkashNumber = 'Txn ID';
    }
    if (paymentType === 'Nagad' && settings.nagad_mode === 'manual' && !bkashNumber.trim()) {
      e.bkashNumber = 'Txn ID';
    }
    return e;
  }, [customerName, customerPhone, streetAddress, district, thana, paymentType, bkashNumber, settings]);

  const applyCoupon = async () => {
    if (!couponInput.trim()) {
      toast.error('কুপন কোড লিখুন');
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
          items: orderItems.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            selectedSize: i.selectedSize,
            selectedColor: i.selectedColor,
          })),
        }),
      });
      const data = await res.json();
      if (!data.valid) throw new Error(data.message || 'Invalid');
      setAppliedCoupon(data);
      toast.success(`কুপন: -৳${Number(data.discount_amount).toFixed(0)}`);
    } catch (err) {
      toast.error(err.message || 'কুপন কাজ করেনি');
    } finally {
      setCouponBusy(false);
    }
  };

  const openConfirm = (e) => {
    e.preventDefault();
    const blocking = { ...fieldsOk };
    Object.keys(blocking).forEach((k) => {
      if (!blocking[k]) delete blocking[k];
    });
    if (Object.keys(blocking).length) {
      setErrors(blocking);
      toast.error('সব তথ্য পূরণ করুন');
      return;
    }
    if (!orderItems.length) {
      toast.error('পণ্য নির্বাচন করুন');
      return;
    }
    setErrors({});
    setConfirmOpen(true);
  };

  const placeOrder = async () => {
    setPlacing(true);
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
          items: orderItems,
          facebook_fbp: readCookie('_fbp'),
          facebook_fbc: readCookie('_fbc'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Order failed');
      setConfirmOpen(false);
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      navigate(`/order-success?orderId=${data.orderId}`, {
        state: { orderId: data.orderId, totalPrice: data.totalPrice },
      });
    } catch (err) {
      toast.error(err.message || 'অর্ডার হয়নি');
    } finally {
      setPlacing(false);
    }
  };

  if (!orderItems.length) return null;

  return (
    <>
      <section id="checkout" className="scroll-mt-6">
        <motion.div className="overflow-hidden rounded-sm border border-stone-200/80 bg-white shadow-lg shadow-stone-200/30">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="border-b border-stone-100 bg-gradient-to-r from-brand-50 via-white to-sage-50 px-5 py-6 sm:px-8"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600">Checkout</p>
            <h2 className="mt-1 text-2xl font-semibold text-stone-900 sm:text-3xl">
              {showPreorder ? 'প্রি-অর্ডার করুন' : 'এখনই অর্ডার করুন'}
            </h2>
            <p className="mt-1 text-sm text-stone-600">নাম, ঠিকানা, কুপন — তারপর কনফার্ম</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="flex flex-col lg:grid lg:grid-cols-[1fr_300px]"
          >
            <aside className="order-1 border-b border-stone-100 bg-stone-50 p-5 lg:order-2 lg:border-b-0 lg:border-l lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">সারাংশ</p>
              <ul className="mt-4 space-y-4">
                {orderItems.map((item) => {
                  const key = cartLineKey(item);
                  const maxQty = maxOrderQuantity(item);
                  const lineTotal = Number(item.price) * Number(item.quantity);
                  return (
                    <li key={key} className="flex gap-3 border-b border-stone-200/80 pb-4 last:border-0 last:pb-0">
                      <img
                        src={resolveImageUrl(item.image)}
                        alt={item.name}
                        className="h-16 w-16 shrink-0 rounded-sm object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-stone-900">{item.name}</p>
                        {(item.selectedSize || item.selectedColor) && (
                          <p className="mt-0.5 text-xs text-stone-500">
                            {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center rounded-sm border border-stone-200 bg-white">
                            <button
                              type="button"
                              onClick={() => onQuantityChange(key, Number(item.quantity) - 1)}
                              className="h-8 w-8 text-sm font-medium text-stone-700 hover:bg-stone-50"
                              aria-label="কমান"
                            >
                              −
                            </button>
                            <span className="min-w-[2ch] text-center text-sm font-semibold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => onQuantityChange(key, Number(item.quantity) + 1)}
                              disabled={maxQty > 0 && Number(item.quantity) >= maxQty}
                              className="h-8 w-8 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                              aria-label="বাড়ান"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-sm font-semibold text-stone-900">৳{lineTotal.toFixed(0)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <dl className="mt-6 space-y-2 border-t border-stone-200 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt>পণ্য</dt>
                  <dd>৳{subtotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>শিপিং</dt>
                  <dd>৳{shippingFee.toFixed(2)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <dt>কুপন</dt>
                    <dd>-৳{discount.toFixed(2)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-stone-200 pt-3 text-lg font-semibold">
                  <dt>মোট</dt>
                  <dd className="text-brand-700">৳{total.toFixed(2)}</dd>
                </div>
              </dl>
            </aside>

            <form onSubmit={openConfirm} className="order-2 space-y-5 p-5 sm:p-8 lg:order-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-stone-800">নাম *</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={fieldClass(errors.customerName)}
                    placeholder="আপনার নাম"
                  />
                  {errors.customerName && <p className="mt-1 text-xs text-brand-600">{errors.customerName}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-800">মোবাইল *</label>
                  <input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className={fieldClass(errors.customerPhone)}
                    placeholder="01XXXXXXXXX"
                    inputMode="tel"
                  />
                  {errors.customerPhone && <p className="mt-1 text-xs text-brand-600">{errors.customerPhone}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-stone-800">জেলা *</label>
                  <select
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setThana('');
                    }}
                    className={fieldClass(errors.district)}
                    disabled={locLoading || settingsLoading}
                  >
                    <option value="">{locLoading ? 'লোড…' : 'জেলা'}</option>
                    {districtRows.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  {errors.district && <p className="mt-1 text-xs text-brand-600">{errors.district}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium text-stone-800">থানা *</label>
                  <select
                    value={thana}
                    onChange={(e) => setThana(e.target.value)}
                    className={fieldClass(errors.thana)}
                    disabled={!district || upazilaLoading}
                  >
                    <option value="">{!district ? 'জেলা আগে' : upazilaLoading ? 'লোড…' : 'থানা'}</option>
                    {upazilas.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  {errors.thana && <p className="mt-1 text-xs text-brand-600">{errors.thana}</p>}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-stone-800">বিস্তারিত ঠিকানা *</label>
                <textarea
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  rows={3}
                  className={fieldClass(errors.streetAddress)}
                  placeholder="আপনার বাড়ির ঠিকানা লিখুন"
                />
                {errors.streetAddress && <p className="mt-1 text-xs text-brand-600">{errors.streetAddress}</p>}
              </div>

              <div>
                <p className="text-sm font-medium text-stone-800">ডেলিভারি</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {[
                    { id: 'home', label: 'হোম' },
                    { id: 'point', label: 'পয়েন্ট' },
                  ].map(({ id, label }) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer justify-center rounded-sm border py-3 text-sm font-semibold ${
                        deliveryMethod === id
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-stone-200'
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
              </div>

              <div>
                <label className="text-sm font-medium text-stone-800">পেমেন্ট</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className={fieldClass(false)}
                >
                  <option value="COD">ক্যাশ অন ডেলিভারি</option>
                  <option value="Online">অনলাইন</option>
                  <option value="Bkash">bKash</option>
                  <option value="Nagad">Nagad</option>
                </select>
              </div>

              {(paymentType === 'Bkash' && settings.bkash_mode === 'manual') ||
              (paymentType === 'Nagad' && settings.nagad_mode === 'manual') ? (
                <div className="rounded-sm bg-sage-50 p-4">
                  <p className="text-sm">
                    Send: {paymentType === 'Bkash' ? settings.bkash_number : settings.nagad_number}
                  </p>
                  <input
                    value={bkashNumber}
                    onChange={(e) => setBkashNumber(e.target.value)}
                    className={fieldClass(errors.bkashNumber)}
                    placeholder="Txn ID"
                  />
                </div>
              ) : null}

              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="কুপন কোড"
                  className="min-w-0 flex-1 rounded-sm border border-stone-200 px-4 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponBusy}
                  className="rounded-sm border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800"
                >
                  {couponBusy ? '…' : 'Apply'}
                </button>
              </div>

              <button
                type="submit"
                className="w-full rounded-sm bg-brand-600 py-4 text-base font-semibold text-white shadow-md hover:bg-brand-700"
              >
                {showPreorder ? 'প্রি-অর্ডার কনফার্ম' : 'অর্ডার কনফার্ম করুন'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      </section>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/55 p-4 backdrop-blur-sm"
            onClick={() => !placing && setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-md rounded-sm bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-semibold">অর্ডার কনফার্ম?</h3>
              <ul className="mt-2 space-y-1 text-sm text-stone-600">
                {orderItems.map((item) => (
                  <li key={cartLineKey(item)}>
                    {item.name} × {item.quantity}
                  </li>
                ))}
              </ul>
              <p className="text-2xl font-bold text-brand-700">৳{total.toFixed(2)}</p>
              <div className="mt-4 rounded-sm bg-stone-50 p-4 text-sm">
                <p className="font-semibold">{customerName}</p>
                <p>{customerPhone}</p>
                <p className="mt-2">{fullAddress}</p>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={placing}
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 rounded-sm border py-3 text-sm font-semibold"
                >
                  পিছনে
                </button>
                <button
                  type="button"
                  disabled={placing}
                  onClick={placeOrder}
                  className="flex-1 rounded-sm bg-brand-600 py-3 text-sm font-semibold text-white"
                >
                  {placing ? '…' : 'হ্যাঁ, অর্ডার দিন'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
