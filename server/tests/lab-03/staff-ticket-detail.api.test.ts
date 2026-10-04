import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";
import {
  STATUS_TRANSITIONS,
  isLegalStatusTransition,
  statusRequiresConfirmation,
} from "../../src/ticketStatus.js";

// Same directory the download routes serve from (server/uploads).
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");

const ALL_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

// UNIT-03 — the pure transition-matrix lookup, tested directly (no HTTP),
// same pattern as auth.ts's hashPassword/validateNewPassword.
describe("status transition lookup (UNIT-03)", () => {
  it("returns true for every matrix ✅ cell", () => {
    for (const from of ALL_STATUSES) {
      for (const to of STATUS_TRANSITIONS[from]) {
        expect(isLegalStatusTransition(from, to)).toBe(true);
      }
    }
  });

  it("returns false for every other cell, including every self-transition", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(isLegalStatusTransition(from, to)).toBe(STATUS_TRANSITIONS[from].includes(to));
      }
      // Explicitly called out per UNIT-03's own wording — no status is ever
      // a legal transition target from itself.
      expect(isLegalStatusTransition(from, from)).toBe(false);
    }
  });

  it("requires confirmation only for RESOLVED, CLOSED, REOPENED, and CANCELLED", () => {
    expect(statusRequiresConfirmation("RESOLVED")).toBe(true);
    expect(statusRequiresConfirmation("CLOSED")).toBe(true);
    expect(statusRequiresConfirmation("REOPENED")).toBe(true);
    expect(statusRequiresConfirmation("CANCELLED")).toBe(true);
    expect(statusRequiresConfirmation("NEW")).toBe(false);
    expect(statusRequiresConfirmation("OPEN")).toBe(false);
    expect(statusRequiresConfirmation("IN_PROGRESS")).toBe(false);
    expect(statusRequiresConfirmation("WAITING_FOR_REQUESTER")).toBe(false);
  });
});

// Lab 3 (docs/lab-03/tests.md §2.6, API-28..38, §2.8's API-49/50): the IT
// Staff Ticket Detail screen's backing routes (Issue #38).
describe("IT Staff Ticket Detail & Workflow", () => {
  const requesterEmail = "staffdetail-requester-fixture@toktickit.test";
  const staffAEmail = "staffdetail-staffA-fixture@toktickit.test";
  const staffBEmail = "staffdetail-staffB-fixture@toktickit.test";
  const inactiveStaffEmail = "staffdetail-inactive-staff-fixture@toktickit.test";
  const adminEmail = "staffdetail-admin-fixture@toktickit.test";

  let requesterAgent: request.Agent;
  let staffAAgent: request.Agent;
  let staffBAgent: request.Agent;
  let adminAgent: request.Agent;
  let requesterId: number;
  let staffAId: number;
  let staffBId: number;
  let inactiveStaffId: number;
  let categoryId: number;
  let relatedSystemId: number;
  const createdTicketIds: number[] = [];
  const createdUploadFiles: string[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const { user: requester } = await createFixtureUser(requesterEmail);
    const { user: staffA } = await createFixtureUser(staffAEmail, { role: "IT_STAFF" });
    const { user: staffB } = await createFixtureUser(staffBEmail, { role: "IT_STAFF" });
    const { user: inactiveStaff } = await createFixtureUser(inactiveStaffEmail, {
      role: "IT_STAFF",
      isActive: false,
    });
    await createFixtureUser(adminEmail, { role: "ADMINISTRATOR" });

    requesterAgent = await loginAgent(requesterEmail);
    staffAAgent = await loginAgent(staffAEmail);
    staffBAgent = await loginAgent(staffBEmail);
    adminAgent = await loginAgent(adminEmail);

    requesterId = requester.id;
    staffAId = staffA.id;
    staffBId = staffB.id;
    inactiveStaffId = inactiveStaff.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    categoryId = category.id;
    relatedSystemId = relatedSystem.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    for (const file of createdUploadFiles) rmSync(path.join(UPLOAD_DIR, file), { force: true });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await deleteFixtureUser(requesterEmail);
    await deleteFixtureUser(staffAEmail);
    await deleteFixtureUser(staffBEmail);
    await deleteFixtureUser(inactiveStaffEmail);
    await deleteFixtureUser(adminEmail);
  });

  async function createTicket(overrides: Record<string, unknown> = {}) {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-STAFFDETAIL-${Date.now()}-${Math.random()}`,
        requesterId,
        categoryId,
        relatedSystemId,
        summary: "Staff ticket detail/workflow fixture",
        description: "Fixture ticket.",
        requestedPriority: "LOW",
        itPriority: "LOW",
        ...overrides,
      },
    });
    createdTicketIds.push(ticket.id);
    return ticket;
  }

  // A real attachment (row + file on disk) on the given ticket.
  async function createAttachment(ticketId: number, body: string, overrides: Record<string, unknown> = {}) {
    const storedFilename = `staffdetail-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(path.join(UPLOAD_DIR, storedFilename), body);
    createdUploadFiles.push(storedFilename);
    return getPrisma().attachment.create({
      data: {
        ticketId,
        originalFilename: "evidence.txt",
        storedFilename,
        mimeType: "text/plain",
        sizeBytes: body.length,
        ...overrides,
      },
    });
  }

  describe("GET /api/staff/tickets/:id", () => {
    // API-62 (sheet 8.4: the staff screen extends Lab 2's Ticket screen, which
    // shows Category and Related System — names, not bare ids)
    it("returns the Category and Related System names, not just their ids", async () => {
      const prisma = getPrisma();
      const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
      const relatedSystem = await prisma.relatedSystem.findUniqueOrThrow({ where: { id: relatedSystemId } });
      const ticket = await createTicket();

      const response = await staffAAgent.get(`/api/staff/tickets/${ticket.id}`).expect(200);

      expect(response.body.ticket.categoryName).toBe(category.name);
      expect(response.body.ticket.relatedSystemName).toBe(relatedSystem.name);
      expect(response.body.ticket.categoryId).toBe(categoryId);
      expect(response.body.ticket.relatedSystemId).toBe(relatedSystemId);
    });

    it("still names the Category of a ticket whose Category was deactivated after it was filed", async () => {
      const prisma = getPrisma();
      const archived = await prisma.category.findFirstOrThrow({ where: { isActive: false } });
      const ticket = await createTicket({ categoryId: archived.id });

      const response = await staffAAgent.get(`/api/staff/tickets/${ticket.id}`).expect(200);

      expect(response.body.ticket.categoryName).toBe(archived.name);
    });

    it("rejects an unauthenticated request", async () => {
      const ticket = await createTicket();
      const response = await request(app).get(`/api/staff/tickets/${ticket.id}`).expect(401);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a Requester session", async () => {
      const ticket = await createTicket();
      const response = await requesterAgent.get(`/api/staff/tickets/${ticket.id}`).expect(403);
      expect(response.body.error).toBeDefined();
    });

    // API-37
    it("returns { ticket, attachments, comments, notes } in one response", async () => {
      const ticket = await createTicket({ ownerId: staffAId });
      const prisma = getPrisma();
      await prisma.publicComment.create({
        data: { ticketId: ticket.id, authorId: requesterId, body: "A public comment." },
      });
      await prisma.internalNote.create({
        data: { ticketId: ticket.id, authorId: staffAId, body: "An internal note." },
      });

      const response = await staffAAgent.get(`/api/staff/tickets/${ticket.id}`).expect(200);

      expect(response.body.ticket).toMatchObject({
        id: ticket.id,
        requesterName: expect.any(String),
        requesterEmail: expect.any(String),
        ownerName: expect.any(String),
        ownerEmail: expect.any(String),
      });
      expect(Array.isArray(response.body.attachments)).toBe(true);
      expect(response.body.comments).toHaveLength(1);
      expect(response.body.comments[0].body).toBe("A public comment.");
      expect(response.body.notes).toHaveLength(1);
      expect(response.body.notes[0].body).toBe("An internal note.");
    });

    it("returns null ownerName/ownerEmail for an unassigned ticket", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent.get(`/api/staff/tickets/${ticket.id}`).expect(200);
      expect(response.body.ticket.ownerName).toBeNull();
      expect(response.body.ticket.ownerEmail).toBeNull();
    });

    // API-54 (second half — the list half is covered in staff-queue.api.test.ts)
    it("is readable by Administrator too (read-only access, BR-39)", async () => {
      const ticket = await createTicket();
      const response = await adminAgent.get(`/api/staff/tickets/${ticket.id}`).expect(200);
      expect(response.body.ticket.id).toBe(ticket.id);
    });

    // API-38
    it("rejects a ticket id that does not exist", async () => {
      const response = await staffAAgent.get("/api/staff/tickets/999999").expect(404);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a non-numeric ticket id", async () => {
      const response = await staffAAgent.get("/api/staff/tickets/not-a-number").expect(400);
      expect(response.body.error).toBeDefined();
    });
  });

  // API-61 (sheet 8.4 "existing Attachments", Part 7 "Attachment continuity"):
  // IT Staff and Administrator can OPEN a ticket's attachments through a
  // read-only staff route; the Requester-only Lab 2 route is unchanged.
  describe("GET /api/staff/tickets/:id/attachments/:attachmentId (API-61)", () => {
    const FILE_BODY = "staff attachment download fixture";
    const url = (ticketId: number, attachmentId: number | string) =>
      `/api/staff/tickets/${ticketId}/attachments/${attachmentId}`;

    it("rejects an unauthenticated request with 401", async () => {
      const ticket = await createTicket();
      const attachment = await createAttachment(ticket.id, FILE_BODY);
      await request(app).get(url(ticket.id, attachment.id)).expect(401);
    });

    it("rejects a Requester session with 403 and no file content", async () => {
      const ticket = await createTicket();
      const attachment = await createAttachment(ticket.id, FILE_BODY);
      const response = await requesterAgent.get(url(ticket.id, attachment.id)).expect(403);
      expect(response.text).not.toContain(FILE_BODY);
    });

    it("serves the file to IT Staff, on a ticket they do not own", async () => {
      const ticket = await createTicket({ ownerId: staffBId });
      const attachment = await createAttachment(ticket.id, FILE_BODY);

      const response = await staffAAgent.get(url(ticket.id, attachment.id)).expect(200);

      expect(response.headers["content-type"]).toMatch(/text\/plain/);
      expect(response.headers["content-disposition"]).toContain("evidence.txt");
      expect(response.text).toBe(FILE_BODY);
    });

    it("serves the file to an Administrator too (read-only access, BR-39)", async () => {
      const ticket = await createTicket();
      const attachment = await createAttachment(ticket.id, FILE_BODY);
      const response = await adminAgent.get(url(ticket.id, attachment.id)).expect(200);
      expect(response.text).toBe(FILE_BODY);
    });

    it("404s a ticket that does not exist", async () => {
      await staffAAgent.get(url(999999, 1)).expect(404);
    });

    it("404s an attachment id that does not exist", async () => {
      const ticket = await createTicket();
      await staffAAgent.get(url(ticket.id, 999999)).expect(404);
    });

    it("404s an attachment that belongs to a different ticket", async () => {
      const ticketA = await createTicket();
      const ticketB = await createTicket();
      const attachmentOfB = await createAttachment(ticketB.id, FILE_BODY);
      const response = await staffAAgent.get(url(ticketA.id, attachmentOfB.id)).expect(404);
      expect(response.text).not.toContain(FILE_BODY);
    });

    it("404s a soft-removed attachment, the same as the Requester route", async () => {
      const ticket = await createTicket();
      const attachment = await createAttachment(ticket.id, FILE_BODY, { removedAt: new Date() });
      await staffAAgent.get(url(ticket.id, attachment.id)).expect(404);
    });

    it("400s a non-numeric ticket id or attachment id", async () => {
      const ticket = await createTicket();
      await staffAAgent.get(url(ticket.id, "not-a-number")).expect(400);
      await staffAAgent.get("/api/staff/tickets/not-a-number/attachments/1").expect(400);
    });

    it("does not widen the Requester route: IT Staff still get 403 there", async () => {
      const ticket = await createTicket();
      const attachment = await createAttachment(ticket.id, FILE_BODY);
      await staffAAgent.get(`/api/tickets/${ticket.id}/attachments/${attachment.id}`).expect(403);
    });
  });

  describe("POST /api/staff/tickets/:id/claim", () => {
    it("rejects an unauthenticated request", async () => {
      const ticket = await createTicket();
      const response = await request(app)
        .post(`/api/staff/tickets/${ticket.id}/claim`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-55 / AC-20b
    it("rejects an Administrator session (403, same as Requester)", async () => {
      const ticket = await createTicket();
      const response = await adminAgent
        .post(`/api/staff/tickets/${ticket.id}/claim`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects a Requester session", async () => {
      const ticket = await createTicket();
      const response = await requesterAgent
        .post(`/api/staff/tickets/${ticket.id}/claim`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    // API-28
    it("sets the caller as owner when the ticket is unassigned", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/claim`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(200);
      expect(response.body.ownerId).toBe(staffAId);
    });

    // API-29
    it("rejects claiming an already-assigned ticket", async () => {
      const ticket = await createTicket({ ownerId: staffAId });
      const response = await staffBAgent
        .post(`/api/staff/tickets/${ticket.id}/claim`)
        .set("Origin", CLIENT_ORIGIN)
        .expect(409);
      expect(response.body.error).toBeDefined();

      const row = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(row.ownerId).toBe(staffAId);
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await staffAAgent
        .post("/api/staff/tickets/999999/claim")
        .set("Origin", CLIENT_ORIGIN)
        .expect(404);
      expect(response.body.error).toBeDefined();
    });

    // Concurrency regression (found in review): claim must be atomic. A
    // read-then-write implementation lets two concurrent claims both observe
    // ownerId: null and both succeed, silently overwriting one claimant with
    // the other instead of the second one getting BR-18's required 409.
    it("under concurrent claims from two staff sessions, exactly one succeeds and the owner is the winner", async () => {
      const ticket = await createTicket();

      const [resultA, resultB] = await Promise.all([
        staffAAgent.post(`/api/staff/tickets/${ticket.id}/claim`).set("Origin", CLIENT_ORIGIN),
        staffBAgent.post(`/api/staff/tickets/${ticket.id}/claim`).set("Origin", CLIENT_ORIGIN),
      ]);

      // Exactly one 200 and one 409 — never both 200 (the race the fix
      // closes) and never both 409 (would mean neither claim ever landed).
      const statuses = [resultA.status, resultB.status].sort();
      expect(statuses).toEqual([200, 409]);

      const expectedWinnerId = resultA.status === 200 ? staffAId : staffBId;
      const winnerResult = resultA.status === 200 ? resultA : resultB;
      expect(winnerResult.body.ownerId).toBe(expectedWinnerId);

      // The row in the DB agrees with whichever response actually got 200 —
      // no silent overwrite by the losing request.
      const row = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(row.ownerId).toBe(expectedWinnerId);
    });
  });

  describe("POST /api/staff/tickets/:id/assign", () => {
    it("rejects an unauthenticated request", async () => {
      const ticket = await createTicket();
      const response = await request(app)
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: staffAId })
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-55 / AC-20b
    it("rejects an Administrator session", async () => {
      const ticket = await createTicket();
      const response = await adminAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: staffAId })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    // API-30
    it("lets a non-owner IT Staff member reassign the ticket (BR-18: not owner-restricted)", async () => {
      const ticket = await createTicket({ ownerId: staffAId });
      const response = await staffBAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: staffBId })
        .expect(200);
      expect(response.body.ownerId).toBe(staffBId);
    });

    it("also works on an unassigned ticket", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: staffAId })
        .expect(200);
      expect(response.body.ownerId).toBe(staffAId);
    });

    // API-31
    it("rejects an ownerId that references a Requester", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: requesterId })
        .expect(400);
      expect(response.body.errors.ownerId).toBeDefined();
    });

    it("rejects an ownerId that references an Administrator", async () => {
      const ticket = await createTicket();
      const prisma = getPrisma();
      const admin = await prisma.user.findFirstOrThrow({ where: { email: adminEmail } });
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: admin.id })
        .expect(400);
      expect(response.body.errors.ownerId).toBeDefined();
    });

    it("rejects an ownerId that references an inactive IT Staff user", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: inactiveStaffId })
        .expect(400);
      expect(response.body.errors.ownerId).toBeDefined();
    });

    it("rejects an ownerId that does not reference any user", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: 999999 })
        .expect(400);
      expect(response.body.errors.ownerId).toBeDefined();
    });

    it("rejects a missing/non-integer ownerId", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .post(`/api/staff/tickets/${ticket.id}/assign`)
        .set("Origin", CLIENT_ORIGIN)
        .send({})
        .expect(400);
      expect(response.body.errors.ownerId).toBeDefined();
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await staffAAgent
        .post("/api/staff/tickets/999999/assign")
        .set("Origin", CLIENT_ORIGIN)
        .send({ ownerId: staffAId })
        .expect(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe("PATCH /api/staff/tickets/:id/priority", () => {
    it("rejects an unauthenticated request", async () => {
      const ticket = await createTicket();
      const response = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/priority`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ itPriority: "HIGH" })
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-55 / AC-20b
    it("rejects an Administrator session", async () => {
      const ticket = await createTicket();
      const response = await adminAgent
        .patch(`/api/staff/tickets/${ticket.id}/priority`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ itPriority: "HIGH" })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    // API-32 / API-49
    it("changes itPriority without touching requestedPriority (BR-20/BR-19)", async () => {
      const ticket = await createTicket({ requestedPriority: "LOW", itPriority: "LOW" });
      const response = await staffAAgent
        .patch(`/api/staff/tickets/${ticket.id}/priority`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ itPriority: "HIGH", requestedPriority: "MEDIUM" })
        .expect(200);

      expect(response.body.itPriority).toBe("HIGH");
      // requestedPriority is immutable by construction — no route accepts a
      // change to it (API-49) — a stray field in the body is just ignored.
      expect(response.body.requestedPriority).toBe("LOW");
    });

    // API-33
    it("rejects an invalid itPriority value", async () => {
      const ticket = await createTicket();
      const response = await staffAAgent
        .patch(`/api/staff/tickets/${ticket.id}/priority`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ itPriority: "URGENT" })
        .expect(400);
      expect(response.body.errors.itPriority).toBeDefined();
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await staffAAgent
        .patch("/api/staff/tickets/999999/priority")
        .set("Origin", CLIENT_ORIGIN)
        .send({ itPriority: "HIGH" })
        .expect(404);
      expect(response.body.error).toBeDefined();
    });
  });

  describe("PATCH /api/staff/tickets/:id/status", () => {
    it("rejects an unauthenticated request", async () => {
      const ticket = await createTicket();
      const response = await request(app)
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ currentStatus: "OPEN" })
        .expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-55 / AC-20b
    it("rejects an Administrator session", async () => {
      const ticket = await createTicket();
      const response = await adminAgent
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ currentStatus: "OPEN" })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    // API-36
    it("rejects a Requester session, even for a legal transition", async () => {
      const ticket = await createTicket({ currentStatus: "NEW" });
      const response = await requesterAgent
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ currentStatus: "OPEN" })
        .expect(403);
      expect(response.body.error).toBeDefined();
    });

    // API-50 — transition rights aren't owner-restricted, distinct from
    // API-34/58 below which don't vary the caller's owner-vs-not relationship.
    it("lets an IT Staff caller who is not the ticket's owner transition its status", async () => {
      const ticket = await createTicket({ currentStatus: "NEW", ownerId: staffAId });
      const response = await staffBAgent
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ currentStatus: "OPEN" })
        .expect(200);
      expect(response.body.currentStatus).toBe("OPEN");
    });

    it("rejects an unrecognized currentStatus value", async () => {
      const ticket = await createTicket({ currentStatus: "NEW" });
      const response = await staffAAgent
        .patch(`/api/staff/tickets/${ticket.id}/status`)
        .set("Origin", CLIENT_ORIGIN)
        .send({ currentStatus: "Open" })
        .expect(400);
      expect(response.body.errors.currentStatus).toBeDefined();
    });

    it("rejects a ticket id that does not exist", async () => {
      const response = await staffAAgent
        .patch("/api/staff/tickets/999999/status")
        .set("Origin", CLIENT_ORIGIN)
        .send({ currentStatus: "OPEN" })
        .expect(404);
      expect(response.body.error).toBeDefined();
    });

    // API-34: every ✅ cell in the matrix, confirm: true sent on every call
    // (isolates legality from BR-42's confirmation requirement).
    describe("every legal transition (API-34)", () => {
      for (const from of ALL_STATUSES) {
        for (const to of STATUS_TRANSITIONS[from]) {
          it(`${from} -> ${to} succeeds`, async () => {
            const ticket = await createTicket({ currentStatus: from });
            const response = await staffAAgent
              .patch(`/api/staff/tickets/${ticket.id}/status`)
              .set("Origin", CLIENT_ORIGIN)
              .send({ currentStatus: to, confirm: true })
              .expect(200);
            expect(response.body.currentStatus).toBe(to);
          });
        }
      }
    });

    // API-35: every self-transition, plus one illegal jump per row —
    // confirm: true sent on every call too, so this isolates matrix
    // legality (409) from BR-42.
    describe("illegal transitions are rejected 409 (API-35)", () => {
      for (const status of ALL_STATUSES) {
        it(`${status} -> ${status} (self-transition) is rejected`, async () => {
          const ticket = await createTicket({ currentStatus: status });
          const response = await staffAAgent
            .patch(`/api/staff/tickets/${ticket.id}/status`)
            .set("Origin", CLIENT_ORIGIN)
            .send({ currentStatus: status, confirm: true })
            .expect(409);
          expect(response.body.error).toBeDefined();

          const row = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
          expect(row.currentStatus).toBe(status);
        });
      }

      const illegalJumps: [TicketStatus, TicketStatus][] = [
        ["NEW", "RESOLVED"],
        ["OPEN", "NEW"],
        ["IN_PROGRESS", "OPEN"],
        ["WAITING_FOR_REQUESTER", "OPEN"],
        ["RESOLVED", "NEW"],
        ["CLOSED", "NEW"],
        ["REOPENED", "CLOSED"],
        ["CANCELLED", "NEW"],
      ];
      for (const [from, to] of illegalJumps) {
        it(`${from} -> ${to} is rejected`, async () => {
          const ticket = await createTicket({ currentStatus: from });
          const response = await staffAAgent
            .patch(`/api/staff/tickets/${ticket.id}/status`)
            .set("Origin", CLIENT_ORIGIN)
            .send({ currentStatus: to, confirm: true })
            .expect(409);
          expect(response.body.error).toBeDefined();

          const row = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
          expect(row.currentStatus).toBe(from);
        });
      }
    });

    // API-57/58/59/60 — BR-42's confirmation requirement.
    describe("confirmation requirement (BR-42, API-57..60)", () => {
      it.each([
        ["IN_PROGRESS", "RESOLVED"],
        ["RESOLVED", "CLOSED"],
        ["RESOLVED", "REOPENED"],
        ["IN_PROGRESS", "CANCELLED"],
      ] as [TicketStatus, TicketStatus][])(
        "API-57: %s -> %s with confirm omitted, and again with confirm:false, are both 400",
        async (from, to) => {
          const omittedTicket = await createTicket({ currentStatus: from });
          const omitted = await staffAAgent
            .patch(`/api/staff/tickets/${omittedTicket.id}/status`)
            .set("Origin", CLIENT_ORIGIN)
            .send({ currentStatus: to })
            .expect(400);
          expect(omitted.body.errors.confirm).toBeDefined();

          const falseTicket = await createTicket({ currentStatus: from });
          const falseResponse = await staffAAgent
            .patch(`/api/staff/tickets/${falseTicket.id}/status`)
            .set("Origin", CLIENT_ORIGIN)
            .send({ currentStatus: to, confirm: false })
            .expect(400);
          expect(falseResponse.body.errors.confirm).toBeDefined();

          for (const t of [omittedTicket, falseTicket]) {
            const row = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
            expect(row.currentStatus).toBe(from);
          }
        }
      );

      it.each([
        ["IN_PROGRESS", "RESOLVED"],
        ["RESOLVED", "CLOSED"],
        ["RESOLVED", "REOPENED"],
        ["IN_PROGRESS", "CANCELLED"],
      ] as [TicketStatus, TicketStatus][])("API-58: %s -> %s with confirm:true is 200", async (from, to) => {
        const ticket = await createTicket({ currentStatus: from });
        const response = await staffAAgent
          .patch(`/api/staff/tickets/${ticket.id}/status`)
          .set("Origin", CLIENT_ORIGIN)
          .send({ currentStatus: to, confirm: true })
          .expect(200);
        expect(response.body.currentStatus).toBe(to);
      });

      // API-59
      it("a target not in the confirmation list succeeds with confirm omitted", async () => {
        const ticket = await createTicket({ currentStatus: "NEW" });
        const response = await staffAAgent
          .patch(`/api/staff/tickets/${ticket.id}/status`)
          .set("Origin", CLIENT_ORIGIN)
          .send({ currentStatus: "IN_PROGRESS" })
          .expect(200);
        expect(response.body.currentStatus).toBe("IN_PROGRESS");
      });

      // API-60 — confirmation check runs before the legality check: an
      // illegal-AND-unconfirmed request is 400, not 409.
      it("an illegal transition to a confirm-required target with confirm missing is 400, not 409", async () => {
        const ticket = await createTicket({ currentStatus: "NEW" });
        const response = await staffAAgent
          .patch(`/api/staff/tickets/${ticket.id}/status`)
          .set("Origin", CLIENT_ORIGIN)
          .send({ currentStatus: "CLOSED" })
          .expect(400);
        expect(response.body.errors.confirm).toBeDefined();
      });
    });
  });

  describe("GET /api/staff/assignable-users", () => {
    it("rejects an unauthenticated request", async () => {
      const response = await request(app).get("/api/staff/assignable-users").expect(401);
      expect(response.body.error).toBeDefined();
    });

    // API-53
    it("returns only active IT Staff users, ordered by name asc, for an IT Staff caller", async () => {
      const response = await staffAAgent.get("/api/staff/assignable-users").expect(200);

      const ids = response.body.map((u: { id: number }) => u.id);
      expect(ids).toContain(staffAId);
      expect(ids).toContain(staffBId);
      expect(ids).not.toContain(inactiveStaffId);
      expect(ids).not.toContain(requesterId);

      for (const user of response.body) {
        expect(user).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
        expect(user).not.toHaveProperty("passwordHash");
        expect(user).not.toHaveProperty("role");
      }

      const names = response.body.map((u: { name: string }) => u.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it("excludes Administrator accounts", async () => {
      const prisma = getPrisma();
      const admin = await prisma.user.findFirstOrThrow({ where: { email: adminEmail } });
      const response = await staffAAgent.get("/api/staff/assignable-users").expect(200);
      const ids = response.body.map((u: { id: number }) => u.id);
      expect(ids).not.toContain(admin.id);
    });

    it("rejects a Requester session", async () => {
      const response = await requesterAgent.get("/api/staff/assignable-users").expect(403);
      expect(response.body.error).toBeDefined();
    });

    it("rejects an Administrator session", async () => {
      const response = await adminAgent.get("/api/staff/assignable-users").expect(403);
      expect(response.body.error).toBeDefined();
    });
  });
});
