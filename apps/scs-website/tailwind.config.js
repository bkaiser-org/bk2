/** @type {import('tailwindcss').Config} */
// Mirrors the former inline `tailwind.config` that the cdn.tailwindcss.com Play CDN
// used at runtime. The CSS is now precompiled to assets/tailwind.css at build time
// (see the `build:web-css` script) so the /web pages need no runtime CDN.
// Regenerate after adding/removing Tailwind classes in the HTML.
module.exports = {
  content: ['apps/scs-website/**/*.html'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        scs: { green: '#009D53', greenDark: '#007a40', blue: '#014da2', blueDark: '#013a7c' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
