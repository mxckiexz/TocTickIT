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

    expect(response.body.length).toBeGreaterThanOrEqual(2);
    for (const ticket of response.body) {
      expect(ticket.requesterId).toBe(requesterAId);
    }

    const summaries = response.body.map((t: { summary: string }) => t.summary);
    expect(summaries).not.toContain("Requester B ticket");
  });

  it("does not return Requester A's tickets when Requester B is selected", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterBId })
      .expect(200);

    const summaries = response.body.map((t: { summary: string }) => t.summary);
    expect(summaries).toContain("Requester B ticket");
    expect(summaries).not.toContain("Requester A ticket 1");
  });

  it("orders tickets newest first", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId })
      .expect(200);

    const dates = response.body.map((t: { createdAt: string }) =>
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

    const tieIds = response.body
      .map((t: { id: number }) => t.id)
      .filter((id: number) => id === first.id || id === second.id);
    expect(tieIds).toEqual([second.id, first.id]);
  });

  it("returns an empty array for a Requester with no tickets", async () => {
    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterWithNoTicketsId })
      .expect(200);

    expect(response.body).toEqual([]);
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
});
