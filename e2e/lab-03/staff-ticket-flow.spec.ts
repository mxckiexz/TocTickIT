import { test, expect } from "@playwright/test";
import { REQUESTER, REQUESTER_RESOLVE_TICKET, STAFF, STAFF_FLOW_TICKET, login } from "../helpers/accounts";

const API = "http://localhost:3000";
const STAFF_TICKET_NUMBER = "TKT-E2E-000001";
const RESOLVE_TICKET_NUMBER = "TKT-E2E-000002";

test.describe.configure({ mode: "serial" });

async function searchFor(page: import("@playwright/test").Page, text: string) {
  // The queue renders a mobile and a desktop copy of the search box; only
  // one is visible at a time.
  await page.locator('[aria-label="Search tickets"]:visible').fill(text);
}

// docs/lab-03/tests.md §9 — E2E-04 (IT Staff flow, AC-14..AC-20) and E2E-05
// (Requester comment + Problem Appears Resolved, AC-12/AC-13).
test("E2E-04: IT Staff searches the queue, claims, prioritizes, transitions, comments, and adds an internal note the Requester never sees", async ({
  page,
  browser,
}) => {
  const publicComment = `Staff public comment ${Date.now()}`;
  const internalNote = `Staff internal note ${Date.now()}`;

  await login(page, STAFF);
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();

  // Search finds exactly the fixture ticket, unassigned and New.
  await searchFor(page, STAFF_FLOW_TICKET);
  const row = page.getByRole("row", { name: new RegExp(STAFF_TICKET_NUMBER) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Unassigned")).toBeVisible();
  await row.getByRole("button", { name: STAFF_TICKET_NUMBER }).click();
  await expect(page.getByRole("heading", { name: STAFF_TICKET_NUMBER })).toBeVisible();

  // Ownership: claim.
  await page.getByRole("button", { name: "Claim this ticket" }).click();
  await expect(page.getByText("E2E Fixture Staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claim this ticket" })).toHaveCount(0);

  // IT Priority is independent of the Requester's Requested Priority.
  await page.getByLabel("IT Priority").selectOption("HIGH");
  await expect(page.getByLabel("IT Priority")).toHaveValue("HIGH");
  await expect(page.locator("dd", { hasText: /^MEDIUM$/ })).toBeVisible(); // Requested Priority unchanged

  // Status: a routine transition applies immediately...
  await page.getByLabel("Status").selectOption("IN_PROGRESS");
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  // ...while Resolved needs confirmation (BR-42): cancelling changes nothing,
  await page.getByLabel("Status").selectOption("RESOLVED");
  await expect(page.getByText(/requires confirmation/i)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
  // confirming applies it.
  await page.getByLabel("Status").selectOption("RESOLVED");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("RESOLVED");

  // Public Comment and Internal Note — visually distinct panels.
  await page.getByLabel("Add a comment").fill(publicComment);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(publicComment)).toBeVisible();

  await page.getByLabel("Add an internal note").fill(internalNote);
  await page.getByRole("button", { name: "Post note" }).click();
  const notesPanel = page.locator("div", { has: page.getByRole("heading", { name: /Internal Notes/ }) }).last();
  await expect(page.getByText("Internal — IT Staff only")).toBeVisible();
  await expect(notesPanel.getByText(internalNote)).toBeVisible();

  // The Requester, in a completely separate browser context, sees the public
  // comment but never the note — in the UI or at the API (AC-04/AC-21).
  const requesterContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();
  await login(requesterPage, REQUESTER);
  await requesterPage.getByRole("button", { name: "My Tickets" }).click();
  await requesterPage.locator('[aria-label="Search tickets"]:visible').fill(STAFF_TICKET_NUMBER);
  await requesterPage.getByRole("button", { name: STAFF_TICKET_NUMBER }).click();
  await expect(requesterPage.getByText(publicComment)).toBeVisible();
  await expect(requesterPage.getByText(internalNote)).toHaveCount(0);
  await expect(requesterPage.getByText(/Internal Notes|Internal — IT Staff only/)).toHaveCount(0);

  const queue = await (await requesterContext.request.get(`${API}/api/tickets?search=${STAFF_TICKET_NUMBER}`)).json();
  const ticketId = queue.tickets[0].id;
  const notesResponse = await requesterContext.request.get(`${API}/api/tickets/${ticketId}/notes`);
  expect(notesResponse.status()).toBe(403);
  expect(await notesResponse.text()).not.toContain(internalNote);
  await requesterContext.close();
});

test("E2E-05: a Requester posts a Public Comment and marks 'Problem Appears Resolved' without the ticket's status changing", async ({
  page,
}) => {
  const comment = `Requester comment ${Date.now()}`;

  await login(page, REQUESTER);
  await page.getByRole("button", { name: "My Tickets" }).click();
  await page.locator('[aria-label="Search tickets"]:visible').fill(RESOLVE_TICKET_NUMBER);
  await page.getByRole("button", { name: RESOLVE_TICKET_NUMBER }).click();
  await expect(page.getByText(REQUESTER_RESOLVE_TICKET)).toBeVisible();
  await expect(page.locator("dd", { hasText: /^IN_PROGRESS$/ })).toBeVisible();

  await page.getByLabel("Add a comment").fill(comment);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(comment)).toBeVisible();

  // A one-way signal, confirmed first; it never closes the ticket (BR-05).
  await page.getByRole("button", { name: "Problem Appears Resolved" }).click();
  await page.getByRole("button", { name: "Yes, mark resolved" }).click();
  await expect(page.getByText(/You marked this as resolved on/)).toBeVisible();
  await expect(page.locator("dd", { hasText: /^IN_PROGRESS$/ })).toBeVisible();
});

// The IT Staff side of E2E-05: the Requester's signal is visible to staff,
// but only a staff member can actually move the ticket.
test("E2E-05 (staff view): the Requester's resolved signal is shown to IT Staff, who still own the status", async ({
  page,
}) => {
  await login(page, STAFF);
  await searchFor(page, REQUESTER_RESOLVE_TICKET);
  await page.getByRole("row", { name: new RegExp(RESOLVE_TICKET_NUMBER) }).getByRole("button", { name: RESOLVE_TICKET_NUMBER }).click();
  await expect(page.getByText(/Requester marked this resolved on/)).toBeVisible();
  await expect(page.getByLabel("Status")).toHaveValue("IN_PROGRESS");
});
