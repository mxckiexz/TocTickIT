import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets/:id", () => {
  let ownerRequesterId: number;
  let otherRequesterId: number;
  let ticketId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const owner = await prisma.requester.findFirstOrThrow({
      where: { isActive: true },
    });
    const other = await prisma.requester.findFirstOrThrow({
      where: { isActive: true, NOT: { id: owner.id } },
    });
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
    });

    ownerRequesterId = owner.id;
    otherRequesterId = other.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-DETAIL-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Ticket Detail test fixture",
        description: "Created for GET /api/tickets/:id tests.",
        requestedPriority: "MEDIUM",
      },
    });
    ticketId = ticket.id;
    createdTicketIds.push(ticket.id);
  });

  afterAll(async () => {
    await getPrisma().ticket.deleteMany({
      where: { id: { in: createdTicketIds } },
    });
  });

  it("returns the full ticket to its owning Requester", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    expect(response.body).toMatchObject({
      id: ticketId,
      requesterId: ownerRequesterId,
      summary: "Ticket Detail test fixture",
      description: "Created for GET /api/tickets/:id tests.",
      requestedPriority: "MEDIUM",
      currentStatus: "New",
    });
  });

  it("rejects a Requester who does not own the ticket", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: otherRequesterId })
      .expect(403);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a ticket id that does not exist", async () => {
    const response = await request(app)
      .get("/api/tickets/999999")
      .query({ requesterId: ownerRequesterId })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric ticket id", async () => {
    const response = await request(app)
      .get("/api/tickets/not-a-number")
      .query({ requesterId: ownerRequesterId })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a missing requesterId", async () => {
    const response = await request(app).get(`/api/tickets/${ticketId}`).expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a requesterId of 0", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: 0 })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric requesterId", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .query({ requesterId: "abc" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});
