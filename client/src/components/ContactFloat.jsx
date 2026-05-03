import { DEFAULT_STORE_CONTACT, whatsappToWaMe } from '../constants/storeContact';
import { useStorefront } from '../context/StorefrontContext';

function IconPhone() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-1.228.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
      />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IconMessenger() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
      <path d="M12 2C6.477 2 2 6.145 2 11.252c0 2.943 1.797 5.536 4.547 7.12L5.5 22l4.04-1.548c1.075.297 2.214.458 3.46.458 5.523 0 10-4.145 10-9.252S17.523 2 12 2zm.55 12.092-2.55-2.704-4.98 2.704 5.47-5.816 2.55 2.704 4.98-2.704-5.47 5.816z" />
    </svg>
  );
}

export default function ContactFloat() {
  const { contact } = useStorefront();
  const c = contact || DEFAULT_STORE_CONTACT;

  const waUrl = whatsappToWaMe(c.whatsappTel);
  const phoneHref = c.phoneTel.startsWith('tel:') ? c.phoneTel : `tel:${c.phoneTel}`;

  const btn =
    'flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-2 ring-white/90 transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2';

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex flex-col items-end gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] sm:p-6"
      role="navigation"
      aria-label="Quick contact"
    >
      {c.messengerUrl ? (
        <a
          href={c.messengerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-brand-500 text-white`}
          title="Messenger"
          aria-label="Chat on Messenger"
        >
          <IconMessenger />
        </a>
      ) : null}
      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-sage-500 text-white`}
          title="WhatsApp"
          aria-label="WhatsApp"
        >
          <IconWhatsApp />
        </a>
      ) : null}
      <a href={phoneHref} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`} title="Call us" aria-label="Phone">
        <IconPhone />
      </a>
    </div>
  );
}
