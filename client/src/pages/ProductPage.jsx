import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { addToCart, buyNow } from '../utils/cart';
import { getAuthHeader, getCurrentUser } from '../utils/auth';
import Reviews from '../components/Reviews';
import { resolveImageUrl } from '../utils/image';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { ProductPageSkeleton } from '../components/Skeletons';
import { ProductShareAndTrust } from '../components/ProductShareAndTrust';
import {
  canPurchaseProduct,
  displayPriceRange,
  formatPreorderDateLabel,
  isPreorderProduct,
  maxOrderQuantity,
  withDefaultUnitSelection,
} from '../utils/productAvailability';

function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [activeImg, setActiveImg] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const user = getCurrentUser();

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await fetchWithTimeout(apiUrl(`/api/products/${id}`));
        if (!response.ok) throw new Error('Not found');
        const data = await response.json();
        setProduct(data);

        const imgs =
          Array.isArray(data.images) && data.images.length > 0
            ? data.images
            : [...new Set([data.image, ...(Array.isArray(data.gallery) ? data.gallery : [])].filter(Boolean))];
        setActiveImg(imgs[0] || '');
        const sizes = Array.isArray(data.sizes) ? data.sizes : [];
        const colors = Array.isArray(data.colors) ? data.colors : [];
        const po = Array.isArray(data.pricing_options) ? data.pricing_options : [];
        setSelectedSize(po.length ? String(po[0].label || '').trim() : sizes[0] || '');
        setSelectedColor(colors[0] || '');

        const [wishOutcome, allOutcome] = await Promise.allSettled([
          user
            ? fetchWithTimeout(apiUrl(`/api/wishlist/${user.id}`), { headers: getAuthHeader() })
            : Promise.resolve(null),
          fetchWithTimeout(apiUrl('/api/products')),
        ]);

        if (user && wishOutcome.status === 'fulfilled' && wishOutcome.value?.ok) {
          try {
            const wishData = await wishOutcome.value.json();
            setIsInWishlist(
              Array.isArray(wishData) && wishData.some((item) => item.product_id === data.id)
            );
          } catch {
            /* ignore wishlist parse errors */
          }
        }

        let allProducts = [];
        if (allOutcome.status === 'fulfilled' && allOutcome.value?.ok) {
          try {
            const raw = await allOutcome.value.json();
            allProducts = Array.isArray(raw) ? raw : [];
          } catch {
            allProducts = [];
          }
        }
        const related = allProducts
          .filter((p) => p.id !== data.id && (p.category || '') === (data.category || ''))
          .slice(0, 4);
        const fallback =
          related.length >= 4
            ? related
            : allProducts
                .filter((p) => p.id !== data.id)
                .sort(() => Math.random() - 0.5)
                .slice(0, 4);
        setRelatedProducts(fallback);
      } catch (error) {
        console.error(error);
        toast.error('Could not load this product.');
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, user?.id]);

  const gallery = useMemo(() => {
    if (!product) return [];
    if (Array.isArray(product.images) && product.images.length) return product.images;
    const base = [product.image, ...(Array.isArray(product.gallery) ? product.gallery : [])].filter(Boolean);
    return [...new Set(base)];
  }, [product]);

  const activeGalleryIndex = useMemo(() => {
    const idx = gallery.findIndex((x) => x === activeImg);
    return idx >= 0 ? idx : 0;
  }, [gallery, activeImg]);

  const goGallery = (delta) => {
    if (gallery.length < 2) return;
    const next = activeGalleryIndex + delta;
    const wrapped = ((next % gallery.length) + gallery.length) % gallery.length;
    setActiveImg(gallery[wrapped]);
  };

  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  const pricingOpts = Array.isArray(product?.pricing_options) ? product.pricing_options : [];
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

  const handleAddToCart = () => {
    if (!product) return;
    if (!canPurchaseProduct(product)) {
      toast.error('This product is out of stock.');
      return;
    }
    if (needsUnit && !selectedSize) {
      toast.error(pricingOpts.length ? 'Please select a unit.' : 'Please select a size.');
      return;
    }
    if (colors.length && !selectedColor) {
      toast.error('Please select a color.');
      return;
    }
    addToCart({
      ...product,
      price: unitPrice,
      quantity,
      selectedSize: selectedSize || undefined,
      selectedColor: selectedColor || undefined,
    });
    toast.success('Added to cart');
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!canPurchaseProduct(product)) {
      toast.error('This product is out of stock.');
      return;
    }
    if (needsUnit && !selectedSize) {
      toast.error(pricingOpts.length ? 'Please select a unit.' : 'Please select a size.');
      return;
    }
    if (colors.length && !selectedColor) {
      toast.error('Please select a color.');
      return;
    }
    buyNow({
      ...product,
      price: unitPrice,
      quantity,
      selectedSize: selectedSize || undefined,
      selectedColor: selectedColor || undefined,
    });
    navigate('/checkout');
  };

  const toggleWishlist = async () => {
    if (!user) {
      toast.message('Log in to use the wishlist');
      return;
    }
    if (!product) return;

    try {
      if (isInWishlist) {
        await fetch(apiUrl(`/api/wishlist/${user.id}/${product.id}`), {
          method: 'DELETE',
          headers: getAuthHeader(),
        });
        setIsInWishlist(false);
        toast.success('Removed from wishlist');
      } else {
        await fetch(apiUrl('/api/wishlist/add'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ productId: product.id }),
        });
        setIsInWishlist(true);
        toast.success('Saved to wishlist');
      }
      window.dispatchEvent(new Event('wishlist-updated'));
    } catch (error) {
      console.error(error);
      toast.error('Wishlist update failed');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ProductPageSkeleton />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-sm border border-stone-200 bg-white p-6 text-center shadow-sm sm:p-8">
        Product not found.
      </div>
    );
  }

  const activeSrc = resolveImageUrl(activeImg || product.image);
  const descText = (product.description || '').slice(0, 200);

  return (
    <>
      <Helmet>
        <title>{product.name} — Qismat</title>
        <meta name="description" content={descText || `Buy ${product.name} at Qismat.`} />
        <meta property="og:title" content={`${product.name} — Qismat`} />
        <meta property="og:description" content={descText || product.name} />
        <meta property="og:image" content={activeSrc} />
      </Helmet>

      <div className="space-y-6 pb-8 lg:space-y-8 lg:pb-12">
        <div className="min-w-0 break-words text-sm text-stone-500">
          <Link to="/" className="hover:text-brand-600">
            Home
          </Link>{' '}
          /{' '}
          <Link to="/shop" className="hover:text-brand-600">
            Shop
          </Link>{' '}
          / <span className="text-stone-700">{product.name}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-4 lg:sticky lg:top-24"
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="group relative block w-full overflow-hidden rounded-sm border border-stone-200/90 bg-white shadow-sm"
              >
                <img
                  src={activeSrc}
                  alt={product.name}
                  decoding="async"
                  loading="eager"
                  className="h-[min(420px,70vw)] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.06] sm:h-[480px]"
                />
                <span className="pointer-events-none absolute bottom-3 right-3 rounded-sm bg-white/90 px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm backdrop-blur">
                  Tap to zoom
                </span>
              </button>
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => goGallery(-1)}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-sm border border-stone-200/90 bg-white/95 p-2 text-stone-800 shadow-md backdrop-blur transition hover:bg-sage-50 hover:border-brand-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => goGallery(1)}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-sm border border-stone-200/90 bg-white/95 p-2 text-stone-800 shadow-md backdrop-blur transition hover:bg-sage-50 hover:border-brand-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <span className="pointer-events-none absolute bottom-16 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-sage-900/85 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm lg:block">
                    {activeGalleryIndex + 1} / {gallery.length}
                  </span>
                </>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="flex justify-center gap-1.5 pb-2 pt-3 sm:hidden">
                {gallery.map((g, dotIdx) => (
                  <button
                    key={`${g}-dot-${dotIdx}`}
                    type="button"
                    aria-label={`Photo ${dotIdx + 1}`}
                    aria-current={activeGalleryIndex === dotIdx ? 'step' : undefined}
                    onClick={() => setActiveImg(g)}
                    className={`h-2 rounded-full transition ${
                      activeGalleryIndex === dotIdx ? 'w-8 bg-brand-600' : 'w-2 bg-stone-300 hover:bg-stone-400'
                    }`}
                  />
                ))}
              </div>
            )}
            {gallery.length > 1 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 px-1">
                {gallery.map((g, thumbIdx) => (
                  <button
                    key={`${g}-thumb-${thumbIdx}`}
                    type="button"
                    onClick={() => setActiveImg(g)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-sm border transition ${
                      activeImg === g ? 'border-brand-500 ring-2 ring-brand-200 ring-offset-2' : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={resolveImageUrl(g)}
                      alt=""
                      loading={thumbIdx <= 4 ? 'eager' : 'lazy'}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.06 }}
            className="space-y-5 rounded-sm border border-stone-200/90 bg-white p-5 shadow-sm sm:p-7"
          >
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-600">{product.category || 'General'}</p>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">{product.name}</h1>
                <p className="text-2xl font-semibold text-stone-900">
                  {product.regular_price != null && Number(product.regular_price) > unitPrice ? (
                    <>
                      <span className="mr-2 text-lg font-normal text-stone-400 line-through">৳{Number(product.regular_price).toFixed(2)}</span>
                      ৳{unitPrice.toFixed(2)}
                    </>
                  ) : (
                    <>৳{unitPrice.toFixed(2)}</>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleWishlist}
                className={`mt-1 shrink-0 self-start rounded-sm border p-3 transition sm:p-3.5 ${
                  isInWishlist ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-stone-200 text-stone-500 hover:bg-stone-50'
                }`}
                aria-label={isInWishlist ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={isInWishlist ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>

            {pricingOpts.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-stone-900">Unit / weight</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pricingOpts.map((opt) => {
                    const label = String(opt.label || '').trim();
                    const p = Number(opt.price);
                    const showP = Number.isFinite(p);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setSelectedSize(label)}
                        className={`rounded-sm border px-4 py-2 text-sm font-semibold transition ${
                          selectedSize === label
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-stone-200 text-stone-700 hover:border-stone-300'
                        }`}
                      >
                        <span>{label}</span>
                        {showP ? (
                          <span className={`ml-2 text-xs font-normal ${selectedSize === label ? 'text-white/90' : 'text-stone-500'}`}>
                            ৳{p.toFixed(0)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!pricingOpts.length && sizes.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-stone-900">Size</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSize(s)}
                      className={`rounded-sm border px-4 py-2 text-sm font-semibold transition ${
                        selectedSize === s
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-stone-200 text-stone-700 hover:border-stone-300'
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
                <p className="text-sm font-semibold text-stone-900">Color</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`rounded-sm border px-4 py-2 text-sm font-semibold transition ${
                        selectedColor === c
                          ? 'border-brand-500 bg-brand-50 text-brand-800'
                          : 'border-stone-200 text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <span
                className={`rounded-sm px-4 py-2 text-xs font-semibold ${
                  product.stock > 0
                    ? 'bg-sage-50 text-sage-800'
                    : showPreorder
                      ? 'bg-peach-50 text-peach-900'
                      : 'bg-brand-50 text-brand-700'
                }`}
              >
                {product.stock > 0
                  ? `In stock · ${product.stock}`
                  : showPreorder
                    ? `Pre-order · Available from ${formatPreorderDateLabel(product.preorder_available_date)}`
                    : 'Out of stock'}
              </span>
              <div className="flex items-center gap-2 rounded-sm border border-stone-200 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                  className="h-9 w-9 rounded-sm text-lg text-stone-700 hover:bg-stone-100"
                >
                  −
                </button>
                <span className="min-w-[2ch] text-center text-sm font-semibold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((prev) => Math.min(maxQty || prev, prev + 1))}
                  disabled={maxQty > 0 && quantity >= maxQty}
                  className="h-9 w-9 rounded-sm text-lg text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex min-w-0 w-full flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={!canPurchaseProduct(product)}
                className="inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-sm border-2 border-brand-600 bg-white px-4 py-3 text-sm font-semibold text-brand-900 transition hover:-translate-y-0.5 hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
              >
                {showPreorder ? 'Pre-order' : 'Buy now'}
              </button>
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canPurchaseProduct(product)}
                className="inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-sm bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                Add to cart
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-6 sm:grid-cols-4">
              {['7-day returns', 'COD available', 'Verified quality', 'Fast dispatch'].map((t) => (
                <div key={t} className="rounded-sm bg-stone-50 px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                  {t}
                </div>
              ))}
            </div>

            <ProductShareAndTrust product={product} productId={id} />
          </motion.div>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="rounded-sm border border-stone-200/90 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="text-xl font-semibold text-stone-900">Details</h2>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-stone-600">{product.description}</p>
        </motion.section>

        <Reviews productId={parseInt(id, 10)} />

        {relatedProducts.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold text-stone-900">You may also like</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedProducts.map((relProduct) => {
                const pr = displayPriceRange(relProduct);
                const priceLabel = pr.single ? `৳${pr.min.toFixed(0)}` : `From ৳${pr.min.toFixed(0)}`;
                const line = withDefaultUnitSelection(relProduct);
                return (
                  <div key={relProduct.id} className="surface-card flex flex-col overflow-hidden">
                    <Link to={`/product/${relProduct.id}`} className="block shrink-0">
                      <img src={resolveImageUrl(relProduct.image)} alt={relProduct.name} className="h-44 w-full object-cover sm:h-52" />
                    </Link>
                    <div className="flex flex-1 flex-col p-4 sm:p-5">
                      <Link to={`/product/${relProduct.id}`} className="block">
                        <h3 className="font-semibold text-stone-900 transition hover:text-brand-600">{relProduct.name}</h3>
                      </Link>
                      <p className="mt-1 text-sm text-stone-600">{priceLabel}</p>
                      <div className="mt-auto flex flex-col gap-2 pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            buyNow({ ...line, quantity: 1 });
                            navigate('/checkout');
                          }}
                          disabled={!canPurchaseProduct(relProduct)}
                          className="w-full rounded-sm border-2 border-brand-600 bg-white py-2 text-xs font-semibold text-brand-900 transition hover:bg-brand-50 disabled:border-stone-300 disabled:text-stone-400 sm:text-sm"
                        >
                          {isPreorderProduct(relProduct) && Number(relProduct.stock) <= 0 ? 'Pre-order' : 'Buy now'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            addToCart({ ...line, quantity: 1 });
                            toast.success('Added to cart');
                          }}
                          disabled={!canPurchaseProduct(relProduct)}
                          className="w-full rounded-sm bg-brand-600 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:bg-stone-300 sm:text-sm"
                        >
                          Add to cart
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {zoomOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-900/75 p-4 backdrop-blur-md"
          onClick={() => setZoomOpen(false)}
        >
          <img src={activeSrc} alt={product.name} className="max-h-[90vh] max-w-full rounded-sm object-contain shadow-2xl" />
        </button>
      )}
    </>
  );
}

export default ProductPage;