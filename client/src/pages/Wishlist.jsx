import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getAuthHeader, getCurrentUser } from '../utils/auth';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { resolveImageUrl } from '../utils/image';
import { addToCart, buyNow } from '../utils/cart';
import {
  canPurchaseProduct,
  displayPriceRange,
  isPreorderProduct,
  withDefaultUnitSelection,
} from '../utils/productAvailability';

function Wishlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const user = getCurrentUser();
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/wishlist/${user.id}`), { headers: getAuthHeader() });
      if (!res.ok) throw new Error('load');
      setItems(await res.json());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onUpd = () => load();
    window.addEventListener('wishlist-updated', onUpd);
    return () => window.removeEventListener('wishlist-updated', onUpd);
  }, [load]);

  return (
    <div className="space-y-4 fade-in-up sm:space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Saved</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-900">Wishlist</h1>
        <p className="mt-1 text-sm text-stone-600">Products you have hearted.</p>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-sm border border-dashed border-stone-200 bg-white py-8 text-center sm:py-10">
          <p className="text-stone-700">Your wishlist is empty.</p>
          <Link to="/shop" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">
            Browse shop →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-6 lg:grid-cols-3">
          {items.map((product) => {
            const pr = displayPriceRange(product);
            const priceLabel = pr.single ? `৳${pr.min.toFixed(0)}` : `From ৳${pr.min.toFixed(0)}`;
            const line = withDefaultUnitSelection(product);
            return (
              <div
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-sm border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <Link to={`/product/${product.id}`} className="block shrink-0">
                  <div className="aspect-square overflow-hidden bg-stone-100 sm:aspect-[4/3]">
                    <img
                      src={resolveImageUrl(product.image)}
                      alt={product.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                </Link>
                <div className="flex flex-1 flex-col p-2 sm:p-4">
                  <Link to={`/product/${product.id}`} className="block">
                    <h2 className="line-clamp-2 text-xs font-semibold leading-snug text-stone-900 transition hover:text-brand-600 sm:line-clamp-none sm:text-base sm:leading-normal">
                      {product.name}
                    </h2>
                  </Link>
                  <p className="mt-1 text-xs font-medium text-stone-800 sm:text-sm">{priceLabel}</p>
                  <div className="mt-auto flex flex-col gap-1.5 pt-3 sm:gap-2 sm:pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        buyNow({ ...line, quantity: 1 });
                        navigate('/checkout');
                      }}
                      disabled={!canPurchaseProduct(product)}
                      className="w-full rounded-sm border-2 border-stone-900 bg-white py-2 text-[10px] font-bold text-stone-900 transition hover:bg-stone-50 disabled:border-stone-300 disabled:text-stone-400 sm:text-xs"
                    >
                      {isPreorderProduct(product) && Number(product.stock) <= 0 ? 'Pre-order' : 'Buy now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addToCart({ ...line, quantity: 1 });
                        setAddedId(product.id);
                        toast.success(`${product.name} added to cart`);
                        window.setTimeout(() => setAddedId(null), 1200);
                      }}
                      disabled={!canPurchaseProduct(product)}
                      className="w-full rounded-sm bg-brand-600 py-2 text-[10px] font-bold text-white transition hover:bg-brand-700 disabled:bg-stone-300 sm:text-xs"
                    >
                      {addedId === product.id ? '✓ Added' : 'Add to cart'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Wishlist;
