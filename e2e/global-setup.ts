import { execSync } from "node:child_process";
import path from "node:path";

const serverDir = path.join(process.cwd(), "server");

// Runs once before the e2e suite (wired via playwright.config.ts's
// globalSetup).
//   1. Heals a previous run that crashed mid-way through the last-admin spec
//      (which temporarily deactivates other Administrators): restore is a
//      no-op when nothing was isolated.
//   2. Restores the dedicated e2e fixture accounts and tickets to a known
//      state (server/scripts/e2e-fixture.ts), so every spec's login step and
//      starting data are deterministic regardless of what a previous run's
//      real login / Change Password / status-change flows left behind.
export default function globalSetup() {
  execSync("npm run e2e:admins -- restore", { cwd: serverDir, stdio: "inherit" });
  execSync("npm run e2e:fixture", { cwd: serverDir, stdio: "inherit" });
}
