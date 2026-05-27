/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}', '../plugins/**/*.js'],
  theme: {
    extend: {
      colors: {
        dark: {
          500: '#2a2a2a',
          600: '#1e1e1e',
          700: '#161616',
          800: '#111111',
        },
        accent: '#4080e0',
        gold: '#e8c040',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
