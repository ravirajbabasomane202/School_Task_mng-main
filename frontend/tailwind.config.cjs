/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Extra breakpoint for large phones (390-430px). Default sm/md/lg/xl/2xl are kept.
      screens: {
        xs: '420px'
      },
      // Dynamic viewport units: h-dvh / min-h-dvh follow the mobile browser's
      // collapsing address bar. Added as new keys so h-screen is untouched.
      height: {
        dvh: '100dvh'
      },
      minHeight: {
        dvh: '100dvh'
      }
    }
  },
  plugins: []
};
