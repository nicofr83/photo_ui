import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Les valeurs codées du contrat ont UNE seule définition, côté frontend.
// Le serveur les importe en lecture seule par cet alias — voir le plan, D2.
const shared = fileURLToPath(new URL('../src/shared', import.meta.url));
const alias = { '@shared': shared };

// `.env` local, non versionné. La suite d'intégration a besoin de
// DATABASE_URL_TEST ; `setup_integration.ts` refuse de tourner sans lui, et
// refuse aussi de viser autre chose que `photo_ui_test`.
const envFile = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        resolve: { alias },
        // Sans base, et sans moquerie : ce qui mérite un test ici est PUR.
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.itest.ts'],
          setupFiles: ['./test/helpers/setup_integration.ts'],
          // Une base, une suite : les tests partagent la connexion et
          // s'isolent par une transaction annulée, pas par un TRUNCATE.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.itest.ts',
        'src/contract/**',
        'src/runtime/bootstrap.ts',
        'src/runtime/main.ts',
        'src/**/*_cli.ts',
      ],
      thresholds: {
        // Une branche non exercée dans la cascade est une photo mal datée.
        'src/metier/dating/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/metier/overlap/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
