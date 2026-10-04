import { defineConfig, devices } from "@playwright/test";

// Lab 2's required e2e suite (section 12/9.2 of the labsheet). Assumes the
// server's Postgres DB is already migrated/seeded (same DB the unit/API
// tests use) — this config only starts the two dev servers themselves.
//
// Lab 3: globalSetup restores the dedicated e2e fixture Requester's login
// credentials before every run (see e2e/global-setup.ts) — real login
// replaced the Lab 2 Development Requester picker, so the suite needs a
// deterministic account to log in as.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Lab 2's two one-off evidence generators for the already-submitted Lab 2
  // PDF. Both drive the removed Development Requester picker (each says so in
  // its own header) and are explicitly "not part of the graded automated
  // suite" — leaving them in the default run just makes it permanently red.
  // Lab 2's graded flow (requester-ticket-flow.spec.ts) still runs.
  testIgnore: [
    "**/lab-02/pdf-evidence.spec.ts",
    "**/lab-02/responsive-screenshots.spec.ts",
    // Lab 3's submission-evidence generator changes fixture data on purpose
    // (passwords, resolved tickets, created users); it runs only on request:
    //   LAB3_EVIDENCE=1 npx playwright test e2e/evidence
    ...(process.env.LAB3_EVIDENCE ? [] : ["**/evidence/**"]),
  ],
  fullyParallel: false,
  // One worker: every spec shares one real Postgres database and one set of
  // fixture accounts/tickets, and the last-Administrator spec temporarily
  // changes a system-wide invariant (BR-37) — files must not overlap.
  workers: 1,
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
