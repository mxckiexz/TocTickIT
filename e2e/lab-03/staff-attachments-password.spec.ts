import { test, expect } from "@playwright/test";
import {
  ATTACHMENT_BODY,
  ATTACHMENT_FILENAME,
  PWCHANGE,
  REQUESTER,
  STAFF,
  STAFF_FLOW_TICKET,
  login,
  logout,
} from "../helpers/accounts";

const API = "http://localhost:3000";
const STAFF_TICKET_NUMBER = "TKT-E2E-000001";

test.describe.configure({ mode: "serial" });

// docs/lab-03/tests.md §9 — E2E-07 (sheet 8.4 / Part 7: IT Staff open a
// ticket's existing attachments, and see its Category and Related System) and
// E2E-08 (sheet section 7: a voluntary Change password action).
test("E2E-07: IT Staff see the Category and Related System and open the ticket's attachment; a Requester cannot use the staff route", async ({
  page,
  context,
}) => {
  await login(page, STAFF);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await page.locator('[aria-label="Search tickets"]:visible').fill(STAFF_FLOW_TICKET);
  await page.getByRole("row", { name: new RegExp(STAFF_TICKET_NUMBER) }).getByRole("button", { name: STAFF_TICKET_NUMBER }).click();
  await expect(page.getByRole("heading", { name: STAFF_TICKET_NUMBER })).toBeVisible();

  // Category and Related System are shown by name — the fixture ticket uses the
  // first active of each, so compare with what the lookup lists return.
  const categories = await (await page.request.get(`${API}/api/categories`)).json();
  const systems = await (await page.request.get(`${API}/api/related-systems`)).json();
  await expect(page.locator("dt", { hasText: /^Category$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText(categories[0].name);
  await expect(page.locator("dt", { hasText: /^Related System$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText(systems[0].name);

  // The attachment is a real link, and it opens the file.
  const link = page.getByRole("link", { name: ATTACHMENT_FILENAME });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/\/api\/staff\/tickets\/\d+\/attachments\/\d+$/);
  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState();
  await expect(popup.locator("body")).toContainText(ATTACHMENT_BODY);
  await popup.close();

  // The same URL is not available to a Requester session (server-side role
  // check, not a hidden link).
  await logout(page);
  await login(page, REQUESTER);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  const asRequester = await page.request.get(href!);
  expect(asRequester.status()).toBe(403);
  expect(await asRequester.text()).not.toContain(ATTACHMENT_BODY);
});

test("E2E-08: a user changes their own password from the app shell, and only the new password works afterwards", async ({
  page,
}) => {
  const newPassword = "E2E-Changed-Pass2";

  await login(page, PWCHANGE);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  // Cancel returns to the shell, and nothing changed.
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "My Tickets" })).toBeVisible();

  // A wrong current password is rejected and the form stays open.
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel(/Current password/i).fill("Not-The-Password1");
  await page.getByLabel(/^New password/i).fill(newPassword);
  await page.getByLabel(/Confirm new password/i).fill(newPassword);
  await page.getByRole("button", { name: /Save password/i }).click();
  await expect(page.getByText("Current password is incorrect.")).toBeVisible();

  // The right one succeeds, returns to the shell, and says so.
  await page.getByLabel(/Current password/i).fill(PWCHANGE.password);
  await page.getByRole("button", { name: /Save password/i }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "My Tickets" })).toBeVisible();

  // Log out: the old password no longer works, the new one does.
  await logout(page);
  await login(page, PWCHANGE);
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await login(page, { email: PWCHANGE.email, password: newPassword });
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});
