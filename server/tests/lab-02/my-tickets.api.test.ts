import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets", () => {
  let requesterAId: number;
  let requesterBId: number;
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
    await getPrisma().ticket.deleteMany({
      where: { id: { in: createdTicketIds } },
    });
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

  it("returns an empty array for a Requester with no tickets", async () => {
    const prisma = getPrisma();
    const otherRequester = await prisma.requester.findFirstOrThrow({
      where: { isActive: true, id: { notIn: [requesterAId, requesterBId] } },
    });

    const response = await request(app)
      .get("/api/tickets")
      .query({ requesterId: otherRequester.id })
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
