import { useEffect } from 'react';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import {
  createMetaEventId,
  getMetaFbc,
  getMetaFbp,
  getMetaEventSourceUrl,
} from '../utils/metaAttribution';

/**
 * Meta Pixel (ব্রাউজার) + CAPI PageView dedup — Admin facebook_pixel_id থাকলে লোড
 * PageView: একই event_id ব্রাউজার + POST /api/meta/event (আসল IP)
 * Purchase: OrderSuccess.jsx (eventID = purchase-order-{id})
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
        const pageViewEventId = createMetaEventId('pageview');
        window.fbq('track', 'PageView', {}, { eventID: pageViewEventId });
        fetch(apiUrl('/api/meta/event'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: 'PageView',
            event_id: pageViewEventId,
            event_source_url: getMetaEventSourceUrl(),
            fbp: getMetaFbp(),
            fbc: getMetaFbc(),
          }),
        }).catch(() => {});
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
