/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        paper: "var(--paper)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        accent: "var(--accent)",
        line: "var(--line)",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["var(--mono)", "monospace"],
      },
      boxShadow: {
        soft: "var(--soft-shadow)",
      }
    },
  },
  plugins: [],
}
