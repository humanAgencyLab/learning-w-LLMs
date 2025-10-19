/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
      darkMode: 'media',
  theme: {
        extend: {
          colors: {
            bg: "var(--bg)",
            'bg-soft': "var(--bg-soft)",
            text: "var(--text)",
            'text-soft': "var(--text-soft)",
            border: "var(--border)",
            brand: "var(--brand)",
            'brand-ghost': "var(--brand-ghost)"
          },
          boxShadow: {
            'soft': 'var(--shadow-soft)'
          }
        }
  },
  plugins: []
}
