import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { addToCart, buyNow } from '../utils/cart';
import { resolveImageUrl } from '../utils/image';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { ProductCardSkeleton } from '../components/Skeletons';
import {
  canPurchaseProduct,
  displayPriceRange,
  customerFacingStockLabel,
  isPreorderProduct,
  withDefaultUnitSelection,
} from '../utils/productAvailability';

function Shop() {
  const [products, setProducts] = useState([]);
  const [brandsList, setBrandsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedProductId, setAddedProductId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Filters State
  const searchQuery = searchParams.get('search') || '';
  const categoryFilter = searchParams.get('category') || 'all';
  const brandFilter = searchParams.get('brand') || 'all';
  const priceFilter = searchParams.get('price') || 'all';
  const currentPage = parseInt(searchParams.get('page')) || 1;
  const itemsPerPage = 6;

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchWithTimeout(apiUrl('/api/products')), fetchWithTimeout(apiUrl('/api/brands'))])
      .then(([prodRes, brandRes]) => Promise.all([prodRes.json(), brandRes.ok ? brandRes.json() : []]))
      .then(([data, brands]) => {
        setProducts(data);
        setBrandsList(Array.isArray(brands) ? brands : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = ['all', ...new Set(products.map(p => p.category || 'General'))];
    return cats;
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (searchQuery) {
      result = result.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((p) => (p.category || 'General') === categoryFilter);
    }

    if (brandFilter !== 'all') {
      const bid = Number(brandFilter);
      if (Number.isFinite(bid) && bid > 0) {
        result = result.filter((p) => {
          const pid = p.brand?.id != null ? Number(p.brand.id) : p.brand_id != null ? Number(p.brand_id) : NaN;
          return Number.isFinite(pid) && pid === bid;
        });
      }
    }

    if (priceFilter !== 'all') {
      const [minF, maxF] = priceFilter.split('-').map(Number);
      result = result.filter((p) => {
        const { min, max } = displayPriceRange(p);
        if (maxF) {
          return min <= maxF && max >= minF;
        }
        return min >= minF;
      });
    }

    return result;
  }, [products, searchQuery, categoryFilter, brandFilter, priceFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const updateFilters = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === 'all' || !value) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    newParams.set('page', '1'); // Reset to first page on filter change
    setSearchParams(newParams);
  };

  const setPage = (page) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page.toString());
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4 fade-in-up sm:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-sage-600">Premium Items</p>
          <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">Our Shop</h1>
          {searchQuery && (
            <p className="text-stone-500">
              Showing results for <span className="font-semibold text-stone-900">"{searchQuery}"</span>
            </p>
          )}
        </div>

        {/* Quick Filters */}
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => updateFilters('category', e.target.value)}
            className="w-full min-h-[44px] rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 shadow-sm transition hover:border-sage-300 sm:w-auto sm:min-h-0 sm:min-w-[160px] sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <option value="all">All Categories</option>
            {categories.filter(c => c !== 'all').map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={brandFilter}
            onChange={(e) => updateFilters('brand', e.target.value)}
            className="w-full min-h-[44px] rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 shadow-sm transition hover:border-sage-300 sm:w-auto sm:min-h-0 sm:min-w-[160px] sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <option value="all">All Brands</option>
            {brandsList.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>

          {/* <select
            value={priceFilter}
            onChange={(e) => updateFilters('price', e.target.value)}
            className="w-full min-h-[44px] rounded-sm border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 shadow-sm transition hover:border-sage-300 sm:w-auto sm:min-h-0 sm:min-w-[160px] sm:px-4 sm:py-2.5 sm:text-sm"
          >
            <option value="all">Any Price</option>
            <option value="3000-5000">৳3000 - ৳5000</option>
            <option value="5000">Above ৳5000</option>
          </select> */}
        </div>
      </div>

      {loading ? (
        <ProductCardSkeleton
          count={6}
          gridClassName="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
        />
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-stone-100 bg-white py-12 text-center shadow-sm sm:py-14">
          <div className="mb-4 rounded-sm bg-stone-50 p-6 text-4xl">🔍</div>
          <h3 className="text-xl font-semibold text-stone-900">No products found</h3>
          <p className="mt-2 text-stone-500">Try adjusting your filters or search query.</p>
          <button
            onClick={() => setSearchParams({})}
            className="mt-6 rounded-sm bg-brand-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {paginatedProducts.map((product) => (
              <div key={product.id} className="group relative flex flex-col overflow-hidden rounded-sm border border-stone-100 bg-white p-2 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-4">
                <div className="relative h-36 overflow-hidden rounded-sm sm:h-48 md:h-64">
                  <Link to={`/product/${product.id}`} className="relative block h-full overflow-hidden rounded-sm">
                    <img
                      src={resolveImageUrl(product.image)}
                      alt={product.name}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-brand-900/5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                  <div className="pointer-events-none absolute right-1.5 top-1.5 max-w-[min(200px,75%)] sm:right-4 sm:top-4">
                    <span
                      className={`pointer-events-auto block max-w-full rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase leading-tight tracking-wider line-clamp-2 sm:line-clamp-none sm:px-3 sm:py-1 sm:text-[10px] ${product.stock > 0
                          ? 'bg-white/90 text-sage-600'
                          : isPreorderProduct(product)
                            ? 'bg-peach-400 text-stone-900'
                            : 'bg-brand-500 text-white'
                        }`}
                    >
                      {customerFacingStockLabel(product)}
                    </span>
                  </div>
                  <Link
                    to={`/product/${product.id}`}
                    aria-label={`View ${product.name}`}
                    title="Product details"
                    className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-sm border border-white/70 bg-white/95 text-stone-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-sage-600 sm:h-10 sm:w-10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </Link>
                </div>

                <div className="flex flex-1 flex-col p-2 pt-3 sm:p-4 sm:pt-6">
                  <div className="mb-1 flex flex-col gap-0.5 sm:mb-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                      {/* <span className="truncate text-[9px] font-bold uppercase tracking-wide text-sage-600 sm:text-[10px] sm:tracking-widest">
                        {product.category || 'General'}
                      </span> */}
                      {product.brand?.name ? (
                        <Link
                          to={`/shop?brand=${product.brand.id}`}
                          className="truncate text-[9px] font-semibold uppercase tracking-wide text-brand-700 hover:underline sm:text-[10px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {product.brand.name}
                        </Link>
                      ) : null}
                    </div>
                    <span className="text-sm font-bold text-stone-900 sm:text-lg">
                      {(() => {
                        const pr = displayPriceRange(product);
                        const main = pr.single ? `৳${pr.min.toFixed(0)}` : `From ৳${pr.min.toFixed(0)}`;
                        const showStrike =
                          product.regular_price != null && Number(product.regular_price) > pr.min;
                        return showStrike ? (
                          <>
                            <span className="mr-1 text-sm font-normal text-stone-400 line-through">
                              ৳{Number(product.regular_price).toFixed(0)}
                            </span>
                            {main}
                          </>
                        ) : (
                          <>{main}</>
                        );
                      })()}
                    </span>
                  </div>

                  <Link to={`/product/${product.id}`}>
                    <h3 className="line-clamp-2 text-xs font-bold leading-snug text-stone-900 transition-colors hover:text-sage-600 sm:text-xl">{product.name}</h3>
                  </Link>

                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-stone-500 sm:mt-2 sm:text-sm sm:leading-relaxed">{product.description}</p>

                  <div className="mt-auto flex flex-col gap-1.5 pt-3 sm:gap-2 sm:pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        buyNow(withDefaultUnitSelection(product));
                        navigate('/checkout');
                      }}
                      disabled={!canPurchaseProduct(product)}
                      className="w-full rounded-sm border-2 border-stone-900 bg-white py-2 text-[11px] font-bold text-stone-900 transition-all hover:bg-stone-50 disabled:border-stone-300 disabled:text-stone-400 sm:py-3 sm:text-sm"
                    >
                      {isPreorderProduct(product) && Number(product.stock) <= 0 ? 'Pre-order' : 'Buy now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addToCart(withDefaultUnitSelection(product));
                        setAddedProductId(product.id);
                        toast.success(`${product.name} added to cart`);
                        window.setTimeout(() => setAddedProductId(null), 1200);
                      }}
                      disabled={!canPurchaseProduct(product)}
                      className="w-full rounded-sm bg-brand-600 py-2 text-[11px] font-bold text-white transition-all hover:bg-brand-700 disabled:bg-stone-300 sm:py-3 sm:text-sm"
                    >
                      {addedProductId === product.id ? '✓ Added' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2 sm:mt-10">
              <button
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                className="flex h-10 w-10 items-center justify-center rounded-sm border border-stone-200 bg-white transition hover:bg-stone-50 disabled:opacity-50"
              >
                ←
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`h-10 w-10 rounded-sm font-bold transition ${currentPage === i + 1
                      ? 'bg-sage-600 text-white shadow-lg shadow-sage-200'
                      : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
                className="flex h-10 w-10 items-center justify-center rounded-sm border border-stone-200 bg-white transition hover:bg-stone-50 disabled:opacity-50"
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Shop;