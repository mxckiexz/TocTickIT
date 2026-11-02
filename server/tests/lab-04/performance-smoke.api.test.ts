import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type request from "supertest";
import { getPrisma } from "../../src/prisma.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 4 F11 (docs/lab-04/tests.md §6a PERF-01 to PERF-04; worksheet §10 asks for a performance-smoke layer).
// A SMOKE test, not a benchmark: it fills the database with a few hundred extra tickets and actions and checks that
// the endpoints Lab 4 added still answer quickly and, for the dashboards, stay concise (FR-18: numbers and a short
// list, never whole collections). The limits are deliberately generous so they only fail on a real regression such
// as a query per row or an unbounded list, not on a slow machine.

const PREFIX = "TEST-PERF-";
const MANY = 400;
const emails = { requester: "perf-requester-fixture@toktickit.test", staff: "perf-staff-fixture@toktickit.test" };
const ids = { requester: 0, staff: 0 };
const agents = {} as Record<keyof typeof emails, request.Agent>;
let heavyTicketId = 0;

// The second call of two, so the first one's connection and query planning do not count.
async function timed(agent: request.Agent, path: string) {
  await agent.get(path);
  const started = performance.now();
  const response = await agent.get(path);
  return { response, ms: performance.now() - started, bytes: Buffer.byteLength(JSON.stringify(response.body)) };
}

describe("performance smoke (PERF-01 to PERF-04)", () => {
  beforeAll(async () => {
    ids.requester = (await createFixtureUser(emails.requester, { role: "REQUESTER" })).user.id;
    ids.staff = (await createFixtureUser(emails.staff, { role: "IT_STAFF" })).user.id;
    agents.requester = await loginAgent(emails.requester);
    agents.staff = await loginAgent(emails.staff);

    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
    const priorities = ["LOW", "MEDIUM", "HIGH"] as const;
    await prisma.ticket.createMany({
      data: Array.from({ length: MANY }, (_, i) => ({
        ticketNumber: `${PREFIX}${Date.now()}-${i}`,
        requesterId: ids.requester,
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: `Performance fixture ${i}`,
        description: "Fixture.",
        requestedPriority: priorities[i % 3],
        itPriority: priorities[(i + 1) % 3],
        currentStatus: statuses[i % 8],
        ownerId: i % 4 === 0 ? null : ids.staff,
      })),
    });
    const tickets = await prisma.ticket.findMany({ where: { ticketNumber: { startsWith: PREFIX } }, select: { id: true }, orderBy: { id: "asc" } });
    heavyTicketId = tickets[0].id;
    // One action on most tickets, and 200 on a single ticket (the long Actions Taken list).
    await prisma.actionTaken.createMany({
      data: [
        ...tickets.slice(1).map((t, i) => ({
          ticketId: t.id,
          performedById: ids.staff,
          assigneeId: i % 2 ? ids.staff : null,
          status: (["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const)[i % 4],
          actionAt: new Date(Date.now() - i * 60_000),
          description: `Fixture action ${i}`,
          result: i % 4 === 2 ? "Done" : "",
        })),
        ...Array.from({ length: 200 }, (_, i) => ({
          ticketId: heavyTicketId,
          performedById: ids.staff,
          status: "COMPLETED" as const,
          actionAt: new Date(Date.now() - i * 1000),
          description: `Long list action ${i}`,
          result: "Done",
        })),
      ],
    });
  }, 60_000);

  afterAll(async () => {
    const prisma = getPrisma();
    const owned = { ticket: { ticketNumber: { startsWith: PREFIX } } };
    await prisma.actionTakenRevision.deleteMany({ where: { actionTaken: owned } });
    await prisma.actionTaken.deleteMany({ where: owned });
    await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: PREFIX } } });
    for (const email of Object.values(emails)) await deleteFixtureUser(email);
  }, 60_000);

  it("PERF-01: the staff dashboard answers fast and stays concise with hundreds of tickets and actions behind it", async () => {
    const { response, ms, bytes } = await timed(agents.staff, "/api/dashboard/staff");
    expect(response.status).toBe(200);
    expect(ms, `took ${Math.round(ms)}ms`).toBeLessThan(1500);
    expect(response.body.recentlyUpdated.length).toBeLessThanOrEqual(5);
    expect(response.body.myRecentActions.length).toBeLessThanOrEqual(5);
    expect(bytes, `${bytes} bytes`).toBeLessThan(8_000);
    // The numbers are real, not zeros: this staff member owns most of the 400 tickets.
    expect(response.body.assignedToMe).toBeGreaterThan(100);
  });

  it("PERF-02: the Requester dashboard answers fast and stays concise with 400 tickets of their own", async () => {
    const { response, ms, bytes } = await timed(agents.requester, "/api/dashboard/requester");
    expect(response.status).toBe(200);
    expect(ms, `took ${Math.round(ms)}ms`).toBeLessThan(1000);
    expect(response.body.recentlyUpdated.length).toBeLessThanOrEqual(5);
    expect(response.body.recentlyResolved.length).toBeLessThanOrEqual(5);
    expect(bytes, `${bytes} bytes`).toBeLessThan(5_000);
    expect(response.body.openTickets).toBeGreaterThan(100);
  });

  it("PERF-03: a ticket with 200 Actions Taken lists them all, in order, quickly", async () => {
    const { response, ms } = await timed(agents.staff, `/api/tickets/${heavyTicketId}/actions`);
    expect(response.status).toBe(200);
    expect(ms, `took ${Math.round(ms)}ms`).toBeLessThan(1000);
    const list = response.body.actions ?? response.body;
    expect(list).toHaveLength(200);
    const times = list.map((a: { actionAt: string }) => new Date(a.actionAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("PERF-04: the Ticket Queue returns one page of the 400+ tickets, not all of them, and quickly, with a drill-down filter too", async () => {
    const page = await timed(agents.staff, "/api/staff/tickets");
    expect(page.response.status).toBe(200);
    expect(page.ms, `took ${Math.round(page.ms)}ms`).toBeLessThan(1500);
    expect(page.response.body.tickets.length).toBeLessThanOrEqual(page.response.body.pagination.pageSize);
    expect(page.response.body.pagination.totalItems).toBeGreaterThanOrEqual(MANY);

    const drill = await timed(agents.staff, "/api/staff/tickets?actionAssigneeId=me&open=1&recent=1&sortBy=updatedAt");
    expect(drill.response.status).toBe(200);
    expect(drill.ms, `took ${Math.round(drill.ms)}ms`).toBeLessThan(1500);
  });
});
