import express, { Request, Response } from "express";
import cors from "cors";
import multer, { MulterError } from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
      where: { isActive: true },
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
// Feature 3 — lookup lists the ticket-creation form needs
// ---------------------------------------------------------------------------
app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    const relatedSystems = await prisma.relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(relatedSystems);
  } catch (error) {
    console.error("Failed to retrieve related systems:", error);

    res.status(500).json({
      error: "Failed to retrieve related systems",
    });
  }
});

// Lab 2 stand-in for authentication: the client fetches the active
// Requesters and lets the user pick which one they are "logged in" as.
app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();

    const requesters = await prisma.requester.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { id: "asc" },
    });

    res.status(200).json(requesters);
  } catch (error) {
    console.error("Failed to retrieve requesters:", error);

    res.status(500).json({
      error: "Failed to retrieve requesters",
    });
  }
});

// ---------------------------------------------------------------------------
// Feature 1 — Create an IT support ticket (POST /api/tickets)
// ---------------------------------------------------------------------------
const REQUESTED_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const SUMMARY_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 2000;
// BR-02: duplicate-submission prevention. A resubmission of the exact same
// ticket content by the same Requester within this window (e.g. a double
// click or a retried request) returns the ticket already created instead of
// inserting a second row.
const DUPLICATE_SUBMISSION_WINDOW_MS = 10_000;

app.post("/api/tickets", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const { requesterId, categoryId, relatedSystemId, requestedPriority } = body;

  const errors: Record<string, string> = {};

  // Ids are positive (autoincrement starts at 1) — 0 is what an empty <select>
  // coerces to via Number(""), and it's still a valid integer, so it must be
  // rejected explicitly rather than just checked with Number.isInteger.
  if (!Number.isInteger(requesterId) || requesterId <= 0) {
    errors.requesterId = "Requester is required.";
  }
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    errors.categoryId = "Category is required.";
  }
  if (!Number.isInteger(relatedSystemId) || relatedSystemId <= 0) {
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

    const duplicate = await prisma.ticket.findFirst({
      where: {
        requesterId,
        categoryId,
        relatedSystemId,
        summary,
        description,
        requestedPriority,
        createdAt: {
          gte: new Date(Date.now() - DUPLICATE_SUBMISSION_WINDOW_MS),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (duplicate) {
      return res.status(200).json(duplicate);
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

// ---------------------------------------------------------------------------
// Feature 2 — Upload a permitted supporting attachment
// (POST /api/tickets/:id/attachments)
// ---------------------------------------------------------------------------
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ACTIVE_ATTACHMENTS_PER_TICKET = 5;

const UPLOAD_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads"
);
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Never trust the client-supplied filename for the path on disk — only
    // its extension is reused, everything else is a fresh random id.
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
});

app.post(
  "/api/tickets/:id/attachments",
  (req: Request, res: Response, next) => {
    upload.single("file")(req, res, (error: unknown) => {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `File exceeds the ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB limit.`,
        });
      }
      if (error) {
        return res.status(400).json({ error: "Upload failed." });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const ticketId = Number(req.params.id);
    // multer places non-file multipart fields on req.body alongside req.file.
    const requesterId = Number(req.body.requesterId);
    const file = req.file;

    if (!Number.isInteger(ticketId)) {
      if (file) unlink(file.path, () => {});
      return res.status(400).json({ error: "Invalid ticket id." });
    }
    if (!Number.isInteger(requesterId) || requesterId <= 0) {
      if (file) unlink(file.path, () => {});
      return res.status(400).json({ error: "Requester is required." });
    }
    if (!file) {
      return res.status(400).json({ error: "A file is required." });
    }
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      unlink(file.path, () => {});
      return res.status(415).json({
        error: "Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.",
      });
    }

    try {
      const prisma = getPrisma();

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
      });
      if (!ticket) {
        unlink(file.path, () => {});
        return res.status(404).json({ error: "Ticket not found." });
      }
      // Ownership check: only the Requester who owns the ticket may add
      // attachments to it.
      if (ticket.requesterId !== requesterId) {
        unlink(file.path, () => {});
        return res.status(403).json({
          error: "You do not have permission to add attachments to this ticket.",
        });
      }

      const activeAttachmentCount = await prisma.attachment.count({
        where: { ticketId },
      });
      if (activeAttachmentCount >= MAX_ACTIVE_ATTACHMENTS_PER_TICKET) {
        unlink(file.path, () => {});
        return res.status(409).json({
          error: `A ticket can have at most ${MAX_ACTIVE_ATTACHMENTS_PER_TICKET} active attachments.`,
        });
      }

      const attachment = await prisma.attachment.create({
        data: {
          ticketId,
          originalFilename: file.originalname,
          storedFilename: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });

      res.status(201).json(attachment);
    } catch (error) {
      console.error("Failed to upload attachment:", error);
      unlink(file.path, () => {});
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  }
);

export default app;