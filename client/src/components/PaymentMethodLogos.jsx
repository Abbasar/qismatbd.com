import bkashSvg from '../assets/payments/bkash.svg';
import nagadSvg from '../assets/payments/nagad.svg';
import rocketSvg from '../assets/payments/rocket.svg';
import sslcommerzSvg from '../assets/payments/sslcommerz.svg';
import bankSvg from '../assets/payments/bank.svg';
import visaSvg from '../assets/payments/visa.svg';
import mastercardSvg from '../assets/payments/mastercard.svg';

const PAYMENT_ASSET_LIST = [
  { src: bkashSvg, label: 'bKash' },
  { src: nagadSvg, label: 'Nagad' },
  { src: rocketSvg, label: 'Rocket' },
  { src: sslcommerzSvg, label: 'SSLCOMMERZ' },
  { src: bankSvg, label: 'Bank' },
  { src: visaSvg, label: 'Visa' },
  { src: mastercardSvg, label: 'Mastercard' },
];

/** Footer — compact payment marks (light footer band). */
export function FooterMiniPaymentLogos() {
  return (
    <div className="mt-6 border-t border-peach-200/55 pt-5 md:flex md:flex-wrap md:items-center md:justify-end md:gap-3">
      <p className="mb-2.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500 md:mb-0">We accept</p>
      <ul
        className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:justify-end md:min-w-0 md:flex-1 md:justify-end"
        aria-label="Accepted payment methods"
      >
        {PAYMENT_ASSET_LIST.map(({ src, label }) => (
          <li
            key={label}
            className="flex h-6 min-w-0 max-w-[3.35rem] shrink items-center justify-center rounded-sm border border-stone-200/90 bg-white/90 px-0.5 py-px shadow-sm sm:h-6 sm:max-w-[3.85rem] sm:px-1"
            title={label}
          >
            <img
              src={src}
              alt=""
              role="presentation"
              className="max-h-[14px] w-full shrink object-contain sm:max-h-4"
              decoding="async"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
