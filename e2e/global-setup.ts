import { execSync } from "node:child_process";
import path from "node:path";

// Runs once before the e2e suite (wired via playwright.config.ts's
// globalSetup). Restores the dedicated e2e fixture Requester's password/
// mustChangePassword to a known state (server/scripts/e2e-fixture.ts) before
// every run, so the suite's login step is deterministic regardless of what
// a previous run's real login/Change Password flow left behind.
export default function globalSetup() {
  execSync("npm run e2e:fixture", {
    cwd: path.join(process.cwd(), "server"),
    stdio: "inherit",
  });
}
