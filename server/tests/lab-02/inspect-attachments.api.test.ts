import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Mirrors server/src/app.ts's own UPLOAD_DIR computation, one directory
// level deeper (tests/lab-02 instead of src).
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");

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
      // Already gone (or never written for a fixture created directly via
      // Prisma) — nothing to clean up.
    }
  }
}

describe("GET /api/tickets/:id/attachments (list)", () => {
  let ownerRequesterId: number;
  let otherRequesterId: number;
  let ticketWithAttachmentsId: number;
  let ticketWithNoAttachmentsId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const owner = await prisma.requester.findFirstOrThrow({ where: { isActive: true } });
    const other = await prisma.requester.findFirstOrThrow({
      where: { isActive: true, NOT: { id: owner.id } },
    });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    ownerRequesterId = owner.id;
    otherRequesterId = other.id;

    async function createTicket(summary: string) {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: `TEST-INSPECT-${Date.now()}-${Math.random()}`,
          requesterId: ownerRequesterId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary,
          description: "Inspect-attachments list test fixture.",
          requestedPriority: "LOW",
        },
      });
      createdTicketIds.push(ticket.id);
      return ticket.id;
    }

    ticketWithAttachmentsId = await createTicket("Ticket with attachments");
    ticketWithNoAttachmentsId = await createTicket("Ticket with no attachments");

    await request(app)
      .post(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .attach("file", Buffer.from("fake image bytes 1"), {
        filename: "one.png",
        contentType: "image/png",
      })
      .expect(201);
    await request(app)
      .post(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .attach("file", Buffer.from("fake pdf bytes"), {
        filename: "two.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await deleteUploadedFiles(createdTicketIds);
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  });

  it("returns the ticket's attachments to its owning Requester", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    expect(response.body).toHaveLength(2);
    const filenames = response.body.map((a: { originalFilename: string }) => a.originalFilename);
    expect(filenames).toEqual(["one.png", "two.pdf"]);
    for (const attachment of response.body) {
      expect(attachment.ticketId).toBe(ticketWithAttachmentsId);
    }
  });

  it("returns only public attachment metadata, not the internal storedFilename", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    for (const attachment of response.body) {
      expect(attachment).not.toHaveProperty("storedFilename");
      expect(Object.keys(attachment).sort()).toEqual(
        ["createdAt", "id", "mimeType", "originalFilename", "removedAt", "sizeBytes", "ticketId"].sort()
      );
      expect(attachment.removedAt).toBeNull();
    }
  });

  it("breaks a createdAt tie with id asc, so order stays predictable", async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    const tieTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-INSPECT-TIE-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Tie-break attachments ticket",
        description: "Two attachments with the exact same createdAt, on purpose.",
        requestedPriority: "LOW",
      },
    });
    createdTicketIds.push(tieTicket.id);

    const sameInstant = new Date();
    const first = await prisma.attachment.create({
      data: {
        ticketId: tieTicket.id,
        originalFilename: "first.png",
        storedFilename: `tie-test-first-${Date.now()}.png`,
        mimeType: "image/png",
        sizeBytes: 1,
        createdAt: sameInstant,
      },
    });
    const second = await prisma.attachment.create({
      data: {
        ticketId: tieTicket.id,
        originalFilename: "second.png",
        storedFilename: `tie-test-second-${Date.now()}.png`,
        mimeType: "image/png",
        sizeBytes: 1,
        createdAt: sameInstant,
      },
    });

    const response = await request(app)
      .get(`/api/tickets/${tieTicket.id}/attachments`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    expect(response.body.map((a: { id: number }) => a.id)).toEqual([first.id, second.id]);
  });

  it("returns an empty array for a ticket with no attachments", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketWithNoAttachmentsId}/attachments`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it("rejects a Requester who does not own the ticket", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .query({ requesterId: otherRequesterId })
      .expect(403);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a ticket id that does not exist", async () => {
    const response = await request(app)
      .get("/api/tickets/999999/attachments")
      .query({ requesterId: ownerRequesterId })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric ticket id", async () => {
    const response = await request(app)
      .get("/api/tickets/not-a-number/attachments")
      .query({ requesterId: ownerRequesterId })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a missing requesterId", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric requesterId", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketWithAttachmentsId}/attachments`)
      .query({ requesterId: "abc" })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});

describe("GET /api/tickets/:id/attachments/:attachmentId (view/download)", () => {
  let ownerRequesterId: number;
  let otherRequesterId: number;
  let ticketId: number;
  let otherTicketId: number;
  let attachmentId: number;
  let otherTicketAttachmentId: number;
  const createdTicketIds: number[] = [];
  const fileContents = "fake image bytes for download test";

  beforeAll(async () => {
    const prisma = getPrisma();

    const owner = await prisma.requester.findFirstOrThrow({ where: { isActive: true } });
    const other = await prisma.requester.findFirstOrThrow({
      where: { isActive: true, NOT: { id: owner.id } },
    });
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

    ownerRequesterId = owner.id;
    otherRequesterId = other.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-DOWNLOAD-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Download test ticket",
        description: "Inspect-attachments download test fixture.",
        requestedPriority: "LOW",
      },
    });
    ticketId = ticket.id;
    createdTicketIds.push(ticket.id);

    const upload = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .attach("file", Buffer.from(fileContents), {
        filename: "download-me.png",
        contentType: "image/png",
      })
      .expect(201);
    attachmentId = upload.body.id;

    // A second ticket + attachment, to prove an attachment id that exists
    // but belongs to a *different* ticket is rejected as not-found here.
    const anotherOwner = await prisma.requester.findFirstOrThrow({
      where: { isActive: true, NOT: { id: ownerRequesterId } },
    });
    const otherTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-DOWNLOAD-OTHER-${Date.now()}`,
        requesterId: anotherOwner.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Other ticket for cross-ticket attachment test",
        description: "Fixture.",
        requestedPriority: "LOW",
      },
    });
    otherTicketId = otherTicket.id;
    createdTicketIds.push(otherTicket.id);

    const otherUpload = await request(app)
      .post(`/api/tickets/${otherTicketId}/attachments`)
      .field("requesterId", String(anotherOwner.id))
      .attach("file", Buffer.from("belongs to another ticket"), {
        filename: "not-yours.png",
        contentType: "image/png",
      })
      .expect(201);
    otherTicketAttachmentId = otherUpload.body.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await deleteUploadedFiles(createdTicketIds);
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
  });

  it("returns the file to its owning Requester", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    expect(response.headers["content-type"]).toContain("image/png");
    expect(Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.text)).toEqual(
      Buffer.from(fileContents)
    );
  });

  it("sends a UTF-8-safe Content-Disposition for a filename with a space and a non-ASCII character", async () => {
    // Set the stored name directly via Prisma rather than through the
    // multipart upload — busboy/multer's own default (latin1) decoding of
    // multipart filename headers is a separate, pre-existing concern (see
    // tests.md's Known Gaps); this test is only about what the *download*
    // endpoint does with whatever originalFilename is already on the row.
    await getPrisma().attachment.update({
      where: { id: attachmentId },
      data: { originalFilename: "café photo.png" },
    });

    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
      .query({ requesterId: ownerRequesterId })
      .expect(200);

    // The plain `filename=` fallback must not be percent-encoded (that would
    // display literally, e.g. "caf%C3%A9%20photo.png"); the real name is
    // carried by `filename*` per RFC 6266/5987.
    expect(response.headers["content-disposition"]).toBe(
      "inline; filename=\"caf_ photo.png\"; filename*=UTF-8''caf%C3%A9%20photo.png"
    );

    // Restore it — this attachment/ticket is reused by later tests in this
    // describe block.
    await getPrisma().attachment.update({
      where: { id: attachmentId },
      data: { originalFilename: "download-me.png" },
    });
  });

  it("rejects a Requester who does not own the ticket", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
      .query({ requesterId: otherRequesterId })
      .expect(403);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a ticket id that does not exist", async () => {
    const response = await request(app)
      .get(`/api/tickets/999999/attachments/${attachmentId}`)
      .query({ requesterId: ownerRequesterId })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an attachment id that belongs to a different ticket", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${otherTicketAttachmentId}`)
      .query({ requesterId: ownerRequesterId })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an attachment id that does not exist", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/999999`)
      .query({ requesterId: ownerRequesterId })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a non-numeric attachment id", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/not-a-number`)
      .query({ requesterId: ownerRequesterId })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a missing requesterId", async () => {
    const response = await request(app)
      .get(`/api/tickets/${ticketId}/attachments/${attachmentId}`)
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});
