/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  darkMode: 'media',
  theme: {
    extend: {
      // -----------------------------------------------------------------
      // Font families
      // -----------------------------------------------------------------
      // Plus Jakarta Sans is the body font; JetBrains Mono is used for
      // uppercase kickers, access codes, and keyboard hints. Fonts loaded
      // via <link> in public/index.html.
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'monospace',
        ],
      },

      // -----------------------------------------------------------------
      // Colors
      // -----------------------------------------------------------------
      // Existing CSS-var-driven tokens (bg, text, brand, etc.) are kept
      // as-is so nothing that already uses `bg-brand` / `text-text-soft`
      // breaks. The design-system tokens below are additive.
      colors: {
        // Legacy tokens — DO NOT REMOVE. Existing components consume these.
        bg: "var(--bg)",
        'bg-soft': "var(--bg-soft)",
        text: "var(--text)",
        'text-soft': "var(--text-soft)",
        border: "var(--border)",
        'brand-ghost': "var(--brand-ghost)",

        // -------------------------------------------------------------
        // Design-system tokens (Claude Design mockup, July 2026)
        // -------------------------------------------------------------
        // Ink scale — text hierarchy from primary headings to ghost hints.
        ink: {
          900: '#0f1729',
          700: '#344256',
          600: '#3a4256',
          500: '#6b7385',
          400: '#8891a0',
          300: '#98a0b0',
          200: '#a9aec0',
          150: '#b0b7c3',
          100: '#c3c9d4',
          50:  '#cbd2dc',
        },

        // Hairline scale — dividers, card borders, hover-line dividers.
        hairline: {
          DEFAULT: '#e8eaee',
          strong:  '#e2e5ea',
          soft:    '#eef0f3',
          softer:  '#f2f4f7',
        },

        // Surface scale — cards vs page vs chip backgrounds.
        surface: {
          DEFAULT: '#ffffff',
          subtle:  '#f6f7f9',
          chip:    '#f2f4f7',
          hover:   '#fafbfc',
        },

        // Brand blue — primary link + "View insights" button color.
        // Override Tailwind's `brand` from a CSS var to a static hex so
        // buttons render the correct blue even without theme vars set.
        // The existing `--brand` var stays for any legacy consumer.
        brand: {
          DEFAULT: '#2563eb',
          pressed: '#1d4ed8',
          tint:    '#eef4ff',
          tintBorder: '#d3e0ff',
        },

        // Assistant indigo — floating Insights Assistant, hot signal,
        // Modify draft topics button.
        assistant: {
          DEFAULT: '#4f46e5',
          deep:    '#4338ca',
          text:    '#4a4568',
          tint:    '#eef0fe',
          tintSoft:'#f4f2ff',
          tintDeep:'#ddd6fe',
        },

        // Risk tiers — critical / high / watch, top-down by severity
        risk: {
          critical:       '#b42318',
          criticalAccent: '#d92d20',
          criticalTint:   '#fef3f2',
          criticalTintDeep:'#fdeeeb',
          criticalBorder: '#fecdca',
          criticalRing:   '#f4c9c2',
          criticalRule:   '#f6ddd8',

          // High — orange scale
          high:            '#ea580c',  // orange-600 — text color
          highAccent:      '#f97316',  // orange-500 — left-stripe border, glyph
          highTint:        '#fff7ed',  // orange-50 — group tint / background
          highTintDeep:    '#ffedd5',  // orange-100 — chip background
          highBorder:      '#fdba74',  // orange-300 — chip border

          // Watch — yellow scale
          watch:           '#ca8a04',  // yellow-600 — text color
          watchAccent:     '#facc15',  // yellow-400 — left-stripe border, glyph
          watchTint:       '#fefce8',  // yellow-50 — group tint / background
          watchTintDeep:   '#fef9c3',  // yellow-100 — chip background
          watchBorder:     '#fde047',  // yellow-300 — chip border
        },

        // Approve / healthy green
        approve: {
          DEFAULT: '#067647',
          strong:  '#12b76a',
          tint:    '#ecfdf3',
          tintDeep:'#dcf5e6',
          border:  '#b8ecca',
        },
      },

      boxShadow: {
        'soft': 'var(--shadow-soft)',
        // Design-system elevation
        'card':      '0 1px 2px rgba(16,24,40,.04)',
        'card-sm':   '0 1px 2px rgba(16,24,40,.03)',
        'card-hover':'0 4px 14px rgba(37,99,235,.08)',
        'popover':   '0 12px 30px rgba(16,24,40,.16)',
        'assistant': '0 8px 24px rgba(79,70,229,.34)',
        'toast':     '0 10px 30px rgba(16,24,40,.3)',
        'drawer':    '-8px 0 40px rgba(16,24,40,.18)',
      },

      // -----------------------------------------------------------------
      // Animations
      // -----------------------------------------------------------------
      // Consumed as `animate-fadeIn`, `animate-riseIn`, `animate-popIn`.
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        riseIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideIn: {
          '0%':   { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        fadeIn:  'fadeIn .4s ease both',
        riseIn:  'riseIn .5s cubic-bezier(.2,.7,.2,1) both',
        popIn:   'popIn .15s ease both',
        slideIn: 'slideIn .26s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
}
