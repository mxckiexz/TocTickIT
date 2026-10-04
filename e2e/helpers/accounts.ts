import { execSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";

// Mirrors server/scripts/e2e-fixture.ts (not imported from it — importing
// would run its main()). Keep the two in sync.
export const REQUESTER = { email: "e2e-requester@toktickit.test", password: "E2E-Fixture-Pass1" };
export const STAFF = { email: "e2e-staff@toktickit.test", password: "E2E-Fixture-Pass1" };
export const ADMIN = { email: "e2e-admin@toktickit.test", password: "E2E-Fixture-Pass1" };
export const FIRST_LOGIN = { email: "e2e-firstlogin@toktickit.test", password: "E2E-Default-Pass1" };
export const CHANGEPW_SHOTS = { email: "e2e-changepw-shots@toktickit.test", password: "E2E-Default-Pass1" };
export const PWCHANGE = { email: "e2e-pwchange@toktickit.test", password: "E2E-Fixture-Pass1" };
export const ATTACHMENT_FILENAME = "e2e-evidence.txt";
export const ATTACHMENT_BODY = "e2e attachment fixture: opened by IT Staff";
export const THREAD_STAFF_COMMENT = "Thanks for reporting this. Which laptop does it happen on?";
export const THREAD_REQUESTER_COMMENT = "It is the one in room B204, started on Monday.";
export const THREAD_INTERNAL_NOTE = "Possible driver issue, check the B204 imaging batch first.";
export const INACTIVE = { email: "e2e-inactive@toktickit.test", password: "E2E-Fixture-Pass1" };
export const STAFF_FLOW_TICKET = "[e2e] Staff flow ticket";
export const REQUESTER_RESOLVE_TICKET = "[e2e] Requester resolve ticket";
export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 800, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

export async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/");
  await page.getByLabel(/^Email/i).fill(account.email);
  await page.getByLabel(/^Password/i).fill(account.password);
  await page.getByRole("button", { name: /^Log in$/i }).click();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: /^Log in$/i }).waitFor();
}

export function runAdminIsolation(command: "isolate" | "restore") {
  execSync(`npm run e2e:admins -- ${command}`, {
    cwd: path.join(process.cwd(), "server"),
    stdio: "inherit",
  });
}
