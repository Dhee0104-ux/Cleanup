/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0F1A2A',
          800: '#14243A', // Primary
          700: '#1E324F',
          600: '#2A4468',
        },
        slate: {
          700: '#334B67', // Secondary
          600: '#466284',
          500: '#718096', // Muted Text
          200: '#E1E6EC', // Border
          100: '#F4F6F8', // Background
          50: '#F8FAFC',
        },
        brand: {
          success: '#16845B',
          warning: '#D99A24',
          danger: '#C74646',
          text: '#202B38',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
