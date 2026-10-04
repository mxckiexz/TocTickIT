import type { Priority, TicketStatus } from "./api.js";

// One place that decides how a ticket's status and priority look, used by every
// screen that shows them (Requester My Tickets and Ticket Detail, Staff Queue
// and Ticket Detail). Sheet section 7 asks for "consistent badges for Ticket
// status, Requested Priority, IT Priority"; before this module the staff
// screens had badges and the Requester screens printed the raw enum
// (`IN_PROGRESS`, `LOW`). Colour never carries meaning alone: every badge has
// its text label (ui-spec.md section 1).

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

// The status filter dropdowns' options, in workflow order.
export const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = (
  Object.keys(STATUS_LABELS) as TicketStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function priorityBadgeClass(priority: Priority): string {
  switch (priority) {
    case "HIGH":
      return "badge text-bg-danger";
    case "MEDIUM":
      return "badge text-bg-warning";
    case "LOW":
    default:
      return "badge text-bg-secondary";
  }
}

export function statusBadgeClass(status: TicketStatus): string {
  switch (status) {
    case "RESOLVED":
    case "CLOSED":
      return "badge text-bg-success";
    case "CANCELLED":
      return "badge text-bg-secondary";
    case "REOPENED":
    case "WAITING_FOR_REQUESTER":
      return "badge text-bg-warning";
    case "IN_PROGRESS":
      return "badge text-bg-info";
    case "OPEN":
    case "NEW":
    default:
      return "badge text-bg-secondary";
  }
}

export function PriorityBadge({ priority, prefix }: { priority: Priority; prefix?: string }) {
  return (
    <span className={priorityBadgeClass(priority)}>
      {prefix}
      {priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={statusBadgeClass(status)}>{statusLabel(status)}</span>;
}
