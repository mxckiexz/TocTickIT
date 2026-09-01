import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { getPrisma } from "./prisma.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "TokTickIT API",
  });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    res.status(200).json(categories);
  } catch (error) {
    console.error("Failed to retrieve categories:", error);

    res.status(500).json({
      error: "Failed to retrieve categories",
    });
  }
});

// ---------------------------------------------------------------------------
// Feature 1 — Create an IT support ticket (POST /api/tickets)
// ---------------------------------------------------------------------------
const REQUESTED_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const SUMMARY_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 2000;

app.post("/api/tickets", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const { requesterId, categoryId, relatedSystemId, requestedPriority } = body;

  const errors: Record<string, string> = {};

  if (!Number.isInteger(requesterId)) {
    errors.requesterId = "Requester is required.";
  }
  if (!Number.isInteger(categoryId)) {
    errors.categoryId = "Category is required.";
  }
  if (!Number.isInteger(relatedSystemId)) {
    errors.relatedSystemId = "Related System is required.";
  }

  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!summary) {
    errors.summary = "Summary is required.";
  } else if (summary.length > SUMMARY_MAX_LENGTH) {
    errors.summary = `Summary must be ${SUMMARY_MAX_LENGTH} characters or fewer.`;
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    errors.description = "Description is required.";
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (!REQUESTED_PRIORITIES.includes(requestedPriority)) {
    errors.requestedPriority = "Requested priority must be LOW, MEDIUM, or HIGH.";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const prisma = getPrisma();

    const [requester, category, relatedSystem] = await Promise.all([
      prisma.requester.findFirst({ where: { id: requesterId, isActive: true } }),
      prisma.category.findFirst({ where: { id: categoryId, isActive: true } }),
      prisma.relatedSystem.findFirst({ where: { id: relatedSystemId, isActive: true } }),
    ]);

    if (!requester) errors.requesterId = "Selected Requester is not valid or is no longer active.";
    if (!category) errors.categoryId = "Selected Category is not valid or is no longer active.";
    if (!relatedSystem) errors.relatedSystemId = "Selected Related System is not valid or is no longer active.";

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    // BR-01: the Ticket Number is backend-generated and unique. It is derived
    // from the row's own auto-increment id after insert, so a random
    // placeholder is used only to satisfy the NOT NULL/unique column briefly
    // without a collision between concurrent requests.
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          ticketNumber: `PENDING-${randomUUID()}`,
          requesterId,
          categoryId,
          relatedSystemId,
          summary,
          description,
          requestedPriority,
        },
      });

      const ticketNumber = `TKT-${created.createdAt.getFullYear()}-${String(created.id).padStart(6, "0")}`;

      return tx.ticket.update({
        where: { id: created.id },
        data: { ticketNumber },
      });
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error("Failed to create ticket:", error);

    res.status(500).json({ error: "Failed to create ticket" });
  }
});

export default app;