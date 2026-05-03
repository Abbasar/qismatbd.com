/** Setting keys stored in `settings` table */
export const THEME_SETTING_KEYS = {
  primary: 'theme_primary_color',
  sidebar: 'theme_sidebar_color',
};

export const DEFAULT_THEME = {
  primary: '#ff5555',
  sidebar: '#ffffff',
};

/** sRGB hex → linear channel 0–1 */
function srgbChannelToLinear(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance 0–1 (WCAG). */
function normalizeHex6(hex) {
  let s = String(hex).trim().replace(/^#/, '');
  if (s.length === 3 && /^[0-9a-f]{3}$/i.test(s)) {
    s = [...s].map((c) => c + c).join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return s;
}

export function hexLuminance(hex) {
  const s = normalizeHex6(hex);
  if (!s) return null;
  const n = parseInt(s, 16);
  const r = srgbChannelToLinear((n >> 16) & 255);
  const g = srgbChannelToLinear((n >> 8) & 255);
  const b = srgbChannelToLinear(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Very light primaries (e.g. #fff) make Tailwind `bg-brand-600` + `text-white` unreadable.
 * Clamp to default when luminance is above this.
 */
const PRIMARY_MAX_LUMINANCE = 0.72;

export function sanitizePrimaryHex(hex) {
  const raw = typeof hex === 'string' ? hex.trim() : '';
  if (!raw) return DEFAULT_THEME.primary;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  const lum = hexLuminance(withHash);
  if (lum == null) return DEFAULT_THEME.primary;
  if (lum > PRIMARY_MAX_LUMINANCE) return DEFAULT_THEME.primary;
  const s6 = normalizeHex6(withHash);
  return s6 ? `#${s6}` : DEFAULT_THEME.primary;
}

/** Secondary palette (fixed; complements --theme-primary). */
export const THEME_FIXED = {
  peach: '#ff937e',
  sage: '#59ac77',
};

export function applyThemeToDocument(theme) {
  const root = document.documentElement;
  const primary = sanitizePrimaryHex(theme?.primary || DEFAULT_THEME.primary);
  const sidebar = theme?.sidebar || DEFAULT_THEME.sidebar;
  root.style.setProperty('--theme-primary', primary);
  root.style.setProperty('--theme-peach', THEME_FIXED.peach);
  root.style.setProperty('--theme-sage', THEME_FIXED.sage);
  root.style.setProperty('--theme-sidebar', sidebar);
}

export function persistThemeCache(theme) {
  const primary = sanitizePrimaryHex(theme?.primary || DEFAULT_THEME.primary);
  const sidebar = theme?.sidebar || DEFAULT_THEME.sidebar;
  applyThemeToDocument({ primary, sidebar });
  try {
    localStorage.setItem(
      'qismat-theme-cache',
      JSON.stringify({
        primary,
        sidebar,
      })
    );
  } catch {
    /* ignore */
  }
}

export function loadThemeFromLocalStorage() {
  try {
    const raw = localStorage.getItem('qismat-theme-cache');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.primary !== 'string') return null;
    return {
      primary: sanitizePrimaryHex(parsed.primary),
      sidebar: typeof parsed.sidebar === 'string' ? parsed.sidebar : DEFAULT_THEME.sidebar,
    };
  } catch {
    return null;
  }
}

export function themeFromSettingsObject(settingsObj) {
  if (!settingsObj) return { ...DEFAULT_THEME };
  return {
    primary: sanitizePrimaryHex(settingsObj[THEME_SETTING_KEYS.primary] || DEFAULT_THEME.primary),
    sidebar: settingsObj[THEME_SETTING_KEYS.sidebar] || DEFAULT_THEME.sidebar,
  };
}
