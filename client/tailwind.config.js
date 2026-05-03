/** Palettes from CSS variables (runtime primary; peach & sage fixed defaults). */
function spectrumFromVar(varName) {
  return {
    50: `color-mix(in srgb, var(${varName}) 10%, white)`,
    100: `color-mix(in srgb, var(${varName}) 18%, white)`,
    200: `color-mix(in srgb, var(${varName}) 32%, white)`,
    300: `color-mix(in srgb, var(${varName}) 50%, white)`,
    400: `color-mix(in srgb, var(${varName}) 72%, white)`,
    500: `var(${varName})`,
    600: `color-mix(in srgb, var(${varName}) 82%, #475569)`,
    700: `color-mix(in srgb, var(${varName}) 68%, #475569)`,
    800: `color-mix(in srgb, var(${varName}) 52%, #475569)`,
    900: `color-mix(in srgb, var(${varName}) 38%, #475569)`,
  };
}

const brandFromTheme = spectrumFromVar('--theme-primary');
const peachFromTheme = spectrumFromVar('--theme-peach');
const sageFromTheme = spectrumFromVar('--theme-sage');

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: brandFromTheme,
        peach: peachFromTheme,
        sage: sageFromTheme,
        'theme-sidebar': 'var(--theme-sidebar)',
      },
      boxShadow: {
        'brand-glow': '0 12px 40px -16px color-mix(in srgb, var(--theme-primary) 45%, transparent)',
        'sage-glow': '0 12px 40px -16px color-mix(in srgb, var(--theme-sage) 40%, transparent)',
      },
    },
  },
  plugins: [],
};
