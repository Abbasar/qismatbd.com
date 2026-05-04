import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import ProductCarousel from '../components/ProductCarousel';
import PrevPromo from '../components/PrevPromo';
import 'swiper/css';
import 'swiper/css/pagination';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { ProductCardSkeleton } from '../components/Skeletons';
import { resolveImageUrl } from '../utils/image';
import { formatCategoryHeroLabel, parseCategoriesApiResponse } from '../utils/categories';

const ALL_PRODUCTS_HERO_IMAGE =
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};

function BrandsChevronLeft({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function BrandsChevronRight({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className={className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

const DEFAULT_UNBOXING_HERO =
  'https://images.unsplash.com/photo-1441986300917-64667bd8cfe?auto=format&fit=crop&w=1200&q=80';
const DEFAULT_NEWSLETTER_BG =
  'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1600&q=80';
const normalizeUnboxingVideoUrl = (rawUrl) => {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  const iframeMatch = s.match(/src=["']([^"']+)["']/i);
  const candidate = iframeMatch?.[1] ? String(iframeMatch[1]).trim() : s;
  try {
    const u = new URL(candidate);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname.startsWith('/embed/')) return candidate;
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/').filter(Boolean)[1];
        return id ? `https://www.youtube.com/embed/${id}` : candidate;
      }
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : candidate;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${id}` : candidate;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id ? `https://player.vimeo.com/video/${id}` : candidate;
    }
    return candidate;
  } catch {
    return candidate;
  }
};

const isEmbedVideoUrl = (url) => {
  const s = String(url || '').trim();
  return s.includes('youtube.com/embed/') || s.includes('player.vimeo.com/video/');
};

function Home() {
  const [newArrivals, setNewArrivals] = useState([]);
  const [popularProducts, setPopularProducts] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryImages, setCategoryImages] = useState({});
  const [advertise, setAdvertise] = useState({
    unboxing: '',
    newsletter: '',
    unboxingTitle: 'Designed to feel as good as unboxing.',
    unboxingSubtitle: 'A quieter kind of commerce: editorial layouts, precise typography, and checkout that respects your time.',
    unboxingMediaType: 'image',
    unboxingVideoUrl: '',
  });
  const [brands, setBrands] = useState([]);
  const [storefrontReviews, setStorefrontReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newsletterBusy, setNewsletterBusy] = useState(false);
  const categorySliderRef = useRef(null);
  const categoryDragRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const brandsSwiperRef = useRef(null);
  const [brandsNav, setBrandsNav] = useState({ atStart: true, atEnd: false });
  const [brandsSwiperLocked, setBrandsSwiperLocked] = useState(true);

  const syncBrandsNav = useCallback((s) => {
    if (!s) return;
    setBrandsNav({ atStart: s.isBeginning, atEnd: s.isEnd });
    setBrandsSwiperLocked(!!s.isLocked);
  }, []);

  useEffect(() => {
    const fetchHighlights = async () => {
      try {
        setLoading(true);
        const [highlightsRes, productsRes, catRes, settingsRes, brandsRes] = await Promise.all([
          fetchWithTimeout(apiUrl('/api/products/highlights')),
          fetchWithTimeout(apiUrl('/api/products')),
          fetchWithTimeout(apiUrl('/api/products/meta/categories')),
          fetchWithTimeout(apiUrl('/api/settings')),
          fetchWithTimeout(apiUrl('/api/brands')),
        ]);
        if (!highlightsRes.ok || !productsRes.ok) throw new Error('Unable to load highlights');
        const [highlightData, allProducts] = await Promise.all([highlightsRes.json(), productsRes.json()]);
        setNewArrivals(highlightData.newArrivals || []);
        setPopularProducts(highlightData.popular || []);
        setFeaturedProducts((allProducts || []).slice(0, 8));
        if (catRes.ok) {
          const c = await catRes.json();
          const { categories: catNames, images } = parseCategoriesApiResponse(c);
          setCategories(catNames);
          setCategoryImages(images);
        }
        if (settingsRes.ok) {
          const settingsArr = await settingsRes.json();
          const map = Object.fromEntries(
            (Array.isArray(settingsArr) ? settingsArr : []).map((r) => [r.setting_key, r.setting_value])
          );
          setAdvertise({
            unboxing: String(map.advertise_unboxing_hero_image || '').trim(),
            newsletter: String(map.advertise_newsletter_bg_image || '').trim(),
            unboxingTitle:
              String(map.advertise_unboxing_title || '').trim() || 'Designed to feel as good as unboxing.',
            unboxingSubtitle:
              String(map.advertise_unboxing_subtitle || '').trim() ||
              'A quieter kind of commerce: editorial layouts, precise typography, and checkout that respects your time.',
            unboxingMediaType: String(map.advertise_unboxing_media_type || 'image').trim() === 'video' ? 'video' : 'image',
            unboxingVideoUrl: String(map.advertise_unboxing_video_url || '').trim(),
          });
        }
        if (brandsRes.ok) {
          const b = await brandsRes.json();
          setBrands(Array.isArray(b) ? b : []);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(apiUrl('/api/reviews/storefront?limit=16'));
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setStorefrontReviews(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setStorefrontReviews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unboxingVideoUrl = useMemo(
    () => normalizeUnboxingVideoUrl(advertise.unboxingVideoUrl),
    [advertise.unboxingVideoUrl]
  );

  const categoryTiles = useMemo(() => {
    const base = (categories || []).filter((n) => String(n).trim().toLowerCase() !== 'general');
    if (base.length === 0) return [];
    const fromApi = base.map((name, i) => ({
      name,
      label: formatCategoryHeroLabel(name),
      imageUrl: String(categoryImages[name] || '').trim(),
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
    const allProducts = {
      name: 'All Products',
      label: 'All Products',
      imageUrl: ALL_PRODUCTS_HERO_IMAGE,
      to: '/shop',
      gradient: 'from-amber-500/90 to-orange-400/90',
    };
    return [allProducts, ...fromApi];
  }, [categories, categoryImages]);

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

      <PrevPromo>
        <div className="flex w-full flex-col items-center gap-2 sm:gap-3">
          {categoryTiles.length === 0 ? (
            <p className="pointer-events-auto max-w-md rounded-xl border border-white/30 bg-stone-900/75 px-4 py-3 text-center text-[11px] leading-snug text-white shadow-lg backdrop-blur-md sm:text-xs">
              কোনো ক্যাটাগরি নেই। <span className="font-semibold">Admin → Products</span> থেকে ক্যাটাগরি যোগ করুন। General এখানে টাইল হিসেবে দেখায় না।
            </p>
          ) : (
            <div className="pointer-events-none w-full px-1 sm:px-2">
              <div className="pointer-events-auto relative mx-auto w-full max-w-[min(100%,26rem)] rounded border border-stone-200/90 bg-white px-3 py-3 shadow-[0_12px_40px_rgba(15,23,42,0.14),0_2px_8px_rgba(15,23,42,0.06)] sm:max-w-3xl  sm:px-5 sm:py-4 md:max-w-4xl lg:max-w-5xl">
                <div className="relative md:px-10">
                  <button
                    type="button"
                    aria-label="Scroll categories left"
                    onClick={() => scrollCategories(-1)}
                    className="absolute left-0 top-1/2 z-[6] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-sm text-stone-600 shadow-md transition hover:bg-stone-50 md:flex"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label="Scroll categories right"
                    onClick={() => scrollCategories(1)}
                    className="absolute right-0 top-1/2 z-[6] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-sm text-stone-600 shadow-md transition hover:bg-stone-50 md:flex"
                  >
                    →
                  </button>
                  <div
                    ref={categorySliderRef}
                    className="relative z-[1] mx-auto flex max-w-full cursor-grab snap-x snap-mandatory gap-3 overflow-x-auto py-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] max-md:justify-start md:justify-center md:gap-6 lg:gap-7 [&::-webkit-scrollbar]:hidden"
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
                        className="shrink-0 snap-start first:pl-0.5 last:pr-0.5 sm:first:pl-0 sm:last:pr-0"
                      >
                        <Link
                          to={tile.to}
                          aria-label={`Shop: ${tile.name}`}
                          className="group flex w-[4.5rem] min-w-[4.5rem] flex-col items-center gap-1.5 rounded-xl py-0.5 outline-none ring-brand-400/0 transition hover:ring-2 hover:ring-brand-100/90 focus-visible:ring-2 focus-visible:ring-brand-500 sm:w-[5.25rem] sm:min-w-[5.25rem] md:w-[5.5rem] md:min-w-[5.5rem]"
                        >
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-stone-200/95 bg-stone-50 shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-[3px] ring-white transition duration-300 group-hover:-translate-y-0.5 group-hover:border-brand-200/80 group-hover:shadow-md sm:h-16 sm:w-16 md:h-[4.25rem] md:w-[4.25rem]">
                            {tile.imageUrl ? (
                              <img
                                src={resolveImageUrl(tile.imageUrl)}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                loading={idx === 0 ? 'eager' : 'lazy'}
                                decoding="async"
                              />
                            ) : (
                              <div
                                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tile.gradient} opacity-[0.93] transition duration-300 group-hover:scale-105`}
                              />
                            )}
                          </div>
                          <p className="line-clamp-2 w-full text-center text-[11px] font-medium leading-snug text-stone-800 underline-offset-2 group-hover:text-brand-800 group-hover:underline sm:text-xs sm:leading-snug md:text-[13px]">
                            {tile.label}
                          </p>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </PrevPromo>

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
            {/* <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600">New season</p> */}
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-stone-900 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              {advertise.unboxingTitle}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
              {advertise.unboxingSubtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/shop"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-sm bg-brand-600 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/18 transition hover:-translate-y-0.5 hover:bg-brand-700 sm:w-auto"
              >
                Shop now
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm border border-stone-200/80 bg-stone-100">
              {advertise.unboxingMediaType === 'video' && unboxingVideoUrl ? (
                isEmbedVideoUrl(unboxingVideoUrl) ? (
                  <iframe
                    src={unboxingVideoUrl}
                    title="Qismat hero video"
                    className="absolute inset-0 h-full w-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={unboxingVideoUrl}
                    className="absolute inset-0 h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls
                  />
                )
              ) : (
                <img
                  src={advertise.unboxing ? resolveImageUrl(advertise.unboxing) : DEFAULT_UNBOXING_HERO}
                  alt="Qismat collection"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {brands.length > 0 ? (
        <section className="relative overflow-hidden rounded border border-stone-200/75 bg-gradient-to-br from-white via-stone-50/50 to-brand-50/[0.18] px-4 py-7 shadow-[0_22px_60px_-28px_rgba(15,23,42,0.12)] ring-1 ring-stone-900/[0.03] sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-brand-200/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-peach-200/25 blur-3xl" />
          <div className="relative mx-auto max-w-6xl">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">Our brands</h2>

            <div className="relative mt-6 sm:mt-8">
              <button
                type="button"
                aria-label="Previous brands"
                disabled={brandsNav.atStart}
                onClick={() => brandsSwiperRef.current?.slidePrev()}
                className={`absolute left-0 top-1/2 z-10 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/95 bg-white text-stone-700 shadow-[0_4px_16px_rgba(15,23,42,0.1)] transition hover:border-brand-200/80 hover:text-brand-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-35 sm:left-1 ${
                  brandsSwiperLocked ? 'hidden' : 'hidden md:flex'
                }`}
              >
                <BrandsChevronLeft className="h-5 w-5 shrink-0" />
              </button>
              <button
                type="button"
                aria-label="Next brands"
                disabled={brandsNav.atEnd}
                onClick={() => brandsSwiperRef.current?.slideNext()}
                className={`absolute right-0 top-1/2 z-10 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/95 bg-white text-stone-700 shadow-[0_4px_16px_rgba(15,23,42,0.1)] transition hover:border-brand-200/80 hover:text-brand-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-35 sm:right-1 ${
                  brandsSwiperLocked ? 'hidden' : 'hidden md:flex'
                }`}
              >
                <BrandsChevronRight className="h-5 w-5 shrink-0" />
              </button>

              <Swiper
                slidesPerView="auto"
                spaceBetween={14}
                watchOverflow
                breakpoints={{
                  480: { spaceBetween: 16 },
                  768: { spaceBetween: 18 },
                  1024: { spaceBetween: 20 },
                }}
                className={`py-1 ${brandsSwiperLocked ? '' : 'md:px-12'}`}
                onSwiper={(s) => {
                  brandsSwiperRef.current = s;
                  syncBrandsNav(s);
                }}
                onSlideChange={syncBrandsNav}
                onReachBeginning={syncBrandsNav}
                onReachEnd={syncBrandsNav}
                onResize={syncBrandsNav}
              >
                {brands.map((b) => (
                  <SwiperSlide key={b.id} className="!w-[124px] sm:!w-[142px] md:!w-[156px]">
                    <Link
                      to={`/shop?brand=${b.id}`}
                      className="group flex h-full min-h-[148px] flex-col items-center gap-3 rounded border border-stone-200/80 bg-white/90 px-3 py-4 shadow-sm shadow-stone-900/[0.04] ring-1 ring-stone-900/[0.02] transition duration-300 hover:-translate-y-0.5 hover:border-brand-200/60 hover:bg-white hover:shadow-md hover:shadow-brand-900/5"
                    >
                      <div className="flex h-[72px] w-full items-center justify-center rounded-xl bg-gradient-to-b from-stone-50 to-white px-2 ring-1 ring-stone-100 transition group-hover:from-brand-50/40 group-hover:ring-brand-100/80">
                        {b.logo_url ? (
                          <img
                            src={resolveImageUrl(b.logo_url)}
                            alt=""
                            className="max-h-[52px] max-w-full object-contain opacity-[0.92] transition group-hover:opacity-100"
                            loading="lazy"
                          />
                        ) : (
                          <span className="rounded-full bg-gradient-to-br from-brand-100 to-peach-100 px-3 py-2 text-center text-xs font-bold tracking-wide text-brand-900">
                            {String(b.name || '').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-2 w-full text-center text-[11px] font-semibold leading-snug text-stone-800 transition group-hover:text-brand-800 sm:text-xs">
                        {b.name}
                      </span>
                    </Link>
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
          </div>
        </section>
      ) : null}

      {storefrontReviews.length > 0 ? (
        <section className="overflow-hidden rounded-sm border border-stone-200/90 bg-white px-4 py-7 shadow-sm sm:px-6 sm:py-9">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex flex-col gap-1 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-600">Reviews</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
                  What customers say
                </h2>
                <p className="mt-1 max-w-xl text-sm text-stone-600">
                  Real feedback from shoppers — tap a card to view the product.
                </p>
              </div>
            </div>
            <Swiper
              modules={[Pagination]}
              pagination={{ clickable: true }}
              spaceBetween={16}
              slidesPerView={1.08}
              breakpoints={{
                520: { slidesPerView: 1.25, spaceBetween: 16 },
                768: { slidesPerView: 2.05, spaceBetween: 18 },
                1024: { slidesPerView: 2.75, spaceBetween: 20 },
                1280: { slidesPerView: 3.1, spaceBetween: 20 },
              }}
              className="home-reviews-swiper !pb-12 [&_.swiper-pagination-bullet-active]:bg-brand-600"
            >
              {storefrontReviews.map((r) => (
                <SwiperSlide key={r.id} className="!h-auto">
                  <Link
                    to={`/product/${r.product_id}`}
                    className="group flex h-full min-h-[200px] flex-col rounded-xl border border-stone-200/90 bg-gradient-to-b from-stone-50/80 to-white p-4 shadow-sm ring-1 ring-stone-900/[0.03] transition hover:border-brand-200/70 hover:shadow-md sm:p-5"
                  >
                    <div className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                        {r.product_image ? (
                          <img
                            src={resolveImageUrl(r.product_image)}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-stone-400">
                            Product
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-stone-900">{r.user_name || 'Customer'}</p>
                        <div className="mt-0.5 flex gap-0.5 text-[13px] leading-none">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} className={star <= Number(r.rating) ? 'text-amber-500' : 'text-stone-300'}>
                              ★
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 line-clamp-1 text-xs font-semibold text-brand-800 group-hover:underline">
                          {r.product_name}
                        </p>
                      </div>
                    </div>
                    {r.title ? (
                      <p className="mt-3 line-clamp-2 text-sm font-semibold text-stone-900">{r.title}</p>
                    ) : null}
                    <p className="mt-2 line-clamp-4 flex-1 text-sm leading-relaxed text-stone-600">{r.comment}</p>
                    <p className="mt-3 text-[11px] text-stone-400">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}
                    </p>
                  </Link>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>
        </section>
      ) : null}

      <section className="relative grid gap-4 overflow-hidden rounded-sm border border-peach-200/70 bg-gradient-to-br from-peach-50 via-white to-sage-50/60 px-4 py-6 shadow-sm shadow-brand-100/30 sm:px-6 sm:py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <img
          src={advertise.newsletter ? resolveImageUrl(advertise.newsletter) : DEFAULT_NEWSLETTER_BG}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.06]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/95 via-peach-50/88 to-white/92" />
        <div className="relative z-[1]">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600"></p>
          <h2 className="mt-3 text-2xl font-semibold text-stone-900 sm:text-3xl">Stay Updated</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">
            Get exclusive deals and yearly access to our new products.
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