import { test, expect, type Page } from "@playwright/test";
import { ADMIN, REQUESTER, login, runAdminIsolation } from "../helpers/accounts";

const API = "http://localhost:3000";

test.describe.configure({ mode: "serial" });

// BR-37 is a system-wide invariant: proving the last-admin guard end to end
// needs the e2e Administrator to be the only active one. The helper
// deactivates every other Administrator and remembers who; afterAll (and
// globalTeardown, as a backstop) reactivates exactly those.
test.beforeAll(() => runAdminIsolation("isolate"));
test.afterAll(() => runAdminIsolation("restore"));

async function openEditFor(page: Page, email: string) {
  await page.locator('[aria-label="Search users"]').fill(email);
  // The search is debounced and the list reloads afterwards: wait until the
  // list has settled on exactly this user, or "Edit" could belong to the
  // previous search's row. (Table and mobile card both render; only the
  // visible one is addressable by role.)
  await expect(page.getByRole("row", { name: new RegExp(email) })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(1);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit user" })).toBeVisible();
}

// docs/lab-03/tests.md §9 — E2E-06 (AC-22..AC-26).
test("E2E-06: Administrator creates, finds, edits, suspends, and resets a user — and the self-suspend and last-Administrator guards hold", async ({
  page,
  browser,
}) => {
  const email = `e2e-created-${Date.now()}@toktickit.test`;

  await login(page, ADMIN);
  await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

  // --- Create: validation first, then success.
  await page.getByRole("button", { name: "Create user" }).click();
  await page.getByRole("button", { name: "Create user" }).nth(1).click();
  await expect(page.getByText("Name is required.")).toBeVisible();
  await expect(page.getByText("Email is required.")).toBeVisible();

  await page.getByLabel(/^Name$/i).fill("E2E Created User");
  await page.getByLabel(/^Email$/i).fill(email);
  await page.getByLabel(/^Role$/i).selectOption("REQUESTER");
  await page.getByLabel(/Default password/i).fill("E2E-Created-Pass1");
  await page.getByRole("button", { name: "Create user" }).nth(1).click();
  await expect(page.getByText("User created.")).toBeVisible();

  // --- Duplicate email (different case) is a field-level error under Email (AC-23).
  await page.getByRole("button", { name: "Create user" }).click();
  await page.getByLabel(/^Name$/i).fill("Duplicate");
  await page.getByLabel(/^Email$/i).fill(email.toUpperCase());
  await page.getByLabel(/^Role$/i).selectOption("REQUESTER");
  await page.getByLabel(/Default password/i).fill("E2E-Created-Pass1");
  await page.getByRole("button", { name: "Create user" }).nth(1).click();
  await expect(page.getByText("This email is already in use.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // --- Search and role filter find the new user.
  await page.locator('[aria-label="Search users"]').fill(email);
  await expect(page.getByRole("cell", { name: email })).toBeVisible();
  await page.getByLabel("Filter by role").selectOption("IT_STAFF");
  await expect(page.getByText("No users match your search.")).toBeVisible();
  await page.getByLabel("Filter by role").selectOption("REQUESTER");
  await expect(page.getByRole("cell", { name: email })).toBeVisible();
  await page.getByLabel("Filter by role").selectOption("");

  // --- Edit role and status: promote to IT Staff, then suspend.
  await openEditFor(page, email);
  await page.getByLabel(/^Role$/i).selectOption("IT_STAFF");
  await page.getByLabel("Active").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("User updated.")).toBeVisible();
  const createdRow = page.getByRole("row", { name: new RegExp(email) });
  await expect(createdRow.getByText("IT Staff", { exact: true })).toBeVisible();
  await expect(createdRow.getByText("Suspended")).toBeVisible();

  // --- Reset password: success message, then the user is forced to change it at next login.
  await openEditFor(page, email);
  await page.getByLabel("New default password").fill("E2E-Reset-Pass1");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Password reset. The user must set a new password at their next login.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).first().click();

  // (Suspended accounts can't log in at all — reactivate, then prove the forced change.)
  await openEditFor(page, email);
  await page.getByLabel("Active").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("User updated.")).toBeVisible();

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await login(userPage, { email, password: "E2E-Reset-Pass1" });
  await expect(userPage.getByRole("heading", { name: "Change your password" })).toBeVisible();
  await userContext.close();

  // --- Self-suspend is blocked, with the message at the Active control (AC-24).
  await openEditFor(page, ADMIN.email);
  await page.getByLabel("Active").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("You cannot suspend your own account.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // --- The only active Administrator can't demote themself (AC-25).
  await openEditFor(page, ADMIN.email);
  await page.getByLabel(/^Role$/i).selectOption("IT_STAFF");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("At least one active Administrator is required.")).toBeVisible();
});

test("a non-Administrator never reaches User Management, in the UI or at the API", async ({ page }) => {
  await login(page, REQUESTER);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "User Management" })).toHaveCount(0);
  expect((await page.request.get(`${API}/api/admin/users`)).status()).toBe(403);
});
