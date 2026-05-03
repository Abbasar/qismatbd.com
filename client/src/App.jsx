import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from './components/Header';
import Footer from './components/Footer';
import ContactFloat from './components/ContactFloat';
import FacebookPixelBootstrap from './components/FacebookPixelBootstrap';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductPage from './pages/ProductPage';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Admin from './pages/Admin';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import About from './pages/About';
import MyAccount from './pages/MyAccount';
import Wishlist from './pages/Wishlist';
import OrderSuccess from './pages/OrderSuccess';
import RequireAuth from './components/RequireAuth';
import ThemeBootstrap from './components/ThemeBootstrap';

function AppContent() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isHome = location.pathname === '/';
  const isShopHeroFlush = location.pathname === '/shop';

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-brand-50/65 via-[#fafafa] to-slate-50 text-slate-900 antialiased">
      <ThemeBootstrap />
      <FacebookPixelBootstrap />
      {!isAdminRoute && <Header />}
      <motion.main
        key={location.pathname + (isAdminRoute ? '-a' : '')}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={
          isAdminRoute
            ? 'min-h-screen w-full px-0 py-0'
            : isHome || isShopHeroFlush
              ? /* Hero / shop promo strip touches header — no top padding */
                'mx-auto max-w-7xl px-3 pb-4 pt-0 sm:px-4 sm:pb-6'
              : 'mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6'
        }
      >
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:id" element={<ProductPage />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/about" element={<About />} />
            <Route
              path="/account"
              element={
                <RequireAuth>
                  <MyAccount />
                </RequireAuth>
              }
            />
            <Route
              path="/wishlist"
              element={
                <RequireAuth>
                  <Wishlist />
                </RequireAuth>
              }
            />
            <Route path="/order-success" element={<OrderSuccess />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/admin"
              element={
                <RequireAuth adminOnly>
                  <Admin />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
      </motion.main>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <ContactFloat />}
    </div>
  );
}

function App() {
  return <AppContent />;
}

export default App;
