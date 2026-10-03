import express, { Request, Response } from "express";
import { Prisma, Role, TicketStatus } from "@prisma/client";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer, { MulterError } from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma } from "./prisma.js";
import { isLegalStatusTransition, statusRequiresConfirmation } from "./ticketStatus.js";
import {
  AuthedRequest,
  AuthenticatedUser,
  CLIENT_ORIGIN,
  DUMMY_PASSWORD_HASH,
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSession,
  deleteSession,
  hashPassword,
  requireAuth,
  requirePasswordUpToDate,
  requireRole,
  requireSameOrigin,
  validateNewPassword,
  verifyPassword,
} from "./auth.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

// credentials: true + an explicit origin (not the previous open cors()) is
// required for the browser to send/receive the session cookie cross-port in
// local dev (api-spec.md "Authentication").
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
// CSRF defense-in-depth (api-spec.md "Authentication"): every POST/PATCH/PUT/
// DELETE request, app-wide, must carry the configured client Origin. Mounted
// before express.json() and cookieParser() on purpose — the gate runs before
// the session cookie is even parsed, so it sits ahead of BR-13's 401/403/400
// ladder rather than inside it. (Feature 2 mounted this on /api/auth only;
// Feature 3 extends it to every route now that Lab 2's own routes sit behind
// sessions too.)
app.use(requireSameOrigin);
app.use(express.json());
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Lab 3 — Authentication Foundation (Issue #35)
// docs/lab-03/api-spec.md "POST /api/auth/login" etc. Wired onto every Lab 2
// ticket/attachment route, plus the new Feature 3 routes below, via
// requireAuth/requireRole/requirePasswordUpToDate.
// ---------------------------------------------------------------------------

app.post("/api/auth/login", async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const errors: Record<string, string> = {};
  if (!email) errors.email = "Email is required.";
  if (!password) errors.password = "Password is required.";
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const prisma = getPrisma();

    // BR-07: an unknown email, a wrong password, and an inactive account all
    // fall through to the exact same 401 below — never distinguished, in the
    // response body/status *and* in timing: verifyPassword always runs,
    // against DUMMY_PASSWORD_HASH when there's no real user/hash, so an
    // unknown email doesn't skip the one bcrypt compare a known email costs.
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || !user.isActive || !passwordOk) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, session.id, {
      ...SESSION_COOKIE_OPTIONS,
      expires: session.expiresAt,
    });

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionId) {
      await deleteSession(sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Logout failed:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res: Response) => {
  res.status(200).json(req.user);
});

app.post("/api/auth/change-password", requireAuth, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  const errors: Record<string, string> = {};
  if (!currentPassword) errors.currentPassword = "Current password is required.";
  const newPasswordError = validateNewPassword(newPassword, currentPassword);
  if (newPasswordError) errors.newPassword = newPasswordError;
  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your new password.";
  } else if (confirmPassword !== newPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    });

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      mustChangePassword: updated.mustChangePassword,
    });
  } catch (error) {
    console.error("Password change failed:", error);
    res.status(500).json({ error: "Password change failed" });
  }
});

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
// api-spec.md "Lookup endpoints": now require an authenticated session (any
// role) instead of being open — Lab 3's default is "authenticated unless
// stated otherwise." requirePasswordUpToDate applies here too: every
// authenticated route except /api/auth/me, /api/auth/logout, and
// /api/auth/change-password itself is blocked for a session that still has
// mustChangePassword set (api-spec.md's "Forced password change" note).
// ---------------------------------------------------------------------------
app.get("/api/categories", requireAuth, requirePasswordUpToDate, async (_req: Request, res: Response) => {
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
app.get("/api/related-systems", requireAuth, requirePasswordUpToDate, async (_req: Request, res: Response) => {
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

// GET /api/requesters is removed (api-spec.md): it was Lab 2's dev-selector
// lookup ("which Requester am I acting as"), which no longer has a purpose
// now that identity comes from the session — removed in the same change
// that removes the client's DevRequesterPicker component.

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

app.post("/api/tickets", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  // FR-08/BR-03: identity comes from the session, never the client. A
  // requesterId in the body (an old client, or a spoof attempt) is silently
  // ignored — not an error — per api-spec.md.
  const requesterId = req.user!.id;
  const { categoryId, relatedSystemId, requestedPriority } = body;

  const errors: Record<string, string> = {};

  // Ids are positive (autoincrement starts at 1) — 0 is what an empty <select>
  // coerces to via Number(""), and it's still a valid integer, so it must be
  // rejected explicitly rather than just checked with Number.isInteger.
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

    // No need to re-check the Requester here: requireAuth already loaded an
    // active User for this session, and requireRole confirmed its role.
    const [category, relatedSystem] = await Promise.all([
      prisma.category.findFirst({ where: { id: categoryId, isActive: true } }),
      prisma.relatedSystem.findFirst({ where: { id: relatedSystemId, isActive: true } }),
    ]);

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
          // BR-20: itPriority is copied from requestedPriority at creation,
          // then independently editable by IT Staff only.
          itPriority: requestedPriority,
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
// Feature 4/5 — My Tickets: view, search, filter, sort, and page through a
// Requester's own tickets (GET /api/tickets)
// ---------------------------------------------------------------------------
const TICKET_SORT_FIELDS = ["createdAt", "summary", "requestedPriority"] as const;
type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];
const DEFAULT_SORT_BY: TicketSortField = "createdAt";
const DEFAULT_SORT_DIR = "desc";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const TICKET_STATUSES = Object.values(TicketStatus);

app.get("/api/tickets", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  // FR-08/BR-03: scoped to the session's own identity, not a query param.
  const requesterId = req.user!.id;

  const where: Record<string, unknown> = { requesterId };

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    where.OR = [
      { summary: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { ticketNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  if (req.query.categoryId !== undefined) {
    const categoryId = Number(req.query.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ error: "categoryId must be a positive integer." });
    }
    where.categoryId = categoryId;
  }

  if (req.query.relatedSystemId !== undefined) {
    const relatedSystemId = Number(req.query.relatedSystemId);
    if (!Number.isInteger(relatedSystemId) || relatedSystemId <= 0) {
      return res.status(400).json({ error: "relatedSystemId must be a positive integer." });
    }
    where.relatedSystemId = relatedSystemId;
  }

  if (req.query.requestedPriority !== undefined) {
    if (!REQUESTED_PRIORITIES.includes(req.query.requestedPriority as (typeof REQUESTED_PRIORITIES)[number])) {
      return res.status(400).json({
        error: "requestedPriority must be LOW, MEDIUM, or HIGH.",
      });
    }
    where.requestedPriority = req.query.requestedPriority;
  }

  if (req.query.currentStatus !== undefined) {
    if (!TICKET_STATUSES.includes(req.query.currentStatus as TicketStatus)) {
      return res.status(400).json({
        error: `currentStatus must be one of: ${TICKET_STATUSES.join(", ")}.`,
      });
    }
    where.currentStatus = req.query.currentStatus;
  }

  const sortByParam = req.query.sortBy;
  const sortBy: TicketSortField =
    sortByParam === undefined ? DEFAULT_SORT_BY : (sortByParam as TicketSortField);
  if (!TICKET_SORT_FIELDS.includes(sortBy)) {
    return res.status(400).json({
      error: `sortBy must be one of: ${TICKET_SORT_FIELDS.join(", ")}.`,
    });
  }

  const sortDirParam = req.query.sortDir;
  const sortDirValue = sortDirParam === undefined ? DEFAULT_SORT_DIR : sortDirParam;
  if (sortDirValue !== "asc" && sortDirValue !== "desc") {
    return res.status(400).json({ error: "sortDir must be asc or desc." });
  }
  const sortDir: Prisma.SortOrder = sortDirValue;

  const pageParam = req.query.page;
  const page = pageParam === undefined ? 1 : Number(pageParam);
  if (!Number.isInteger(page) || page <= 0) {
    return res.status(400).json({ error: "page must be a positive integer." });
  }

  const pageSizeParam = req.query.pageSize;
  const pageSize = pageSizeParam === undefined ? DEFAULT_PAGE_SIZE : Number(pageSizeParam);
  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > MAX_PAGE_SIZE) {
    return res.status(400).json({
      error: `pageSize must be a positive integer up to ${MAX_PAGE_SIZE}.`,
    });
  }

  try {
    const prisma = getPrisma();

    // id desc as a tiebreaker keeps order stable when two tickets share the
    // sorted-on value (e.g. the same createdAt millisecond, or an equal
    // summary/priority) — BR-08.
    let orderBy: Prisma.TicketOrderByWithRelationInput[];
    switch (sortBy) {
      case "summary":
        orderBy = [{ summary: sortDir }, { id: "desc" }];
        break;
      case "requestedPriority":
        orderBy = [{ requestedPriority: sortDir }, { id: "desc" }];
        break;
      case "createdAt":
      default:
        orderBy = [{ createdAt: sortDir }, { id: "desc" }];
    }

    const [tickets, totalItems] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ticket.count({ where }),
    ]);

    res.status(200).json({
      tickets,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      },
    });
  } catch (error) {
    console.error("Failed to retrieve tickets:", error);

    res.status(500).json({
      error: "Failed to retrieve tickets",
    });
  }
});

// ---------------------------------------------------------------------------
// Feature 6 — Ticket Detail screen (GET /api/tickets/:id)
// Attachments on the detail screen are Feature 7 — this returns the ticket's
// own fields only.
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  const requesterId = req.user!.id;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket id." });
  }

  try {
    const prisma = getPrisma();

    // BR-14: a ticket that doesn't exist, and one that exists but belongs to
    // a different Requester, both 404 — a Requester can't tell the two apart
    // (tightened from Lab 2's 403, which confirmed the ticket existed).
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    res.status(200).json(ticket);
  } catch (error) {
    console.error("Failed to retrieve ticket:", error);

    res.status(500).json({
      error: "Failed to retrieve ticket",
    });
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
  requireAuth,
  requireRole("REQUESTER"),
  requirePasswordUpToDate,
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
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    // requesterId is no longer a form field (FR-08/BR-03) — identity comes
    // from the session, which requireAuth already attached.
    const requesterId = req.user!.id;
    const file = req.file;

    if (!Number.isInteger(ticketId)) {
      if (file) unlink(file.path, () => {});
      return res.status(400).json({ error: "Invalid ticket id." });
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

      // BR-14: a nonexistent ticket and one that isn't the caller's both 404
      // — same reasoning as GET /api/tickets/:id.
      const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, requesterId },
      });
      if (!ticket) {
        unlink(file.path, () => {});
        return res.status(404).json({ error: "Ticket not found." });
      }

      const activeAttachmentCount = await prisma.attachment.count({
        where: { ticketId, removedAt: null },
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

// ---------------------------------------------------------------------------
// Feature 7 — Inspect a ticket's attachments (list + view/download one)
// Same ownership rule as the rest of Feature 6/BR-07: only the Requester who
// owns the ticket may see or fetch its attachments (BR-12).
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id/attachments", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  const requesterId = req.user!.id;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket id." });
  }

  try {
    const prisma = getPrisma();

    // BR-14: 404, not 403, for a ticket that isn't the caller's.
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    const attachments = await prisma.attachment.findMany({
      // Includes removed attachments too (BR-14, per the handout's example:
      // "A removed Attachment remains visible as metadata but cannot be
      // downloaded") — removedAt/removalReason tell the caller which ones
      // are removed; the download endpoint is what actually blocks access.
      where: { ticketId },
      // id asc as a tiebreaker keeps order stable when two attachments
      // share a createdAt (same millisecond) — same reasoning as BR-08.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      // storedFilename is an internal, server-side detail (the random name
      // the file is actually saved under) — never expose it. Everything a
      // client needs to display or fetch the file is public metadata.
      select: {
        id: true,
        ticketId: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        removedAt: true,
        removalReason: true,
      },
    });

    res.status(200).json(attachments);
  } catch (error) {
    console.error("Failed to retrieve attachments:", error);

    res.status(500).json({ error: "Failed to retrieve attachments" });
  }
});

app.get("/api/tickets/:id/attachments/:attachmentId", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const requesterId = req.user!.id;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket id." });
  }
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return res.status(400).json({ error: "Invalid attachment id." });
  }

  try {
    const prisma = getPrisma();

    // BR-14: 404, not 403, for a ticket that isn't the caller's.
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    // Scoped to this ticketId too, not just id — an attachment id that
    // exists but belongs to a different ticket must 404 here, the same as
    // one that doesn't exist at all. removedAt: null blocks downloading a
    // soft-removed attachment (Feature 9) the same way — it 404s rather
    // than serving a file that's supposed to be gone.
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId, removedAt: null },
    });
    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found." });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedFilename);
    // RFC 6266/5987: `filename=` is the plain (ASCII) fallback a client that
    // doesn't understand filename* falls back to — it must NOT be percent-
    // encoded, or it displays literally (e.g. "photo%20one.png"). `filename*`
    // carries the real name, percent-encoded with its charset, for clients
    // that support spaces/non-ASCII (Unicode names, accents, etc.).
    const asciiFallbackFilename = attachment.originalFilename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const encodedFilename = encodeURIComponent(attachment.originalFilename);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${asciiFallbackFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    res.sendFile(filePath, (error) => {
      if (error) {
        console.error("Failed to send attachment file:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to retrieve attachment file" });
        }
      }
    });
  } catch (error) {
    console.error("Failed to retrieve attachment:", error);

    res.status(500).json({ error: "Failed to retrieve attachment" });
  }
});

// ---------------------------------------------------------------------------
// Feature 9 — Remove one of a Requester's own attachments (soft removal)
// Same ownership rule as Feature 7/8 (BR-12). Required soft-removal rules
// (BR-14): the Attachment row is never deleted — removedAt (and an optional
// removalReason, handout section 4.5) is set instead, so its metadata is
// retained and still shows up in the list — but the physical file is
// deleted from disk, the download endpoint 404s for it, and the upload
// endpoint's active-count check treats it as gone.
// ---------------------------------------------------------------------------
app.delete("/api/tickets/:id/attachments/:attachmentId", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  const requesterId = req.user!.id;

  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket id." });
  }
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return res.status(400).json({ error: "Invalid attachment id." });
  }

  // Removal reason (handout section 4.5): optional free text, sent as a
  // JSON body rather than a query param since it's arbitrary prose, not an
  // id. Absent/blank is fine — it's recorded as null, not required.
  const rawReason = req.body?.reason;
  if (rawReason !== undefined && rawReason !== null && typeof rawReason !== "string") {
    return res.status(400).json({ error: "reason must be a string." });
  }
  const trimmedReason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (trimmedReason.length > 500) {
    return res.status(400).json({ error: "Removal reason must be at most 500 characters." });
  }
  const removalReason = trimmedReason.length > 0 ? trimmedReason : null;

  try {
    const prisma = getPrisma();

    // BR-14: 404, not 403, for a ticket that isn't the caller's.
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    // Scoped to ticketId and removedAt: null — an attachment id that's
    // already removed, or belongs to a different ticket, 404s here the
    // same as one that never existed (matches the download endpoint).
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticketId, removedAt: null },
    });
    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found." });
    }

    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
      data: { removedAt: new Date(), removalReason },
      select: {
        id: true,
        ticketId: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        removedAt: true,
        removalReason: true,
      },
    });

    // Best-effort: the row is the source of truth once removedAt is set,
    // regardless of whether the physical file happened to still be there.
    unlink(path.join(UPLOAD_DIR, attachment.storedFilename), (error) => {
      if (error) console.error("Failed to delete removed attachment's file:", error);
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error("Failed to remove attachment:", error);

    res.status(500).json({ error: "Failed to remove attachment" });
  }
});

// ---------------------------------------------------------------------------
// Feature 3 — Public Comments, Internal Notes, and "Problem Appears Resolved"
// (docs/lab-03/api-spec.md "Comments, Notes, and 'mark resolved'")
//
// Read (GET) is reachable by a Requester only for a ticket they own, or by
// IT Staff/Administrator for any ticket (BR-39). Write (POST) is reachable
// by a Requester (their own ticket, comments only) or IT Staff (any ticket,
// comments and notes) — never Administrator, on any write route here.
// ---------------------------------------------------------------------------
const COMMENT_BODY_MAX_LENGTH = 2000;

export function validateCommentBody(rawBody: unknown): { body: string; error?: undefined } | { error: string } {
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!body) return { error: "Body is required." };
  if (body.length > COMMENT_BODY_MAX_LENGTH) {
    return { error: `Body must be ${COMMENT_BODY_MAX_LENGTH} characters or fewer.` };
  }
  return { body };
}

function serializeAuthoredEntry(entry: {
  id: number;
  ticketId: number;
  authorId: number;
  body: string;
  createdAt: Date;
  author: { name: string; role: Role };
}) {
  return {
    id: entry.id,
    ticketId: entry.ticketId,
    authorId: entry.authorId,
    authorName: entry.author.name,
    authorRole: entry.author.role,
    body: entry.body,
    createdAt: entry.createdAt,
  };
}

// A Requester sees only their own ticket; IT Staff/Administrator see any
// ticket (BR-39) — same visibility rule the staff detail screen will use.
async function findVisibleTicket(ticketId: number, user: AuthenticatedUser) {
  const prisma = getPrisma();
  if (user.role === "REQUESTER") {
    return prisma.ticket.findFirst({ where: { id: ticketId, requesterId: user.id } });
  }
  return prisma.ticket.findUnique({ where: { id: ticketId } });
}

app.get("/api/tickets/:id/comments", requireAuth, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
  const ticketId = Number(req.params.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return res.status(400).json({ error: "Invalid ticket id." });
  }

  try {
    // BR-14: not the caller's ticket looks the same as one that doesn't
    // exist — applies to a Requester caller only; IT Staff/Administrator
    // may read any ticket's comments (BR-39).
    const ticket = await findVisibleTicket(ticketId, req.user!);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    const prisma = getPrisma();
    const comments = await prisma.publicComment.findMany({
      where: { ticketId },
      include: { author: { select: { name: true, role: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    res.status(200).json(comments.map(serializeAuthoredEntry));
  } catch (error) {
    console.error("Failed to retrieve comments:", error);

    res.status(500).json({ error: "Failed to retrieve comments" });
  }
});

app.post(
  "/api/tickets/:id/comments",
  requireAuth,
  // BR-39: Administrator is read-only here — a Requester (own ticket) or IT
  // Staff (any ticket) may post; Administrator gets 403 before the ticket is
  // even looked up.
  requireRole("REQUESTER", "IT_STAFF"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    // BR-25/BR-26, checked before the ticket lookup per BR-13's
    // 400-before-404 order.
    const validated = validateCommentBody(req.body?.body);
    if (validated.error !== undefined) {
      return res.status(400).json({ errors: { body: validated.error } });
    }

    try {
      const ticket = await findVisibleTicket(ticketId, req.user!);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      const prisma = getPrisma();
      const comment = await prisma.publicComment.create({
        data: { ticketId, authorId: req.user!.id, body: validated.body },
        include: { author: { select: { name: true, role: true } } },
      });

      res.status(201).json(serializeAuthoredEntry(comment));
    } catch (error) {
      console.error("Failed to create comment:", error);

      res.status(500).json({ error: "Failed to create comment" });
    }
  }
);

app.get(
  "/api/tickets/:id/notes",
  requireAuth,
  // AC-04/BR-29: a Requester is rejected with 403 without the ticket ever
  // being looked up — so it can't be told apart from "ticket has no notes"
  // or "not your ticket" by response shape.
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    try {
      const prisma = getPrisma();
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      const notes = await prisma.internalNote.findMany({
        where: { ticketId },
        include: { author: { select: { name: true, role: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      res.status(200).json(notes.map(serializeAuthoredEntry));
    } catch (error) {
      console.error("Failed to retrieve notes:", error);

      res.status(500).json({ error: "Failed to retrieve notes" });
    }
  }
);

app.post(
  "/api/tickets/:id/notes",
  requireAuth,
  // BR-29/BR-39: IT Staff only — Requester never sees/writes notes,
  // Administrator is read-only.
  requireRole("IT_STAFF"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    const validated = validateCommentBody(req.body?.body);
    if (validated.error !== undefined) {
      return res.status(400).json({ errors: { body: validated.error } });
    }

    try {
      const prisma = getPrisma();
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      const note = await prisma.internalNote.create({
        data: { ticketId, authorId: req.user!.id, body: validated.body },
        include: { author: { select: { name: true, role: true } } },
      });

      res.status(201).json(serializeAuthoredEntry(note));
    } catch (error) {
      console.error("Failed to create note:", error);

      res.status(500).json({ error: "Failed to create note" });
    }
  }
);

// BR-40: once a ticket has reached one of these terminal-for-this-purpose
// statuses, the Requester can no longer flag it as resolved themselves.
const RESOLVE_BLOCKED_STATUSES: TicketStatus[] = ["RESOLVED", "CLOSED", "CANCELLED"];

app.post(
  "/api/tickets/:id/mark-resolved",
  requireAuth,
  requireRole("REQUESTER"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    const requesterId = req.user!.id;
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    try {
      const prisma = getPrisma();

      // BR-14: not the caller's ticket looks the same as one that doesn't
      // exist.
      const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      if (RESOLVE_BLOCKED_STATUSES.includes(ticket.currentStatus)) {
        return res.status(409).json({
          error: `This ticket is already ${ticket.currentStatus} and can't be marked resolved.`,
        });
      }

      // BR-24: idempotent while not yet terminal — a repeat call just
      // overwrites the timestamp/author; currentStatus is untouched (this
      // is a Requester-visible signal only, never a status transition).
      const updated = await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          requesterMarkedResolvedAt: new Date(),
          requesterMarkedResolvedById: requesterId,
        },
      });

      res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to mark ticket resolved:", error);

      res.status(500).json({ error: "Failed to mark ticket resolved" });
    }
  }
);

// ---------------------------------------------------------------------------
// Feature 4 — IT Staff Ticket Queue (Issue #37)
// docs/lab-03/api-spec.md "GET /api/staff/tickets". Read-only for both
// IT_STAFF and ADMINISTRATOR (BR-39) — every ticket, not scoped to any one
// Requester the way Lab 2's GET /api/tickets is. A REQUESTER caller gets
// 403 on every /api/staff/* route (AC-28a).
// ---------------------------------------------------------------------------
const STAFF_TICKET_SORT_FIELDS = ["createdAt", "updatedAt", "itPriority", "currentStatus"] as const;
type StaffTicketSortField = (typeof STAFF_TICKET_SORT_FIELDS)[number];
const STAFF_DEFAULT_SORT_BY: StaffTicketSortField = "createdAt";
const STAFF_DEFAULT_SORT_DIR = "desc";
const STAFF_DEFAULT_PAGE_SIZE = 20;
const STAFF_MAX_PAGE_SIZE = 50;

app.get(
  "/api/staff/tickets",
  requireAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const where: Record<string, unknown> = {};

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      where.OR = [
        { summary: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { ticketNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    let categoryId: number | undefined;
    if (req.query.categoryId !== undefined) {
      categoryId = Number(req.query.categoryId);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({ error: "categoryId must be a positive integer." });
      }
    }

    let relatedSystemId: number | undefined;
    if (req.query.relatedSystemId !== undefined) {
      relatedSystemId = Number(req.query.relatedSystemId);
      if (!Number.isInteger(relatedSystemId) || relatedSystemId <= 0) {
        return res.status(400).json({ error: "relatedSystemId must be a positive integer." });
      }
    }

    if (req.query.itPriority !== undefined) {
      if (!REQUESTED_PRIORITIES.includes(req.query.itPriority as (typeof REQUESTED_PRIORITIES)[number])) {
        return res.status(400).json({ error: "itPriority must be LOW, MEDIUM, or HIGH." });
      }
      where.itPriority = req.query.itPriority;
    }

    if (req.query.currentStatus !== undefined) {
      if (!TICKET_STATUSES.includes(req.query.currentStatus as TicketStatus)) {
        return res.status(400).json({
          error: `currentStatus must be one of: ${TICKET_STATUSES.join(", ")}.`,
        });
      }
      where.currentStatus = req.query.currentStatus;
    }

    // ownerId=0 means "unassigned only" (where.ownerId: null); any other
    // non-negative integer filters to that specific owner.
    if (req.query.ownerId !== undefined) {
      const ownerId = Number(req.query.ownerId);
      if (!Number.isInteger(ownerId) || ownerId < 0) {
        return res.status(400).json({
          error: "ownerId must be a non-negative integer (0 means unassigned).",
        });
      }
      where.ownerId = ownerId === 0 ? null : ownerId;
    }

    const sortByParam = req.query.sortBy;
    const sortBy: StaffTicketSortField =
      sortByParam === undefined ? STAFF_DEFAULT_SORT_BY : (sortByParam as StaffTicketSortField);
    if (!STAFF_TICKET_SORT_FIELDS.includes(sortBy)) {
      return res.status(400).json({
        error: `sortBy must be one of: ${STAFF_TICKET_SORT_FIELDS.join(", ")}.`,
      });
    }

    const sortDirParam = req.query.sortDir;
    const sortDirValue = sortDirParam === undefined ? STAFF_DEFAULT_SORT_DIR : sortDirParam;
    if (sortDirValue !== "asc" && sortDirValue !== "desc") {
      return res.status(400).json({ error: "sortDir must be asc or desc." });
    }
    const sortDir: Prisma.SortOrder = sortDirValue;

    const pageParam = req.query.page;
    const page = pageParam === undefined ? 1 : Number(pageParam);
    if (!Number.isInteger(page) || page <= 0) {
      return res.status(400).json({ error: "page must be a positive integer." });
    }

    const pageSizeParam = req.query.pageSize;
    const pageSize = pageSizeParam === undefined ? STAFF_DEFAULT_PAGE_SIZE : Number(pageSizeParam);
    if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > STAFF_MAX_PAGE_SIZE) {
      return res.status(400).json({
        error: `pageSize must be a positive integer up to ${STAFF_MAX_PAGE_SIZE}.`,
      });
    }

    try {
      const prisma = getPrisma();

      // The API contract requires each id to reference an existing row, not
      // just be a positive integer — an unknown id is a 400 (a mistyped
      // filter), not a silent empty-result 200.
      if (categoryId !== undefined) {
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        if (!category) {
          return res.status(400).json({ error: "categoryId does not reference an existing Category." });
        }
        where.categoryId = categoryId;
      }

      if (relatedSystemId !== undefined) {
        const relatedSystem = await prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } });
        if (!relatedSystem) {
          return res
            .status(400)
            .json({ error: "relatedSystemId does not reference an existing Related System." });
        }
        where.relatedSystemId = relatedSystemId;
      }

      // id desc as a tiebreaker keeps order stable when two tickets share the
      // sorted-on value, same convention as Lab 2's GET /api/tickets.
      let orderBy: Prisma.TicketOrderByWithRelationInput[];
      switch (sortBy) {
        case "updatedAt":
          orderBy = [{ updatedAt: sortDir }, { id: "desc" }];
          break;
        case "itPriority":
          orderBy = [{ itPriority: sortDir }, { id: "desc" }];
          break;
        case "currentStatus":
          orderBy = [{ currentStatus: sortDir }, { id: "desc" }];
          break;
        case "createdAt":
        default:
          orderBy = [{ createdAt: sortDir }, { id: "desc" }];
      }

      const [tickets, totalItems] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            requester: { select: { name: true } },
            owner: { select: { name: true } },
          },
        }),
        prisma.ticket.count({ where }),
      ]);

      res.status(200).json({
        // Flattened onto the ticket itself (StaffTicketSummary) rather than
        // nested requester/owner objects — the queue table only ever needs
        // the name, never the rest of either User row.
        tickets: tickets.map(({ requester, owner, ...ticket }) => ({
          ...ticket,
          requesterName: requester.name,
          ownerName: owner?.name ?? null,
        })),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
        },
      });
    } catch (error) {
      console.error("Failed to retrieve staff ticket queue:", error);

      res.status(500).json({ error: "Failed to retrieve staff ticket queue" });
    }
  }
);

// ---------------------------------------------------------------------------
// Feature 5 — IT Staff Ticket Detail & Workflow (Issue #38)
// docs/lab-03/api-spec.md's "IT Staff endpoints" section, from
// GET /api/staff/tickets/:id onward. Read (detail) is IT_STAFF/ADMINISTRATOR
// (BR-39); every write route below it is IT_STAFF only — an ADMINISTRATOR
// caller gets 403 on all five, the same as a REQUESTER would (AC-20b).
// ---------------------------------------------------------------------------
app.get(
  "/api/staff/tickets/:id",
  requireAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    try {
      const prisma = getPrisma();

      // No ownership restriction (unlike the Requester's own GET
      // /api/tickets/:id) — IT Staff/Administrator may open any ticket.
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          requester: { select: { name: true, email: true } },
          owner: { select: { name: true, email: true } },
        },
      });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      const [attachments, comments, notes] = await Promise.all([
        prisma.attachment.findMany({
          where: { ticketId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            ticketId: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            removedAt: true,
            removalReason: true,
          },
        }),
        prisma.publicComment.findMany({
          where: { ticketId },
          include: { author: { select: { name: true, role: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        prisma.internalNote.findMany({
          where: { ticketId },
          include: { author: { select: { name: true, role: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
      ]);

      const { requester, owner, ...ticketFields } = ticket;

      res.status(200).json({
        ticket: {
          ...ticketFields,
          requesterName: requester.name,
          requesterEmail: requester.email,
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
        },
        attachments,
        comments: comments.map(serializeAuthoredEntry),
        notes: notes.map(serializeAuthoredEntry),
      });
    } catch (error) {
      console.error("Failed to retrieve staff ticket detail:", error);

      res.status(500).json({ error: "Failed to retrieve staff ticket detail" });
    }
  }
);

app.post(
  "/api/staff/tickets/:id/claim",
  requireAuth,
  requireRole("IT_STAFF"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    try {
      const prisma = getPrisma();

      // Atomic claim: the WHERE clause's ownerId: null is checked and
      // written in the same statement, so two concurrent claims on the same
      // ticket can't both read "unassigned" and both win — only the update
      // whose WHERE still matches at execution time affects a row. A plain
      // findUnique-then-update here would be a classic TOCTOU race (found
      // in review): both requests could read ownerId: null before either
      // writes, and the second write would silently overwrite the first
      // claimant instead of getting BR-18's required 409.
      const result = await prisma.ticket.updateMany({
        where: { id: ticketId, ownerId: null },
        data: { ownerId: req.user!.id },
      });

      if (result.count === 0) {
        // Distinguish "doesn't exist" (404) from "exists but already
        // claimed" (409, BR-18) — the updateMany above can't tell these
        // apart on its own, since both leave count at 0.
        const exists = await prisma.ticket.findUnique({
          where: { id: ticketId },
          select: { id: true },
        });
        if (!exists) {
          return res.status(404).json({ error: "Ticket not found." });
        }
        return res.status(409).json({
          error: "Ticket is already assigned. Use assign to change its owner.",
        });
      }

      const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to claim ticket:", error);

      res.status(500).json({ error: "Failed to claim ticket" });
    }
  }
);

app.post(
  "/api/staff/tickets/:id/assign",
  requireAuth,
  requireRole("IT_STAFF"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    const ownerId = req.body?.ownerId;
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      return res.status(400).json({
        errors: { ownerId: "ownerId is required and must be a positive integer." },
      });
    }

    try {
      const prisma = getPrisma();

      // Both queried up front (in parallel) so an invalid ownerId is a 400
      // even when the ticket also doesn't exist — BR-13's 400-before-404.
      const [ticket, targetUser] = await Promise.all([
        prisma.ticket.findUnique({ where: { id: ticketId } }),
        prisma.user.findFirst({ where: { id: ownerId, role: "IT_STAFF", isActive: true } }),
      ]);

      if (!targetUser) {
        return res.status(400).json({
          errors: { ownerId: "ownerId must reference an active IT Staff user." },
        });
      }
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      const updated = await prisma.ticket.update({
        where: { id: ticketId },
        data: { ownerId },
      });

      res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to assign ticket:", error);

      res.status(500).json({ error: "Failed to assign ticket" });
    }
  }
);

app.patch(
  "/api/staff/tickets/:id/priority",
  requireAuth,
  requireRole("IT_STAFF"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    const itPriority = req.body?.itPriority;
    if (!REQUESTED_PRIORITIES.includes(itPriority)) {
      return res.status(400).json({
        errors: { itPriority: "itPriority must be LOW, MEDIUM, or HIGH." },
      });
    }

    try {
      const prisma = getPrisma();

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      // BR-20: requestedPriority is never touched by this route.
      const updated = await prisma.ticket.update({
        where: { id: ticketId },
        data: { itPriority },
      });

      res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to update ticket priority:", error);

      res.status(500).json({ error: "Failed to update ticket priority" });
    }
  }
);

app.patch(
  "/api/staff/tickets/:id/status",
  requireAuth,
  requireRole("IT_STAFF"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const ticketId = Number(req.params.id);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Invalid ticket id." });
    }

    const targetStatus = req.body?.currentStatus;
    if (!TICKET_STATUSES.includes(targetStatus)) {
      return res.status(400).json({
        errors: { currentStatus: `currentStatus must be one of: ${TICKET_STATUSES.join(", ")}.` },
      });
    }

    // BR-42: confirmation is checked before the matrix's legality check
    // (400 before 409, per BR-13's order) — a target requiring confirmation
    // with confirm missing/false is 400 even if the transition would also
    // have been illegal.
    if (statusRequiresConfirmation(targetStatus) && req.body?.confirm !== true) {
      return res.status(400).json({
        errors: { confirm: "Confirmation is required to set this status." },
      });
    }

    try {
      const prisma = getPrisma();

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      // BR-22: only the matrix's ✅ cells are legal, including rejecting a
      // status "transitioning" to itself.
      if (!isLegalStatusTransition(ticket.currentStatus, targetStatus)) {
        return res.status(409).json({
          error: `Cannot transition from ${ticket.currentStatus} to ${targetStatus}.`,
        });
      }

      const updated = await prisma.ticket.update({
        where: { id: ticketId },
        data: { currentStatus: targetStatus },
      });

      res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to update ticket status:", error);

      res.status(500).json({ error: "Failed to update ticket status" });
    }
  }
);

// FR-28/BR-41 — populates the claim/assign control's dropdown. Deliberately
// not GET /api/admin/users: that route is Administrator-only and returns
// every role, more data than a reassignment needs.
app.get(
  "/api/staff/assignable-users",
  requireAuth,
  requireRole("IT_STAFF"),
  requirePasswordUpToDate,
  async (_req: AuthedRequest, res: Response) => {
    try {
      const prisma = getPrisma();

      const users = await prisma.user.findMany({
        where: { role: "IT_STAFF", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      res.status(200).json(users);
    } catch (error) {
      console.error("Failed to retrieve assignable users:", error);

      res.status(500).json({ error: "Failed to retrieve assignable users" });
    }
  }
);

// ---------------------------------------------------------------------------
// Lab 3 — Administrator User Management (Issue #39)
// docs/lab-03/api-spec.md "Administrator endpoints". Every route here
// requires role ADMINISTRATOR (AC-27) — a Requester or IT Staff caller gets
// 403 on all four. Never a DELETE route (BR-38): suspension (isActive:
// false) is the only way to remove a user's access.
// ---------------------------------------------------------------------------
const ROLES: Role[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

// Arbitrary, fixed key for the transaction-scoped advisory lock that
// serializes every request able to change who is an active Administrator
// (PATCH /api/admin/users/:id's role/isActive changes — BR-37). Any 64-bit
// constant works as long as nothing else in the app takes a lock on the same
// key; "37" is just a mnemonic for the rule it protects.
const ADMIN_INVARIANT_LOCK_KEY = 4_100_037;

// BR-34's case-insensitive uniqueness is enforced by a database-level
// unique index on LOWER(email) (migration
// 20261002080000_lab3_admin_email_case_insensitive_unique), not only by the
// findFirst pre-checks in the create/edit handlers below — those pre-checks
// give a clean error for the common case, but only the database can
// actually prevent two concurrent requests with differently-cased emails
// from both passing a pre-check before either row exists. This recognizes
// that race's unique-violation error (Postgres SQLSTATE 23505, surfaced by
// Prisma as P2002) so it can be translated into the same documented 409.
function isUniqueEmailViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

app.get(
  "/api/admin/users",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const roleParam = req.query.role;

    if (roleParam !== undefined && !ROLES.includes(roleParam as Role)) {
      return res.status(400).json({
        error: "role must be one of: REQUESTER, IT_STAFF, ADMINISTRATOR.",
      });
    }

    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (roleParam !== undefined) {
      where.role = roleParam as Role;
    }

    try {
      const prisma = getPrisma();

      // No pagination (specification.md §8.5's explicit exclusion) — the
      // full matching list is returned every time.
      const users = await prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { id: "asc" },
      });

      res.status(200).json(users);
    } catch (error) {
      console.error("Failed to retrieve users:", error);

      res.status(500).json({ error: "Failed to retrieve users" });
    }
  }
);

app.post(
  "/api/admin/users",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const role = body.role;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
    const password = typeof body.password === "string" ? body.password : "";

    const errors: Record<string, string> = {};
    if (!name) errors.name = "Name is required.";
    if (!email) {
      errors.email = "Email is required.";
    } else if (!EMAIL_SHAPE.test(email)) {
      errors.email = "Email must be a valid email address.";
    }
    // BR-32: exactly one of the three roles — not zero, not an array, not an
    // unrecognized string.
    if (!ROLES.includes(role)) {
      errors.role = "role must be exactly one of REQUESTER, IT_STAFF, ADMINISTRATOR.";
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    try {
      const prisma = getPrisma();

      // BR-34: case-insensitive uniqueness, checked explicitly up front so
      // the duplicate case is a clean 409 rather than relying on the DB's
      // own unique constraint (which is case-sensitive) to catch it.
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (existing) {
        return res.status(409).json({ errors: { email: "This email is already in use." } });
      }

      const created = await prisma.user.create({
        data: {
          name,
          email,
          role,
          isActive,
          passwordHash: await hashPassword(password),
          // Every admin-created account is forced to change its (admin-
          // chosen) default password at first login, regardless of isActive.
          mustChangePassword: true,
        },
        select: ADMIN_USER_SELECT,
      });

      res.status(201).json(created);
    } catch (error) {
      // BR-34/review fix: the findFirst pre-check above is a courtesy (a
      // clean error for the common, non-concurrent case) — the actual
      // invariant is enforced by the database's own case-insensitive unique
      // index (migration 20261002080000_lab3_admin_email_case_insensitive_unique),
      // so two requests racing with differently-cased emails can't both
      // succeed. Whichever one loses that race lands here as a unique
      // violation, translated to the same 409 the pre-check would have given.
      if (isUniqueEmailViolation(error)) {
        return res.status(409).json({ errors: { email: "This email is already in use." } });
      }

      console.error("Failed to create user:", error);

      res.status(500).json({ error: "Failed to create user" });
    }
  }
);

app.patch(
  "/api/admin/users/:id",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id." });
    }

    const body = req.body ?? {};
    const data: Prisma.UserUpdateInput = {};
    const errors: Record<string, string> = {};

    // Only fields actually present in the body are validated/applied —
    // never the password (reset-password, below, is the only way to change
    // it, per api-spec.md's "Never changes the password" note).
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) errors.name = "Name cannot be empty.";
      else data.name = name;
    }
    if (body.email !== undefined) {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email || !EMAIL_SHAPE.test(email)) {
        errors.email = "Email must be a valid email address.";
      } else {
        data.email = email;
      }
    }
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) {
        errors.role = "role must be one of REQUESTER, IT_STAFF, ADMINISTRATOR.";
      } else {
        data.role = body.role;
      }
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        errors.isActive = "isActive must be a boolean.";
      } else {
        data.isActive = body.isActive;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    try {
      const prisma = getPrisma();

      // BR-37 (review fix): the "count the other active Administrators, then
      // update" sequence must be atomic with respect to every other request
      // that could change who is an active Administrator. Without that, two
      // requests can each read "one other active Administrator remains"
      // before either update commits, both pass the guard, and both commit —
      // e.g. two sole-remaining Administrators demoting themselves, or two
      // Administrators deactivating each other, at the same moment — leaving
      // zero. A transaction-scoped advisory lock serializes exactly those
      // requests (only ones touching role/isActive; name/email edits can't
      // affect the invariant and skip it): the second waits until the first
      // commits, then reads the post-commit state and gets its own 409.
      // Everything that reads state the guard depends on (the target row
      // itself included) is read *inside* the lock, not before it.
      const touchesAdminInvariant = data.role !== undefined || data.isActive !== undefined;

      type Outcome =
        | { kind: "ok"; user: Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }> }
        | { kind: "notFound" }
        | { kind: "emailTaken" }
        | { kind: "selfSuspend" }
        | { kind: "lastAdmin" };

      const outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
        if (touchesAdminInvariant) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_INVARIANT_LOCK_KEY}::bigint)`;
        }

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) return { kind: "notFound" };

        // BR-34: uniqueness re-checked against every *other* user (the
        // database's LOWER(email) index remains the real guard — see the
        // P2002 handling below).
        if (typeof data.email === "string") {
          const duplicate = await tx.user.findFirst({
            where: { email: { equals: data.email, mode: "insensitive" }, NOT: { id: userId } },
          });
          if (duplicate) return { kind: "emailTaken" };
        }

        // BR-36/FR-26: an Administrator can never deactivate their own
        // account (edits to other fields on self are still fine).
        if (data.isActive === false && userId === req.user!.id) {
          return { kind: "selfSuspend" };
        }

        // BR-37/FR-27: the system always has at least one active
        // Administrator. Only relevant when the target is currently an
        // active Administrator and this update would deactivate them or
        // move them to a different role.
        const targetLosesActiveAdminStatus =
          user.role === "ADMINISTRATOR" &&
          user.isActive &&
          (data.isActive === false || (data.role !== undefined && data.role !== "ADMINISTRATOR"));

        if (targetLosesActiveAdminStatus) {
          const otherActiveAdmins = await tx.user.count({
            where: { role: "ADMINISTRATOR", isActive: true, NOT: { id: userId } },
          });
          if (otherActiveAdmins === 0) return { kind: "lastAdmin" };
        }

        const updated = await tx.user.update({
          where: { id: userId },
          data,
          select: ADMIN_USER_SELECT,
        });
        return { kind: "ok", user: updated };
      });

      switch (outcome.kind) {
        case "notFound":
          return res.status(404).json({ error: "User not found." });
        case "emailTaken":
          return res.status(409).json({ error: "This email is already in use." });
        case "selfSuspend":
          return res.status(409).json({ error: "You cannot suspend your own account." });
        case "lastAdmin":
          return res.status(409).json({ error: "At least one active Administrator is required." });
        case "ok":
          return res.status(200).json(outcome.user);
      }
    } catch (error) {
      // BR-34/review fix: same race as the create route above — the
      // findFirst pre-check is a courtesy, the database's case-insensitive
      // unique index is the actual guard. api-spec.md's PATCH contract uses
      // the singular { error } shape here, not { errors: { email } }.
      if (isUniqueEmailViolation(error)) {
        return res.status(409).json({ error: "This email is already in use." });
      }

      console.error("Failed to update user:", error);

      res.status(500).json({ error: "Failed to update user" });
    }
  }
);

app.post(
  "/api/admin/users/:id/reset-password",
  requireAuth,
  requireRole("ADMINISTRATOR"),
  requirePasswordUpToDate,
  async (req: AuthedRequest, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id." });
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        errors: { password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      });
    }

    try {
      const prisma = getPrisma();

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      // BR-35/FR-25: no self/last-admin restriction here — only
      // *deactivating* the last active Administrator is blocked, not
      // resetting their password.
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        },
        select: ADMIN_USER_SELECT,
      });

      res.status(200).json(updated);
    } catch (error) {
      console.error("Failed to reset user's password:", error);

      res.status(500).json({ error: "Failed to reset user's password" });
    }
  }
);

export default app;