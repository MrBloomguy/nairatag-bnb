/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          bnb: '#F0B90B',
          'bnb-hover': '#FCD535',
          'bnb-dark': '#C99400',
          naira: '#059669',
          'naira-hover': '#047857',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'GT Maru', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
