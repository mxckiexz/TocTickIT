import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 3 (docs/lab-03/tests.md §2.5, API-22..27): the IT Staff Ticket Queue
// (Issue #37). Read-only for both IT_STAFF and ADMINISTRATOR (BR-39); a
// REQUESTER caller gets 403 on every /api/staff/* route (AC-28a, SEC-02).
describe("GET /api/staff/tickets", () => {
  const requesterEmail = "staffqueue-requester-fixture@toktickit.test";
  const staffEmail = "staffqueue-staff-fixture@toktickit.test";
  const otherStaffEmail = "staffqueue-other-staff-fixture@toktickit.test";
  const adminEmail = "staffqueue-admin-fixture@toktickit.test";
  let requesterAgent: request.Agent;
  let staffAgent: request.Agent;
  let adminAgent: request.Agent;
  let requesterId: number;
  let staffId: number;
  let otherStaffId: number;
  let categoryAId: number;
  let categoryBId: number;
  let relatedSystemAId: number;
  let relatedSystemBId: number;
  const ticketIds: Record<string, number> = {};
  const ticketNumbers: Record<string, string> = {};
  const ticketSummaries: Record<string, string> = {};
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const { user: requester } = await createFixtureUser(requesterEmail);
    const { user: staff } = await createFixtureUser(staffEmail, { role: "IT_STAFF" });
    const { user: otherStaff } = await createFixtureUser(otherStaffEmail, { role: "IT_STAFF" });
    await createFixtureUser(adminEmail, { role: "ADMINISTRATOR" });
    requesterAgent = await loginAgent(requesterEmail);
    staffAgent = await loginAgent(staffEmail);
    adminAgent = await loginAgent(adminEmail);
    requesterId = requester.id;
    staffId = staff.id;
    otherStaffId = otherStaff.id;

    const [categoryA, categoryB] = await prisma.category.findMany({
      where: { isActive: true },
      take: 2,
      orderBy: { id: "asc" },
    });
    const [relatedSystemA, relatedSystemB] = await prisma.relatedSystem.findMany({
      where: { isActive: true },
      take: 2,
      orderBy: { id: "asc" },
    });
    categoryAId = categoryA.id;
    categoryBId = categoryB.id;
    relatedSystemAId = relatedSystemA.id;
    relatedSystemBId = relatedSystemB.id;

    async function createTicket(key: string, overrides: Record<string, unknown>) {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: `TEST-STAFFQ-${key}-${Date.now()}-${Math.random()}`,
          requesterId,
          categoryId: categoryAId,
          relatedSystemId: relatedSystemAId,
          summary: `Fixture ticket ${key}`,
          description: "Staff Ticket Queue fixture.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          ...overrides,
        },
      });
      ticketIds[key] = ticket.id;
      ticketNumbers[key] = ticket.ticketNumber;
      ticketSummaries[key] = ticket.summary;
      createdTicketIds.push(ticket.id);
      return ticket;
    }

    await createTicket("alpha", {
      summary: "Wifi connection drops in the library",
      categoryId: categoryAId,
      relatedSystemId: relatedSystemAId,
      itPriority: "LOW",
      currentStatus: "NEW",
      ownerId: null,
    });
    await createTicket("bravo", {
      summary: "Printer paper jam on the 3rd floor",
      categoryId: categoryBId,
      relatedSystemId: relatedSystemAId,
      itPriority: "HIGH",
      currentStatus: "OPEN",
      ownerId: staffId,
    });
    await createTicket("charlie", {
      summary: "Email search feels slow this week",
      description: "Contains the unique term zzyzx-widget-42 for search matching.",
      categoryId: categoryAId,
      relatedSystemId: relatedSystemBId,
      itPriority: "MEDIUM",
      currentStatus: "IN_PROGRESS",
      ownerId: staffId,
    });
    await createTicket("delta", {
      summary: "VPN disconnects randomly",
      categoryId: categoryBId,
      relatedSystemId: relatedSystemBId,
      itPriority: "HIGH",
      currentStatus: "RESOLVED",
      ownerId: otherStaffId,
    });
    await createTicket("echo", {
      // A unique-per-run marker, not the plain "Laptop battery drains
      // quickly" text other fixture files reuse verbatim elsewhere in this
      // shared dev DB — the search test below needs a term only this
      // fixture ticket matches.
      summary: `Laptop battery drains quickly (zzyzx-staffq-echo-${Date.now()})`,
      categoryId: categoryAId,
      relatedSystemId: relatedSystemAId,
      itPriority: "LOW",
      currentStatus: "NEW",
      ownerId: null,
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await deleteFixtureUser(requesterEmail);
    await deleteFixtureUser(staffEmail);
    await deleteFixtureUser(otherStaffEmail);
    await deleteFixtureUser(adminEmail);
  });

  function summariesOf(tickets: Array<{ summary: string }>) {
    return tickets.map((t) => t.summary);
  }

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/staff/tickets").expect(401);
    expect(response.body.error).toBeDefined();
  });

  // AC-28a / SEC-02
  it("rejects a Requester session (403, every /api/staff/* route)", async () => {
    const response = await requesterAgent.get("/api/staff/tickets").expect(403);
    expect(response.body.error).toBeDefined();
  });

  // API-22
  it("returns tickets from multiple Requesters with no filters, as IT Staff", async () => {
    const response = await staffAgent.get("/api/staff/tickets").expect(200);

    expect(response.body.tickets.length).toBeGreaterThanOrEqual(5);
    for (const ticket of response.body.tickets) {
      expect(ticket).toMatchObject({
        requesterName: expect.any(String),
      });
      expect(ticket).toHaveProperty("ownerName");
    }
  });

  // API-54 / AC-28a — Administrator's read access works (BR-39).
  it("is readable by Administrator too (read-only access, BR-39)", async () => {
    const response = await adminAgent.get("/api/staff/tickets").expect(200);
    expect(response.body.tickets.length).toBeGreaterThanOrEqual(5);
  });

  it("includes requesterName and ownerName (nullable) alongside the Lab 2 ticket fields", async () => {
    const response = await staffAgent.get("/api/staff/tickets").expect(200);

    const alpha = response.body.tickets.find((t: { id: number }) => t.id === ticketIds.alpha);
    expect(alpha).toMatchObject({ requesterName: expect.any(String), ownerName: null });

    const bravo = response.body.tickets.find((t: { id: number }) => t.id === ticketIds.bravo);
    expect(bravo.ownerName).toEqual(expect.any(String));
  });

  // A shared dev DB accumulates leftover tickets from every other test file
  // (categoryId/itPriority/currentStatus values are all reused, unscoped,
  // across the whole suite) — and this endpoint deliberately has no
  // requesterId-style scoping of its own. Every filter test below combines
  // its filter under test with `search: FIXTURE_MARKER` (unique to this
  // file's ticketNumbers, e.g. "TEST-STAFFQ-alpha-...") so the result set is
  // always just these 5 fixture tickets, regardless of what else is in the
  // DB.
  const FIXTURE_MARKER = "TEST-STAFFQ";

  it("filters by search text matching the summary", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: "zzyzx-staffq-echo" })
      .expect(200);
    expect(summariesOf(response.body.tickets)).toEqual([ticketSummaries.echo]);
  });

  it("filters by search text matching the description", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: "zzyzx-widget-42" })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id);
    expect(ids).toEqual([ticketIds.charlie]);
  });

  it("filters by search text matching the ticketNumber", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: ticketNumbers.delta })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id);
    expect(ids).toEqual([ticketIds.delta]);
  });

  // API-23 (AC-14) — search, category, related system, priority, status, owner filters, each alone and combined (this and the following filter tests)
  it("filters by categoryId", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, categoryId: categoryBId })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.bravo, ticketIds.delta].sort());
  });

  it("filters by relatedSystemId", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, relatedSystemId: relatedSystemBId })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.charlie, ticketIds.delta].sort());
  });

  // Review fix: a categoryId/relatedSystemId that doesn't reference an
  // existing row is a 400, not a silently-empty 200 — the id itself must be
  // valid, not merely well-formed.
  it("rejects a categoryId that does not reference an existing Category", async () => {
    const response = await staffAgent.get("/api/staff/tickets").query({ categoryId: 999999 }).expect(400);
    expect(response.body.error).toBeDefined();
  });

  it("rejects a relatedSystemId that does not reference an existing Related System", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ relatedSystemId: 999999 })
      .expect(400);
    expect(response.body.error).toBeDefined();
  });

  it("filters by itPriority", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, itPriority: "HIGH" })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.bravo, ticketIds.delta].sort());
  });

  it("filters by currentStatus", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, currentStatus: "NEW" })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.alpha, ticketIds.echo].sort());
  });

  it("combining two filters narrows further", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, categoryId: categoryAId, currentStatus: "NEW" })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.alpha, ticketIds.echo].sort());
  });

  // API-24
  it("filters to unassigned-only with ownerId=0", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, ownerId: 0 })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.alpha, ticketIds.echo].sort());
  });

  it("filters to a specific owner", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_MARKER, ownerId: staffId })
      .expect(200);
    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.bravo, ticketIds.charlie].sort());
  });

  it("rejects a negative ownerId", async () => {
    const response = await staffAgent.get("/api/staff/tickets").query({ ownerId: -1 }).expect(400);
    expect(response.body.error).toBeDefined();
  });

  // API-25
  it("sorts by itPriority", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ sortBy: "itPriority", sortDir: "asc" })
      .expect(200);
    const priorities = response.body.tickets.map((t: { itPriority: string }) => t.itPriority);
    const priorityRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const ranks = priorities.map((p: string) => priorityRank[p]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("sorts by currentStatus", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ sortBy: "currentStatus", sortDir: "asc" })
      .expect(200);
    const statuses = response.body.tickets.map((t: { currentStatus: string }) => t.currentStatus);
    // A native Postgres enum sorts by its declared label order (schema.prisma's
    // TicketStatus), not alphabetically — plain string .sort() would assert
    // the wrong thing here.
    const statusRank: Record<string, number> = Object.fromEntries(
      ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"].map(
        (status, index) => [status, index]
      )
    );
    const ranks = statuses.map((status: string) => statusRank[status]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("sorts by updatedAt", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ sortBy: "updatedAt", sortDir: "desc" })
      .expect(200);
    const dates = response.body.tickets.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("breaks a tie with id desc, so order stays predictable", async () => {
    const response = await staffAgent
      .get("/api/staff/tickets")
      .query({ sortBy: "itPriority", sortDir: "asc" })
      .expect(200);
    const lowIds = response.body.tickets
      .filter((t: { itPriority: string }) => t.itPriority === "LOW")
      .map((t: { id: number }) => t.id);
    expect(lowIds).toEqual([...lowIds].sort((a, b) => b - a));
  });

  // API-26
  it("paginates results, and rejects a pageSize over the maximum (50)", async () => {
    const page1 = await staffAgent
      .get("/api/staff/tickets")
      .query({ sortBy: "createdAt", sortDir: "asc", page: 1, pageSize: 2 })
      .expect(200);
    expect(page1.body.tickets).toHaveLength(2);
    expect(page1.body.pagination).toMatchObject({ page: 1, pageSize: 2 });

    const overMax = await staffAgent.get("/api/staff/tickets").query({ pageSize: 51 }).expect(400);
    expect(overMax.body.error).toBeDefined();
  });

  it("rejects a page of 0", async () => {
    const response = await staffAgent.get("/api/staff/tickets").query({ page: 0 }).expect(400);
    expect(response.body.error).toBeDefined();
  });

  // API-27
  it("rejects an invalid currentStatus value, not silently ignoring it", async () => {
    const response = await staffAgent.get("/api/staff/tickets").query({ currentStatus: "New" }).expect(400);
    expect(response.body.error).toBeDefined();
  });

  it("rejects an invalid itPriority value, not silently ignoring it", async () => {
    const response = await staffAgent.get("/api/staff/tickets").query({ itPriority: "URGENT" }).expect(400);
    expect(response.body.error).toBeDefined();
  });

  it("rejects an invalid sortBy value", async () => {
    const response = await staffAgent.get("/api/staff/tickets").query({ sortBy: "summary" }).expect(400);
    expect(response.body.error).toBeDefined();
  });
});
