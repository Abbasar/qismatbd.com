import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getCart, removeFromCart, updateQuantity, getCartTotal, cartLineKey, CART_UPDATED_EVENT } from '../utils/cart';
import { resolveImageUrl } from '../utils/image';

function Cart() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  const refresh = () => setItems(getCart());

  useEffect(() => {
    refresh();
    window.addEventListener(CART_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const handleRemove = (lineKey) => {
    removeFromCart(lineKey);
    refresh();
    toast.message('Removed from cart');
  };

  const handleQuantityChange = (lineKey, quantity) => {
    updateQuantity(lineKey, Number(quantity));
    refresh();
  };

  const total = getCartTotal();

  return (
    <div className="grid gap-6 fade-in-up lg:grid-cols-[1fr_320px] lg:gap-8">
      <div className="space-y-5 rounded-sm border border-stone-200/90 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Cart</p>
            <h2 className="mt-1 text-3xl font-semibold text-stone-900">Your bag</h2>
          </div>
          <Link to="/shop" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Continue shopping
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-sm border border-dashed border-stone-200 bg-stone-50/80 p-12 text-center text-stone-600">
            Your cart is empty.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const key = cartLineKey(item);
              return (
                <div
                  key={key}
                  className="flex flex-col gap-4 rounded-sm border border-stone-100 bg-stone-50/50 p-4 transition hover:border-stone-200 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <img src={resolveImageUrl(item.image)} alt={item.name} className="h-24 w-24 rounded-sm object-cover ring-1 ring-brand-900/10" />
                    <div>
                      <h3 className="font-semibold text-stone-900">{item.name}</h3>
                      {(item.selectedSize || item.selectedColor) && (
                        <p className="mt-1 text-xs text-stone-500">
                          {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-stone-600">৳{item.price} each</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(key, e.target.value)}
                      className="w-20 rounded-sm border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                    />
                    <button type="button" onClick={() => handleRemove(key)} className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <aside className="h-fit space-y-4 rounded-sm border border-stone-200/90 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-28">
        <h3 className="text-lg font-semibold text-stone-900">Summary</h3>
        <div className="space-y-3 text-stone-600">
          <div className="flex items-center justify-between text-sm">
            <span>Subtotal</span>
            <span className="font-semibold text-stone-900">৳{total.toFixed(2)}</span>
          </div>
          <p className="text-xs text-stone-500">Shipping and coupons are applied at checkout.</p>
        </div>
        <button
          type="button"
          disabled={!items.length}
          onClick={() => navigate('/checkout')}
          className="w-full rounded-sm bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          Checkout
        </button>
      </aside>
    </div>
  );
}

export default Cart;