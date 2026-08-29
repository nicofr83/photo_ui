import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `environmentMatchGlobs` was removed in Vitest 4; the node/jsdom split is a
// projects split. Each project inherits plugins and resolution from the root.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // The backend listens on the loopback, so the client always builds an
    // absolute URL. Node's fetch refuses a relative one, which is what makes
    // this explicit rather than accidental.
    env: { VITE_API_BASE_URL: 'http://127.0.0.1:3000' },
    projects: [
      {
        extends: true,
        test: {
          name: 'domain',
          environment: 'node',
          include: [
            'src/shared/**/*.test.ts',
            'src/domain/**/*.test.ts',
            'src/api/**/*.test.ts',
            'src/ui/date/noBareDateRendering.test.ts',
            'fixtures/**/*.test.ts',
            'mocks/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          // Hook tests live beside their hooks in src/api/ but need a DOM.
          include: [
            'src/{app,ui,screens}/**/*.test.{ts,tsx}',
            'src/api/**/*.test.tsx',
            'src/App.test.tsx',
          ],
          exclude: ['src/ui/date/noBareDateRendering.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/shared/**',
      ],
      thresholds: {
        'src/domain/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
