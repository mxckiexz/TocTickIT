import type { Express, Response } from "express";
import { ActionStatus, Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { AuthedRequest, requireAuth, requirePasswordUpToDate, requireRole } from "./auth.js";

// Lab 4 F3: Actions Taken (docs/lab-04/specification.md BR-01..BR-10, BR-13,
// BR-16, BR-28; api-spec.md "Actions Taken"). Lives in its own module because
// app.ts is already large; registered from app.ts via registerActionsTakenRoutes.

const DESCRIPTION_MAX = 2000;
const RESULT_MAX = 2000;
const FOLLOW_UP_NOTE_MAX = 1000;
const ATTACHMENT_NOTES_MAX = 1000;
// BR-05: an action may be recorded in the past, but not more than 5 minutes ahead.
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const ACTION_STATUSES: readonly ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const OPEN_ACTION_STATUSES: readonly ActionStatus[] = ["PLANNED", "IN_PROGRESS"];
const FINAL_ACTION_STATUSES: readonly ActionStatus[] = ["COMPLETED", "CANCELLED"];

// BR-06, on edit. An unchanged status is not a move (it is always allowed, see
// resolveActionEdit); COMPLETED and CANCELLED are final.
const EDIT_MOVES: Record<ActionStatus, readonly ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isAllowedActionEditMove(from: ActionStatus, to: ActionStatus): boolean {
  return EDIT_MOVES[from].includes(to);
}

// BR-06, on create: nothing exists yet to cancel.
export function isAllowedActionCreateStatus(status: unknown): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS" || status === "COMPLETED";
}

const isActionStatus = (value: unknown): value is ActionStatus =>
  typeof value === "string" && (ACTION_STATUSES as readonly string[]).includes(value);

export interface ActionValues {
  status: ActionStatus;
  assigneeId: number | null;
  actionAt: Date;
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}
export type ActionInput = Partial<ActionValues>;
type FieldErrors = Record<string, string>;

const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

// Request-level validation only: types, lengths, enum membership and the actionAt
// window. Rules that need the stored action (status moves, the follow-up and
// result rules on the merged values) are in resolveActionCreate/resolveActionEdit.
export function validateActionFields(body: unknown, now: Date): { errors?: FieldErrors; values: ActionInput } {
  const source = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const values: ActionInput = {};

  const text = (key: "description" | "result" | "followUpNote" | "attachmentNotes", max: number, label: string, required: boolean) => {
    const raw = source[key];
    if (raw === undefined) return;
    if (typeof raw !== "string") {
      errors[key] = `${label} must be text.`;
      return;
    }
    const trimmed = raw.trim();
    if (required && trimmed.length === 0) errors[key] = `${label} is required.`;
    else if (trimmed.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
    else values[key] = trimmed;
  };
  text("description", DESCRIPTION_MAX, "Description", true);
  text("result", RESULT_MAX, "Result", false);
  text("followUpNote", FOLLOW_UP_NOTE_MAX, "Follow-up note", false);
  text("attachmentNotes", ATTACHMENT_NOTES_MAX, "Attachment notes", false);

  if (source.followUpRequired !== undefined) {
    if (typeof source.followUpRequired === "boolean") values.followUpRequired = source.followUpRequired;
    else errors.followUpRequired = "Follow-up required must be true or false.";
  }

  if (source.status !== undefined) {
    if (isActionStatus(source.status)) values.status = source.status;
    else errors.status = "Status must be PLANNED, IN_PROGRESS, COMPLETED or CANCELLED.";
  }

  if (source.assigneeId !== undefined) {
    if (source.assigneeId === null) values.assigneeId = null;
    else if (typeof source.assigneeId === "number" && Number.isInteger(source.assigneeId) && source.assigneeId > 0) values.assigneeId = source.assigneeId;
    else errors.assigneeId = "Assignee must be an active IT Staff or Administrator.";
  }

  if (source.actionAt !== undefined) {
    const at = typeof source.actionAt === "string" && ISO_8601.test(source.actionAt) ? new Date(source.actionAt) : null;
    if (at === null || Number.isNaN(at.getTime())) errors.actionAt = "Action time must be a valid date and time.";
    else if (at.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) errors.actionAt = "Action time cannot be more than 5 minutes in the future.";
    else values.actionAt = at;
  }

  return Object.keys(errors).length > 0 ? { errors, values } : { values };
}

// BR-04 and the COMPLETED rule on a full set of values.
function finish(values: ActionValues, errors: FieldErrors): { errors: FieldErrors } | { values: ActionValues } {
  if (values.followUpRequired && values.followUpNote.length === 0) errors.followUpNote = "Follow-up note is required when follow-up is required.";
  if (!values.followUpRequired) values.followUpNote = "";
  if (values.status === "COMPLETED" && values.result.length === 0) errors.result = "Result is required to complete an action.";
  return Object.keys(errors).length > 0 ? { errors } : { values };
}

export function resolveActionCreate(input: ActionInput, now: Date): { errors: FieldErrors } | { values: ActionValues } {
  const errors: FieldErrors = {};
  if (input.description === undefined) errors.description = "Description is required.";
  const status = input.status ?? "PLANNED";
  if (!isAllowedActionCreateStatus(status)) errors.status = "A new action can be PLANNED, IN_PROGRESS or COMPLETED.";
  return finish(
    {
      status,
      assigneeId: input.assigneeId ?? null,
      actionAt: input.actionAt ?? now,
      description: input.description ?? "",
      result: input.result ?? "",
      followUpRequired: input.followUpRequired ?? false,
      followUpNote: input.followUpNote ?? "",
      attachmentNotes: input.attachmentNotes ?? "",
    },
    errors
  );
}

export function resolveActionEdit(stored: ActionValues, input: ActionInput): { errors: FieldErrors } | { values: ActionValues } {
  const errors: FieldErrors = {};
  const merged: ActionValues = { ...stored };
  for (const key of Object.keys(input) as Array<keyof ActionValues>) {
    if (input[key] !== undefined) (merged as unknown as Record<string, unknown>)[key] = input[key];
  }
  if (merged.status !== stored.status && !isAllowedActionEditMove(stored.status, merged.status)) {
    errors.status = `An action cannot move from ${stored.status} to ${merged.status}.`;
  }
  return finish(merged, errors);
}

// Test seam for API-63: lets a test throw after the update, inside the
// transaction, to prove the projection and the revision roll back together.
export const actionsTakenHooks: {
  afterUpdate?: () => void;
  // Runs after the early assignee check and before the transaction: lets a test
  // change the assignee in that gap to prove the in-transaction re-check (BR-07).
  afterAssigneeCheck?: () => Promise<void> | void;
} = {};

const personSelect = { select: { id: true, name: true } } as const;
const actionInclude = { performedBy: personSelect, assignee: personSelect } satisfies Prisma.ActionTakenInclude;
type ActionRow = Prisma.ActionTakenGetPayload<{ include: typeof actionInclude }>;

function serializeAction(a: ActionRow) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    performedBy: a.performedBy,
    assignee: a.assignee,
    status: a.status,
    actionAt: a.actionAt.toISOString(),
    description: a.description,
    result: a.result,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    version: a.version,
  };
}

const parseId = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// BR-13: the "ticket lock". Every Action Taken write and every ticket status
// write takes it first, so the resolution gate and an action write are always
// serialized on the same Ticket row.
export async function lockTicket(tx: Prisma.TransactionClient, ticketId: number): Promise<void> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`);
}

// A missing ticket is the same 404 for every role; Requesters never reach a
// write route (403 first), and may only read their own ticket.
async function findVisibleTicket(ticketId: number, user: NonNullable<AuthedRequest["user"]>) {
  const prisma = getPrisma();
  if (user.role === "REQUESTER") return prisma.ticket.findFirst({ where: { id: ticketId, requesterId: user.id }, select: { id: true } });
  return prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
}

const ASSIGNEE_MESSAGE = "Assignee must be an active IT Staff or Administrator.";
const isEligibleAssignee = (user: { role: string; isActive: boolean } | null | undefined) =>
  !!user && user.isActive && (user.role === "IT_STAFF" || user.role === "ADMINISTRATOR");

// BR-07, early check: gives the documented 400-before-404 order. It is not
// enough on its own (the user can change before the write), so the write
// re-checks with checkAssigneeLocked. A database error here is not swallowed:
// it propagates to the route's 500 handler.
async function checkAssignee(assigneeId: number | null | undefined): Promise<string | undefined> {
  if (assigneeId === undefined || assigneeId === null) return undefined;
  const user = await getPrisma().user.findUnique({ where: { id: assigneeId }, select: { role: true, isActive: true } });
  return isEligibleAssignee(user) ? undefined : ASSIGNEE_MESSAGE;
}

// BR-07, authoritative check: inside the transaction, after the Ticket lock and
// immediately before the write. FOR SHARE on the User row makes a concurrent
// deactivation or role change wait until this transaction commits, so the
// assignee cannot become ineligible between this read and the write.
async function checkAssigneeLocked(tx: Prisma.TransactionClient, assigneeId: number | null | undefined): Promise<string | undefined> {
  if (assigneeId === undefined || assigneeId === null) return undefined;
  const rows = await tx.$queryRaw<Array<{ role: string; isActive: boolean }>>(
    Prisma.sql`SELECT "role"::text AS "role", "isActive" FROM "User" WHERE "id" = ${assigneeId} FOR SHARE`
  );
  return isEligibleAssignee(rows[0]) ? undefined : ASSIGNEE_MESSAGE;
}

const TICKET_CLOSED = { error: "This ticket is closed or cancelled and accepts no actions.", code: "TICKET_CLOSED" };
const TICKET_RESOLVED = { error: "Reopen the ticket before adding open work.", code: "TICKET_RESOLVED" };

function revisionData(actionTakenId: number, revision: number, editedById: number, v: ActionValues) {
  return {
    actionTakenId,
    revision,
    editedById,
    status: v.status,
    assigneeId: v.assigneeId,
    actionAt: v.actionAt,
    description: v.description,
    result: v.result,
    followUpRequired: v.followUpRequired,
    followUpNote: v.followUpNote,
    attachmentNotes: v.attachmentNotes,
  };
}

export function registerActionsTakenRoutes(app: Express): void {
  const staffRoles = requireRole("IT_STAFF", "ADMINISTRATOR");

  app.get("/api/tickets/:id/actions", requireAuth, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    try {
      if (!(await findVisibleTicket(ticketId, req.user!))) return res.status(404).json({ error: "Ticket not found." });
      const actions = await getPrisma().actionTaken.findMany({
        where: { ticketId },
        include: actionInclude,
        orderBy: [{ actionAt: "asc" }, { id: "asc" }],
      });
      res.status(200).json({ actions: actions.map(serializeAction) });
    } catch (error) {
      console.error("Failed to list actions:", error);
      res.status(500).json({ error: "Failed to load actions" });
    }
  });

  app.post("/api/tickets/:id/actions", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    const now = new Date();

    const fields = validateActionFields(req.body, now);
    const resolved = fields.errors ? { errors: fields.errors } : resolveActionCreate(fields.values, now);

    try {
      const assigneeError = await checkAssignee(fields.values.assigneeId);
      if ("errors" in resolved || assigneeError) {
        const errors = { ...("errors" in resolved ? resolved.errors : {}), ...(assigneeError ? { assigneeId: assigneeError } : {}) };
        return res.status(400).json({ error: "Please correct the highlighted fields.", errors });
      }
      const values = resolved.values;
      await actionsTakenHooks.afterAssigneeCheck?.();

      const prisma = getPrisma();
      if (!(await findVisibleTicket(ticketId, req.user!))) return res.status(404).json({ error: "Ticket not found." });
      const performerId = req.user!.id;

      const outcome = await prisma.$transaction(async (tx) => {
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { currentStatus: true } });
        if (!ticket) return { kind: "missing" as const };
        if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") return { kind: "closed" as const };
        if (ticket.currentStatus === "RESOLVED" && OPEN_ACTION_STATUSES.includes(values.status)) return { kind: "resolved" as const };
        const assigneeRecheck = await checkAssigneeLocked(tx, values.assigneeId);
        if (assigneeRecheck) return { kind: "assignee" as const, message: assigneeRecheck };
        const created = await tx.actionTaken.create({ data: { ticketId, performedById: performerId, ...values } });
        await tx.actionTakenRevision.create({ data: { ...revisionData(created.id, 1, performerId, values), editedAt: created.createdAt } });
        const row = await tx.actionTaken.findUniqueOrThrow({ where: { id: created.id }, include: actionInclude });
        return { kind: "ok" as const, row };
      });

      if (outcome.kind === "missing") return res.status(404).json({ error: "Ticket not found." });
      if (outcome.kind === "closed") return res.status(409).json(TICKET_CLOSED);
      if (outcome.kind === "resolved") return res.status(409).json(TICKET_RESOLVED);
      if (outcome.kind === "assignee") return res.status(400).json({ error: "Please correct the highlighted fields.", errors: { assigneeId: outcome.message } });
      res.status(201).json(serializeAction(outcome.row));
    } catch (error) {
      console.error("Failed to create action:", error);
      res.status(500).json({ error: "Failed to create action" });
    }
  });

  app.patch("/api/tickets/:id/actions/:actionId", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    const actionId = parseId(req.params.actionId);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    if (actionId === null) return res.status(400).json({ error: "Invalid action id." });

    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const fields = validateActionFields(body, new Date());
    const errors: FieldErrors = { ...(fields.errors ?? {}) };
    const version = body.version;
    if (typeof version !== "number" || !Number.isInteger(version)) errors.version = "Version is required.";

    try {
      const assigneeError = await checkAssignee(fields.values.assigneeId);
      if (assigneeError) errors.assigneeId = assigneeError;
      if (Object.keys(errors).length > 0) return res.status(400).json({ error: "Please correct the highlighted fields.", errors });
      await actionsTakenHooks.afterAssigneeCheck?.();

      const prisma = getPrisma();
      if (!(await findVisibleTicket(ticketId, req.user!))) return res.status(404).json({ error: "Ticket not found." });
      if (!(await prisma.actionTaken.findFirst({ where: { id: actionId, ticketId }, select: { id: true } }))) {
        return res.status(404).json({ error: "Action not found." });
      }
      const editorId = req.user!.id;

      const outcome = await prisma.$transaction(async (tx) => {
        // BR-13: ticket lock first, then the action (always this order).
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { currentStatus: true } });
        const stored = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId } });
        if (!ticket || !stored) return { kind: "missing" as const };
        // Stored-state checks, in this order: 409 closed, 409 final, 409 stale,
        // 409 resolved, then the 400 rules that need the stored values.
        if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") return { kind: "closed" as const };
        if (FINAL_ACTION_STATUSES.includes(stored.status)) return { kind: "final" as const };
        if (stored.version !== version) return { kind: "stale" as const, currentVersion: stored.version };
        const resultingStatus = fields.values.status ?? stored.status;
        if (ticket.currentStatus === "RESOLVED" && OPEN_ACTION_STATUSES.includes(resultingStatus)) return { kind: "resolved" as const };

        const resolved = resolveActionEdit(stored, fields.values);
        if ("errors" in resolved) return { kind: "invalid" as const, errors: resolved.errors };
        const values = resolved.values;
        // Only an assignee supplied in this request is re-checked; an existing
        // assignment that was valid when made is left as it is.
        const assigneeRecheck = await checkAssigneeLocked(tx, fields.values.assigneeId);
        if (assigneeRecheck) return { kind: "invalid" as const, errors: { assigneeId: assigneeRecheck } };

        // The version check and the write are one statement (BR-17).
        const updated = await tx.actionTaken.updateMany({
          where: { id: actionId, version: stored.version },
          data: {
            status: values.status,
            assigneeId: values.assigneeId,
            actionAt: values.actionAt,
            description: values.description,
            result: values.result,
            followUpRequired: values.followUpRequired,
            followUpNote: values.followUpNote,
            attachmentNotes: values.attachmentNotes,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) return { kind: "stale" as const, currentVersion: stored.version };
        actionsTakenHooks.afterUpdate?.();
        await tx.actionTakenRevision.create({ data: revisionData(actionId, stored.version + 1, editorId, values) });
        const row = await tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: actionInclude });
        return { kind: "ok" as const, row };
      });

      switch (outcome.kind) {
        case "missing":
          return res.status(404).json({ error: "Action not found." });
        case "closed":
          return res.status(409).json(TICKET_CLOSED);
        case "final":
          return res.status(409).json({ error: "A completed or cancelled action can no longer be edited.", code: "ACTION_FINAL" });
        case "stale":
          return res.status(409).json({ error: "This record was changed by someone else. Reload and try again.", code: "STALE_VERSION", currentVersion: outcome.currentVersion });
        case "resolved":
          return res.status(409).json(TICKET_RESOLVED);
        case "invalid":
          return res.status(400).json({ error: "Please correct the highlighted fields.", errors: outcome.errors });
        default:
          return res.status(200).json(serializeAction(outcome.row));
      }
    } catch (error) {
      console.error("Failed to edit action:", error);
      res.status(500).json({ error: "Failed to edit action" });
    }
  });

  app.get("/api/tickets/:id/actions/:actionId/revisions", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    const actionId = parseId(req.params.actionId);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    if (actionId === null) return res.status(400).json({ error: "Invalid action id." });
    try {
      const prisma = getPrisma();
      if (!(await prisma.actionTaken.findFirst({ where: { id: actionId, ticketId }, select: { id: true } }))) {
        return res.status(404).json({ error: "Action not found." });
      }
      const revisions = await prisma.actionTakenRevision.findMany({
        where: { actionTakenId: actionId },
        include: { editedBy: personSelect },
        orderBy: { revision: "asc" },
      });
      res.status(200).json({
        revisions: revisions.map((r) => ({
          revision: r.revision,
          editedBy: r.editedBy,
          editedAt: r.editedAt.toISOString(),
          status: r.status,
          assigneeId: r.assigneeId,
          actionAt: r.actionAt.toISOString(),
          description: r.description,
          result: r.result,
          followUpRequired: r.followUpRequired,
          followUpNote: r.followUpNote,
          attachmentNotes: r.attachmentNotes,
        })),
      });
    } catch (error) {
      console.error("Failed to list revisions:", error);
      res.status(500).json({ error: "Failed to load revisions" });
    }
  });
}
