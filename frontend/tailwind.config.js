/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        desk: {
          bg: '#090d16',
          card: '#0f172a',
          cardHover: '#1e293b',
          border: '#1e293b',
          borderLight: '#334155',
          muted: '#64748b',
          text: '#f8fafc',
          subtext: '#94a3b8',
        },
        trade: {
          forecast: '#06b6d4',      // Cyan for Day-Ahead Wind Forecast
          forecastGlow: '#0891b2',
          actual: '#10b981',        // Emerald for Actual Generation Outturn
          actualGlow: '#059669',
          short: '#f43f5e',         // Rose for Shortage / Cashout Risk
          long: '#3b82f6',          // Blue for Surplus / Long
          thermal: '#f59e0b',       // Amber for CCGT / OCGT Reserve
          peaker: '#fb923c',        // Orange for Peaker fast dispatch
          bess: '#8b5cf6',          // Violet for Battery storage
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px -3px rgba(6, 182, 212, 0.25)',
        'glow-emerald': '0 0 20px -3px rgba(16, 185, 129, 0.25)',
        'glow-rose': '0 0 20px -3px rgba(244, 63, 94, 0.25)',
      }
    },
  },
  plugins: [],
}
