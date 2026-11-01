import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, REQUESTER, STAFF, login } from "../helpers/accounts";
import {
  REQUESTER2,
  apiSession,
  createTicket,
  currentUserId,
  dashboardTruth,
  recordAction,
  staffWrite,
  uniqueSummary,
  watchConsole,
  type CreatedTicket,
} from "../helpers/lab4";

// docs/lab-04/tests.md section 7, E2E-03: what each dashboard says is what the database holds, the drill-down links
// open exactly the list they counted, navigation is per role, and a Requester sees only their own tickets. The
// expected numbers come from server/scripts/e2e-dashboard-truth.ts, which reads the database without using the
// dashboard code. The database also holds the seeded tickets and everything earlier specs left, so no number is
// hard-coded: each is compared with the truth taken right before the page is read.
test.describe.configure({ mode: "serial" });

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};
const ACTION_LABELS: Record<string, string> = { PLANNED: "Planned", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const PRIORITY_LABELS: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

// The number in a drill-down link's accessible name: "View 6 unassigned tickets" -> 6.
async function numberOf(page: Page, name: RegExp): Promise<number> {
  const label = await page.getByRole("link", { name }).first().getAttribute("aria-label");
  return Number(/View (\d+)/.exec(label ?? "")![1]);
}

// How many tickets a list says it holds: "Page 1 of 1 (9 tickets)".
async function listTotal(page: Page): Promise<number> {
  const text = await page.getByText(/\(\d+ tickets?\)/).first().innerText();
  return Number(/\((\d+) tickets?\)/.exec(text)![1]);
}

const ticketNumbersIn = (page: Page, heading: string) =>
  page
    .getByRole("heading", { name: heading })
    .locator("xpath=ancestor::section[1]")
    .locator("li a")
    .evaluateAll((links) => links.map((a) => (a.textContent ?? "").trim()).filter((t) => /^TKT-/.test(t)));

async function openAs(browser: Browser, account: { email: string; password: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  return { context, page };
}

let own: CreatedTicket[];
let foreign: CreatedTicket;

test.beforeAll(async ({ playwright }) => {
  const requesterApi = await apiSession(playwright, REQUESTER);
  const requester2Api = await apiSession(playwright, REQUESTER2);
  const staffApi = await apiSession(playwright, STAFF);
  const staffId = await currentUserId(staffApi);

  // A spread of states for the fixture IT Staff member and the fixture Requester.
  const unassigned = await createTicket(requesterApi, uniqueSummary("Dashboard unassigned"));
  const working = await createTicket(requesterApi, uniqueSummary("Dashboard working"));
  const waiting = await createTicket(requesterApi, uniqueSummary("Dashboard waiting"));
  const resolved = await createTicket(requesterApi, uniqueSummary("Dashboard resolved"));
  foreign = await createTicket(requester2Api, uniqueSummary("Dashboard other requester"));
  own = [unassigned, working, waiting, resolved];

  await staffWrite(staffApi, working.id, { claim: true });
  await staffWrite(staffApi, working.id, { status: "IN_PROGRESS" });
  await staffWrite(staffApi, working.id, { priority: "HIGH" });
  await recordAction(staffApi, working.id, { description: "Open action for me", status: "PLANNED", assigneeId: staffId });
  await recordAction(staffApi, working.id, { description: "Second open action for me", status: "IN_PROGRESS", assigneeId: staffId });

  await staffWrite(staffApi, waiting.id, { claim: true });
  await staffWrite(staffApi, waiting.id, { status: "IN_PROGRESS" });
  await staffWrite(staffApi, waiting.id, { status: "WAITING_FOR_REQUESTER" });

  await staffWrite(staffApi, resolved.id, { claim: true });
  await staffWrite(staffApi, resolved.id, { status: "IN_PROGRESS" });
  await recordAction(staffApi, resolved.id, { description: "Fixed it", status: "COMPLETED", result: "Works now" });
  await staffWrite(staffApi, resolved.id, { status: "RESOLVED", confirm: true });

  await requesterApi.dispose();
  await requester2Api.dispose();
  await staffApi.dispose();
});

test("E2E-03: the IT Staff dashboard says what the database holds", async ({ browser }) => {
  const { context, page } = await openAs(browser, STAFF);
  const watched = watchConsole(page);
  const truth = dashboardTruth(STAFF.email);

  expect(await numberOf(page, /unassigned tickets?$/)).toBe(truth.unassigned);
  expect(await numberOf(page, /tickets? assigned to me$/)).toBe(truth.assignedToMe);
  expect(await numberOf(page, /tickets? with my open actions$/)).toBe(truth.ticketsWithMyOpenActions);
  // The scenario made this person own tickets and hold open actions, so these are not just zeros agreeing with zeros.
  expect(truth.assignedToMe).toBeGreaterThan(0);
  expect(truth.ticketsWithMyOpenActions).toBeGreaterThan(0);

  for (const [status, count] of Object.entries<number>(truth.byStatus)) {
    expect(await numberOf(page, new RegExp(`^View \\d+ ${STATUS_LABELS[status]} tickets?$`)), `status ${status}`).toBe(count);
  }
  for (const [priority, count] of Object.entries<number>(truth.byItPriority)) {
    expect(await numberOf(page, new RegExp(`^View \\d+ ${PRIORITY_LABELS[priority]} priority open tickets?$`)), `priority ${priority}`).toBe(count);
  }

  // "Recently updated": the same five tickets, in the same order.
  expect(await ticketNumbersIn(page, "Recently updated")).toEqual(truth.recentlyUpdated);

  // "My recent actions": the same rows, newest first, with the status written out.
  const rows = await page
    .getByRole("heading", { name: "My recent actions" })
    .locator("xpath=ancestor::section[1]")
    .locator("li")
    .evaluateAll((items) => items.map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim()));
  expect(rows).toHaveLength(truth.myRecentActions.length);
  truth.myRecentActions.forEach((action: { ticketNumber: string; status: string }, index: number) => {
    expect(rows[index]).toContain(action.ticketNumber);
    expect(rows[index]).toContain(ACTION_LABELS[action.status]);
  });
  expect(truth.myRecentActions.length).toBeGreaterThan(0);
  expect(watched.errors()).toEqual([]);
  await context.close();
});

test("E2E-03: each drill-down link opens exactly the list its number counted", async ({ browser }) => {
  const { context, page } = await openAs(browser, STAFF);
  const truth = dashboardTruth(STAFF.email);

  const drill = async (name: RegExp, expectedCount: number, notice?: string) => {
    await page.goto("/#/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("link", { name }).first().click();
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
    await expect(page.getByText(/\(\d+ tickets?\)/).first()).toBeVisible();
    expect(await listTotal(page), `${name} list size`).toBe(expectedCount);
    if (notice) await expect(page.getByRole("status")).toContainText(notice);
  };

  await drill(/unassigned tickets?$/, truth.unassigned, "Open tickets only");
  await drill(/tickets? assigned to me$/, truth.assignedToMe, "Open tickets only");
  await drill(/tickets? with my open actions$/, truth.ticketsWithMyOpenActions, "Tickets with my open actions");
  await drill(/^View \d+ In Progress tickets?$/, truth.byStatus.IN_PROGRESS);
  await drill(/^View \d+ High priority open tickets?$/, truth.byItPriority.HIGH, "Open tickets only");

  // Recent: the queue's first rows are the dashboard's five, newest first.
  await page.goto("/#/dashboard");
  await page.getByRole("link", { name: "View all recently updated tickets" }).click();
  await expect(page.getByRole("status")).toContainText("Updated in the last 7 days");
  const firstRows = await page.locator("table tbody tr").evaluateAll((rows) =>
    rows.slice(0, 5).map((row) => (row.querySelector("button")?.textContent ?? "").trim())
  );
  expect(firstRows).toEqual(truth.recentlyUpdated);

  // "Clear dashboard filter" turns the narrowing off and the list grows to every ticket.
  await page.getByRole("button", { name: "Clear dashboard filter" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await context.close();
});

test("E2E-03: the Administrator dashboard adds the user counts, the IT Staff one does not", async ({ browser }) => {
  const admin = await openAs(browser, ADMIN);
  const truth = dashboardTruth(ADMIN.email);
  await expect(admin.page.getByText(`Users: ${truth.userCounts.total} total, ${truth.userCounts.active} active`)).toBeVisible();
  await expect(admin.page.getByRole("link", { name: "Manage users" })).toBeVisible();
  // The same ticket numbers as IT Staff see (the same data and rules for both roles).
  expect(await numberOf(admin.page, /unassigned tickets?$/)).toBe(truth.unassigned);
  await admin.context.close();

  const staff = await openAs(browser, STAFF);
  await expect(staff.page.getByText(/^Users: /)).toHaveCount(0);
  await expect(staff.page.getByRole("link", { name: "Manage users" })).toHaveCount(0);
  await staff.context.close();
});

test("E2E-03: navigation is per role, lands on the Dashboard, and a page the role cannot use does not open", async ({ browser }) => {
  const items = (page: Page) => page.getByRole("navigation", { name: "Main" }).getByRole("button");
  const current = (page: Page) => page.getByRole("navigation", { name: "Main" }).locator('[aria-current="page"]');

  const requester = await openAs(browser, REQUESTER);
  await expect(items(requester.page)).toHaveText(["Dashboard", "New Ticket", "My Tickets"]);
  await expect(current(requester.page)).toHaveText("Dashboard");
  // Typing the staff address does not open the staff queue for a Requester.
  await requester.page.goto("/#/queue");
  await expect(requester.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(requester.page.getByRole("heading", { name: "Ticket Queue" })).toHaveCount(0);
  await requester.context.close();

  const staff = await openAs(browser, STAFF);
  await expect(items(staff.page)).toHaveText(["Dashboard", "Ticket Queue"]);
  await staff.page.goto("/#/users");
  await expect(staff.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(staff.page.getByRole("heading", { name: "User Management" })).toHaveCount(0);
  await staff.page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Ticket Queue" }).click();
  await expect(current(staff.page)).toHaveText("Ticket Queue");
  await staff.context.close();

  const admin = await openAs(browser, ADMIN);
  await expect(items(admin.page)).toHaveText(["Dashboard", "Ticket Queue", "User Management"]);
  await admin.page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "User Management" }).click();
  await expect(admin.page.getByRole("heading", { name: "User Management" })).toBeVisible();
  await expect(current(admin.page)).toHaveText("User Management");
  await admin.context.close();
});

test.describe("E2E-03: the Requester dashboard", () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    ({ context, page } = await openAs(browser, REQUESTER));
  });
  test.afterAll(async () => {
    await context.close();
  });

  test("shows what the database holds for this Requester", async () => {
    const truth = dashboardTruth(REQUESTER.email);
    expect(await numberOf(page, /open tickets?$/)).toBe(truth.openTickets);
    expect(await numberOf(page, /tickets? waiting for you$/)).toBe(truth.waitingForRequester);
    expect(truth.waitingForRequester).toBeGreaterThan(0);
    expect(await ticketNumbersIn(page, "Recently updated")).toEqual(truth.recentlyUpdated);
    expect(await ticketNumbersIn(page, "Recently resolved")).toEqual(truth.recentlyResolved);
    expect(truth.recentlyResolved.length).toBeGreaterThan(0);
  });

  test("its links open My Tickets with exactly the tickets they counted", async () => {
    const truth = dashboardTruth(REQUESTER.email);
    await page.goto("/#/dashboard");
    await page.getByRole("link", { name: /open tickets?$/ }).first().click();
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Open tickets only");
    await expect(page.getByText(/\(\d+ tickets?\)/).first()).toBeVisible();
    expect(await listTotal(page)).toBe(truth.openTickets);

    await page.goto("/#/dashboard");
    await page.getByRole("link", { name: /tickets? waiting for you$/ }).first().click();
    await expect(page.getByLabel("Filter by status")).toHaveValue("WAITING_FOR_REQUESTER");
    await expect(page.getByText(/\(\d+ tickets?\)/).first()).toBeVisible();
    expect(await listTotal(page)).toBe(truth.waitingForRequester);
  });

  test("never shows another Requester's ticket: not on the dashboard, not in My Tickets", async () => {
    await page.goto("/#/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(foreign.ticketNumber)).toHaveCount(0);
    await expect(page.getByText(foreign.summary)).toHaveCount(0);

    await page.goto("/#/my-tickets?recent=1&sortBy=updatedAt");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await expect(page.getByText(/\(\d+ tickets?\)/).first()).toBeVisible();
    await expect(page.getByText(foreign.ticketNumber)).toHaveCount(0);
    // Opening the other Requester's ticket by its address finds nothing of it either.
    await page.goto(`/#/my-tickets/${foreign.id}`);
    await expect(page.getByText(foreign.summary)).toHaveCount(0);
  });

  test("the other Requester sees their own ticket and none of this one's", async ({ browser }) => {
    const other = await openAs(browser, REQUESTER2);
    const truth = dashboardTruth(REQUESTER2.email);
    expect(await numberOf(other.page, /open tickets?$/)).toBe(truth.openTickets);
    await expect(other.page.getByText(foreign.ticketNumber).first()).toBeVisible();
    for (const ticket of own) await expect(other.page.getByText(ticket.ticketNumber)).toHaveCount(0);
    await other.context.close();
  });
});
