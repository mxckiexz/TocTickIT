import { execSync } from "node:child_process";
import path from "node:path";

// Safety net behind the last-admin spec's own afterAll: whatever happened
// during the run, never leave the real Administrators deactivated.
export default function globalTeardown() {
  execSync("npm run e2e:admins -- restore", {
    cwd: path.join(process.cwd(), "server"),
    stdio: "inherit",
  });
}
