import { useEffect } from 'react';
import { apiUrl, fetchWithTimeout } from '../utils/api';

/**
 * Loads Meta Pixel (client-side) when `facebook_pixel_id` is set in public settings.
 */
export default function FacebookPixelBootstrap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(apiUrl('/api/settings'));
        if (!res.ok || cancelled) return;
        const rows = await res.json();
        const map = {};
        rows.forEach((r) => {
          map[r.setting_key] = r.setting_value;
        });
        const pixelId = map.facebook_pixel_id && String(map.facebook_pixel_id).trim();
        if (!pixelId || cancelled) return;
        if (typeof window.fbq === 'function') return;

        (function loadFbq(f, b, e, v, n, t, s) {
          if (f.fbq) return;
          n = f.fbq = function fbqPush() {
            // eslint-disable-next-line prefer-rest-params
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n;
          n.loaded = !0;
          n.version = '2.0';
          n.queue = [];
          t = b.createElement(e);
          t.async = !0;
          t.src = v;
          s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

        window.fbq('init', pixelId);
        window.fbq('track', 'PageView');
      } catch {
        /* optional marketing script */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
