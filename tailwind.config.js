/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#F0F7FF',
          100: '#D6EAFF',
          500: '#007AFF',
          600: '#007AFF',
          700: '#0062CC',
        },
      },
    },
  },
  plugins: [],
}
