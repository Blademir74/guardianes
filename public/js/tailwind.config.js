// tailwind.config.js
module.exports = {
  content: ["./public/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        'guardian-blue': '#0a2e5a',
        'guardian-light': '#e6f0ff',
        'gold-accent': '#f0b429',
        'emerald-accent': '#10b981',
      },
      fontFamily: {
        'sans': ['Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}