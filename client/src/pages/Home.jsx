import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import ProductCarousel from '../components/ProductCarousel';
import PrevPromo from '../components/PrevPromo';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { ProductCardSkeleton } from '../components/Skeletons';
import { pickProductCoverImage, resolveImageUrl } from '../utils/image';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};

const DEFAULT_UNBOXING_HERO =
  'https://images.unsplash.com/photo-1441986300917-64667bd8cfe?auto=format&fit=crop&w=1200&q=80';
const DEFAULT_NEWSLETTER_BG =
  'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1600&q=80';

function Home() {
  const [newArrivals, setNewArrivals] = useState([]);
  const [popularProducts, setPopularProducts] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [advertise, setAdvertise] = useState({ unboxing: '', newsletter: '' });
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newsletterBusy, setNewsletterBusy] = useState(false);
  const categorySliderRef = useRef(null);
  const categoryDragRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });

  useEffect(() => {
    const fetchHighlights = async () => {
      try {
        setLoading(true);
        const [highlightsRes, productsRes, catRes, settingsRes] = await Promise.all([
          fetchWithTimeout(apiUrl('/api/products/highlights')),
          fetchWithTimeout(apiUrl('/api/products')),
          fetchWithTimeout(apiUrl('/api/products/meta/categories')),
          fetchWithTimeout(apiUrl('/api/settings')),
        ]);
        if (!highlightsRes.ok || !productsRes.ok) throw new Error('Unable to load highlights');
        const [highlightData, allProducts] = await Promise.all([highlightsRes.json(), productsRes.json()]);
        setNewArrivals(highlightData.newArrivals || []);
        setPopularProducts(highlightData.popular || []);
        setFeaturedProducts((allProducts || []).slice(0, 8));
        if (catRes.ok) {
          const c = await catRes.json();
          setCategories(Array.isArray(c) ? c : []);
        }
        if (settingsRes.ok) {
          const settingsArr = await settingsRes.json();
          const map = Object.fromEntries(
            (Array.isArray(settingsArr) ? settingsArr : []).map((r) => [r.setting_key, r.setting_value])
          );
          setAdvertise({
            unboxing: String(map.advertise_unboxing_hero_image || '').trim(),
            newsletter: String(map.advertise_newsletter_bg_image || '').trim(),
          });
        }
      } catch (error) {
        console.error(error);
        toast.error('Could not load the storefront. Check API / database.');
      } finally {
        setLoading(false);
      }
    };
    fetchHighlights();
  }, []);

  /**
   * Center “polaroid” = catalog image (not Admin Advertise bg). Merge featured + highlights so
   * we still find a cover if the newest 8 products have no image.
   */
  const unboxingHeroProduct = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const list of [featuredProducts, popularProducts, newArrivals]) {
      for (const p of list || []) {
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        merged.push(p);
      }
    }
    return merged.find((p) => pickProductCoverImage(p)) || merged[0] || null;
  }, [featuredProducts, popularProducts, newArrivals]);

  const unboxingHeroImage = useMemo(
    () => pickProductCoverImage(unboxingHeroProduct),
    [unboxingHeroProduct]
  );

  const categoryTiles = useMemo(() => {
    const base = (categories || []).filter((n) => String(n).trim().toLowerCase() !== 'general');
    return base.map((name, i) => ({
      name,
      to: `/shop?category=${encodeURIComponent(name)}`,
      gradient: [
        'from-brand-600/90 to-peach-500/90',
        'from-sage-600/90 to-sage-400/90',
        'from-peach-500/90 to-brand-500/90',
        'from-sage-500/90 to-peach-400/90',
        'from-stone-800/90 to-stone-600/90',
        'from-brand-500/90 to-sage-500/90',
      ][i % 6],
    }));
  }, [categories]);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email.');
      return;
    }
    setNewsletterBusy(true);
    try {
      const res = await fetch(apiUrl('/api/newsletter/subscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Subscribe failed');
      toast.success(data.message || 'You are subscribed.');
      setEmail('');
    } catch (err) {
      toast.error(err.message || 'Could not subscribe');
    } finally {
      setNewsletterBusy(false);
    }
  };

  const scrollCategories = (direction) => {
    const slider = categorySliderRef.current;
    if (!slider) return;
    slider.scrollBy({ left: direction * 150, behavior: 'smooth' });
  };

  const onCategoryPointerDown = (e) => {
    const slider = categorySliderRef.current;
    if (!slider) return;
    categoryDragRef.current = {
      active: true,
      startX: e.clientX,
      startScrollLeft: slider.scrollLeft,
    };
    slider.setPointerCapture(e.pointerId);
    slider.style.cursor = 'grabbing';
  };

  const onCategoryPointerMove = (e) => {
    const slider = categorySliderRef.current;
    if (!slider || !categoryDragRef.current.active) return;
    const dragDistance = e.clientX - categoryDragRef.current.startX;
    slider.scrollLeft = categoryDragRef.current.startScrollLeft - dragDistance;
  };

  const onCategoryPointerUp = (e) => {
    const slider = categorySliderRef.current;
    if (!slider) return;
    if (categoryDragRef.current.active && slider.hasPointerCapture?.(e.pointerId)) {
      slider.releasePointerCapture(e.pointerId);
    }
    categoryDragRef.current.active = false;
    slider.style.cursor = 'grab';
  };

  return (
    <div className="space-y-5 sm:space-y-6 lg:space-y-8">
      <Helmet>
        <title>Qismat — Curated products, calm checkout</title>
        <meta
          name="description"
          content="Shop curated products with secure checkout, fast delivery, and a minimalist shopping experience powered by Qismat."
        />
        <meta property="og:title" content="Qismat — Modern ecommerce" />
        <meta property="og:description" content="Minimalist storefront with premium product storytelling and frictionless checkout." />
        <link rel="canonical" href="/" />
      </Helmet>

      <PrevPromo />

      <section className="space-y-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-600 sm:text-xs sm:tracking-[0.3em]">Browse</p>
            <h2 className="mt-1 text-lg font-semibold text-stone-900 sm:text-xl">Featured categories</h2>
            <p className="mt-0.5 text-xs text-stone-600 sm:text-sm">Add names in Admin → Products; they appear here (General is not shown as a tile).</p>
          </div>
          <Link to="/shop" className="text-xs font-semibold text-brand-600 hover:text-brand-700 sm:text-sm">
            View all →
          </Link>
        </div>
        {categoryTiles.length === 0 ? (
          <div className="rounded-sm border border-dashed border-stone-200 bg-stone-50/80 px-4 py-6 text-center text-xs text-stone-600 sm:text-sm">
            No categories yet. Open <span className="font-semibold text-stone-800">Admin → Products</span>, add a category, then assign products to it.
          </div>
        ) : (
          <div className="relative">
            <button
              type="button"
              aria-label="Scroll categories left"
              onClick={() => scrollCategories(-1)}
              className="absolute -left-1 top-1/2 z-[2] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-sm text-stone-700 shadow-sm transition hover:bg-stone-50 sm:flex"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Scroll categories right"
              onClick={() => scrollCategories(1)}
              className="absolute -right-1 top-1/2 z-[2] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-sm text-stone-700 shadow-sm transition hover:bg-stone-50 sm:flex"
            >
              →
            </button>

            <div
              ref={categorySliderRef}
              className="flex cursor-grab gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2 sm:pb-2"
              onPointerDown={onCategoryPointerDown}
              onPointerMove={onCategoryPointerMove}
              onPointerUp={onCategoryPointerUp}
              onPointerLeave={onCategoryPointerUp}
            >
              {categoryTiles.map((tile, idx) => (
                <motion.div
                  key={tile.name + idx}
                  {...fadeUp}
                  transition={{ duration: 0.35, delay: idx * 0.04 }}
                  className="w-[108px] min-w-[108px] sm:w-[124px] sm:min-w-[124px]"
                >
                  <Link
                    to={tile.to}
                    className="group relative block overflow-hidden rounded-sm border border-stone-200/80 bg-brand-900 p-2.5 text-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:p-3"
                  >
                    <div className={`pointer-events-none absolute inset-0 opacity-90 transition duration-500 group-hover:scale-105 bg-gradient-to-br ${tile.gradient}`} />
                    <div className="relative flex min-h-[62px] flex-col justify-end sm:min-h-[66px]">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/80 sm:text-[9px] sm:tracking-[0.18em]">Shop</p>
                      <p className="mt-0.5 text-xs font-semibold leading-tight sm:text-[13px]">{tile.name}</p>
                      <p className="mt-0.5 text-[9px] text-white/85 sm:text-[10px]">Explore →</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </section>

      {loading ? (
        <ProductCardSkeleton count={4} />
      ) : (
        <>
          <ProductCarousel
            badge="Signal"
            title="Trending now"
            subtitle="What shoppers are viewing and reviewing right now."
            products={popularProducts.length ? popularProducts : featuredProducts}
          />
          <ProductCarousel
            badge="Just landed"
            title="New arrivals"
            subtitle="Fresh listings from your catalog."
            products={newArrivals}
          />
        </>
      )}

<section className="relative overflow-hidden rounded-sm border border-stone-200/80 bg-white shadow-[0_20px_70px_-40px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-peach-200/35 blur-3xl" />
        <div className="relative grid gap-5 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600">New season</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-stone-900 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              Designed to feel as good as{' '}
              <span className="bg-gradient-to-r from-brand-600 to-peach-500 bg-clip-text text-transparent">unboxing</span>.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
              A quieter kind of commerce: editorial layouts, precise typography, and checkout that respects your time.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/shop"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-sm bg-brand-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/18 transition hover:-translate-y-0.5 hover:bg-brand-700 sm:w-auto"
              >
                Shop collection
              </Link>
              <Link
                to="/about"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-sm border border-stone-200 bg-white px-7 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 sm:w-auto"
              >
                Our story
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-1 gap-6 border-t border-stone-100 pt-8 text-sm sm:grid-cols-3 sm:gap-4">
              <div>
                <dt className="text-stone-500">Shipping</dt>
                <dd className="mt-1 font-semibold text-stone-900">Nationwide</dd>
              </div>
              <div>
                <dt className="text-stone-500">Checkout</dt>
                <dd className="mt-1 font-semibold text-stone-900">SSL ready</dd>
              </div>
              <div>
                <dt className="text-stone-500">Support</dt>
                <dd className="mt-1 font-semibold text-stone-900">Human, fast</dd>
              </div>
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm border border-stone-200/80 bg-stone-100 shadow-inner">
              <img
                src={advertise.unboxing ? resolveImageUrl(advertise.unboxing) : DEFAULT_UNBOXING_HERO}
                alt="Qismat collection"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-900/55 via-stone-900/10 to-stone-900/25" />
              {loading ? (
                <div className="absolute inset-0 animate-pulse bg-white/20 backdrop-blur-[1px]" />
              ) : null}
              {unboxingHeroProduct ? (
                <div className="absolute inset-0 z-[1] flex items-center justify-center p-5 sm:p-8">
                  <div className="relative aspect-[4/5] w-[min(220px,58%)] shrink-0 overflow-hidden rounded-sm border-2 border-white/95 shadow-2xl shadow-stone-900/40 ring-1 ring-brand-900/10">
                    <img
                      src={resolveImageUrl(unboxingHeroImage)}
                      alt={unboxingHeroProduct.name}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = 'https://via.placeholder.com/600x400';
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="absolute -bottom-4 left-3 right-3 rounded-sm border border-white/70 bg-white/90 p-3 shadow-xl shadow-stone-900/10 backdrop-blur-xl sm:-bottom-6 sm:left-4 sm:right-4 sm:p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Featured pick</p>
              <p className="mt-1 text-sm font-semibold text-stone-900">
                {unboxingHeroProduct?.name || 'Your hero product appears here'}
              </p>
              {unboxingHeroProduct?.id ? (
                <Link
                  to={`/product/${unboxingHeroProduct.id}`}
                  className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  View product →
                </Link>
              ) : null}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative grid gap-4 overflow-hidden rounded-sm border border-peach-200/70 bg-gradient-to-br from-peach-50 via-white to-sage-50/60 px-4 py-6 shadow-sm shadow-brand-100/30 sm:px-6 sm:py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <img
          src={advertise.newsletter ? resolveImageUrl(advertise.newsletter) : DEFAULT_NEWSLETTER_BG}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.06]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-peach-50/88 to-white/92" />
        <div className="relative z-[1]">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600">Newsletter</p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">Occasional emails. Zero noise.</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">
            Get launch notes and curated picks — powered by your new subscriber list in MySQL.
          </p>
        </div>
        <form onSubmit={subscribe} className="relative z-[1] flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-sm border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-brand-400/0 transition placeholder:text-stone-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="submit"
            disabled={newsletterBusy}
            className="rounded-sm bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-200/70 transition hover:-translate-y-0.5 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {newsletterBusy ? 'Joining…' : 'Subscribe'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default Home;