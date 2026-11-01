import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, REQUESTER, STAFF, login } from "../helpers/accounts";
import {
  apiSession,
  createTicket,
  openTicketFromQueue,
  uniqueSummary,
  watchConsole,
  type CreatedTicket,
} from "../helpers/lab4";

// docs/lab-04/tests.md section 7: E2E-01 (staff records, edits and validates actions; the Requester sees them read
// only) and E2E-04 (double click sends one request; a failed submit keeps what was typed; no console error).
// One ticket, worked through in order, so the tests are serial.
test.describe.configure({ mode: "serial" });

let ticket: CreatedTicket;
let staffContext: BrowserContext;
let staff: Page;
let consoleOfStaff: ReturnType<typeof watchConsole>;

test.beforeAll(async ({ browser, playwright }) => {
  const requesterApi = await apiSession(playwright, REQUESTER);
  ticket = await createTicket(requesterApi, uniqueSummary("Actions flow"));
  await requesterApi.dispose();

  staffContext = await browser.newContext();
  staff = await staffContext.newPage();
  await login(staff, STAFF);
  // Watched from here: the 401 the login screen gets from its first "who am I" call is the app working, not a defect.
  consoleOfStaff = watchConsole(staff);
  await openTicketFromQueue(staff, ticket);
});

test.afterAll(async () => {
  await staffContext.close();
});

const section = () => staff.locator("#actions-taken");
const entry = (text: string) => section().locator("li", { hasText: text });
const addForm = () => staff.getByRole("form", { name: "Add action" });
const editForm = () => staff.getByRole("form", { name: "Edit action" });

test("E2E-01: staff record a Planned action and one logged as Completed with a result", async () => {
  await expect(section().getByText("No actions recorded yet.")).toBeVisible();

  // A Planned action (the default status) with an assignee.
  await section().getByRole("button", { name: "Add action" }).click();
  await addForm().getByLabel(/Description/).fill("Check the docking station firmware");
  await expect(addForm().getByLabel(/^Status/)).toHaveValue("PLANNED");
  await addForm().getByLabel(/Assignee/).selectOption({ label: "E2E Fixture Staff" });
  await addForm().getByRole("button", { name: /^Save/ }).click();

  const planned = entry("Check the docking station firmware");
  await expect(planned).toBeVisible();
  await expect(planned.getByText("Planned", { exact: true })).toBeVisible();
  await expect(planned.getByText("Performed by E2E Fixture Staff")).toBeVisible();
  await expect(planned.getByText("Assigned to E2E Fixture Staff")).toBeVisible();

  // Logged as already Completed: the form insists on a result, then saves.
  await section().getByRole("button", { name: "Add action" }).click();
  await addForm().getByLabel(/Description/).fill("Replaced the faulty power supply");
  await addForm().getByLabel(/^Status/).selectOption("COMPLETED");
  await consoleOfStaff.expecting(async () => {
    await addForm().getByRole("button", { name: /^Save/ }).click();
    await expect(addForm().getByText("Result is required to complete an action.")).toBeVisible();
  });
  await addForm().getByLabel(/^Result/).fill("Laptop charges again");
  await addForm().getByRole("button", { name: /^Save/ }).click();

  const completed = entry("Replaced the faulty power supply");
  await expect(completed.getByText("Completed", { exact: true })).toBeVisible();
  await expect(completed.getByText("Result: Laptop charges again")).toBeVisible();
  // A completed action is final: no Edit, but its History is there.
  await expect(completed.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(completed.getByRole("button", { name: "History" })).toBeVisible();
});

test("E2E-01: an empty Description is refused with the message under the field, and nothing is added", async () => {
  await section().getByRole("button", { name: "Add action" }).click();
  await consoleOfStaff.expecting(async () => {
    await addForm().getByRole("button", { name: /^Save/ }).click();
    await expect(addForm().getByText("Description is required.")).toBeVisible();
  });
  await expect(addForm().getByLabel(/Description/)).toHaveAttribute("aria-invalid", "true");
  await addForm().getByRole("button", { name: "Cancel" }).click();
  await expect(section().locator("li")).toHaveCount(2);
});

test("E2E-01: staff edit an action, and its History shows both revisions", async () => {
  const planned = entry("Check the docking station firmware");
  await planned.getByRole("button", { name: "Edit" }).click();
  await editForm().getByLabel(/Description/).fill("Check the docking station firmware and cable");
  await editForm().getByLabel(/^Status/).selectOption("IN_PROGRESS");
  await editForm().getByRole("button", { name: /^Save/ }).click();

  const edited = entry("Check the docking station firmware and cable");
  await expect(edited.getByText("In progress", { exact: true })).toBeVisible();

  await edited.getByRole("button", { name: "History" }).click();
  const history = edited.getByRole("region", { name: "History" });
  await expect(history.getByText("Revision 1")).toBeVisible();
  await expect(history.getByText("Revision 2")).toBeVisible();
  // The first revision still has the text it was saved with.
  await expect(history.getByText("Check the docking station firmware", { exact: true })).toBeVisible();
});

test("E2E-01: an assignee who was deactivated after the form was opened is refused, with the typed text kept", async ({ playwright }) => {
  const adminApi = await apiSession(playwright, ADMIN);
  const name = `E2E Assignee ${Date.now()}`;
  const created = await adminApi.post("/api/admin/users", {
    // The "e2e-created-" prefix is swept by server/scripts/e2e-fixture.ts before the next run.
    data: { name, email: `e2e-created-assignee-${Date.now()}@toktickit.test`, role: "IT_STAFF", password: "E2E-Assignee-Pass1" },
  });
  expect(created.status()).toBe(201);
  const assignee = await created.json();

  // Leave and come back, so the form's list of people is loaded again and includes the new user.
  await staff.goto("/#/dashboard");
  await staff.goto(`/#/queue/${ticket.id}`);
  await expect(staff.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();

  await section().getByRole("button", { name: "Add action" }).click();
  await addForm().getByLabel(/Description/).fill("Hand over to the new colleague");
  await addForm().getByLabel(/Assignee/).selectOption({ label: name });

  // Someone deactivates the user while the form is open.
  const deactivated = await adminApi.patch(`/api/admin/users/${assignee.id}`, { data: { isActive: false } });
  expect(deactivated.status()).toBe(200);

  await consoleOfStaff.expecting(async () => {
    await addForm().getByRole("button", { name: /^Save/ }).click();
    await expect(addForm().getByText(/Assignee must be an active/)).toBeVisible();
  });
  await expect(addForm().getByLabel(/Assignee/)).toHaveAttribute("aria-invalid", "true");
  await expect(addForm().getByLabel(/Description/)).toHaveValue("Hand over to the new colleague");
  await addForm().getByRole("button", { name: "Cancel" }).click();
  await adminApi.dispose();
});

test("E2E-01: the Requester sees every field of every action, read only", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, REQUESTER);
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "My Tickets" }).click();
  await page.locator('[aria-label="Search tickets"]:visible').fill(ticket.summary);
  await page.getByRole("button", { name: ticket.ticketNumber }).first().click();
  await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();

  const actions = page.locator("#actions-taken");
  const done = actions.locator("li", { hasText: "Replaced the faulty power supply" });
  await expect(done.getByText("Completed", { exact: true })).toBeVisible();
  await expect(done.getByText("Performed by E2E Fixture Staff")).toBeVisible();
  await expect(done.getByText("Unassigned")).toBeVisible();
  await expect(done.getByText("Result: Laptop charges again")).toBeVisible();
  const edited = actions.locator("li", { hasText: "Check the docking station firmware and cable" });
  await expect(edited.getByText("Assigned to E2E Fixture Staff")).toBeVisible();

  // Read only: no way to add, edit or see the history.
  await expect(actions.getByRole("button", { name: /Add action|Edit|History/ })).toHaveCount(0);
  await context.close();
});

test("E2E-04: a double click on Save sends one request and adds one action", async () => {
  let posts = 0;
  const url = `**/api/tickets/${ticket.id}/actions`;
  await staff.route(url, async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      // Slow enough that a second click would land while the first request is still running.
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.continue();
  });

  await section().getByRole("button", { name: "Add action" }).click();
  await addForm().getByLabel(/Description/).fill("Double click check");
  await addForm().getByRole("button", { name: /^Save/ }).dblclick();

  await expect(entry("Double click check")).toHaveCount(1);
  expect(posts).toBe(1);
  await staff.unroute(url);
});

test("E2E-04: a failed submit keeps what was typed, and the retry works", async () => {
  const url = `**/api/tickets/${ticket.id}/actions`;
  await staff.route(url, (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "Failed to save the action" } }) : route.continue()
  );

  await section().getByRole("button", { name: "Add action" }).click();
  await addForm().getByLabel(/Description/).fill("Keep this text");
  await addForm().getByLabel(/^Status/).selectOption("COMPLETED");
  await addForm().getByLabel(/^Result/).fill("And keep this result");
  await consoleOfStaff.expecting(async () => {
    await addForm().getByRole("button", { name: /^Save/ }).click();
    await expect(staff.getByRole("alert").filter({ hasText: "Unable to save the action." })).toBeVisible();
  });
  await expect(addForm().getByLabel(/Description/)).toHaveValue("Keep this text");
  await expect(addForm().getByLabel(/^Result/)).toHaveValue("And keep this result");
  await expect(addForm().getByRole("button", { name: /^Save/ })).toBeEnabled();

  await staff.unroute(url);
  await addForm().getByRole("button", { name: /^Save/ }).click();
  await expect(entry("Keep this text")).toBeVisible();
  await expect(entry("Keep this text").getByText("Result: And keep this result")).toBeVisible();
});

test("E2E-04: no console error or uncaught exception during the whole flow", async () => {
  expect(consoleOfStaff.errors()).toEqual([]);
});
