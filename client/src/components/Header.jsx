import { Link, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clearCurrentUser, getAuthHeader, getCurrentUser, isAdmin } from '../utils/auth';
import Sidecart from './Sidecart';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { DEFAULT_STORE_CONTACT } from '../constants/storeContact';
import { useStorefront } from '../context/StorefrontContext';
import { parseCategoriesApiResponse } from '../utils/categories';

const megaLinks = [
  { label: 'New in', hint: 'Latest drops', to: '/shop', accent: 'from-brand-500/90 to-peach-500/90' },
  { label: 'Qismat', hint: 'Brand', to: '/shop?brand=2', accent: 'from-sage-500/90 to-sage-400/90' },
  { label: 'Yes', hint: 'Brand', to: '/shop?brand=3', accent: 'from-brand-600/90 to-sage-500/90' },
  { label: 'Shop all', hint: 'Full catalog', to: '/shop', accent: 'from-peach-500/90 to-brand-500/90' },
];

function IconWishlist({ className = 'h-5 w-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function IconUser({ className = 'h-5 w-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function IconSearch({ className = 'h-5 w-5' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

const iconBtnBase =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700';

function Header() {
  const { contact } = useStorefront();
  const logoSrc = (contact || DEFAULT_STORE_CONTACT).logoUrl;
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [megaOpen, setMegaOpen] = useState(false);
  const [wishCount, setWishCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const megaRef = useRef(null);
  const mobileSearchInputRef = useRef(null);

  const refreshWishlistCount = useCallback(async () => {
    const u = getCurrentUser();
    if (!u?.id) {
      setWishCount(0);
      return;
    }
    try {
      const res = await fetchWithTimeout(apiUrl(`/api/wishlist/${u.id}`), { headers: getAuthHeader() });
      if (!res.ok) throw new Error('wishlist');
      const data = await res.json();
      setWishCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setWishCount(0);
    }
  }, []);

  useEffect(() => {
    refreshWishlistCount();
  }, [refreshWishlistCount, user?.id]);

  useEffect(() => {
    window.addEventListener('wishlist-updated', refreshWishlistCount);
    return () => window.removeEventListener('wishlist-updated', refreshWishlistCount);
  }, [refreshWishlistCount]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithTimeout(apiUrl('/api/products/meta/categories'));
        if (!res.ok) throw new Error('categories');
        const data = await res.json();
        const { categories } = parseCategoriesApiResponse(data);
        setCategories(categories);
      } catch {
        setCategories([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (megaRef.current && !megaRef.current.contains(e.target)) setMegaOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMenuOpen]);

  const logout = () => {
    clearCurrentUser();
    setWishCount(0);
    navigate('/');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsMenuOpen(false);
      setMegaOpen(false);
      setSearchOpen(false);
    }
  };

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const mobileMenuPortal =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {isMenuOpen ? (
              <>
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[9000] cursor-default bg-brand-900/40 backdrop-blur-[2px] lg:hidden"
                  aria-label="Close menu"
                  onClick={() => setIsMenuOpen(false)}
                />
                <motion.aside
                  id="mobile-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Site menu"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="fixed inset-y-0 left-0 z-[9001] flex w-[min(320px,88vw)] flex-col border-r border-slate-200/90 bg-white shadow-2xl lg:hidden"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
                    <span className="text-sm font-semibold text-slate-900">Menu</span>
                    <button
                      type="button"
                      onClick={() => setIsMenuOpen(false)}
                      className="rounded-sm p-2 text-slate-600 transition hover:bg-brand-600/10"
                      aria-label="Close menu"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
                    <Link to="/shop" onClick={() => setIsMenuOpen(false)} className="rounded-sm px-3 py-3 text-base font-medium text-slate-800 hover:bg-brand-600/10">
                      Shop
                    </Link>
                    <Link to="/about" onClick={() => setIsMenuOpen(false)} className="rounded-sm px-3 py-3 text-base font-medium text-slate-800 hover:bg-brand-600/10">
                      About
                    </Link>
                    <Link to="/gallery" onClick={() => setIsMenuOpen(false)} className="rounded-sm px-3 py-3 text-base font-medium text-slate-800 hover:bg-brand-600/10">
                      Gallery
                    </Link>
                    <Link to="/cart" onClick={() => setIsMenuOpen(false)} className="rounded-sm px-3 py-3 text-base font-medium text-slate-800 hover:bg-brand-600/10">
                      Cart
                    </Link>
                    <Link to="/wishlist" onClick={() => setIsMenuOpen(false)} className="rounded-sm px-3 py-3 text-base font-medium text-slate-800 hover:bg-brand-600/10">
                      Wishlist
                    </Link>
                    {user && (
                      <Link to="/account" onClick={() => setIsMenuOpen(false)} className="rounded-sm px-3 py-3 text-base font-medium text-slate-800 hover:bg-brand-600/10">
                        My account
                      </Link>
                    )}
                    <div className="mt-3 border-t border-slate-100 pt-4">
                      {user ? (
                        <div className="space-y-2 px-1">
                          <p className="px-2 text-xs text-slate-500">Signed in as {user.name}</p>
                          {isAdmin() && (
                            <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block rounded-sm px-3 py-3 font-semibold text-brand-600 hover:bg-brand-50">
                              Admin dashboard
                            </Link>
                          )}
                          <button type="button" onClick={() => { logout(); setIsMenuOpen(false); }} className="w-full rounded-sm px-3 py-3 text-left font-medium text-brand-600 hover:bg-brand-50">
                            Log out
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 px-1">
                          <Link to="/login" onClick={() => setIsMenuOpen(false)} className="rounded-sm border border-slate-200 py-3 text-center text-sm font-semibold text-slate-800">
                            Log in
                          </Link>
                          <Link to="/register" onClick={() => setIsMenuOpen(false)} className="rounded-sm bg-brand-600 py-3 text-center text-sm font-semibold text-white hover:bg-brand-700">
                            Register
                          </Link>
                        </div>
                      )}
                    </div>
                  </nav>
                </motion.aside>
              </>
            ) : null}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-white/30 bg-white/65 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/55">
      <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className="flex min-w-0 flex-col gap-0 lg:gap-0">
        <div className="flex h-16 min-w-0 flex-nowrap items-center gap-x-2 sm:h-[4.25rem] sm:gap-x-3">
          <Link
            to="/"
            className="flex shrink-0 items-center text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
          >
            <img
              src={logoSrc}
              alt="Qismat"
              width={112}
              height={36}
              className="h-8 w-auto object-contain object-left sm:h-9"
            />
          </Link>

          <nav
            ref={megaRef}
            className="relative z-[60] hidden shrink-0 items-center gap-1 lg:flex"
            onMouseLeave={() => setMegaOpen(false)}
          >
            <button
              type="button"
              className="rounded-sm px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-600/10 hover:text-slate-900"
              onMouseEnter={() => setMegaOpen(true)}
              onFocus={() => setMegaOpen(true)}
              onClick={() => setMegaOpen((v) => !v)}
            >
              Shop
              <span className="ml-1 text-xs text-slate-400">▾</span>
            </button>
            <Link
              to="/shop"
              className="rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand-600/10 hover:text-slate-900"
            >
              All products
            </Link>
            <Link
              to="/about"
              className="rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand-600/10 hover:text-slate-900"
            >
              About
            </Link>
            <Link
              to="/gallery"
              className="rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-brand-600/10 hover:text-slate-900"
            >
              Gallery
            </Link>

            <AnimatePresence>
              {megaOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-0 top-full z-[70] mt-0 w-[min(920px,calc(100vw-2rem))] rounded-sm border border-slate-200/80 bg-white/95 p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-xl"
                  onMouseEnter={() => setMegaOpen(true)}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {megaLinks.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMegaOpen(false)}
                          className="group relative overflow-hidden rounded-sm border border-slate-100 bg-slate-50/80 p-4 transition hover:border-slate-200 hover:bg-white"
                        >
                          <div
                            className={`pointer-events-none absolute inset-0 opacity-0 blur-2xl transition group-hover:opacity-30 bg-gradient-to-br ${item.accent}`}
                          />
                          <p className="relative text-sm font-semibold text-slate-900">{item.label}</p>
                          <p className="relative mt-1 text-xs text-slate-500">{item.hint}</p>
                        </Link>
                      ))}
                    </div>
                    <div className="rounded-sm border border-slate-100 bg-slate-50/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Categories</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {categories.length === 0 ? (
                          <span className="text-sm text-slate-500">Browse all in shop — categories load from your catalog.</span>
                        ) : (
                          categories.map((c) => (
                            <Link
                              key={c}
                              to={`/shop?category=${encodeURIComponent(c)}`}
                              onClick={() => setMegaOpen(false)}
                              className="rounded-sm border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-600"
                            >
                              {c}
                            </Link>
                          ))
                        )}
                      </div>
                      <Link
                        to="/shop"
                        onClick={() => setMegaOpen(false)}
                        className="mt-4 inline-flex items-center text-sm font-semibold text-brand-600 hover:text-brand-700"
                      >
                        View full catalog →
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </nav>

          <form
            onSubmit={handleSearch}
            className="hidden min-w-0 flex-1 lg:flex lg:min-w-[240px]"
          >
            <div className="group mx-auto flex h-11 w-full min-w-0 max-w-2xl items-center rounded-sm border border-slate-200 bg-white shadow-sm transition focus-within:border-slate-300 focus-within:shadow-md">
              <div className="flex items-center pl-3 pr-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <input
                type="search"
                name="q"
                placeholder="Search products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                className="min-h-[44px] min-w-0 flex-1 bg-transparent py-2 pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
                aria-label="Search products"
              />
              <button
                type="submit"
                className="inline-flex h-full shrink-0 items-center justify-center border-l border-slate-200 bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 focus:outline-none focus:ring-0"
                aria-label="Search"
              >
                Search
              </button>
            </div>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-0">
            <div className="hidden items-center gap-1 sm:gap-2 lg:flex">
              {user ? (
                <Link
                  to="/wishlist"
                  className={iconBtnBase}
                  title="Wishlist"
                  aria-label={`Wishlist${wishCount ? `, ${wishCount} items` : ''}`}
                >
                  <IconWishlist />
                  {wishCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-brand-600 px-1 text-[10px] font-bold text-white">
                      {wishCount > 99 ? '99+' : wishCount}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className={iconBtnBase}
                  title="Log in to use wishlist"
                  aria-label="Wishlist — log in"
                >
                  <IconWishlist />
                </Link>
              )}

              {user ? (
                <Link to="/account" className={iconBtnBase} title="My account" aria-label="My account">
                  <IconUser />
                </Link>
              ) : (
                <Link to="/login" className={iconBtnBase} title="Log in" aria-label="Log in">
                  <IconUser />
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => !v);
                setIsMenuOpen(false);
              }}
              className={`${iconBtnBase} lg:hidden`}
              title={searchOpen ? 'Close search' : 'Search'}
              aria-label={searchOpen ? 'Close search' : 'Open search'}
              aria-expanded={searchOpen}
              aria-controls="mobile-search-panel"
            >
              <IconSearch />
            </button>

            <div className="flex items-center gap-1 lg:hidden">
              {user ? (
                <Link
                  to="/wishlist"
                  className={iconBtnBase}
                  title="Wishlist"
                  aria-label={`Wishlist${wishCount ? `, ${wishCount} items` : ''}`}
                >
                  <IconWishlist />
                  {wishCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-brand-600 px-1 text-[10px] font-bold text-white">
                      {wishCount > 99 ? '99+' : wishCount}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <Link to="/login" className={iconBtnBase} title="Log in to use wishlist" aria-label="Wishlist — log in">
                  <IconWishlist />
                </Link>
              )}
            </div>

            <Sidecart />

            <div className="hidden items-center gap-2 border-l border-slate-200/80 pl-2 lg:flex">
              {isAdmin() && (
                <Link to="/admin" className="whitespace-nowrap px-2 text-xs font-semibold text-brand-600 hover:text-brand-700">
                  Admin
                </Link>
              )}
              {user ? (
                <button
                  type="button"
                  onClick={logout}
                  className="whitespace-nowrap px-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Log out
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setIsMenuOpen((v) => !v);
              }}
              className="rounded-sm p-2 text-slate-700 transition hover:bg-brand-600/10 lg:hidden"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {searchOpen ? (
          <form
            id="mobile-search-panel"
            onSubmit={handleSearch}
            className="border-t border-slate-100 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            <div className="group flex h-11 w-full min-w-0 items-center rounded-sm border border-slate-200 bg-white shadow-sm transition focus-within:border-slate-300 focus-within:shadow-md">
              <div className="flex items-center pl-3 pr-2">
                <IconSearch className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
              <input
                ref={mobileSearchInputRef}
                type="search"
                name="q-mobile"
                placeholder="Search products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
                className="min-h-[44px] min-w-0 flex-1 bg-transparent py-2 pr-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
                aria-label="Search products"
              />
              <button
                type="submit"
                className="inline-flex h-full shrink-0 items-center justify-center border-l border-slate-200 bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus:ring-0"
                aria-label="Search"
              >
                Search
              </button>
            </div>
          </form>
        ) : null}
        </div>
      </div>
    </header>
    {mobileMenuPortal}
    </>
  );
}

export default Header;