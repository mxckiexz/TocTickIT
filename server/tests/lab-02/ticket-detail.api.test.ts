import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { createFixtureUser, deleteFixtureUser, loginAgent, withOrigin } from "../helpers/auth-fixtures.js";

// Lab 3 (tests.md §2.3, API-12): re-run against session auth. BR-14 tightens
// the cross-Requester rejection from Lab 2's 403 to 404 (§2.9, category 1).
describe("GET /api/tickets/:id", () => {
  const ownerEmail = "ticket-detail-owner-fixture@toktickit.test";
  const otherEmail = "ticket-detail-other-fixture@toktickit.test";
  let ownerAgent: request.Agent;
  let otherAgent: request.Agent;
  let ownerRequesterId: number;
  let ticketId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const { user: owner } = await createFixtureUser(ownerEmail);
    await createFixtureUser(otherEmail);
    ownerAgent = await loginAgent(ownerEmail);
    otherAgent = await loginAgent(otherEmail);
    ownerRequesterId = owner.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-DETAIL-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Ticket Detail test fixture",
        description: "Created for GET /api/tickets/:id tests.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
      },
    });
    ticketId = ticket.id;
    createdTicketIds.push(ticket.id);
  });

  afterAll(async () => {
    await getPrisma().ticket.deleteMany({
      where: { id: { in: createdTicketIds } },
    });
    await deleteFixtureUser(ownerEmail);
    await deleteFixtureUser(otherEmail);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get(`/api/tickets/${ticketId}`).expect(401);
    expect(response.body.error).toBeDefined();
  });

  it("rejects a session whose role is not REQUESTER", async () => {
    const staffEmail = "ticket-detail-staff-fixture@toktickit.test";
    await createFixtureUser(staffEmail, { role: "IT_STAFF" });
    const staffAgent = await loginAgent(staffEmail);

    const response = await staffAgent.get(`/api/tickets/${ticketId}`).expect(403);
    expect(response.body.error).toBeDefined();

    await deleteFixtureUser(staffEmail);
  });

  it("returns the full ticket to its owning Requester", async () => {
    const response = await ownerAgent.get(`/api/tickets/${ticketId}`).expect(200);

    expect(response.body).toMatchObject({
      id: ticketId,
      requesterId: ownerRequesterId,
      summary: "Ticket Detail test fixture",
      description: "Created for GET /api/tickets/:id tests.",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
    });
  });

  // BR-14 / AC-11: a different Requester's ticket is 404, not 403 — it
  // shouldn't be distinguishable from a ticket id that never existed.
  it("returns 404 (not 403) for a Requester who does not own the ticket", async () => {
    const response = await otherAgent.get(`/api/tickets/${ticketId}`).expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a ticket id that does not exist", async () => {
    const response = await ownerAgent.get("/api/tickets/999999").expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric ticket id", async () => {
    const response = await ownerAgent.get("/api/tickets/not-a-number").expect(400);

    expect(response.body.error).toBeDefined();
  });
});
