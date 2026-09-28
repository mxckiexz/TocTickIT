import { defineConfig, devices } from "@playwright/test";

// Lab 2's required e2e suite (section 12/9.2 of the labsheet). Assumes the
// server's Postgres DB is already migrated/seeded (same DB the unit/API
// tests use) — this config only starts the two dev servers themselves.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: "server",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      cwd: "client",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
