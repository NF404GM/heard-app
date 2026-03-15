/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        heard: {
          bg: '#0E0E10',
          surface: '#1A1A1F',
          'surface-light': '#2A2A32',
          text: '#F0EEE9',
          'text-muted': '#8A8A8E',
          accent: '#6C5CE7',
          'accent-warm': '#E17055',
          'accent-gold': '#FDCB6E',
          success: '#00B894',
          error: '#D63031',
        },
      },
      fontFamily: {
        display: ['SpaceMono'],
        body: ['System'],
      },
      spacing: {
        'card-w': '320px',
        'card-h': '426px',
        'art-size': '280px',
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};
