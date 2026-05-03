import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiUrl, fetchWithTimeout } from '../utils/api';
import { DEFAULT_STORE_CONTACT, settingsRowsToContact } from '../constants/storeContact';

const StorefrontContext = createContext({
  contact: DEFAULT_STORE_CONTACT,
  ready: false,
});

export function StorefrontProvider({ children }) {
  const [rows, setRows] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(apiUrl('/api/settings'));
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setRows(data);
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      contact: settingsRowsToContact(rows),
      ready: settingsLoaded,
    }),
    [rows, settingsLoaded]
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront() {
  return useContext(StorefrontContext);
}
