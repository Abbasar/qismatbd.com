import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DEFAULT_STORE_CONTACT, whatsappToWaMe } from '../constants/storeContact';
import { useStorefront } from '../context/StorefrontContext';
import { FooterMiniPaymentLogos } from './PaymentMethodLogos';

function SocialIconFacebook() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function SocialIconMessenger() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.477 2 2 6.145 2 11.252c0 2.943 1.797 5.536 4.547 7.12L5.5 22l4.04-1.548c1.075.297 2.214.458 3.46.458 5.523 0 10-4.145 10-9.252S17.523 2 12 2zm.55 12.092-2.55-2.704-4.98 2.704 5.47-5.816 2.55 2.704 4.98-2.704-5.47 5.816z" />
    </svg>
  );
}

function SocialIconWhatsApp() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function SocialIconPhone() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-1.228.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
      />
    </svg>
  );
}

function Footer() {
  const { contact: c } = useStorefront();
  const store = c || DEFAULT_STORE_CONTACT;

  const waUrl = whatsappToWaMe(store.whatsappTel);
  const phoneHref = store.phoneTel.startsWith('tel:') ? store.phoneTel : `tel:${store.phoneTel}`;

  const socialClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm shadow-slate-200/40 transition hover:border-brand-300 hover:bg-peach-50 hover:text-brand-600';

  return (
    <footer className="mt-10 border-t border-peach-200/70 bg-gradient-to-b from-peach-50 via-white to-sage-50/50 text-slate-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.85)] sm:mt-12">
      <div className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-10">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}>
            <Link to="/" className="inline-flex items-center gap-3">
              <img
                src={store.logoUrl}
                alt="Qismat"
                width={128}
                height={40}
                className="h-8 w-auto max-w-[140px] object-contain object-left opacity-95"
              />
            </Link>
            <p className="mt-4 text-lg font-semibold leading-relaxed text-slate-600">
              Purity is our promise,
            <br /> quality is our business.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={store.facebookUrl} target="_blank" rel="noopener noreferrer" className={socialClass} aria-label="Facebook">
                <SocialIconFacebook />
              </a>
              <a href={store.messengerUrl} target="_blank" rel="noopener noreferrer" className={socialClass} aria-label="Messenger">
                <SocialIconMessenger />
              </a>
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className={socialClass} aria-label="WhatsApp">
                  <SocialIconWhatsApp />
                </a>
              ) : null}
              <a href={phoneHref} className={socialClass} aria-label="Phone">
                <SocialIconPhone />
              </a>
            </div>
          </motion.div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Shop</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link to="/shop" className="font-medium text-slate-700 hover:text-brand-600">
                  All products
                </Link>
              </li>
              <li>
                <Link to="/shop?brand" className="font-medium text-slate-700 hover:text-brand-600">
                  All Brands
                </Link>
              </li>
              <li>
                <Link to="/cart" className="font-medium text-slate-700 hover:text-brand-600">
                  Cart
                </Link>
              </li>
              <li>
                <Link to="/wishlist" className="font-medium text-slate-700 hover:text-brand-600">
                  Wishlist
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500"> <a href="https://hafblbd.com" target="_blank" rel="noopener noreferrer" className=" hover:text-brand-600">Company</a></p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link to="/about" className="font-medium text-slate-700 hover:text-brand-600">
                  About
                </Link>
              </li>
              <li>
                <Link to="/gallery" className="font-medium text-slate-700 hover:text-brand-600">
                  Gallery
                </Link>
              </li>
              <li>
                <Link to="/login" className="font-medium text-slate-700 hover:text-brand-600">
                  My Account
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Visit us</p>
            <p className="mt-4 text-lg font-semibold leading-relaxed text-slate-600">
              <a href="https://hafblbd.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-800 hover:text-brand-600">Hossain ALi Food & Beverage Ltd.</a></p>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">{store.address}</p>
            <p className="mt-3 text-sm">
              phone:
              <a href={phoneHref} className="font-semibold text-slate-800 hover:text-brand-600">
                {store.phoneTel.replace(/^tel:/, '')}
              </a>
            </p>
            <p className="mt-3 text-sm">
              email: <a href={`mailto:hafblbd@gmail.com`} className="font-semibold text-slate-800 hover:text-brand-600">hafblbd@gmail.com</a>
            </p>
            <button
              type="button"
              aria-label="Back to top"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
              }}
              className="mt-5 inline-flex rounded-sm border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-brand-300 hover:bg-peach-50 hover:text-brand-700"
            >
              Back to top
            </button>
          </div>
        </div>
        <FooterMiniPaymentLogos />
        <div className="mt-8 flex flex-col gap-2 border-t border-peach-200/60 pt-6 text-xs text-slate-500 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Qismat. All rights reserved.</p>
          <p className="text-slate-500">Built with care — React, Vite, Node, MySQL.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
