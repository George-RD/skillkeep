/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        field: "var(--color-field)",
        plate: "var(--color-plate)",
        ink: "var(--color-ink)",
        "ink-secondary": "var(--color-ink-secondary)",
        "ink-quiet": "var(--color-ink-quiet)",
        rule: "var(--color-rule)",
        terracotta: "var(--color-terracotta)",
        forest: "var(--color-forest)",
        amber: "var(--color-amber)",
        brick: "var(--color-brick)",
      },
      fontFamily: {
        serif: "var(--font-serif)",
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
    },
  },
  plugins: [],
};
