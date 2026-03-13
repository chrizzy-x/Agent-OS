import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
        mono: [
          'ui-monospace', '"SFMono-Regular"', '"SF Mono"', 'Menlo',
          'Consolas', '"Liberation Mono"', 'monospace',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
