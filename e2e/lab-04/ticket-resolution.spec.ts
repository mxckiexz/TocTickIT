import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN, REQUESTER, STAFF, login } from "../helpers/accounts";
import {
  apiSession,
  createTicket,
  openTicketFromQueue,
  recordAction,
  staffWrite,
  uniqueSummary,
  watchConsole,
  type CreatedTicket,
} from "../helpers/lab4";

// docs/lab-04/tests.md section 7: E2E-02 (the resolution gate, the Requester's advisory, two sessions and the conflict
// banner) and E2E-05 (an Administrator takes a ticket from claim to Closed). Everything the person does goes through
// the screens; the API is used only to put tickets into the starting state a scenario needs.
test.describe.configure({ mode: "serial" });

const statusGroup = (page: Page) => page.getByRole("group", { name: "Change status" });
const statusBadge = (page: Page, label: string) => page.locator(".badge", { hasText: new RegExp(`^${label}$`) });
const STALE = "Someone else changed this. Reload to see the latest, then try again.";

test.describe("E2E-02: the resolution gate, the Requester's advisory, and two sessions", () => {
  let gateTicket: CreatedTicket;
  let advisoryTicket: CreatedTicket;
  let contexts: BrowserContext[] = [];
  let staff: Page;
  let firstSession: ReturnType<typeof watchConsole>;

  test.beforeAll(async ({ browser, playwright }) => {
    const requesterApi = await apiSession(playwright, REQUESTER);
    gateTicket = await createTicket(requesterApi, uniqueSummary("Gate flow"));
    advisoryTicket = await createTicket(requesterApi, uniqueSummary("Advisory flow"));
    await requesterApi.dispose();

    // The advisory ticket starts In Progress, owned by the fixture IT Staff member.
    const staffApi = await apiSession(playwright, STAFF);
    await staffWrite(staffApi, advisoryTicket.id, { claim: true });
    await staffWrite(staffApi, advisoryTicket.id, { status: "IN_PROGRESS" });
    await recordAction(staffApi, advisoryTicket.id, { description: "Original wording of the action" });
    await staffApi.dispose();

    const context = await browser.newContext();
    contexts.push(context);
    staff = await context.newPage();
    await login(staff, STAFF);
    firstSession = watchConsole(staff);
  });

  test.afterAll(async () => {
    await Promise.all(contexts.map((c) => c.close()));
  });

  test("E2E-02: Resolved stays disabled, with the reasons, until an owner and a completed action exist and none is open", async () => {
    await openTicketFromQueue(staff, gateTicket);
    const group = statusGroup(staff);

    // New and unowned: In Progress is possible, Resolved is not offered yet (NEW does not lead to RESOLVED).
    await staff.getByRole("button", { name: "Claim this ticket" }).click();
    await expect(staff.getByText("E2E Fixture Staff", { exact: true })).toBeVisible();
    await group.getByRole("button", { name: "In Progress" }).click();
    await expect(statusBadge(staff, "In Progress")).toBeVisible();

    // Owner yes, action no: Resolved is shown but disabled, and says why.
    await expect(group.getByRole("button", { name: "Resolved" })).toBeDisabled();
    await expect(staff.getByText("Needs a completed action")).toBeVisible();
    await expect(staff.getByText("Needs an owner")).toHaveCount(0);

    // A Planned action is open work: now there are two reasons.
    await staff.getByRole("button", { name: "Add action" }).click();
    const addForm = staff.getByRole("form", { name: "Add action" });
    await addForm.getByLabel(/Description/).fill("Reimage the laptop");
    await addForm.getByRole("button", { name: /^Save/ }).click();
    await expect(staff.getByText("Finish or cancel open actions")).toBeVisible();
    await expect(staff.getByText("Needs a completed action")).toBeVisible();
    await expect(group.getByRole("button", { name: "Resolved" })).toBeDisabled();

    // Finishing it clears both, without reloading the page.
    await staff.locator("#actions-taken li", { hasText: "Reimage the laptop" }).getByRole("button", { name: "Edit" }).click();
    const editForm = staff.getByRole("form", { name: "Edit action" });
    await editForm.getByLabel(/^Status/).selectOption("COMPLETED");
    await editForm.getByLabel(/^Result/).fill("Laptop reimaged and tested");
    await editForm.getByRole("button", { name: /^Save/ }).click();
    await expect(group.getByRole("button", { name: "Resolved" })).toBeEnabled();
    await expect(staff.getByText("Finish or cancel open actions")).toHaveCount(0);
    await expect(staff.getByText("Needs a completed action")).toHaveCount(0);

    // Resolving asks for confirmation; cancelling changes nothing, confirming does.
    await group.getByRole("button", { name: "Resolved" }).click();
    await expect(staff.getByText(/requires confirmation/i)).toBeVisible();
    await staff.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(statusBadge(staff, "In Progress")).toBeVisible();
    await group.getByRole("button", { name: "Resolved" }).click();
    await staff.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(statusBadge(staff, "Resolved")).toBeVisible();
  });

  test("E2E-02: on a Resolved ticket a new action can only be Completed", async () => {
    await staff.getByRole("button", { name: "Add action" }).click();
    const addForm = staff.getByRole("form", { name: "Add action" });
    await expect(addForm.getByText("Reopen the ticket to add open work")).toBeVisible();
    const options = await addForm.getByLabel(/^Status/).locator("option").allTextContents();
    expect(options).toEqual(["Completed"]);
    await addForm.getByRole("button", { name: "Cancel" }).click();
  });

  test("E2E-02: the Requester's 'Problem Appears Resolved' never changes the status", async ({ browser }) => {
    const requesterContext = await browser.newContext();
    contexts.push(requesterContext);
    const requester = await requesterContext.newPage();
    await login(requester, REQUESTER);
    await requester.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "My Tickets" }).click();
    await requester.locator('[aria-label="Search tickets"]:visible').fill(advisoryTicket.summary);
    await requester.getByRole("button", { name: advisoryTicket.ticketNumber }).first().click();
    await expect(statusBadge(requester, "In Progress")).toBeVisible();

    await requester.getByRole("button", { name: "Problem Appears Resolved" }).click();
    await requester.getByRole("button", { name: "Yes, mark resolved" }).click();
    await expect(requester.getByText(/You marked this as resolved on/)).toBeVisible();
    await expect(statusBadge(requester, "In Progress")).toBeVisible();
    await expect(statusBadge(requester, "Resolved")).toHaveCount(0);

    // Staff see the signal, and the ticket is exactly where it was: In Progress, with every button still theirs.
    await staff.goto(`/#/queue/${advisoryTicket.id}`);
    await expect(staff.getByText(/Requester marked this resolved on/)).toBeVisible();
    await expect(statusBadge(staff, "In Progress")).toBeVisible();
    await expect(statusGroup(staff).getByRole("button", { name: "Waiting for Requester" })).toBeEnabled();
  });

  test("E2E-02: a second session that changes the ticket first gets the conflict banner, and Reload fixes it", async ({ browser }) => {
    const secondContext = await browser.newContext();
    contexts.push(secondContext);
    const second = await secondContext.newPage();
    await login(second, STAFF);
    await second.goto(`/#/queue/${advisoryTicket.id}`);
    await expect(second.getByRole("heading", { name: advisoryTicket.ticketNumber })).toBeVisible();
    // The first session (already on this ticket) changes the IT priority.
    await staff.goto("/#/dashboard");
    await staff.goto(`/#/queue/${advisoryTicket.id}`);
    await expect(staff.getByRole("heading", { name: advisoryTicket.ticketNumber })).toBeVisible();
    await staff.getByLabel("IT Priority").selectOption("HIGH");
    await expect(staff.getByLabel("IT Priority")).toHaveValue("HIGH");
    await expect(staff.getByText("Saving…")).toHaveCount(0);

    // The second session still holds the old version: its status change is refused, not silently applied.
    const secondConsole = watchConsole(second);
    await secondConsole.expecting(async () => {
      await statusGroup(second).getByRole("button", { name: "Waiting for Requester" }).click();
      await expect(second.getByRole("alert").filter({ hasText: STALE })).toBeVisible();
    });
    await expect(statusBadge(second, "In Progress")).toBeVisible();
    await expect(second.getByLabel("IT Priority")).toHaveValue("MEDIUM");

    await second.getByRole("button", { name: "Reload" }).click();
    await expect(second.getByRole("alert").filter({ hasText: STALE })).toHaveCount(0);
    await expect(second.getByLabel("IT Priority")).toHaveValue("HIGH");
    await statusGroup(second).getByRole("button", { name: "Waiting for Requester" }).click();
    await expect(statusBadge(second, "Waiting for Requester")).toBeVisible();
    expect(secondConsole.errors()).toEqual([]);
  });

  test("E2E-02: two sessions editing the same action: the second Save gets the conflict banner, keeps the typed text, and works after Reload", async ({ browser }) => {
    const secondContext = await browser.newContext();
    contexts.push(secondContext);
    const second = await secondContext.newPage();
    await login(second, STAFF);
    await second.goto(`/#/queue/${advisoryTicket.id}`);
    await expect(second.locator("#actions-taken li", { hasText: "Original wording of the action" })).toBeVisible();
    await second.locator("#actions-taken li", { hasText: "Original wording of the action" }).getByRole("button", { name: "Edit" }).click();
    const secondForm = second.getByRole("form", { name: "Edit action" });
    await secondForm.getByLabel(/Description/).fill("Second session wording");

    // The first session saves its own change to the same action first.
    await staff.goto("/#/dashboard");
    await staff.goto(`/#/queue/${advisoryTicket.id}`);
    await staff.locator("#actions-taken li", { hasText: "Original wording of the action" }).getByRole("button", { name: "Edit" }).click();
    const firstForm = staff.getByRole("form", { name: "Edit action" });
    await firstForm.getByLabel(/Description/).fill("First session wording");
    await firstForm.getByRole("button", { name: /^Save/ }).click();
    await expect(staff.locator("#actions-taken li", { hasText: "First session wording" })).toBeVisible();

    const secondConsole = watchConsole(second);
    await secondConsole.expecting(async () => {
      await secondForm.getByRole("button", { name: /^Save/ }).click();
      await expect(second.getByRole("alert").filter({ hasText: STALE })).toBeVisible();
    });
    await expect(secondForm.getByLabel(/Description/)).toHaveValue("Second session wording");

    await second.getByRole("alert").filter({ hasText: STALE }).getByRole("button", { name: "Reload" }).click();
    await expect(second.getByRole("alert").filter({ hasText: STALE })).toHaveCount(0);
    await expect(secondForm.getByLabel(/Description/)).toHaveValue("Second session wording");
    await secondForm.getByRole("button", { name: /^Save/ }).click();
    await expect(second.locator("#actions-taken li", { hasText: "Second session wording" })).toBeVisible();
    expect(secondConsole.errors()).toEqual([]);
  });

  test("E2E-04: no console error or uncaught exception in the first session during E2E-02", async () => {
    expect(firstSession.errors()).toEqual([]);
  });
});

test.describe("E2E-05: an Administrator takes a ticket from claim to Closed", () => {
  let ticket: CreatedTicket;
  let context: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser, playwright }) => {
    const requesterApi = await apiSession(playwright, REQUESTER);
    ticket = await createTicket(requesterApi, uniqueSummary("Administrator flow"));
    await requesterApi.dispose();
    context = await browser.newContext();
    admin = await context.newPage();
    await login(admin, ADMIN);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("E2E-05: claim, add and complete an action, comment, note, resolve and close, all through the screens", async () => {
    const watched = watchConsole(admin);
    await openTicketFromQueue(admin, ticket);
    const group = statusGroup(admin);

    // The Administrator has every control IT Staff have.
    await admin.getByRole("button", { name: "Claim this ticket" }).click();
    await expect(admin.getByText("E2E Fixture Admin", { exact: true }).last()).toBeVisible();
    await group.getByRole("button", { name: "In Progress" }).click();
    await expect(statusBadge(admin, "In Progress")).toBeVisible();

    await admin.getByRole("button", { name: "Add action" }).click();
    const addForm = admin.getByRole("form", { name: "Add action" });
    await addForm.getByLabel(/Description/).fill("Restored the mailbox from backup");
    await addForm.getByLabel(/^Status/).selectOption("COMPLETED");
    await addForm.getByLabel(/^Result/).fill("Mailbox opens, 3 days of mail recovered");
    await addForm.getByRole("button", { name: /^Save/ }).click();
    const logged = admin.locator("#actions-taken li", { hasText: "Restored the mailbox from backup" });
    await expect(logged.getByText("Performed by E2E Fixture Admin")).toBeVisible();

    const comment = `Admin public comment ${Date.now()}`;
    const note = `Admin internal note ${Date.now()}`;
    await admin.getByLabel("Add a comment").fill(comment);
    await admin.getByRole("button", { name: "Post comment" }).click();
    await expect(admin.getByText(comment)).toBeVisible();
    await admin.getByLabel("Add an internal note").fill(note);
    await admin.getByRole("button", { name: "Post note" }).click();
    await expect(admin.getByText(note)).toBeVisible();
    await expect(admin.getByText("Internal — IT Staff only")).toBeVisible();

    await expect(group.getByRole("button", { name: "Resolved" })).toBeEnabled();
    await group.getByRole("button", { name: "Resolved" }).click();
    await admin.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(statusBadge(admin, "Resolved")).toBeVisible();

    await group.getByRole("button", { name: "Closed" }).click();
    await admin.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(statusBadge(admin, "Closed")).toBeVisible();
    // Closed is nearly final: the only way on is to reopen it.
    await expect(group.getByRole("button")).toHaveText(["Reopened"]);
    // Nothing new can be added to a closed ticket's actions.
    await expect(admin.getByRole("button", { name: "Add action" })).toBeDisabled();
    expect(watched.errors()).toEqual([]);
  });
});
