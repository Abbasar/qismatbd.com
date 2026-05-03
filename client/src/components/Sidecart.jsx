import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CART_UPDATED_EVENT, cartLineKey, getCart, removeFromCart, updateQuantity, getCartTotal, getCartCount } from '../utils/cart';
import { resolveImageUrl } from '../utils/image';

function Sidecart() {
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const syncCart = () => setItems(getCart());
    setItems(getCart());
    window.addEventListener('storage', syncCart);
    window.addEventListener(CART_UPDATED_EVENT, syncCart);
    return () => {
      window.removeEventListener('storage', syncCart);
      window.removeEventListener(CART_UPDATED_EVENT, syncCart);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const handleRemove = (lineKey) => {
    removeFromCart(lineKey);
    setItems(getCart());
    toast.message('Removed from cart');
  };

  const handleQuantityChange = (lineKey, quantity) => {
    updateQuantity(lineKey, Number(quantity));
    setItems(getCart());
  };

  const total = getCartTotal();
  const count = getCartCount();

  const drawer = createPortal(
    <>
      <div
        className={`fixed inset-0 z-[9998] bg-stone-900/45 transition-opacity duration-300 ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsOpen(false)}
        role="presentation"
        aria-hidden={!isOpen}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-[9999] flex h-screen w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="border-b border-stone-200 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand-600">Mini cart</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-stone-900">Your selection</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-sm border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="rounded-sm border border-dashed border-stone-200 bg-stone-50 p-8 text-center">
              <p className="font-medium text-stone-800">Your cart is empty</p>
              <p className="mt-2 text-sm text-stone-500">Discover something you love — it will show up here instantly.</p>
              <Link
                to="/shop"
                onClick={() => setIsOpen(false)}
                className="mt-5 inline-flex rounded-sm bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Browse shop
              </Link>
            </div>
          ) : (
            items.map((item) => {
              const key = cartLineKey(item);
              return (
                <div
                  key={key}
                  className="flex gap-3 rounded-sm border border-stone-200 bg-stone-50 p-3 transition hover:border-brand-200 hover:bg-white"
                >
                    <img src={resolveImageUrl(item.image)} alt={item.name} className="h-20 w-20 rounded-sm object-cover ring-1 ring-brand-900/10" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-stone-900">{item.name}</h3>
                    {(item.selectedSize || item.selectedColor) && (
                      <p className="mt-0.5 text-xs text-stone-500">
                        {[item.selectedSize, item.selectedColor].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <p className="mt-1 text-xs font-medium text-stone-700">৳{item.price}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(key, item.quantity - 1)}
                        className="rounded-sm border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-xs font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(key, item.quantity + 1)}
                        className="rounded-sm border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        +
                      </button>
                      <button type="button" onClick={() => handleRemove(key)} className="ml-auto text-xs font-semibold text-brand-600 hover:text-brand-700">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-stone-200 bg-white px-5 pb-[max(1.25rem\,env(safe-area-inset-bottom))] pt-5">
            <div className="flex items-center justify-between text-sm text-stone-600">
              <span>Subtotal</span>
              <span className="font-semibold text-stone-900">৳{total.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-xs text-stone-500">Shipping & coupons are finalized at checkout.</p>
            <Link
              to="/cart"
              onClick={() => setIsOpen(false)}
              className="mt-4 block w-full rounded-sm border border-stone-200 py-3 text-center text-sm font-semibold text-stone-900 hover:bg-stone-50"
            >
              View cart
            </Link>
            <Link
              to="/checkout"
              onClick={() => setIsOpen(false)}
              className="mt-2 block w-full rounded-sm bg-brand-600 py-3 text-center text-sm font-semibold text-white hover:bg-brand-700"
            >
              Checkout
            </Link>
          </div>
        )}
      </aside>
    </>,
    document.body
  );

  return (
    <>
      {drawer}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-stone-200/90 bg-white/90 text-stone-800 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700"
        title="Cart"
        aria-label="Open shopping cart"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-brand-600 px-1 text-[10px] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
    </>
  );
}

export default Sidecart;