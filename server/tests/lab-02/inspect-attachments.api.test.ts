import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

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
