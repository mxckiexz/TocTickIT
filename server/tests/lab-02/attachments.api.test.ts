import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 3 (tests.md §2.3, API-12): re-run against session auth — requesterId
// is no longer a form field (FR-08/BR-03), and the cross-Requester rejection
// tightens Lab 2's 403 to 404 (BR-14, §2.9 category 1).
describe("POST /api/tickets/:id/attachments", () => {
  const ownerEmail = "attachments-owner-fixture@toktickit.test";
  const otherEmail = "attachments-other-fixture@toktickit.test";
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
        ticketNumber: `TEST-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment test ticket",
        description: "Created for attachment upload tests.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });

    ticketId = ticket.id;
    createdTicketIds.push(ticket.id);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.attachment.deleteMany({
      where: { ticketId: { in: createdTicketIds } },
    });
    await prisma.ticket.deleteMany({
      where: { id: { in: createdTicketIds } },
    });
    await deleteFixtureUser(ownerEmail);
    await deleteFixtureUser(otherEmail);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("fake"), { filename: "note.pdf", contentType: "application/pdf" })
      .expect(401);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a session whose role is not REQUESTER", async () => {
    const staffEmail = "attachments-staff-fixture@toktickit.test";
    await createFixtureUser(staffEmail, { role: "IT_STAFF" });
    const staffAgent = await loginAgent(staffEmail);

    const response = await staffAgent
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("fake"), { filename: "note.pdf", contentType: "application/pdf" })
      .expect(403);
    expect(response.body.error).toBeDefined();

    await deleteFixtureUser(staffEmail);
  });

  it("uploads a permitted file and returns its metadata", async () => {
    const response = await ownerAgent
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("fake image bytes"), {
        filename: "screenshot.png",
        contentType: "image/png",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      ticketId,
      originalFilename: "screenshot.png",
      mimeType: "image/png",
      sizeBytes: Buffer.byteLength("fake image bytes"),
    });
    expect(response.body.storedFilename).not.toBe("screenshot.png");

    const saved = await getPrisma().attachment.findUnique({
      where: { id: response.body.id },
    });
    expect(saved).not.toBeNull();
  });

  it("rejects an unsupported file type", async () => {
    const response = await ownerAgent
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("#!/bin/sh\necho hi"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      })
      .expect(415);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a file larger than 5MB", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);

    const response = await ownerAgent
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", oversized, {
        filename: "big.png",
        contentType: "image/png",
      })
      .expect(413);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an upload with no file", async () => {
    const response = await ownerAgent
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an upload to a ticket that does not exist", async () => {
    const response = await ownerAgent
      .post(`/api/tickets/999999/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("fake"), {
        filename: "note.pdf",
        contentType: "application/pdf",
      })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  // BR-14 / AC-11: 404, not 403, for a ticket that isn't the caller's.
  it("returns 404 (not 403) for a Requester who does not own the ticket", async () => {
    const response = await otherAgent
      .post(`/api/tickets/${ticketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("fake"), {
        filename: "note.pdf",
        contentType: "application/pdf",
      })
      .expect(404);

    expect(response.body.error).toBeDefined();

    const attachments = await getPrisma().attachment.findMany({
      where: { ticketId, originalFilename: "note.pdf" },
    });
    expect(attachments).toHaveLength(0);
  });

  it("rejects a 6th active attachment on the same ticket", async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const limitTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-LIMIT-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment limit test ticket",
        description: "A fresh ticket so this test owns its own count of 5.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });
    createdTicketIds.push(limitTicket.id);

    for (let i = 0; i < 5; i++) {
      await ownerAgent
        .post(`/api/tickets/${limitTicket.id}/attachments`)
        .set("Origin", CLIENT_ORIGIN)
        .attach("file", Buffer.from(`file-${i}`), {
          filename: `file-${i}.png`,
          contentType: "image/png",
        })
        .expect(201);
    }

    const response = await ownerAgent
      .post(`/api/tickets/${limitTicket.id}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("one too many"), {
        filename: "one-too-many.png",
        contentType: "image/png",
      })
      .expect(409);

    expect(response.body.error).toBeDefined();
  });
});
