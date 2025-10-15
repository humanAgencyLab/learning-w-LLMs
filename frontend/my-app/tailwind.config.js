/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--sa-bg)",
        surface: "var(--sa-surface)",
        border: "var(--sa-border)",
        primary: "var(--sa-primary)",
        text: "var(--sa-text)",
        muted: "var(--sa-muted)",
        accent: "var(--sa-accent)",
        secondary: "var(--sa-secondary)",
        'secondary-light': "var(--sa-secondary-light)",
        'primary-light': "var(--sa-primary-light)",
        'text-muted': "var(--sa-text-muted)",
        'text-secondary': "var(--sa-text-secondary)",
      },
      borderRadius: {
        DEFAULT: "var(--sa-radius-lg)",
        xl: "var(--sa-radius-xl)",
        '2xl': "var(--sa-radius-2xl)",
        sm: "var(--sa-radius-sm)",
        full: "var(--sa-radius-full)",
      },
      boxShadow: {
        card: "var(--sa-elev-1)",
        float: "var(--sa-elev-2)",
        elevated: "var(--sa-elev-3)",
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      spacing: {
        'sa-xs': 'var(--sa-gap-xs)',
        'sa-sm': 'var(--sa-gap-sm)',
        'sa-md': 'var(--sa-gap-md)',
        'sa-lg': 'var(--sa-gap-lg)',
        'sa-xl': 'var(--sa-gap-xl)',
        'sa-2xl': 'var(--sa-gap-2xl)',
        'sa-3xl': 'var(--sa-gap-3xl)',
        'sa-4xl': 'var(--sa-gap-4xl)',
      }
    },
  },
  plugins: [],
}
