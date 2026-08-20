import { defineConfig, devices } from "@playwright/test";

import {
  E2E_DATABASE_URL,
  assertE2EDatabaseSafety,
} from "./tests/e2e/fixtures/database-safety";

const databaseUrl =
  process.env.DATABASE_URL ??
  E2E_DATABASE_URL;
assertE2EDatabaseSafety({ ...process.env, DATABASE_URL: databaseUrl });
const authSecret =
  process.env.AUTH_SECRET ?? "task-13-e2e-only-auth-secret-2026";
const port = 31_013;
const baseURL = `http://127.0.0.1:${port}`;

process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_SECRET = authSecret;
process.env.AUTH_URL = baseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/task-13",
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `corepack pnpm prisma migrate deploy && corepack pnpm build && corepack pnpm exec next start -p ${port}`,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: authSecret,
      AUTH_URL: baseURL,
      NODE_ENV: "production",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
