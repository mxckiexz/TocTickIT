import { execSync } from "node:child_process";
import path from "node:path";
import { expect, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from "@playwright/test";

// Lab 4 F9 (docs/lab-04/tests.md section 7): what the three Lab 4 specs share. The specs drive the screens the way a
// person does; this file only does the SETUP that would be slow or beside the point through the UI (a ticket to work
// on, a ticket in a given state), reads the database for the dashboard check, and watches the console.

export const API = "http://localhost:3000";
export const CLIENT_ORIGIN = "http://localhost:5173";
export const REQUESTER2 = { email: "e2e-requester2@toktickit.test", password: "E2E-Fixture-Pass1" };

// "[e2e]" is the managed prefix server/scripts/e2e-fixture.ts sweeps before every run (tickets, their actions and
// revisions), so nothing these specs create piles up.
export const uniqueSummary = (label: string) => `[e2e] ${label} ${Date.now()}`;

// A session for setup calls: the login cookie is kept by the context, and every write carries the Origin the server
// requires of a browser (api-spec.md "Authentication").
export async function apiSession(playwright: PlaywrightWorkerArgs["playwright"], account: { email: string; password: string }) {
  const request = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: CLIENT_ORIGIN } });
  const response = await request.post("/api/auth/login", { data: account });
  expect(response.status(), `login as ${account.email}`).toBe(200);
  return request;
}

export interface CreatedTicket {
  id: number;
  ticketNumber: string;
  summary: string;
}

// Opens a ticket as the Requester of `request`'s session, in the first active Category and Related System.
export async function createTicket(request: APIRequestContext, summary: string): Promise<CreatedTicket> {
  const categories = await (await request.get("/api/categories")).json();
  const systems = await (await request.get("/api/related-systems")).json();
  const response = await request.post("/api/tickets", {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: systems[0].id,
      summary,
      description: "Created by the Lab 4 end-to-end suite.",
      requestedPriority: "MEDIUM",
    },
  });
  expect(response.status(), "create ticket").toBe(201);
  const ticket = await response.json();
  return { id: ticket.id, ticketNumber: ticket.ticketNumber, summary };
}

// One write to a staff route, carrying the ticket's current version like the screens do.
export async function staffWrite(
  request: APIRequestContext,
  ticketId: number,
  step: { claim: true } | { priority: "LOW" | "MEDIUM" | "HIGH" } | { status: string; confirm?: boolean }
) {
  const current = await (await request.get(`/api/staff/tickets/${ticketId}`)).json();
  const version = current.ticket.version;
  const response =
    "claim" in step
      ? await request.post(`/api/staff/tickets/${ticketId}/claim`, { data: { version } })
      : "priority" in step
        ? await request.patch(`/api/staff/tickets/${ticketId}/priority`, { data: { itPriority: step.priority, version } })
        : await request.patch(`/api/staff/tickets/${ticketId}/status`, { data: { currentStatus: step.status, confirm: step.confirm, version } });
  expect(response.status(), `staff write ${JSON.stringify(step)}`).toBe(200);
}

export async function recordAction(
  request: APIRequestContext,
  ticketId: number,
  action: {
    description: string;
    status?: string;
    result?: string;
    assigneeId?: number | null;
    actionAt?: string;
    followUpRequired?: boolean;
    followUpNote?: string;
    attachmentNotes?: string;
  }
) {
  const response = await request.post(`/api/tickets/${ticketId}/actions`, { data: action });
  expect(response.status(), "record action").toBe(201);
  return response.json();
}

export async function currentUserId(request: APIRequestContext): Promise<number> {
  const me = await (await request.get("/api/auth/me")).json();
  return me.id;
}

// What the dashboards should say for this account, from the database (server/scripts/e2e-dashboard-truth.ts).
export function dashboardTruth(email: string): Record<string, any> {
  const output = execSync(`npx tsx scripts/e2e-dashboard-truth.ts ${email}`, { cwd: path.join(process.cwd(), "server"), encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").pop()!);
}

// A ticket that shows every part of the Lab 4 screens at once: In Progress, High priority, owned by the fixture IT
// Staff member, with a Completed action (result and follow-up), a Planned one assigned to them and an In progress one
// with attachment notes. Open work is left, so the resolution gate has a message to show.
export async function seedHardeningTicket(playwright: PlaywrightWorkerArgs["playwright"], label: string) {
  const requesterApi = await apiSession(playwright, { email: "e2e-requester@toktickit.test", password: "E2E-Fixture-Pass1" });
  const ticket = await createTicket(requesterApi, uniqueSummary(label));
  await requesterApi.dispose();
  const staffApi = await apiSession(playwright, { email: "e2e-staff@toktickit.test", password: "E2E-Fixture-Pass1" });
  const staffId = await currentUserId(staffApi);
  await staffWrite(staffApi, ticket.id, { claim: true });
  await staffWrite(staffApi, ticket.id, { status: "IN_PROGRESS" });
  await staffWrite(staffApi, ticket.id, { priority: "HIGH" });
  await recordAction(staffApi, ticket.id, {
    description: "Replaced the faulty docking station",
    status: "COMPLETED",
    result: "Both monitors work again",
    followUpRequired: true,
    followUpNote: "Check again after the next firmware update",
    attachmentNotes: "Photo of the old dock kept in the IT cupboard",
    assigneeId: staffId,
  });
  await recordAction(staffApi, ticket.id, { description: "Order a spare docking station", status: "PLANNED", assigneeId: staffId });
  await recordAction(staffApi, ticket.id, { description: "Update the dock firmware", status: "IN_PROGRESS", attachmentNotes: "Vendor notes saved in the shared folder" });
  await staffApi.dispose();
  return ticket;
}

// Opens a ticket from the Ticket Queue by searching for its summary, the way staff do.
export async function openTicketFromQueue(page: Page, ticket: CreatedTicket) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Ticket Queue" }).click();
  await page.locator('[aria-label="Search tickets"]:visible').fill(ticket.summary);
  await page.getByRole("row", { name: new RegExp(ticket.ticketNumber) }).getByRole("button", { name: ticket.ticketNumber }).click();
  await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
}

// Console errors and uncaught exceptions of a page. A step that is SUPPOSED to fail (a validation error, a conflict, a
// forced 500) is wrapped in `expecting(...)`: the browser's own "Failed to load resource" line and the app's own
// logging of the handled failure are then expected and dropped. Everything else is a defect (E2E-04).
export function watchConsole(page: Page) {
  const found: string[] = [];
  let expected = 0;
  page.on("console", (message) => {
    if (message.type() === "error" && expected === 0) found.push(message.text());
  });
  page.on("pageerror", (error) => found.push(`uncaught: ${error.message}`));
  return {
    async expecting<T>(step: () => Promise<T>): Promise<T> {
      expected++;
      try {
        const result = await step();
        // Let the app's own console.error for the handled failure land inside the window.
        await page.waitForTimeout(150);
        return result;
      } finally {
        expected--;
      }
    },
    errors: () => [...found],
  };
}
