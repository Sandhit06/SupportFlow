import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/live",
  timeout: 120000,
  workers: 1,
  webServer: [
    {
      command: "pnpm --filter @supportflow/web start",
      url: "http://localhost:3000/api/v1/health/ready",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command:
        'pnpm exec concurrently "pnpm exec tsx apps/realtime/src/index.ts" "pnpm exec tsx apps/worker/src/index.ts"',
      url: "http://localhost:3001",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "pnpm exec http-server examples/storefront -p 3002 -c-1",
      url: "http://localhost:3002",
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
