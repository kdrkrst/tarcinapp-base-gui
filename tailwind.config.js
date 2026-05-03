/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#0f172a',
          hover: '#1e293b',
          active: '#1d4ed8',
          border: '#1e293b',
          text: '#94a3b8',
          activeText: '#ffffff',
        },
        surface: '#1e293b',
        muted: '#334155',
      },
    },
  },
  plugins: [],
}
