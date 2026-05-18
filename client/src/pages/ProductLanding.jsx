import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { resolveImageUrl } from '../utils/image';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { ProductPageSkeleton } from '../components/Skeletons';
import LandingHero from '../components/LandingHero';
import LandingCheckout from '../components/LandingCheckout';
import {
  canPurchaseProduct,
  displayPriceRange,
  isPreorderProduct,
  maxOrderQuantity,
} from '../utils/productAvailability';

const fade = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
};

/**
 * Facebook বিজ্ঞাপন ল্যান্ডিং — URL: /lp/:id
 * API: GET /api/products/landing/:id (landing_enabled চালু থাকতে হবে)
 * অর্ডার: LandingCheckout কম্পোনেন্ট
 */
function ProductLanding() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [otherProducts, setOtherProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [landingRes, allRes] = await Promise.all([
          fetchWithTimeout(apiUrl(`/api/products/landing/${id}`)),
          fetchWithTimeout(apiUrl('/api/products')),
        ]);
        if (!landingRes.ok) throw new Error('Landing not available');
        const data = await landingRes.json();
        setProduct(data);

        const po = Array.isArray(data.pricing_options) ? data.pricing_options : [];
        const sizes = Array.isArray(data.sizes) ? data.sizes : [];
        const colors = Array.isArray(data.colors) ? data.colors : [];
        setSelectedSize(po.length ? String(po[0].label || '').trim() : sizes[0] || '');
        setSelectedColor(colors[0] || '');

        let all = [];
        if (allRes.ok) {
          const raw = await allRes.json().catch(() => []);
          all = Array.isArray(raw) ? raw : [];
        }
        setOtherProducts(all.filter((p) => p.id !== data.id).slice(0, 8));
      } catch {
        setProduct(null);
        toast.error('এই অফার পেজটি উপলব্ধ নয়।');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const promoSlides = useMemo(() => {
    if (!product) return [];
    const landing = Array.isArray(product.landing_slides) ? product.landing_slides : [];
    if (landing.length) return landing;
    if (Array.isArray(product.images) && product.images.length) return product.images;
    return product.image ? [product.image] : [];
  }, [product]);

  const pricingOpts = Array.isArray(product?.pricing_options) ? product.pricing_options : [];
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  const colors = Array.isArray(product?.colors) ? product.colors : [];
  const maxQty = product ? maxOrderQuantity(product) : 0;
  const showPreorder = product && isPreorderProduct(product) && Number(product.stock) <= 0;

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    if (pricingOpts.length && selectedSize) {
      const o = pricingOpts.find((x) => String(x.label || '').trim() === String(selectedSize).trim());
      if (o != null && Number.isFinite(Number(o.price))) return Number(o.price);
    }
    return Number(product.price);
  }, [product, pricingOpts, selectedSize]);

  const needsUnit = pricingOpts.length > 0 || sizes.length > 0;

  const lineItem = useMemo(() => {
    if (!product || !canPurchaseProduct(product)) return null;
    if (needsUnit && !selectedSize) return null;
    if (colors.length && !selectedColor) return null;
    return {
      ...product,
      price: unitPrice,
      quantity,
      selectedSize: selectedSize || undefined,
      selectedColor: selectedColor || undefined,
    };
  }, [product, unitPrice, quantity, selectedSize, selectedColor, needsUnit, colors.length]);

  const scrollToCheckout = () => {
    if (!canPurchaseProduct(product)) {
      toast.error('স্টকে নেই।');
      return;
    }
    if (needsUnit && !selectedSize) {
      toast.error(pricingOpts.length ? 'ইউনিট বেছে নিন' : 'সাইজ বেছে নিন');
      return;
    }
    if (colors.length && !selectedColor) {
      toast.error('রং বেছে নিন');
      return;
    }
    document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
        <ProductPageSkeleton />
      </motion.div>
    );
  }

  if (!product) {
    return (
      <motion.div className="rounded-lg border border-stone-200 bg-white p-10 text-center shadow-sm">
        <p className="text-stone-700">এই অফার পেজটি উপলব্ধ নয়।</p>
        <Link to="/shop" className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline">
          শপে যান
        </Link>
      </motion.div>
    );
  }

  const heroSrc = resolveImageUrl(product.image);
  const descText = (product.description || '').slice(0, 160);
  const canOrder = canPurchaseProduct(product);

  return (
    <>
      <Helmet>
        <title>{product.name} — Special offer | Qismat</title>
        <meta name="description" content={descText || product.name} />
        <meta property="og:title" content={`${product.name} — Qismat`} />
        <meta property="og:description" content={descText || product.name} />
        <meta property="og:image" content={heroSrc} />
      </Helmet>

      <div className="space-y-8 pb-14 sm:space-y-10 lg:space-y-12">
        <LandingHero
          productName={product.name}
          promoSlides={promoSlides}
          heroSrc={heroSrc}
        />

        {/* Product options — variant & quantity */}
        <motion.section
          {...fade}
          className="mx-auto max-w-6xl px-3 sm:px-4"
        >
          <div className="rounded-lg border border-stone-200/90 bg-white p-4 shadow-md shadow-stone-200/25 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-4">
                <img
                  src={heroSrc}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-lg border border-stone-100 object-cover shadow-sm sm:h-24 sm:w-24"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">অপশন বেছে নিন</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900 sm:text-xl">{product.name}</p>
                  <p className="mt-0.5 text-sm text-stone-500">পরিমাণ সিলেক্ট করুন</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:min-w-[280px]">
                {pricingOpts.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-stone-500">ইউনিট</p>
                    <div className="flex flex-wrap gap-2">
                      {pricingOpts.map((opt) => {
                        const label = String(opt.label || '').trim();
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setSelectedSize(label)}
                            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                              selectedSize === label
                                ? 'border-brand-600 bg-brand-600 text-white shadow-md'
                                : 'border-stone-200 hover:border-brand-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!pricingOpts.length && sizes.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-stone-500">সাইজ</p>
                    <div className="flex flex-wrap gap-2">
                      {sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedSize(s)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                            selectedSize === s ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {colors.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-stone-500">রং</p>
                    <motion.div layout className="flex flex-wrap gap-2">
                      {colors.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setSelectedColor(c)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                            selectedColor === c ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-stone-200'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </motion.div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="h-11 w-11 text-lg font-medium hover:bg-white"
                    >
                      −
                    </button>
                    <span className="min-w-[2.5rem] text-center font-semibold">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(maxQty || q, q + 1))}
                      disabled={maxQty > 0 && quantity >= maxQty}
                      className="h-11 w-11 text-lg font-medium hover:bg-white disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <motion.button
                    type="button"
                    whileHover={{ scale: canOrder ? 1.02 : 1 }}
                    whileTap={{ scale: canOrder ? 0.98 : 1 }}
                    onClick={scrollToCheckout}
                    disabled={!canOrder}
                    className="flex-1 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 hover:bg-brand-700 disabled:bg-stone-300"
                  >
                    {showPreorder ? 'প্রি-অর্ডার' : 'অর্ডার করুন ↓'}
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Inline checkout */}
        <div className="mx-auto max-w-6xl px-3 sm:px-4">
          <LandingCheckout lineItem={lineItem} productName={product.name} showPreorder={showPreorder} />
        </div>

        {/* More products */}
        {otherProducts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-6xl px-3 sm:px-4"
          >
            <h2 className="text-lg font-semibold text-stone-900 sm:text-xl">আরও পণ্য</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {otherProducts.map((p, i) => {
                const pr = displayPriceRange(p);
                const priceLabel = pr.single ? `৳${pr.min.toFixed(0)}` : `From ৳${pr.min.toFixed(0)}`;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.04, 0.2) }}
                    className="group overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <Link to={`/product/${p.id}`} className="block overflow-hidden">
                      <img
                        src={resolveImageUrl(p.image)}
                        alt={p.name}
                        className="h-28 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-40 lg:h-44"
                        loading="lazy"
                      />
                    </Link>
                    <div className="p-2.5 sm:p-4">
                      <Link
                        to={`/product/${p.id}`}
                        className="line-clamp-2 text-sm font-semibold leading-snug text-stone-900 hover:text-brand-600 sm:text-base"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-stone-600 sm:mt-1 sm:text-sm">{priceLabel}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}
      </div>
    </>
  );
}

export default ProductLanding;
