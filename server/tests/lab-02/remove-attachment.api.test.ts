import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Mirrors server/src/app.ts's own UPLOAD_DIR computation.
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");

// Some attachments in this file are deliberately left active (rejected/
// wrong-ticket removal attempts) — the server only deletes a file when it
// actually removes the attachment, so this file's own fixtures must clean
// up whatever's still on disk for them, the same as inspect-attachments'.
async function deleteUploadedFiles(ticketIds: number[]) {
  const prisma = getPrisma();
  const attachments = await prisma.attachment.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { storedFilename: true },
  });
  for (const { storedFilename } of attachments) {
    try {
      unlinkSync(path.join(UPLOAD_DIR, storedFilename));
    } catch {
      // Already gone (the endpoint itself deletes the file on a
      // successful removal) — nothing to clean up.
    }
  }
}

// Lab 3 (tests.md §2.3, API-12): re-run against session auth. BR-14 tightens
// the cross-Requester rejection from Lab 2's 403 to 404 (§2.9, category 1).
describe("DELETE /api/tickets/:id/attachments/:attachmentId (soft removal)", () => {
  const ownerEmail = "remove-attachment-owner-fixture@toktickit.test";
  const otherEmail = "remove-attachment-other-fixture@toktickit.test";
  let ownerAgent: request.Agent;
  let otherAgent: request.Agent;
  let ownerRequesterId: number;
  let otherRequesterId: number;
  let ticketId: number;
  let otherTicketId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const { user: owner } = await createFixtureUser(ownerEmail);
    const { user: other } = await createFixtureUser(otherEmail);
    ownerAgent = await loginAgent(ownerEmail);
    otherAgent = await loginAgent(otherEmail);
    ownerRequesterId = owner.id;
    otherRequesterId = other.id;

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-REMOVE-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Remove-attachment test ticket",
        description: "Fixture for DELETE /api/tickets/:id/attachments/:attachmentId.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });
    ticketId = ticket.id;
    createdTicketIds.push(ticket.id);

    const otherTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-REMOVE-OTHER-${Date.now()}`,
        requesterId: otherRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Other ticket for cross-ticket removal test",
        description: "Fixture.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });
    otherTicketId = otherTicket.id;
    createdTicketIds.push(otherTicket.id);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await deleteUploadedFiles(createdTicketIds);
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    await deleteFixtureUser(ownerEmail);
    await deleteFixtureUser(otherEmail);
  });

  async function uploadFixtureAttachment(
    forTicketId: number,
    agent: request.Agent,
    filename = "to-remove.png"
  ) {
    const response = await agent
      .post(`/api/tickets/${forTicketId}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("fake bytes"), { filename, contentType: "image/png" })
      .expect(201);
    return response.body as { id: number; storedFilename: string };
  }

  it("rejects an unauthenticated request", async () => {
    const response = await request(app)
      .delete(`/api/tickets/${ticketId}/attachments/1`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(401);
    expect(response.body.error).toBeDefined();
  });

  it("rejects a session whose role is not REQUESTER", async () => {
    const staffEmail = "remove-attachment-staff-fixture@toktickit.test";
    await createFixtureUser(staffEmail, { role: "IT_STAFF" });
    const staffAgent = await loginAgent(staffEmail);

    const response = await staffAgent
      .delete(`/api/tickets/${ticketId}/attachments/1`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(403);
    expect(response.body.error).toBeDefined();

    await deleteFixtureUser(staffEmail);
  });

  it("soft-removes the attachment: sets removedAt, keeps the row, deletes the file", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent);
    const filePath = path.join(UPLOAD_DIR, uploaded.storedFilename);
    expect(existsSync(filePath)).toBe(true);

    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(200);

    expect(response.body).toMatchObject({
      id: uploaded.id,
      ticketId,
      originalFilename: "to-remove.png",
    });
    expect(response.body.removedAt).not.toBeNull();
    expect(response.body).not.toHaveProperty("storedFilename");

    // Metadata retained (BR-14) — the row itself is still there, just marked.
    const row = await getPrisma().attachment.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(row.removedAt).not.toBeNull();
    expect(row.originalFilename).toBe("to-remove.png");

    // Physical file actually deleted.
    expect(existsSync(filePath)).toBe(false);
  });

  it("still appears in the attachment list after removal, marked with removedAt (BR-14: visible as metadata)", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "list-me-then-remove.png");

    await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(200);

    const listResponse = await ownerAgent.get(`/api/tickets/${ticketId}/attachments`).expect(200);

    const entry = listResponse.body.find((a: { id: number }) => a.id === uploaded.id);
    expect(entry).toBeDefined();
    expect(entry.removedAt).not.toBeNull();
    expect(entry.originalFilename).toBe("list-me-then-remove.png");
    expect(entry).not.toHaveProperty("storedFilename");
  });

  it("captures an optional removal reason", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "with-reason.png");

    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .send({ reason: "Uploaded the wrong file" })
      .expect(200);

    expect(response.body.removalReason).toBe("Uploaded the wrong file");

    const row = await getPrisma().attachment.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(row.removalReason).toBe("Uploaded the wrong file");
  });

  it("records a null removal reason when none is given", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "no-reason.png");

    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(200);

    expect(response.body.removalReason).toBeNull();
  });

  it("rejects a removal reason over 500 characters", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "reason-too-long.png");

    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .send({ reason: "a".repeat(501) })
      .expect(400);

    expect(response.body.error).toBeDefined();

    // Rejected — the attachment itself is untouched.
    const row = await getPrisma().attachment.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(row.removedAt).toBeNull();
  });

  it("blocks downloading a removed attachment (404, same as not existing)", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "download-then-remove.png");

    await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(200);

    const response = await ownerAgent.get(`/api/tickets/${ticketId}/attachments/${uploaded.id}`).expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("does not count toward the 5-active-attachment upload limit", async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const limitTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-REMOVE-LIMIT-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Removal + limit interaction ticket",
        description: "5 uploads, remove 1, a 6th should now succeed.",
        requestedPriority: "LOW",
        itPriority: "LOW",
      },
    });
    createdTicketIds.push(limitTicket.id);

    const uploaded: { id: number }[] = [];
    for (let i = 0; i < 5; i++) {
      uploaded.push(await uploadFixtureAttachment(limitTicket.id, ownerAgent, `file-${i}.png`));
    }

    // At the limit — a 6th is rejected.
    await ownerAgent
      .post(`/api/tickets/${limitTicket.id}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("one too many"), {
        filename: "one-too-many.png",
        contentType: "image/png",
      })
      .expect(409);

    // Remove one — frees up a slot.
    await ownerAgent
      .delete(`/api/tickets/${limitTicket.id}/attachments/${uploaded[0].id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(200);

    await ownerAgent
      .post(`/api/tickets/${limitTicket.id}/attachments`)
      .set("Origin", CLIENT_ORIGIN)
      .attach("file", Buffer.from("now there's room"), {
        filename: "now-fits.png",
        contentType: "image/png",
      })
      .expect(201);
  });

  // BR-14 / AC-11
  it("returns 404 (not 403) for a Requester who does not own the ticket", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "not-yours-to-remove.png");

    const response = await otherAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(404);

    expect(response.body.error).toBeDefined();

    // Untouched — still active.
    const row = await getPrisma().attachment.findUniqueOrThrow({ where: { id: uploaded.id } });
    expect(row.removedAt).toBeNull();
  });

  it("rejects removing an attachment that belongs to a different ticket", async () => {
    const uploaded = await uploadFixtureAttachment(otherTicketId, otherAgent, "belongs-elsewhere.png");

    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects removing an attachment that is already removed", async () => {
    const uploaded = await uploadFixtureAttachment(ticketId, ownerAgent, "double-remove.png");

    await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(200);

    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/${uploaded.id}`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a ticket id that does not exist", async () => {
    const response = await ownerAgent
      .delete("/api/tickets/999999/attachments/1")
      .set("Origin", CLIENT_ORIGIN)
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an attachment id that does not exist", async () => {
    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/999999`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric ticket id", async () => {
    const response = await ownerAgent
      .delete("/api/tickets/not-a-number/attachments/1")
      .set("Origin", CLIENT_ORIGIN)
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric attachment id", async () => {
    const response = await ownerAgent
      .delete(`/api/tickets/${ticketId}/attachments/not-a-number`)
      .set("Origin", CLIENT_ORIGIN)
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});
