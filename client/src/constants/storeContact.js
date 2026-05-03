import { resolveImageUrl } from '../utils/image';

/** Defaults match server `data.sql` storefront settings; overridden by public `/api/settings` keys. */
export const DEFAULT_STORE_LOGO = '/images/logo.svg';

export const DEFAULT_STORE_CONTACT = {
  address:
    '-40, Inner circular road, first & second floor, naya paltan, Dhaka - 1000, Bangladesh',
  phoneTel: '+8801755579869',
  whatsappTel: '+8801755579864',
  facebookUrl: 'https://www.facebook.com/share/1DjnnXDabv/',
  messengerUrl: 'https://www.facebook.com/share/1DjnnXDabv/',
  logoUrl: DEFAULT_STORE_LOGO,
};

export function settingsRowsToContact(rows) {
  if (!Array.isArray(rows)) return { ...DEFAULT_STORE_CONTACT };
  const m = {};
  rows.forEach((r) => {
    m[r.setting_key] = r.setting_value;
  });
  const rawLogo = String(m.store_logo_url || '').trim();
  return {
    address: m.store_business_address || DEFAULT_STORE_CONTACT.address,
    phoneTel: m.store_phone_tel || DEFAULT_STORE_CONTACT.phoneTel,
    whatsappTel: m.store_whatsapp_tel || DEFAULT_STORE_CONTACT.whatsappTel,
    facebookUrl: m.store_facebook_url || DEFAULT_STORE_CONTACT.facebookUrl,
    messengerUrl: m.store_messenger_url || DEFAULT_STORE_CONTACT.messengerUrl,
    logoUrl: rawLogo ? resolveImageUrl(rawLogo) : DEFAULT_STORE_LOGO,
  };
}

/** Digits only for wa.me */
export function whatsappToWaMe(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d ? `https://wa.me/${d}` : '';
}
