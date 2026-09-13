import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--vs-font-sans)',
          'Source Sans 3',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        display: [
          'var(--vs-font-display)',
          'Plus Jakarta Sans',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        vs: {
          ink: 'var(--vs-ink)',
          paper: 'var(--vs-paper)',
          muted: 'var(--vs-muted)',
          line: 'var(--vs-line)',
          sky: 'var(--vs-sky)',
          blue: 'var(--vs-blue)',
          shade: {
            50: 'var(--vs-shade-50)',
            100: 'var(--vs-shade-100)',
            200: 'var(--vs-shade-200)',
            300: 'var(--vs-shade-300)',
            400: 'var(--vs-shade-400)',
            500: 'var(--vs-shade-500)',
            600: 'var(--vs-shade-600)',
            700: 'var(--vs-shade-700)',
            800: 'var(--vs-shade-800)',
            900: 'var(--vs-shade-900)',
            950: 'var(--vs-shade-950)',
          },
        },
      },
      fontSize: {
        'vs-xs': ['0.75rem', { lineHeight: '1.25rem', letterSpacing: '0.02em' }],
        'vs-sm': ['0.875rem', { lineHeight: '1.375rem' }],
        'vs-base': ['1rem', { lineHeight: '1.6rem' }],
        'vs-lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'vs-xl': ['1.25rem', { lineHeight: '1.8rem', letterSpacing: '-0.01em' }],
        'vs-2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        'vs-3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        'vs-4xl': ['2.25rem', { lineHeight: '2.6rem', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [],
} satisfies Config;
