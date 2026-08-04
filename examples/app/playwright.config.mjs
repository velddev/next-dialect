import { defineConfig } from '@playwright/test'

// Assumes both flows are built (npm run build && npm run build:ssr).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  webServer: [
    {
      command: 'node scripts/serve.mjs dist',
      port: 4510,
      env: { PORT: '4510' },
      reuseExistingServer: true,
    },
    {
      command: 'node ../../node_modules/next-dialect/bin/next-dialect.mjs start',
      port: 4620,
      env: { PORT: '4620', DIALECT_SSR: '1' },
      reuseExistingServer: true,
    },
  ],
})
