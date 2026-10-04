import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { createFixtureUser, deleteFixtureUser, loginAgent, withOrigin } from "../helpers/auth-fixtures.js";

// Lab 3 (docs/lab-03/tests.md §2.3, API-12): re-run against session auth
// instead of a client-supplied requesterId — identity now comes from a
// logged-in agent, and ownership rejection tightens 403 -> 404 elsewhere
// (this file has none of those, since a Requester always creates their own
// ticket; that rule is exercised in ticket-detail/attachments instead).
describe("POST /api/tickets", () => {
  const email = "create-ticket-fixture@toktickit.test";
  let agent: request.Agent;
  let requesterId: number;
  let categoryId: number;
  let relatedSystemId: number;
  let inactiveCategoryId: number;
  let inactiveRelatedSystemId: number;
  let createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const { user } = await createFixtureUser(email);
    requesterId = user.id;
    agent = await loginAgent(email);

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const inactiveCategory = await prisma.category.findFirstOrThrow({ where: { isActive: false } });
    const inactiveRelatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: false } });

    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
    inactiveCategoryId = inactiveCategory.id;
    inactiveRelatedSystemId = inactiveRelatedSystem.id;
  });

  afterAll(async () => {
    await deleteFixtureUser(email);
  });

  afterEach(async () => {
    // Only remove the tickets this test file created — never a blanket
    // deleteMany(), which would wipe every Ticket row in the database
    // (including anything a user created against the same DATABASE_URL).
    if (createdTicketIds.length > 0) {
      await getPrisma().ticket.deleteMany({
        where: { id: { in: createdTicketIds } },
      });
      createdTicketIds = [];
    }
  });

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      categoryId,
      relatedSystemId,
      summary: "Laptop battery drains quickly",
      description: "Battery drains much faster than usual, even when idle.",
      requestedPriority: "MEDIUM",
      ...overrides,
    };
  }

  it("rejects an unauthenticated request", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .set("Origin", "http://localhost:5173")
      .send(validPayload())
      .expect(401);
    expect(response.body.error).toBeDefined();
  });

  it("rejects a session whose role is not REQUESTER", async () => {
    const staffEmail = "create-ticket-staff-fixture@toktickit.test";
    await createFixtureUser(staffEmail, { role: "IT_STAFF" });
    const staffAgent = await loginAgent(staffEmail);

    const response = await withOrigin(staffAgent.post("/api/tickets")).send(validPayload()).expect(403);
    expect(response.body.error).toBeDefined();

    await deleteFixtureUser(staffEmail);
  });

  it("creates a ticket and returns a unique Ticket Number (AC-01)", async () => {
    const response = await withOrigin(agent.post("/api/tickets")).send(validPayload()).expect(201);

    expect(response.body).toMatchObject({
      requesterId,
      categoryId,
      relatedSystemId,
      summary: "Laptop battery drains quickly",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
    });
    expect(response.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    createdTicketIds.push(response.body.id);

    const prisma = getPrisma();
    const saved = await prisma.ticket.findUnique({
      where: { id: response.body.id },
    });
    expect(saved?.ticketNumber).toBe(response.body.ticketNumber);
  });

  // API-14
  it("response includes ownerId: null, itPriority equal to requestedPriority, and currentStatus NEW (§7.2)", async () => {
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ requestedPriority: "HIGH" }))
      .expect(201);
    createdTicketIds.push(response.body.id);

    expect(response.body).toMatchObject({
      ownerId: null,
      itPriority: "HIGH",
      requestedPriority: "HIGH",
      currentStatus: "NEW",
    });
  });

  // API-13
  it("ignores a requesterId in the body — the ticket is created under the session's own identity (FR-08, BR-03)", async () => {
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ requesterId: 999999 }))
      .expect(201);
    createdTicketIds.push(response.body.id);

    expect(response.body.requesterId).toBe(requesterId);
    expect(response.body.requesterId).not.toBe(999999);
  });

  it("rejects a submission missing required fields with field-level errors", async () => {
    const response = await withOrigin(agent.post("/api/tickets")).send({}).expect(400);

    expect(response.body.errors).toMatchObject({
      categoryId: expect.any(String),
      relatedSystemId: expect.any(String),
      summary: expect.any(String),
      description: expect.any(String),
      requestedPriority: expect.any(String),
    });
  });

  it("rejects categoryId/relatedSystemId of 0, not just missing", async () => {
    // An unselected <select> in the client form coerces to 0 via Number(""),
    // which passes a bare Number.isInteger() check — ids must be > 0.
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ categoryId: 0, relatedSystemId: 0 }))
      .expect(400);

    expect(response.body.errors).toMatchObject({
      categoryId: expect.any(String),
      relatedSystemId: expect.any(String),
    });
  });

  it("rejects a summary that is only whitespace", async () => {
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ summary: "   " }))
      .expect(400);

    expect(response.body.errors.summary).toBeDefined();
  });

  it("rejects a requestedPriority outside LOW/MEDIUM/HIGH", async () => {
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ requestedPriority: "URGENT" }))
      .expect(400);

    expect(response.body.errors.requestedPriority).toBeDefined();
  });

  it("rejects an inactive Category", async () => {
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ categoryId: inactiveCategoryId }))
      .expect(400);

    expect(response.body.errors.categoryId).toBeDefined();
  });

  it("rejects an inactive Related System", async () => {
    const response = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ relatedSystemId: inactiveRelatedSystemId }))
      .expect(400);

    expect(response.body.errors.relatedSystemId).toBeDefined();
  });

  it("accepts a summary at the 150-character limit and rejects 151 characters", async () => {
    const atLimit = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ summary: "A".repeat(150) }))
      .expect(201);
    createdTicketIds.push(atLimit.body.id);

    const overLimit = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ summary: "A".repeat(151) }))
      .expect(400);
    expect(overLimit.body.errors.summary).toBeDefined();
  });

  it("accepts a description at the 2000-character limit and rejects 2001 characters", async () => {
    const atLimit = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ description: "A".repeat(2000) }))
      .expect(201);
    createdTicketIds.push(atLimit.body.id);

    const overLimit = await withOrigin(agent.post("/api/tickets"))
      .send(validPayload({ description: "A".repeat(2001) }))
      .expect(400);
    expect(overLimit.body.errors.description).toBeDefined();
  });

  it("returns the existing ticket instead of creating a duplicate on resubmission (BR-02)", async () => {
    const payload = validPayload({ summary: "Duplicate submission test" });

    const first = await withOrigin(agent.post("/api/tickets")).send(payload).expect(201);
    createdTicketIds.push(first.body.id);

    const second = await withOrigin(agent.post("/api/tickets")).send(payload).expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.ticketNumber).toBe(first.body.ticketNumber);

    const count = await getPrisma().ticket.count({
      where: {
        requesterId,
        summary: "Duplicate submission test",
      },
    });
    expect(count).toBe(1);
  });
});
