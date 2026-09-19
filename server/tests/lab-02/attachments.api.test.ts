import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("POST /api/tickets/:id/attachments", () => {
  let ticketId: number;
  let ownerRequesterId: number;
  let otherRequesterId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();

    const requester = await prisma.requester.findFirstOrThrow({
      where: { isActive: true },
    });
    const anotherRequester = await prisma.requester.findFirstOrThrow({
      where: { isActive: true, NOT: { id: requester.id } },
    });
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
    });

    ownerRequesterId = requester.id;
    otherRequesterId = anotherRequester.id;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-${Date.now()}`,
        requesterId: ownerRequesterId,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment test ticket",
        description: "Created for attachment upload tests.",
        requestedPriority: "LOW",
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
  });

  it("uploads a permitted file and returns its metadata", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
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
    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .attach("file", Buffer.from("#!/bin/sh\necho hi"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      })
      .expect(415);

    expect(response.body.error).toBeDefined();
  });

  it("rejects a file larger than 5MB", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);

    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .attach("file", oversized, {
        filename: "big.png",
        contentType: "image/png",
      })
      .expect(413);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an upload with no file", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an upload with no requesterId", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .attach("file", Buffer.from("fake"), {
        filename: "note.pdf",
        contentType: "application/pdf",
      })
      .expect(400);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an upload to a ticket that does not exist", async () => {
    const response = await request(app)
      .post(`/api/tickets/999999/attachments`)
      .field("requesterId", String(ownerRequesterId))
      .attach("file", Buffer.from("fake"), {
        filename: "note.pdf",
        contentType: "application/pdf",
      })
      .expect(404);

    expect(response.body.error).toBeDefined();
  });

  it("rejects an upload from a requester who does not own the ticket", async () => {
    const response = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(otherRequesterId))
      .attach("file", Buffer.from("fake"), {
        filename: "note.pdf",
        contentType: "application/pdf",
      })
      .expect(403);

    expect(response.body.error).toBeDefined();

    const attachments = await getPrisma().attachment.findMany({
      where: { ticketId, originalFilename: "note.pdf" },
    });
    expect(attachments).toHaveLength(0);
  });

  it("rejects a 6th active attachment on the same ticket", async () => {
    const prisma = getPrisma();
    const requester = await prisma.requester.findFirstOrThrow({
      where: { isActive: true },
    });
    const category = await prisma.category.findFirstOrThrow({
      where: { isActive: true },
    });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({
      where: { isActive: true },
    });
    const limitTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-LIMIT-${Date.now()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Attachment limit test ticket",
        description: "A fresh ticket so this test owns its own count of 5.",
        requestedPriority: "LOW",
      },
    });
    createdTicketIds.push(limitTicket.id);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/api/tickets/${limitTicket.id}/attachments`)
        .field("requesterId", String(requester.id))
        .attach("file", Buffer.from(`file-${i}`), {
          filename: `file-${i}.png`,
          contentType: "image/png",
        })
        .expect(201);
    }

    const response = await request(app)
      .post(`/api/tickets/${limitTicket.id}/attachments`)
      .field("requesterId", String(requester.id))
      .attach("file", Buffer.from("one too many"), {
        filename: "one-too-many.png",
        contentType: "image/png",
      })
      .expect(409);

    expect(response.body.error).toBeDefined();
  });
});
