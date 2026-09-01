import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("POST /api/tickets", () => {
  let activeRequesterId: number;
  let inactiveRequesterId: number;
  let categoryId: number;
  let relatedSystemId: number;

  beforeAll(async () => {
    const prisma = getPrisma();

    const activeRequester = await prisma.requester.findFirstOrThrow({
      where: { isActive: true },
    });
    const inactiveRequester = await prisma.requester.findFirstOrThrow({
      where: { isActive: false },
    });
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
    });

    activeRequesterId = activeRequester.id;
    inactiveRequesterId = inactiveRequester.id;
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  afterEach(async () => {
    await getPrisma().ticket.deleteMany();
  });

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      requesterId: activeRequesterId,
      categoryId,
      relatedSystemId,
      summary: "Laptop battery drains quickly",
      description: "Battery drains much faster than usual, even when idle.",
      requestedPriority: "MEDIUM",
      ...overrides,
    };
  }

  it("creates a ticket and returns a unique Ticket Number (AC-01)", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .send(validPayload())
      .expect(201);

    expect(response.body).toMatchObject({
      requesterId: activeRequesterId,
      categoryId,
      relatedSystemId,
      summary: "Laptop battery drains quickly",
      requestedPriority: "MEDIUM",
      currentStatus: "New",
    });
    expect(response.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);

    const prisma = getPrisma();
    const saved = await prisma.ticket.findUnique({
      where: { id: response.body.id },
    });
    expect(saved?.ticketNumber).toBe(response.body.ticketNumber);
  });

  it("rejects a submission missing required fields with field-level errors", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .send({})
      .expect(400);

    expect(response.body.errors).toMatchObject({
      requesterId: expect.any(String),
      categoryId: expect.any(String),
      relatedSystemId: expect.any(String),
      summary: expect.any(String),
      description: expect.any(String),
      requestedPriority: expect.any(String),
    });
  });

  it("rejects a summary that is only whitespace", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .send(validPayload({ summary: "   " }))
      .expect(400);

    expect(response.body.errors.summary).toBeDefined();
  });

  it("rejects a requestedPriority outside LOW/MEDIUM/HIGH", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .send(validPayload({ requestedPriority: "URGENT" }))
      .expect(400);

    expect(response.body.errors.requestedPriority).toBeDefined();
  });

  it("rejects an inactive Requester", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .send(validPayload({ requesterId: inactiveRequesterId }))
      .expect(400);

    expect(response.body.errors.requesterId).toBeDefined();
  });

  it("rejects a requesterId that does not exist", async () => {
    const response = await request(app)
      .post("/api/tickets")
      .send(validPayload({ requesterId: 999999 }))
      .expect(400);

    expect(response.body.errors.requesterId).toBeDefined();
  });
});
