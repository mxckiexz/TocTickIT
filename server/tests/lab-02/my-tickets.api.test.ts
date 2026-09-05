import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets", () => {
  let requesterAId: number;
  let requesterBId: number;
  let requesterWithNoTicketsId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const [requesterA, requesterB] = await prisma.requester.findMany({
      where: { isActive: true },
      take: 2,
      orderBy: { id: "asc" },
    });
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
    });

    requesterAId = requesterA.id;
    requesterBId = requesterB.id;

    // Dedicated fixture for the empty-list case — a seeded requester "found
    // to have no tickets right now" is fragile (any other test or manual
    // run against the same DB could leave it with tickets). This one is
    // created here and nothing ever creates a ticket against it, so the
    // empty-list assertion holds regardless of what else is in the DB.
    const requesterWithNoTickets = await prisma.requester.upsert({
      where: { email: "no-tickets-fixture@toktickit.test" },
      update: { isActive: true },
      create: {
        name: "No Tickets Fixture",
        email: "no-tickets-fixture@toktickit.test",
        isActive: true,
      },
    });
    requesterWithNoTicketsId = requesterWithNoTickets.id;

    async function createTicket(requesterId: number, summary: string) {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: `TEST-MYTIX-${Date.now()}-${Math.random()}`,
          requesterId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary,
          description: "My Tickets list test fixture.",
          requestedPriority: "LOW",
        },
      });
      createdTicketIds.push(ticket.id);
      return ticket;
    }

    await createTicket(requesterAId, "Requester A ticket 1");
    await new Promise((r) => setTimeout(r, 5));
    await createTicket(requesterAId, "Requester A ticket 2 (newest)");
    await createTicket(requesterBId, "Requester B ticket");
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.ticket.deleteMany({
      where: { id: { in: createdTicketIds } },
    });
    // Tickets first (FK), then the fixture Requester itself — leave nothing
    // behind for this test file to have created.
    await prisma.requester.delete({ where: { id: requesterWithNoTicketsId } });
  });

  it("returns only the selected Requester's own tickets (ownership)", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId })
      .expect(200);

    expect(response.body.tickets.length).toBeGreaterThanOrEqual(2);
    for (const ticket of response.body.tickets) {
      expect(ticket.requesterId).toBe(requesterAId);
    }

    const summaries = response.body.tickets.map((t: { summary: string }) => t.summary);
    expect(summaries).not.toContain("Requester B ticket");
  });

  it("does not return Requester A's tickets when Requester B is selected", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterBId })
      .expect(200);

    const summaries = response.body.tickets.map((t: { summary: string }) => t.summary);
    expect(summaries).toContain("Requester B ticket");
    expect(summaries).not.toContain("Requester A ticket 1");
  });

  it("orders tickets newest first by default", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId })
      .expect(200);

    const dates = response.body.tickets.map((t: { createdAt: string }) =>
      new Date(t.createdAt).getTime()
    );
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });

  it("breaks a createdAt tie with id desc, so order stays predictable", async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
    });
    const sameInstant = new Date();

    const first = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-MYTIX-TIE-${Date.now()}-a`,
        requesterId: requesterAId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Tie-break ticket 1",
        description: "Same createdAt as the next one, on purpose.",
        requestedPriority: "LOW",
        createdAt: sameInstant,
      },
    });
    const second = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-MYTIX-TIE-${Date.now()}-b`,
        requesterId: requesterAId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Tie-break ticket 2",
        description: "Same createdAt as the previous one, on purpose.",
        requestedPriority: "LOW",
        createdAt: sameInstant,
      },
    });
    createdTicketIds.push(first.id, second.id);

    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId })
      .expect(200);

    const tieIds = response.body.tickets
      .map((t: { id: number }) => t.id)
      .filter((id: number) => id === first.id || id === second.id);
    expect(tieIds).toEqual([second.id, first.id]);
  });

  it("returns an empty tickets array for a Requester with no tickets", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterWithNoTicketsId })
      .expect(200);

    expect(response.body.tickets).toEqual([]);
    expect(response.body.pagination).toMatchObject({
      page: 1,
      totalItems: 0,
      totalPages: 1,
    });
  });

  it("rejects a missing requesterId", async () => {
    const response = await request(app).get("/api/tickets").expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a requesterId of 0", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: 0 })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("includes a pagination envelope even on an unfiltered request", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId })
      .expect(200);

    expect(response.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
    });
    expect(response.body.pagination.totalItems).toBeGreaterThanOrEqual(
      response.body.tickets.length
    );
  });
});

describe("GET /api/tickets — search, filter, sort, and pagination (Feature 5)", () => {
  let requesterId: number;
  let categoryAId: number;
  let categoryBId: number;
  let relatedSystemAId: number;
  let relatedSystemBId: number;
  const ticketIds: Record<string, number> = {};
  const ticketNumbers: Record<string, string> = {};
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const requester = await prisma.requester.upsert({
      where: { email: "feature5-fixture@toktickit.test" },
      update: { isActive: true },
      create: {
        name: "Feature 5 Fixture",
        email: "feature5-fixture@toktickit.test",
        isActive: true,
      },
    });
    requesterId = requester.id;

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
          ticketNumber: `TEST-F5-${key}-${Date.now()}-${Math.random()}`,
          requesterId,
          categoryId: categoryAId,
          relatedSystemId: relatedSystemAId,
          summary: `Fixture ticket ${key}`,
          description: "Feature 5 filter/search/sort fixture.",
          requestedPriority: "LOW",
          ...overrides,
        },
      });
      ticketIds[key] = ticket.id;
      ticketNumbers[key] = ticket.ticketNumber;
      createdTicketIds.push(ticket.id);
      return ticket;
    }

    await createTicket("alpha", {
      summary: "Wifi connection drops in the library",
      categoryId: categoryAId,
      relatedSystemId: relatedSystemAId,
      requestedPriority: "LOW",
    });
    await createTicket("bravo", {
      summary: "Printer paper jam on the 3rd floor",
      categoryId: categoryBId,
      relatedSystemId: relatedSystemAId,
      requestedPriority: "HIGH",
    });
    await createTicket("charlie", {
      summary: "Email search feels slow this week",
      description: "Contains the unique term zzyzx-widget-42 for search matching.",
      categoryId: categoryAId,
      relatedSystemId: relatedSystemBId,
      requestedPriority: "MEDIUM",
    });
    await createTicket("delta", {
      summary: "VPN disconnects randomly",
      categoryId: categoryBId,
      relatedSystemId: relatedSystemBId,
      requestedPriority: "HIGH",
    });
    await createTicket("echo", {
      summary: "Laptop battery drains quickly",
      categoryId: categoryAId,
      relatedSystemId: relatedSystemAId,
      requestedPriority: "LOW",
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.ticket.deleteMany({
      where: { id: { in: createdTicketIds } },
    });
    await prisma.requester.delete({ where: { id: requesterId } });
  });

  function summariesOf(tickets: Array<{ summary: string }>) {
    return tickets.map((t) => t.summary);
  }

  it("filters by search text matching the summary", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, search: "battery" })
      .expect(200);

    expect(summariesOf(response.body.tickets)).toEqual(["Laptop battery drains quickly"]);
  });

  it("search is case-insensitive", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, search: "BATTERY" })
      .expect(200);

    expect(summariesOf(response.body.tickets)).toEqual(["Laptop battery drains quickly"]);
  });

  it("filters by search text matching the description", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, search: "zzyzx-widget-42" })
      .expect(200);

    const ids = response.body.tickets.map((t: { id: number }) => t.id);
    expect(ids).toEqual([ticketIds.charlie]);
  });

  it("filters by search text matching the ticketNumber", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, search: ticketNumbers.delta })
      .expect(200);

    const ids = response.body.tickets.map((t: { id: number }) => t.id);
    expect(ids).toEqual([ticketIds.delta]);
  });

  it("returns an empty result (not an error) when nothing matches the search", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, search: "no-ticket-should-ever-match-this" })
      .expect(200);

    expect(response.body.tickets).toEqual([]);
    expect(response.body.pagination.totalItems).toBe(0);
  });

  it("filters by categoryId", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, categoryId: categoryBId })
      .expect(200);

    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.bravo, ticketIds.delta].sort());
  });

  it("filters by relatedSystemId", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, relatedSystemId: relatedSystemBId })
      .expect(200);

    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.charlie, ticketIds.delta].sort());
  });

  it("filters by requestedPriority", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, requestedPriority: "HIGH" })
      .expect(200);

    const ids = response.body.tickets.map((t: { id: number }) => t.id).sort();
    expect(ids).toEqual([ticketIds.bravo, ticketIds.delta].sort());
  });

  it("filters by currentStatus", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, currentStatus: "New" })
      .expect(200);

    expect(response.body.tickets.length).toBe(5);
  });

  it("returns an empty result for a currentStatus no ticket currently has", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, currentStatus: "Resolved" })
      .expect(200);

    expect(response.body.tickets).toEqual([]);
  });

  it("combines a category filter with a search term", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, categoryId: categoryAId, search: "battery" })
      .expect(200);

    expect(summariesOf(response.body.tickets)).toEqual(["Laptop battery drains quickly"]);
  });

  it("rejects a non-numeric categoryId", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, categoryId: "not-a-number" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a requestedPriority outside LOW/MEDIUM/HIGH", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, requestedPriority: "URGENT" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("sorts by summary ascending", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortBy: "summary", sortDir: "asc" })
      .expect(200);

    const summaries = summariesOf(response.body.tickets);
    expect(summaries).toEqual([...summaries].sort((a, b) => a.localeCompare(b)));
  });

  it("sorts by summary descending", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortBy: "summary", sortDir: "desc" })
      .expect(200);

    const summaries = summariesOf(response.body.tickets);
    expect(summaries).toEqual([...summaries].sort((a, b) => b.localeCompare(a)));
  });

  it("rejects a sortBy that isn't a supported field", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortBy: "id" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a sortDir that isn't asc or desc", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortDir: "sideways" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("paginates results across pages without gaps or duplicates", async () => {
    const page1 = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortBy: "summary", sortDir: "asc", page: 1, pageSize: 2 })
      .expect(200);
    const page2 = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortBy: "summary", sortDir: "asc", page: 2, pageSize: 2 })
      .expect(200);
    const page3 = await request(app)
      .get("/api/tickets")
      .query({ requesterId, sortBy: "summary", sortDir: "asc", page: 3, pageSize: 2 })
      .expect(200);

    expect(page1.body.tickets).toHaveLength(2);
    expect(page2.body.tickets).toHaveLength(2);
    expect(page3.body.tickets).toHaveLength(1);
    expect(page1.body.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      totalItems: 5,
      totalPages: 3,
    });

    const allIds = [...page1.body.tickets, ...page2.body.tickets, ...page3.body.tickets].map(
      (t: { id: number }) => t.id
    );
    expect(new Set(allIds).size).toBe(5);
  });

  it("rejects a page of 0", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, page: 0 })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a pageSize over the maximum", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, pageSize: 51 })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric pageSize", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId, pageSize: "lots" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});
