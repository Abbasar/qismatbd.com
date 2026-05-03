import { useEffect } from 'react';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import {
  applyThemeToDocument,
  persistThemeCache,
  themeFromSettingsObject,
} from '../utils/theme';

/**
 * Loads theme from API settings and applies CSS variables (overrides local cache when successful).
 */
function ThemeBootstrap() {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchWithTimeout(apiUrl('/api/settings'));
        if (!res.ok) return;
        const rows = await res.json();
        const map = {};
        rows.forEach((r) => {
          map[r.setting_key] = r.setting_value;
        });
        const theme = themeFromSettingsObject(map);
        if (!cancelled) {
          persistThemeCache(theme);
        }
      } catch {
        /* keep existing vars from main.jsx cache */
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'qismat-theme-cache' || !e.newValue) return;
      try {
        const t = JSON.parse(e.newValue);
        applyThemeToDocument(t);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return null;
}

export default ThemeBootstrap;
