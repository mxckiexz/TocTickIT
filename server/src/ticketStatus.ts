import { TicketStatus } from "@prisma/client";

// docs/lab-03/specification.md §7.3 — the ticket status transition matrix.
// Keyed by "from" status; each value lists every legal "to" status. A cell
// not listed (including a status transitioning to itself) is illegal —
// BR-22 rejects it with 409.
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

export function isLegalStatusTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

// specification.md §7.3's confirmation table — a property of the *target*
// status, not of the specific from→to pair: reaching one of these four
// always needs `confirm: true` in the request body (BR-42), regardless of
// which legal source status the transition started from.
export const CONFIRMATION_REQUIRED_STATUSES: ReadonlySet<TicketStatus> = new Set([
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
]);

export function statusRequiresConfirmation(target: TicketStatus): boolean {
  return CONFIRMATION_REQUIRED_STATUSES.has(target);
}
