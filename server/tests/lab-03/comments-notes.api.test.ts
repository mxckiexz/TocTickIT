import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 3 (docs/lab-03/tests.md §2.4, API-15..21): Public Comments, Internal
// Notes, and "Problem Appears Resolved" (api-spec.md "Comments, Notes, and
// 'mark resolved'").
describe("Comments, Notes, and mark-resolved", () => {
  const requesterEmail = "comments-requester-fixture@toktickit.test";
  const otherRequesterEmail = "comments-other-requester-fixture@toktickit.test";
  const staffEmail = "comments-staff-fixture@toktickit.test";
  const adminEmail = "comments-admin-fixture@toktickit.test";
  let requesterAgent: request.Agent;
  let otherRequesterAgent: request.Agent;
  let staffAgent: request.Agent;
  let adminAgent: request.Agent;
  let requesterId: number;
  let staffId: number;
  let ticketId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const { user: requester } = await createFixtureUser(requesterEmail);
    const { user: staff } = await createFixtureUser(staffEmail, { role: "IT_STAFF" });
    await createFixtureUser(otherRequesterEmail);
    await createFixtureUser(adminEmail, { role: "ADMINISTRATOR" });
    requesterAgent = await loginAgent(requesterEmail);
    otherRequesterAgent = await loginAgent(otherRequesterEmail);
    staffAgent = await loginAgent(staffEmail);
    adminAgent = await loginAgent(adminEmail);
    requesterId = requester.id;
    staffId = staff.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-COMMENTS-${Date.now()}`,
        requesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Comments/notes/mark-resolved test ticket",
        description: "Fixture ticket.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });
    ticketId = ticket.id;
    createdTicketIds.push(ticket.id);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await deleteFixtureUser(requesterEmail);
    await deleteFixtureUser(otherRequesterEmail);
    await deleteFixtureUser(staffEmail);
    await deleteFixtureUser(adminEmail);
  });

  describe("GET /api/tickets/:id/comments", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(app).get(`/api/tickets/${ticketId}/comments`).expect(401);
      expect(response.body.error).toBeDefined();
    });

    it("returns 404 (not 403) for a Requester who does not own the ticket", async () => {
      const response = await otherRequesterAgent.get(`/api/tickets/${ticketId}/comments`).expect(404);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await requesterAgent.get("/api/tickets/999999/comments").expect(404);
      expect(response.body.error).toBeDefined();
    });

    it("is readable by IT Staff for any ticket", async () => {
      const response = await staffAgent.get(`/api/tickets/${ticketId}/comments`).expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("is readable by Administrator for any ticket (read-only, BR-39)", async () => {
      const response = await adminAgent.get(`/api/tickets/${ticketId}/comments`).expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("POST /api/tickets/:id/comments", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "hi" })
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a caller with role ADMINISTRATOR (BR-39: read-only)", async () => {
      const response = await adminAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Administrators can't post comments." })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects an empty/whitespace-only body (BR-25)", async () => {
      const response = await requesterAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "   " })
        .expect(400);
      expect(response.body.errors.body).toBeDefined();
    });

    it("rejects a 2001-character body (BR-26)", async () => {
      const response = await requesterAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "a".repeat(2001) })
        .expect(400);
      expect(response.body.errors.body).toBeDefined();
    });

    it("accepts a 2000-character body at the limit", async () => {
      const response = await requesterAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "a".repeat(2000) })
        .expect(201);
      expect(response.body.body).toHaveLength(2000);
    });

    it("returns 404 (not 403) for a Requester who does not own the ticket", async () => {
      const response = await otherRequesterAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Not my ticket." })
        .expect(404);
      expect(response.body.error).toBeDefined();
    });

    // API-15
    it("lets a Requester post a Public Comment on their own ticket (AC-12, BR-27)", async () => {
      const response = await requesterAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "I tried restarting the laptop and the issue is still there." })
        .expect(201);

      expect(response.body).toMatchObject({
        ticketId,
        authorId: requesterId,
        authorRole: "REQUESTER",
        body: "I tried restarting the laptop and the issue is still there.",
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();

      // Visible via the read route too (same underlying data IT Staff would
      // see on the staff detail screen later).
      const listResponse = await staffAgent.get(`/api/tickets/${ticketId}/comments`).expect(200);
      const found = listResponse.body.find((c: { id: number }) => c.id === response.body.id);
      expect(found).toBeDefined();
    });

    it("lets IT Staff post a comment on any ticket", async () => {
      const response = await staffAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Looking into this now." })
        .expect(201);

      expect(response.body).toMatchObject({
        ticketId,
        authorId: staffId,
        authorRole: "IT_STAFF",
      });
    });

    it("orders comments createdAt asc, id asc", async () => {
      const response = await requesterAgent.get(`/api/tickets/${ticketId}/comments`).expect(200);
      const dates = response.body.map((c: { createdAt: string }) => new Date(c.createdAt).getTime());
      const sorted = [...dates].sort((a, b) => a - b);
      expect(dates).toEqual(sorted);
    });

    // API-18
    it("has no edit/delete route (append-only, BR-28)", async () => {
      const created = await requesterAgent
        .post(`/api/tickets/${ticketId}/comments`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Immutable once posted." })
        .expect(201);

      await requesterAgent
        .delete(`/api/tickets/${ticketId}/comments/${created.body.id}`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(404);
      await requesterAgent
        .put(`/api/tickets/${ticketId}/comments/${created.body.id}`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "edited" })
        .expect(404);
    });
  });

  describe("GET /api/tickets/:id/notes", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(app).get(`/api/tickets/${ticketId}/notes`).expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-21
    it("rejects a Requester reading notes on their own ticket, without revealing whether any exist (AC-04, BR-29)", async () => {
      const response = await requesterAgent.get(`/api/tickets/${ticketId}/notes`).expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a Requester reading notes on a ticket that isn't even theirs, with the identical 403", async () => {
      const response = await otherRequesterAgent.get(`/api/tickets/${ticketId}/notes`).expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a Requester on a nonexistent ticket with the same 403 (not 404)", async () => {
      const response = await requesterAgent.get("/api/tickets/999999/notes").expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("is readable by IT Staff", async () => {
      const response = await staffAgent.get(`/api/tickets/${ticketId}/notes`).expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("is readable by Administrator (read-only, BR-39)", async () => {
      const response = await adminAgent.get(`/api/tickets/${ticketId}/notes`).expect(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("rejects IT Staff/Administrator on a ticket id that does not exist", async () => {
      const response = await staffAgent.get("/api/tickets/999999/notes").expect(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe("POST /api/tickets/:id/notes", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "hi" })
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-21
    it("rejects a Requester posting a note on their own ticket (403, BR-29)", async () => {
      const response = await requesterAgent
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Requesters can never write notes." })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects an Administrator (read-only, BR-39)", async () => {
      const response = await adminAgent
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Administrators can't write notes either." })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects an empty/whitespace-only body (BR-25)", async () => {
      const response = await staffAgent
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "" })
        .expect(400);
      expect(response.body.errors.body).toBeDefined();
    });

    it("rejects a 2001-character body (BR-26)", async () => {
      const response = await staffAgent
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "a".repeat(2001) })
        .expect(400);
      expect(response.body.errors.body).toBeDefined();
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await staffAgent
        .post("/api/tickets/999999/notes")
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Ghost ticket." })
        .expect(404);
      expect(response.body.error).toBeDefined();
    });

    it("lets IT Staff post an Internal Note on any ticket", async () => {
      const response = await staffAgent
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Internal-only triage note." })
        .expect(201);

      expect(response.body).toMatchObject({
        ticketId,
        authorId: staffId,
        authorRole: "IT_STAFF",
        body: "Internal-only triage note.",
      });

      // Never visible via the Public Comments route. (PublicComment and
      // InternalNote are separate tables with their own id sequences, so an
      // id match alone wouldn't prove anything — compare on the body text.)
      const commentsResponse = await staffAgent.get(`/api/tickets/${ticketId}/comments`).expect(200);
      const leaked = commentsResponse.body.find(
        (c: { body: string }) => c.body === "Internal-only triage note."
      );
      expect(leaked).toBeUndefined();
    });

    // API-18
    it("has no edit/delete route (append-only, BR-28)", async () => {
      const created = await staffAgent
        .post(`/api/tickets/${ticketId}/notes`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ body: "Immutable once posted." })
        .expect(201);

      await staffAgent
        .delete(`/api/tickets/${ticketId}/notes/${created.body.id}`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(404);
    });
  });

  describe("POST /api/tickets/:id/mark-resolved", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(app)
        .post(`/api/tickets/${ticketId}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a caller whose role is not REQUESTER", async () => {
      const response = await staffAgent
        .post(`/api/tickets/${ticketId}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("returns 404 (not 403) for a Requester who does not own the ticket", async () => {
      const response = await otherRequesterAgent
        .post(`/api/tickets/${ticketId}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(404);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await requesterAgent
        .post("/api/tickets/999999/mark-resolved")
        .set("Origin", CLIENT_ORIGIN)
        .expect(404);
      expect(response.body.error).toBeDefined();
    });

    // API-19
    it("marks the ticket resolved without changing currentStatus (AC-13, BR-05, BR-24)", async () => {
      const response = await requesterAgent
        .post(`/api/tickets/${ticketId}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(200);

      expect(response.body.currentStatus).toBe("NEW");
      expect(response.body.requesterMarkedResolvedAt).toBeDefined();
      expect(response.body.requesterMarkedResolvedAt).not.toBeNull();
      expect(response.body.requesterMarkedResolvedById).toBe(requesterId);
    });

    // API-20
    it("is idempotent: a second call while not yet terminal is 200 and overwrites the timestamp (BR-24)", async () => {
      const first = await requesterAgent
        .post(`/api/tickets/${ticketId}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(200);

      await new Promise((r) => setTimeout(r, 5));

      const second = await requesterAgent
        .post(`/api/tickets/${ticketId}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(200);

      expect(new Date(second.body.requesterMarkedResolvedAt).getTime()).toBeGreaterThan(
        new Date(first.body.requesterMarkedResolvedAt).getTime()
      );
      expect(second.body.currentStatus).toBe("NEW");
    });

    it("rejects marking resolved once the ticket is in a terminal status (409, BR-40)", async () => {
      const prisma = getPrisma();
      const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
      const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
      const terminalTicket = await prisma.ticket.create({
        data: {
          ticketNumber: `TEST-MARK-RESOLVED-TERMINAL-${Date.now()}`,
          requesterId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: "Already-closed ticket",
          description: "Fixture for the terminal-status 409 case.",
          requestedPriority: "LOW",
          itPriority: "LOW",
          currentStatus: "CLOSED",
        },
      });
      createdTicketIds.push(terminalTicket.id);

      const response = await requesterAgent
        .post(`/api/tickets/${terminalTicket.id}/mark-resolved`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(409);

      expect(response.body.error).toBeDefined();
    });
  });
});
