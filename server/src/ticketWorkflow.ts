import type { Express, Response } from "express";
import { ActionStatus, Prisma, Priority, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { AuthedRequest, requireAuth, requirePasswordUpToDate, requireRole } from "./auth.js";
import { STATUS_TRANSITIONS, isLegalStatusTransition, statusRequiresConfirmation } from "./ticketStatus.js";
import { checkAssignee, checkAssigneeLocked, lockTicket } from "./actionsTaken.js";

// Lab 4 F4: ticket workflow (docs/lab-04/specification.md BR-11..BR-17, BR-26,
// api-spec.md "Ticket workflow"). Claim, assign, priority, status and
// mark-resolved moved here from app.ts: each now requires `version` (BR-17),
// opens to the Administrator (BR-26), takes the Ticket lock (BR-13), and the
// status route enforces the resolution gate (BR-12).

export type GateReason = "NO_OWNER" | "NO_COMPLETED_ACTION" | "OPEN_ACTIONS";

// BR-12, as a pure function so it can be tested without the database.
export function evaluateResolutionGate(ticket: { ownerId: number | null }, actions: Array<{ status: ActionStatus }>): GateReason[] {
  const unmet: GateReason[] = [];
  if (ticket.ownerId === null) unmet.push("NO_OWNER");
  if (!actions.some((a) => a.status === "COMPLETED")) unmet.push("NO_COMPLETED_ACTION");
  if (actions.some((a) => a.status === "PLANNED" || a.status === "IN_PROGRESS")) unmet.push("OPEN_ACTIONS");
  return unmet;
}

// What the staff screens need next to a ticket (FR-12): the same lists for IT
// Staff and Administrator.
export function workflowFields(ticket: { currentStatus: TicketStatus; ownerId: number | null }, actions: Array<{ status: ActionStatus }>) {
  const unmet = evaluateResolutionGate(ticket, actions);
  return {
    allowedTransitions: STATUS_TRANSITIONS[ticket.currentStatus],
    resolutionGate: { ok: unmet.length === 0, unmet },
  };
}

// Test seam: lets a test change the new owner in the gap between the early
// eligibility check and the write, to prove the in-transaction re-check (BR-07).
export const workflowHooks: { afterOwnerCheck?: () => Promise<void> | void } = {};

const PRIORITIES: readonly Priority[] = ["LOW", "MEDIUM", "HIGH"];
const OWNER_MESSAGE = "ownerId must reference an active IT Staff or Administrator.";
// BR-40: once a ticket is in one of these, the Requester can no longer flag it.
const RESOLVE_BLOCKED_STATUSES: readonly TicketStatus[] = ["RESOLVED", "CLOSED", "CANCELLED"];

const parseId = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const versionOf = (body: unknown): number | null => {
  const v = (body as { version?: unknown } | undefined)?.version;
  return typeof v === "number" && Number.isInteger(v) ? v : null;
};
const VERSION_ERROR = { version: "Version is required." };
const stale = (currentVersion: number) => ({
  error: "This record was changed by someone else. Reload and try again.",
  code: "STALE_VERSION",
  currentVersion,
});

type Outcome<T> = { kind: "ok"; ticket: T } | { kind: "missing" } | { kind: "stale"; currentVersion: number } | { kind: "owner"; message: string } | { kind: "conflict"; status: number; body: object };

export function registerTicketWorkflowRoutes(app: Express): void {
  const staffRoles = requireRole("IT_STAFF", "ADMINISTRATOR");
  const respond = <T>(res: Response, outcome: Outcome<T>, ok: (ticket: T) => object) => {
    switch (outcome.kind) {
      case "missing":
        return res.status(404).json({ error: "Ticket not found." });
      case "stale":
        return res.status(409).json(stale(outcome.currentVersion));
      case "owner":
        return res.status(400).json({ errors: { ownerId: outcome.message } });
      case "conflict":
        return res.status(outcome.status).json(outcome.body);
      default:
        return res.status(200).json(ok(outcome.ticket));
    }
  };

  app.post("/api/staff/tickets/:id/claim", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    const version = versionOf(req.body);
    if (version === null) return res.status(400).json({ errors: VERSION_ERROR });

    try {
      const outcome: Outcome<Prisma.TicketGetPayload<object>> = await getPrisma().$transaction(async (tx) => {
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) return { kind: "missing" };
        if (ticket.version !== version) return { kind: "stale", currentVersion: ticket.version };
        // BR-18: a claim only ever takes an unowned ticket.
        if (ticket.ownerId !== null) {
          return { kind: "conflict", status: 409, body: { error: "Ticket is already assigned. Use assign to change its owner.", code: "ALREADY_ASSIGNED" } };
        }
        const updated = await tx.ticket.update({ where: { id: ticketId }, data: { ownerId: req.user!.id, version: { increment: 1 } } });
        return { kind: "ok", ticket: updated };
      });
      respond(res, outcome, (t) => t);
    } catch (error) {
      console.error("Failed to claim ticket:", error);
      res.status(500).json({ error: "Failed to claim ticket" });
    }
  });

  app.post("/api/staff/tickets/:id/assign", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    const ownerId = req.body?.ownerId;
    const version = versionOf(req.body);
    const errors: Record<string, string> = {};
    if (!Number.isInteger(ownerId) || ownerId <= 0) errors.ownerId = "ownerId is required and must be a positive integer.";
    if (version === null) errors.version = VERSION_ERROR.version;

    try {
      if (!errors.ownerId) {
        const ownerError = await checkAssignee(ownerId, OWNER_MESSAGE);
        if (ownerError) errors.ownerId = ownerError;
      }
      if (Object.keys(errors).length > 0) return res.status(400).json({ errors });
      await workflowHooks.afterOwnerCheck?.();

      const outcome: Outcome<Prisma.TicketGetPayload<object>> = await getPrisma().$transaction(async (tx) => {
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) return { kind: "missing" };
        if (ticket.version !== version) return { kind: "stale", currentVersion: ticket.version };
        const recheck = await checkAssigneeLocked(tx, ownerId, OWNER_MESSAGE);
        if (recheck) return { kind: "owner", message: recheck };
        const updated = await tx.ticket.update({ where: { id: ticketId }, data: { ownerId, version: { increment: 1 } } });
        return { kind: "ok", ticket: updated };
      });
      respond(res, outcome, (t) => t);
    } catch (error) {
      console.error("Failed to assign ticket:", error);
      res.status(500).json({ error: "Failed to assign ticket" });
    }
  });

  app.patch("/api/staff/tickets/:id/priority", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    const itPriority = req.body?.itPriority;
    const version = versionOf(req.body);
    const errors: Record<string, string> = {};
    if (!PRIORITIES.includes(itPriority)) errors.itPriority = "itPriority must be LOW, MEDIUM, or HIGH.";
    if (version === null) errors.version = VERSION_ERROR.version;
    if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

    try {
      // BR-20: requestedPriority is never touched by this route.
      const outcome: Outcome<Prisma.TicketGetPayload<object>> = await getPrisma().$transaction(async (tx) => {
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) return { kind: "missing" };
        if (ticket.version !== version) return { kind: "stale", currentVersion: ticket.version };
        const updated = await tx.ticket.update({ where: { id: ticketId }, data: { itPriority, version: { increment: 1 } } });
        return { kind: "ok", ticket: updated };
      });
      respond(res, outcome, (t) => t);
    } catch (error) {
      console.error("Failed to update ticket priority:", error);
      res.status(500).json({ error: "Failed to update ticket priority" });
    }
  });

  app.patch("/api/staff/tickets/:id/status", requireAuth, staffRoles, requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    const target = req.body?.currentStatus as TicketStatus;
    const version = versionOf(req.body);
    const errors: Record<string, string> = {};
    if (!Object.values(TicketStatus).includes(target)) {
      errors.currentStatus = `currentStatus must be one of: ${Object.values(TicketStatus).join(", ")}.`;
    } else if (statusRequiresConfirmation(target) && req.body?.confirm !== true) {
      // BR-14: confirmation is checked with the other 400s, before the 404 and 409 rungs.
      errors.confirm = "Confirmation is required to set this status.";
    }
    if (version === null) errors.version = VERSION_ERROR.version;
    if (Object.keys(errors).length > 0) return res.status(400).json({ errors });

    try {
      const outcome: Outcome<{ ticket: Prisma.TicketGetPayload<object>; actions: Array<{ status: ActionStatus }> }> = await getPrisma().$transaction(async (tx) => {
        // BR-13: the lock is held through the matrix check, the gate check and the write.
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) return { kind: "missing" };
        if (ticket.version !== version) return { kind: "stale", currentVersion: ticket.version };
        if (!isLegalStatusTransition(ticket.currentStatus, target)) {
          return {
            kind: "conflict",
            status: 409,
            body: { error: `Cannot transition from ${ticket.currentStatus} to ${target}.`, code: "ILLEGAL_TRANSITION" },
          };
        }
        const actions = await tx.actionTaken.findMany({ where: { ticketId }, select: { status: true } });
        if (target === "RESOLVED") {
          const unmet = evaluateResolutionGate(ticket, actions);
          if (unmet.length > 0) {
            return { kind: "conflict", status: 409, body: { error: "The resolution conditions are not met.", code: "RESOLUTION_GATE", unmet } };
          }
        }
        const updated = await tx.ticket.update({ where: { id: ticketId }, data: { currentStatus: target, version: { increment: 1 } } });
        return { kind: "ok", ticket: { ticket: updated, actions } };
      });
      respond(res, outcome, ({ ticket, actions }) => ({ ticket: { ...ticket, ...workflowFields(ticket, actions) } }));
    } catch (error) {
      console.error("Failed to update ticket status:", error);
      res.status(500).json({ error: "Failed to update ticket status" });
    }
  });

  // BR-26: the Requester's signal stays advisory (BR-15): it records who and when
  // and never changes currentStatus. It is a write to the ticket, so it carries
  // the version like the other routes (BR-17).
  app.post("/api/tickets/:id/mark-resolved", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    const ticketId = parseId(req.params.id);
    if (ticketId === null) return res.status(400).json({ error: "Invalid ticket id." });
    const version = versionOf(req.body);
    if (version === null) return res.status(400).json({ errors: VERSION_ERROR });
    const requesterId = req.user!.id;

    try {
      const prisma = getPrisma();
      // BR-14: a ticket that is not the caller's looks the same as one that does not exist.
      if (!(await prisma.ticket.findFirst({ where: { id: ticketId, requesterId }, select: { id: true } }))) {
        return res.status(404).json({ error: "Ticket not found." });
      }
      const outcome: Outcome<Prisma.TicketGetPayload<object>> = await prisma.$transaction(async (tx) => {
        await lockTicket(tx, ticketId);
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) return { kind: "missing" };
        if (ticket.version !== version) return { kind: "stale", currentVersion: ticket.version };
        if (RESOLVE_BLOCKED_STATUSES.includes(ticket.currentStatus)) {
          return { kind: "conflict", status: 409, body: { error: `This ticket is already ${ticket.currentStatus} and can't be marked resolved.` } };
        }
        // BR-24: repeating the call while the ticket is not terminal just refreshes who and when.
        const updated = await tx.ticket.update({
          where: { id: ticketId },
          data: { requesterMarkedResolvedAt: new Date(), requesterMarkedResolvedById: requesterId, version: { increment: 1 } },
        });
        return { kind: "ok", ticket: updated };
      });
      respond(res, outcome, (t) => t);
    } catch (error) {
      console.error("Failed to mark ticket resolved:", error);
      res.status(500).json({ error: "Failed to mark ticket resolved" });
    }
  });

  // BR-26: IT Staff and Administrator may both own a ticket, so both are offered.
  app.get("/api/staff/assignable-users", requireAuth, staffRoles, requirePasswordUpToDate, async (_req: AuthedRequest, res: Response) => {
    try {
      const users = await getPrisma().user.findMany({
        where: { role: { in: ["IT_STAFF", "ADMINISTRATOR"] }, isActive: true },
        select: { id: true, name: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      res.status(200).json(users);
    } catch (error) {
      console.error("Failed to retrieve assignable users:", error);
      res.status(500).json({ error: "Failed to retrieve assignable users" });
    }
  });
}
