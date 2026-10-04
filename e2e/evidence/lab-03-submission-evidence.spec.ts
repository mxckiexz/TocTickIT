import { test, expect, request as playwrightRequest, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  ADMIN,
  ATTACHMENT_BODY,
  ATTACHMENT_FILENAME,
  FIRST_LOGIN,
  INACTIVE,
  REQUESTER,
  STAFF,
  STAFF_FLOW_TICKET,
  THREAD_INTERNAL_NOTE,
  login,
  logout,
  runAdminIsolation,
} from "../helpers/accounts";

// Evidence generator for the Lab 3 submission PDF (sheet section 14, Parts 5-8).
// NOT part of the graded suite: playwright.config.ts ignores this folder unless
// LAB3_EVIDENCE=1, because it deliberately changes fixture data (changes a
// password, resolves a ticket, creates users) and must run on its own:
//
//   LAB3_EVIDENCE=1 npx playwright test e2e/evidence
//
// Every step also asserts its outcome, so a screenshot is only written for a
// behaviour that really happened. Output: artifacts/lab-03/submission-evidence/
// (<part>-NN-<name>.png for screens, .txt for direct-API evidence).
const OUT = path.join(process.cwd(), "artifacts", "lab-03", "submission-evidence");
const API = "http://localhost:3000";
const ORIGIN = "http://localhost:5173";

test.use({ viewport: { width: 1280, height: 900 } });
// Each test walks a whole Part (many steps, several browser contexts), so the
// default 30 s per test is far too short.
test.describe.configure({ mode: "serial", timeout: 240_000 });

test.beforeAll(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
});

// Cropped to the app's real content height (plus a margin) rather than the whole
// 900px-tall viewport: a short screen such as Login would otherwise be a page of
// empty background in the PDF.
async function shot(page: Page, name: string, heightCap?: number) {
  const measured = await page.evaluate(() => {
    const root = document.querySelector("#root > *");
    const bottom = root ? root.getBoundingClientRect().bottom + window.scrollY : document.documentElement.scrollHeight;
    return Math.min(Math.ceil(bottom + 40), document.documentElement.scrollHeight);
  });
  const height = heightCap ? Math.min(measured, heightCap) : measured;
  const width = page.viewportSize()?.width ?? 1280;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true, clip: { x: 0, y: 0, width, height } });
}

function writeText(name: string, text: string) {
  fs.writeFileSync(path.join(OUT, `${name}.txt`), text.endsWith("\n") ? text : `${text}\n`);
}

async function signedIn(browser: Browser, account: { email: string; password: string }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await login(page, account);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  return { context, page };
}

// One direct HTTP call, recorded the way a grader can read it. `expected` is
// asserted, so the evidence file can only ever contain true statements.
class ApiLog {
  lines: string[] = [];
  async call(
    label: string,
    context: BrowserContext | null,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    expected: number,
    options: { body?: object; origin?: string | null; mustNotContain?: string } = {}
  ) {
    const headers: Record<string, string> = {};
    if (method !== "GET" && options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
    const client = context ? context.request : await playwrightRequest.newContext();
    const response = await client.fetch(`${API}${url}`, { method, headers, data: options.body });
    const text = await response.text();
    expect(response.status(), `${label}: ${method} ${url}`).toBe(expected);
    if (options.mustNotContain) expect(text).not.toContain(options.mustNotContain);
    const shown = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    this.lines.push(`${label}\n    ${method} ${url}${options.body ? `  ${JSON.stringify(options.body)}` : ""}\n    -> ${response.status()}  ${shown.replace(/\s+/g, " ")}\n`);
  }
}

async function searchQueue(page: Page, text: string) {
  await page.locator('[aria-label="Search tickets"]:visible').fill(text);
}

// ---------------------------------------------------------------------------
// Part 5 — Login and Mandatory Password Change
// ---------------------------------------------------------------------------
test("Part 5: login, invalid and inactive accounts, busy and failure feedback, first-login password change, role display, logout, blocked direct access", async ({
  page,
  browser,
}) => {
  // Login screen.
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Log in$/i })).toBeVisible();
  await shot(page, "p5-01-login-screen");

  // Invalid credentials: a safe, generic message.
  await page.getByLabel(/^Email/i).fill(REQUESTER.email);
  await page.getByLabel(/^Password/i).fill("not-the-password");
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  await shot(page, "p5-02-login-invalid-credentials");

  // Inactive account, CORRECT password: the identical message, nothing about the account.
  await page.getByLabel(/^Email/i).fill(INACTIVE.email);
  await page.getByLabel(/^Password/i).fill(INACTIVE.password);
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  await expect(page.getByText(/inactive|suspended|disabled/i)).toHaveCount(0);
  await shot(page, "p5-03-login-inactive-account-same-safe-message");

  // Busy state: the request is held for 2.5 s; the button says so and is disabled.
  await page.route("**/api/auth/login", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });
  await page.getByLabel(/^Email/i).fill(REQUESTER.email);
  await page.getByLabel(/^Password/i).fill(REQUESTER.password);
  await page.getByRole("button", { name: /^Log in$/i }).click();
  const busy = page.getByRole("button", { name: "Logging in…" });
  await expect(busy).toBeVisible();
  await expect(busy).toBeDisabled();
  await shot(page, "p5-04-login-busy-state");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page.unroute("**/api/auth/login");
  // Authenticated user and role are shown in the shell.
  await expect(page.getByText("E2E Fixture Requester")).toBeVisible();
  await expect(page.getByText("REQUESTER", { exact: true })).toBeVisible();
  await shot(page, "p5-05-authenticated-user-and-role-requester");

  // Logout, then a safe failure: the API is unreachable.
  await logout(page);
  await page.route("**/api/auth/login", (route) => route.abort());
  await page.getByLabel(/^Email/i).fill(REQUESTER.email);
  await page.getByLabel(/^Password/i).fill(REQUESTER.password);
  await page.getByRole("button", { name: /^Log in$/i }).click();
  await expect(page.getByRole("alert")).toHaveText("Unable to log in. Please try again.");
  await shot(page, "p5-06-login-safe-failure-feedback");
  await page.unroute("**/api/auth/login");

  // Mandatory first-login password change (default password account).
  await login(page, FIRST_LOGIN);
  await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Ticket" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  await shot(page, "p5-07-first-login-forced-change-password");

  await page.getByLabel(/^Current password/i).fill(FIRST_LOGIN.password);
  await page.getByLabel(/^New password/i).fill("E2E-Changed-Pass1");
  await page.getByLabel(/^Confirm new password/i).fill("something-else-1");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await shot(page, "p5-08-change-password-validation-mismatch");

  await page.getByLabel(/^Current password/i).fill("not-the-current-one");
  await page.getByLabel(/^Confirm new password/i).fill("E2E-Changed-Pass1");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("alert")).toHaveText("Current password is incorrect.");
  await shot(page, "p5-09-change-password-wrong-current");

  await page.getByLabel(/^Current password/i).fill(FIRST_LOGIN.password);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Ticket" })).toBeVisible();
  await shot(page, "p5-10-after-password-change-normal-app");

  // Logout, and direct access is blocked afterwards (UI and API).
  const context = page.context();
  await logout(page);
  await shot(page, "p5-11-after-logout-login-screen");
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Log in$/i })).toBeVisible();
  const log = new ApiLog();
  await log.call("After logout, the same browser session asks who it is", context, "GET", "/api/auth/me", 401);
  await log.call("After logout, the same session lists tickets", context, "GET", "/api/tickets", 401);
  await log.call("After logout, the same session opens the staff queue", context, "GET", "/api/staff/tickets", 401);
  writeText("p5-12-direct-access-after-logout", `Direct API access after Logout (the page above is Login again; every protected call is 401)\n\n${log.lines.join("\n")}`);

  // The new password is the one that works now; the role display for the other roles.
  await login(page, { email: FIRST_LOGIN.email, password: FIRST_LOGIN.password });
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  const staff = await signedIn(browser, STAFF);
  await expect(staff.page.getByText("IT_STAFF", { exact: true })).toBeVisible();
  await shot(staff.page, "p5-13-authenticated-user-and-role-it-staff");
  await staff.context.close();
  const admin = await signedIn(browser, ADMIN);
  await expect(admin.page.getByText("ADMINISTRATOR", { exact: true })).toBeVisible();
  await shot(admin.page, "p5-14-authenticated-user-and-role-administrator");
  await admin.context.close();
});

// ---------------------------------------------------------------------------
// Part 6 — IT Staff Ticket Queue
// ---------------------------------------------------------------------------
test("Part 6: queue with realistic data, search, filters, sorting, pagination, ownership, badges, open detail, empty / no-results / failure / forbidden", async ({
  browser,
}) => {
  // A Requester files a few more tickets so the queue has more than one page.
  const requester = await signedIn(browser, REQUESTER);
  const categories = await (await requester.context.request.get(`${API}/api/categories`)).json();
  const systems = await (await requester.context.request.get(`${API}/api/related-systems`)).json();
  const priorities = ["LOW", "MEDIUM", "HIGH"];
  for (let n = 1; n <= 6; n++) {
    const response = await requester.context.request.post(`${API}/api/tickets`, {
      headers: { Origin: ORIGIN },
      data: {
        categoryId: categories[n % categories.length].id,
        relatedSystemId: systems[n % systems.length].id,
        summary: `[e2e] Evidence ticket ${n}`,
        description: "Filed by the evidence run so the queue spans more than one page.",
        requestedPriority: priorities[n % 3],
      },
    });
    expect(response.status()).toBe(201);
  }
  await requester.context.close();

  const { context, page } = await signedIn(browser, STAFF);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await expect(page.getByRole("button", { name: /TKT-/ }).first()).toBeVisible();
  // Assigned and unassigned ownership are both visible, with status and priority badges.
  await expect(page.getByRole("cell", { name: "Unassigned" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /Olivia Martinez|Priya Nair|Marcus Chen/ }).first()).toBeVisible();
  await expect(page.locator("table .badge", { hasText: /^In Progress$/ }).first()).toBeVisible();
  await expect(page.locator("table .badge", { hasText: /^HIGH$/ }).first()).toBeVisible();
  await shot(page, "p6-01-queue-realistic-data-badges-ownership");

  // Pagination: page 1 of 2, then page 2.
  await expect(page.getByText(/Page 1 of 2/).first()).toBeVisible();
  await shot(page, "p6-02-pagination-page-1");
  await page.getByRole("button", { name: "Next" }).first().click();
  await expect(page.getByText(/Page 2 of 2/).first()).toBeVisible();
  await shot(page, "p6-03-pagination-page-2");
  await page.getByRole("button", { name: "Previous" }).first().click();
  await expect(page.getByText(/Page 1 of 2/).first()).toBeVisible();

  // Search.
  await searchQueue(page, "VPN");
  await expect(page.getByRole("button", { name: "TKT-SEED-004" })).toBeVisible();
  await expect(page.getByRole("button", { name: "TKT-SEED-012" })).toBeVisible();
  await expect(page.getByRole("button", { name: "TKT-SEED-001" })).toHaveCount(0);
  await shot(page, "p6-04-search-vpn");
  await searchQueue(page, "");

  // Filters: status, IT priority, owner.
  await page.locator('[aria-label="Filter by status"]:visible').selectOption("IN_PROGRESS");
  await expect(page.locator("table .badge", { hasText: /^In Progress$/ }).first()).toBeVisible();
  await expect(page.locator("table .badge", { hasText: /^New$/ })).toHaveCount(0);
  await page.locator('[aria-label="Filter by IT priority"]:visible').selectOption("MEDIUM");
  await shot(page, "p6-05-filters-status-and-it-priority");
  await page.locator('[aria-label="Filter by status"]:visible').selectOption("");
  await page.locator('[aria-label="Filter by IT priority"]:visible').selectOption("");
  await page.locator('[aria-label="Filter by owner"]:visible').selectOption("unassigned");
  await expect(page.getByRole("cell", { name: /Olivia Martinez|Priya Nair|Marcus Chen/ })).toHaveCount(0);
  await shot(page, "p6-06-filter-unassigned-only");
  await page.locator('[aria-label="Filter by owner"]:visible').selectOption("");

  // Sorting.
  await page.getByRole("button", { name: /^IT Priority/ }).filter({ visible: true }).click();
  await expect(page.getByRole("button", { name: /^IT Priority ▲|^IT Priority ▼/ }).filter({ visible: true })).toBeVisible();
  await shot(page, "p6-07-sorted-by-it-priority");

  // Empty / no-results.
  await searchQueue(page, "zzzz-no-such-ticket");
  await expect(page.getByText("No tickets match your search and filters.")).toBeVisible();
  await shot(page, "p6-08-no-results-state");
  await searchQueue(page, "");

  // Open Ticket Detail.
  await searchQueue(page, "TKT-SEED-004");
  await page.getByRole("button", { name: "TKT-SEED-004" }).click();
  await expect(page.getByRole("heading", { name: "TKT-SEED-004" })).toBeVisible();
  await shot(page, "p6-09-open-ticket-detail-from-queue");
  await context.close();

  // Failure feedback: the queue API is unreachable.
  const failing = await signedIn(browser, STAFF);
  await failing.page.reload();
  await failing.page.route("**/api/staff/tickets**", (route) => route.abort());
  await failing.page.reload();
  await expect(failing.page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(failing.page.getByText(/Unable to load the ticket queue/).first()).toBeVisible();
  await shot(failing.page, "p6-10-failure-feedback-queue-unreachable");
  await failing.context.close();

  // Forbidden: the server answers 403 to the queue (as it would for a Requester).
  const forbidden = await signedIn(browser, STAFF);
  await forbidden.page.route("**/api/staff/tickets**", (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) })
  );
  await forbidden.page.reload();
  await expect(forbidden.page.getByText(/permission|not allowed|forbidden/i).first()).toBeVisible();
  await shot(forbidden.page, "p6-11-forbidden-panel");
  await forbidden.context.close();

  const asRequester = await signedIn(browser, REQUESTER);
  const log = new ApiLog();
  await log.call("A Requester calls the staff queue directly", asRequester.context, "GET", "/api/staff/tickets", 403);
  writeText("p6-12-queue-direct-api-requester", `Direct API access to the queue\n\n${log.lines.join("\n")}`);
  await asRequester.context.close();
});

// ---------------------------------------------------------------------------
// Part 7 — IT Staff Ticket Detail
// ---------------------------------------------------------------------------
test("Part 7: claim/reassign, IT Priority, status with confirmation, comments, notes, attachments, Requester resolution, validation, failure, direct API authorization", async ({
  browser,
}) => {
  const staff = await signedIn(browser, STAFF);
  const page = staff.page;
  await searchQueue(page, STAFF_FLOW_TICKET);
  await page.getByRole("button", { name: "TKT-E2E-000001" }).click();
  await expect(page.getByRole("heading", { name: "TKT-E2E-000001" })).toBeVisible();
  await shot(page, "p7-01-detail-unassigned-new");

  // Claim.
  await page.getByRole("button", { name: "Claim this ticket" }).click();
  await expect(page.getByRole("button", { name: "Reassign" })).toBeVisible();
  await shot(page, "p7-02-claimed");

  // Reassign to another IT Staff member.
  await page.getByRole("button", { name: "Reassign" }).click();
  await page.getByLabel("Reassign to").selectOption({ label: "Priya Nair" });
  await shot(page, "p7-03-reassign-choose-staff");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Priya Nair", { exact: true }).first()).toBeVisible();
  await shot(page, "p7-04-reassigned");

  // IT Priority is independent of Requested Priority.
  await page.getByLabel("IT Priority").selectOption("HIGH");
  await expect(page.getByLabel("IT Priority")).toHaveValue("HIGH");
  await expect(page.locator("dd .badge", { hasText: /^MEDIUM$/ })).toBeVisible();
  await shot(page, "p7-05-it-priority-high-requested-stays-medium");

  // Status: a routine change is immediate; Resolved asks first.
  await page.getByLabel("Status").selectOption("IN_PROGRESS");
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  await shot(page, "p7-06-status-in-progress-immediate");
  await page.getByLabel("Status").selectOption("RESOLVED");
  await expect(page.getByText(/requires confirmation/i)).toBeVisible();
  await shot(page, "p7-07-status-resolved-needs-confirmation");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");
  await shot(page, "p7-08-status-resolved-confirmed");

  // Validation: an empty comment is refused, with the message at the field.
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Comment cannot be empty.")).toBeVisible();
  await shot(page, "p7-09-validation-empty-comment");

  // Public Comment, then a safe failure on the next one.
  const comment = `Visible to the requester ${Date.now()}`;
  await page.getByLabel("Add a comment").fill(comment);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(comment)).toBeVisible();
  await page.route("**/api/tickets/*/comments", (route) => route.abort());
  await page.getByLabel("Add a comment").fill("This one cannot be saved");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Unable to post your comment.")).toBeVisible();
  await expect(page.getByLabel("Add a comment")).toHaveValue("This one cannot be saved");
  await shot(page, "p7-10-safe-failure-comment-text-kept");
  await page.unroute("**/api/tickets/*/comments");

  // Internal Note: visually distinct.
  const note = `Staff only ${Date.now()}`;
  await page.getByLabel("Add an internal note").fill(note);
  await page.getByRole("button", { name: "Post note" }).click();
  await expect(page.getByText("Internal — IT Staff only")).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await shot(page, "p7-11-public-comment-and-internal-note");

  // Attachment continuity: the Requester's attachment opens for IT Staff.
  const link = page.getByRole("link", { name: ATTACHMENT_FILENAME });
  await expect(link).toBeVisible();
  const [popup] = await Promise.all([staff.context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState();
  await expect(popup.locator("body")).toContainText(ATTACHMENT_BODY);
  // A plain-text page has no app container: crop to the few lines of the file.
  await shot(popup, "p7-12-attachment-opened-by-it-staff", 120);
  await popup.close();

  // The Requester sees the comment, never the note; and signals "resolved" on the other ticket.
  const requester = await signedIn(browser, REQUESTER);
  await requester.page.getByRole("button", { name: "My Tickets" }).click();
  await requester.page.locator('[aria-label="Search tickets"]:visible').fill("TKT-E2E-000001");
  await requester.page.getByRole("button", { name: "TKT-E2E-000001" }).click();
  await expect(requester.page.getByText(comment)).toBeVisible();
  await expect(requester.page.getByText(note)).toHaveCount(0);
  await expect(requester.page.getByText(THREAD_INTERNAL_NOTE)).toHaveCount(0);
  await expect(requester.page.getByText(/Internal/)).toHaveCount(0);
  await shot(requester.page, "p7-13-requester-sees-comment-never-the-note");

  await requester.page.getByRole("button", { name: "Back to My Tickets" }).click();
  await requester.page.locator('[aria-label="Search tickets"]:visible').fill("TKT-E2E-000002");
  await requester.page.getByRole("button", { name: "TKT-E2E-000002" }).click();
  await requester.page.getByRole("button", { name: "Problem Appears Resolved" }).click();
  await requester.page.getByRole("button", { name: "Yes, mark resolved" }).click();
  await expect(requester.page.getByText(/You marked this as resolved on/)).toBeVisible();
  await expect(requester.page.locator("dd .badge", { hasText: /^In Progress$/ })).toBeVisible();
  await shot(requester.page, "p7-14-requester-marks-resolved-status-unchanged");

  await page.getByRole("button", { name: "Back to Ticket Queue" }).click();
  await searchQueue(page, "TKT-E2E-000002");
  await page.getByRole("button", { name: "TKT-E2E-000002" }).click();
  await expect(page.getByText(/Requester marked this resolved on/)).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  await shot(page, "p7-15-staff-sees-requester-resolution-signal-status-theirs");

  // Direct API authorization evidence.
  const admin = await signedIn(browser, ADMIN);
  const list = await (await staff.context.request.get(`${API}/api/staff/tickets?search=TKT-E2E-000001`)).json();
  const ticketId: number = list.tickets[0].id;
  const all = await (await staff.context.request.get(`${API}/api/staff/tickets?pageSize=50`)).json();
  const foreign = all.tickets.find((t: { requesterName: string }) => t.requesterName !== "E2E Fixture Requester");
  const log = new ApiLog();
  const t = `/api/staff/tickets/${ticketId}`;
  await log.call("1. No session opens a staff ticket", null, "GET", t, 401);
  await log.call("2. A Requester opens a staff ticket", requester.context, "GET", t, 403);
  await log.call("3. A Requester claims a ticket", requester.context, "POST", `${t}/claim`, 403);
  await log.call("4. A Requester reads Internal Notes of their own ticket (no note content returned)", requester.context, "GET", `/api/tickets/${ticketId}/notes`, 403, { mustNotContain: note });
  await log.call("5. A Requester writes an Internal Note", requester.context, "POST", `/api/tickets/${ticketId}/notes`, 403, { body: { body: "x" } });
  await log.call("6. An Administrator may READ a staff ticket (read-only)", admin.context, "GET", t, 200);
  await log.call("7. An Administrator claims a ticket", admin.context, "POST", `${t}/claim`, 403);
  await log.call("8. An Administrator changes a status", admin.context, "PATCH", `${t}/status`, 403, { body: { currentStatus: "CLOSED", confirm: true } });
  await log.call("9. An Administrator writes an Internal Note", admin.context, "POST", `/api/tickets/${ticketId}/notes`, 403, { body: { body: "x" } });
  await log.call("10. IT Staff change status without the required confirmation (validation, 400)", staff.context, "PATCH", `${t}/status`, 400, { body: { currentStatus: "CLOSED" } });
  await log.call("11. IT Staff make a status change the workflow does not allow (conflict, 409)", staff.context, "PATCH", `${t}/status`, 409, { body: { currentStatus: "OPEN" } });
  await log.call("12. IT Staff claim a ticket that already has an owner (conflict, 409)", staff.context, "POST", `${t}/claim`, 409);
  await log.call("13. IT Staff ask for a ticket that does not exist (404)", staff.context, "GET", "/api/staff/tickets/999999", 404);
  await log.call("14. A forged Origin on a state-changing call is refused (403)", staff.context, "PATCH", `${t}/priority`, 403, { body: { itPriority: "LOW" }, origin: "https://evil.example" });
  if (foreign) {
    await log.call("15. A Requester opens ANOTHER Requester's ticket: 404, not 403 (no existence leak)", requester.context, "GET", `/api/tickets/${foreign.id}`, 404);
  }
  writeText("p7-16-direct-api-authorization", `Direct API authorization evidence (the server enforces roles and ownership, not the UI)\nStatus codes follow the ladder 401 -> 403 -> 400 -> 404 -> 409.\n\n${log.lines.join("\n")}`);

  await requester.context.close();
  await admin.context.close();
  await staff.context.close();
});

// ---------------------------------------------------------------------------
// Part 8 — Administrator User Management
// ---------------------------------------------------------------------------
test.describe("Part 8", () => {
  test("Part 8: list, search, role filter, create, duplicate and invalid input, edit, reset password and forced change, self-deactivation guard, forbidden for non-Administrators", async ({
    browser,
  }) => {
    const email = `e2e-created-${Date.now()}@toktickit.test`;
    const { context, page } = await signedIn(browser, ADMIN);
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    for (const column of ["Name", "Email", "Role", "Status"]) await expect(page.getByRole("columnheader", { name: column })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
    await shot(page, "p8-01-user-list-name-email-role-status-edit");

    // Search and role filter.
    await page.locator('[aria-label="Search users"]').fill("olivia");
    await expect(page.getByRole("cell", { name: "olivia.martinez@toktickit.test" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "grace.thompson@toktickit.test" })).toHaveCount(0);
    await shot(page, "p8-02-search-by-name-or-email");
    await page.locator('[aria-label="Search users"]').fill("");
    await page.getByLabel("Filter by role").selectOption("IT_STAFF");
    await expect(page.getByRole("cell", { name: "priya.nair@toktickit.test" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "jennifer.anderson@toktickit.test" })).toHaveCount(0);
    await shot(page, "p8-03-optional-role-filter-it-staff");
    await page.getByLabel("Filter by role").selectOption("");

    // Create: invalid input first (field-level messages), then valid.
    await page.getByRole("button", { name: "Create user" }).click();
    await page.getByLabel(/^Name$/i).fill("Evidence User");
    await page.getByLabel(/^Email$/i).fill("not-an-email");
    await page.getByLabel(/Default password/i).fill("abc");
    await page.getByRole("button", { name: "Create user" }).nth(1).click();
    await expect(page.locator(".invalid-feedback:visible, .text-danger:visible").first()).toBeVisible();
    await shot(page, "p8-04-create-invalid-input-field-messages");

    await page.getByLabel(/^Email$/i).fill(email);
    await page.getByLabel(/^Role$/i).selectOption("IT_STAFF");
    await page.getByLabel(/Default password/i).fill("E2E-Created-Pass1");
    await shot(page, "p8-05-create-valid-one-role-and-initial-password");
    await page.getByRole("button", { name: "Create user" }).nth(1).click();
    await expect(page.getByText("User created.")).toBeVisible();
    await shot(page, "p8-06-create-success");

    // Duplicate email, differing only by case.
    await page.getByRole("button", { name: "Create user" }).click();
    await page.getByLabel(/^Name$/i).fill("Duplicate");
    await page.getByLabel(/^Email$/i).fill(email.toUpperCase());
    await page.getByLabel(/^Role$/i).selectOption("REQUESTER");
    await page.getByLabel(/Default password/i).fill("E2E-Created-Pass1");
    await page.getByRole("button", { name: "Create user" }).nth(1).click();
    await expect(page.getByText("This email is already in use.")).toBeVisible();
    await shot(page, "p8-07-duplicate-email-rejected");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Edit name / email / role / activation.
    await page.locator('[aria-label="Search users"]').fill(email);
    await expect(page.getByRole("row", { name: new RegExp(email) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(1);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit user" })).toBeVisible();
    await shot(page, "p8-08-edit-user-form");
    await page.getByLabel(/^Role$/i).selectOption("REQUESTER");
    await page.getByLabel("Active").uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("User updated.")).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row.getByText("Requester", { exact: true })).toBeVisible();
    await expect(row.getByText("Suspended")).toBeVisible();
    await shot(page, "p8-09-edited-role-and-suspended-saved");

    // Reactivate, reset the initial password, and show the forced change at next login.
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Active").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("User updated.")).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("New default password").fill("E2E-Reset-Pass1");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Password reset. The user must set a new password at their next login.")).toBeVisible();
    await shot(page, "p8-10-reset-initial-password-success");
    await page.getByRole("button", { name: "Cancel" }).first().click();

    const user = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const userPage = await user.newPage();
    await login(userPage, { email, password: "E2E-Reset-Pass1" });
    await expect(userPage.getByRole("heading", { name: "Change your password" })).toBeVisible();
    await shot(userPage, "p8-11-next-login-forces-password-change");
    await user.close();

    // Safety guards.
    await page.locator('[aria-label="Search users"]').fill(ADMIN.email);
    await expect(page.getByRole("row", { name: new RegExp(ADMIN.email) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(1);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Active").uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("You cannot suspend your own account.")).toBeVisible();
    await shot(page, "p8-12-self-deactivation-blocked");
    await context.close();

    // Forbidden for non-Administrators: no screen, and the API says 403.
    const requester = await signedIn(browser, REQUESTER);
    await expect(requester.page.getByRole("heading", { name: "User Management" })).toHaveCount(0);
    await shot(requester.page, "p8-14-requester-has-no-user-management");
    const staff = await signedIn(browser, STAFF);
    const log = new ApiLog();
    await log.call("No session lists users", null, "GET", "/api/admin/users", 401);
    await log.call("A Requester lists users", requester.context, "GET", "/api/admin/users", 403);
    await log.call("IT Staff list users", staff.context, "GET", "/api/admin/users", 403);
    await log.call("IT Staff create a user", staff.context, "POST", "/api/admin/users", 403, { body: { name: "x", email: "x@toktickit.test", role: "ADMINISTRATOR", password: "abcdefgh1" } });
    await log.call("IT Staff reset someone's password", staff.context, "POST", "/api/admin/users/1/reset-password", 403, { body: { password: "abcdefgh1" } });
    writeText("p8-15-admin-api-forbidden-for-non-administrators", `Administrator API is forbidden to everyone else\n\n${log.lines.join("\n")}`);
    await requester.context.close();
    await staff.context.close();
  });

  // BR-37 is a system-wide invariant: proving the last-Administrator guard
  // needs the e2e Administrator to be the only active one. The isolation helper
  // deactivates every other Administrator for the duration of THIS test only
  // (restored afterwards), so no other screenshot ever shows that temporary state.
  test.describe("last active Administrator", () => {
    test.beforeAll(() => runAdminIsolation("isolate"));
    test.afterAll(() => runAdminIsolation("restore"));

    test("Part 8: the only active Administrator cannot be demoted", async ({ browser }) => {
      const { context, page } = await signedIn(browser, ADMIN);
      await page.locator('[aria-label="Search users"]').fill(ADMIN.email);
      await expect(page.getByRole("row", { name: new RegExp(ADMIN.email) })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(1);
      await page.getByRole("button", { name: "Edit" }).click();
      await page.getByLabel(/^Role$/i).selectOption("IT_STAFF");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("At least one active Administrator is required.")).toBeVisible();
      await shot(page, "p8-13-last-active-administrator-protected");
      await context.close();
    });
  });
});
