import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MyTickets from "../../src/MyTickets.js";
import StaffTicketQueue from "../../src/StaffTicketQueue.js";
import TicketDetail from "../../src/TicketDetail.js";
import {
  PriorityBadge,
  STATUS_LABELS,
  StatusBadge,
  priorityBadgeClass,
  statusBadgeClass,
} from "../../src/ticketBadges.js";
import * as api from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";

// docs/lab-03/tests.md STY-01 (badge half), UI-18. Sheet section 7: "use
// consistent badges for Ticket status, Requested Priority, IT Priority, and
// role". The Requester's Ticket Detail and My Tickets used to print the raw
// enum (`IN_PROGRESS`, `LOW`) while the staff screens used badges; one shared
// module now formats both, and these tests pin it on every screen.

const ALL_STATUSES: api.TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

const categories = [{ id: 1, name: "Hardware" }];
const relatedSystems = [{ id: 1, name: "Email" }];

function ticket(overrides: Partial<api.Ticket> = {}): api.Ticket {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    ownerId: null,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "IN_PROGRESS",
    requesterMarkedResolvedAt: null,
    requesterMarkedResolvedById: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shared ticket badge formatting", () => {
  it("has a human-readable label for every status, never the raw enum value", () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(STATUS_LABELS.IN_PROGRESS).toBe("In Progress");
    expect(STATUS_LABELS.WAITING_FOR_REQUESTER).toBe("Waiting for Requester");
    for (const status of ALL_STATUSES) expect(STATUS_LABELS[status]).not.toMatch(/_/);
  });

  it("maps priority to semantic colours: HIGH danger, MEDIUM warning, LOW secondary", () => {
    expect(priorityBadgeClass("HIGH")).toBe("badge text-bg-danger");
    expect(priorityBadgeClass("MEDIUM")).toBe("badge text-bg-warning");
    expect(priorityBadgeClass("LOW")).toBe("badge text-bg-secondary");
  });

  it("maps every status to one of the allowed semantic classes", () => {
    for (const status of ALL_STATUSES) {
      expect(statusBadgeClass(status)).toMatch(/^badge text-bg-(success|warning|danger|secondary|info)$/);
    }
    expect(statusBadgeClass("RESOLVED")).toBe(statusBadgeClass("CLOSED"));
    expect(statusBadgeClass("IN_PROGRESS")).toBe("badge text-bg-info");
  });

  it("renders the label as text (never colour alone)", () => {
    render(
      <>
        <StatusBadge status="WAITING_FOR_REQUESTER" />
        <PriorityBadge priority="HIGH" />
      </>
    );
    expect(screen.getByText("Waiting for Requester")).toHaveClass("badge", "text-bg-warning");
    expect(screen.getByText("HIGH")).toHaveClass("badge", "text-bg-danger");
  });
});

describe("Requester Ticket Detail (UI-18)", () => {
  function renderDetail(overrides: Partial<api.Ticket> = {}) {
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(ticket(overrides));
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([]);
    vi.spyOn(api, "fetchComments").mockResolvedValue([]);
    return render(
      <TicketDetail ticketId={1} categories={categories} relatedSystems={relatedSystems} onBack={() => {}} />
    );
  }

  it("shows the status as a labelled badge, not the raw enum value", async () => {
    renderDetail({ currentStatus: "IN_PROGRESS" });

    const status = await screen.findByText("In Progress");
    expect(status).toHaveClass("badge", "text-bg-info");
    expect(screen.queryByText("IN_PROGRESS")).not.toBeInTheDocument();
  });

  it("shows Requested Priority as a priority badge", async () => {
    renderDetail({ requestedPriority: "LOW" });

    const priority = await screen.findByText("LOW");
    expect(priority).toHaveClass("badge", "text-bg-secondary");
  });

  it.each(ALL_STATUSES)("labels %s the same way as the staff screens do", async (status) => {
    renderDetail({ currentStatus: status });
    const badge = await screen.findByText(STATUS_LABELS[status]);
    expect(badge.className).toBe(statusBadgeClass(status));
  });
});

describe("My Tickets list (UI-18)", () => {
  it("shows each row's priority and status as badges, not raw enum text", async () => {
    vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
    vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [
        ticket({ id: 1, ticketNumber: "TKT-2026-000001", summary: "One", requestedPriority: "HIGH", currentStatus: "WAITING_FOR_REQUESTER" }),
      ],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    mockLoggedInUser();

    render(<MyTickets />);

    const row = (await screen.findByText("One")).closest("tr")!;
    expect(within(row).getByText("HIGH")).toHaveClass("badge", "text-bg-danger");
    expect(within(row).getByText("Waiting for Requester")).toHaveClass("badge", "text-bg-warning");
    expect(within(row).queryByText("WAITING_FOR_REQUESTER")).not.toBeInTheDocument();
  });
});

describe("consistency across screens (UI-18)", () => {
  it("the same status and priority get the same badge on the Requester list and the Staff Queue", async () => {
    vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
    vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
    vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [ticket({ summary: "Same ticket", requestedPriority: "HIGH", currentStatus: "REOPENED" })],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [
        {
          ...ticket({ summary: "Same ticket", requestedPriority: "HIGH", currentStatus: "REOPENED" }),
          requesterName: "Jennifer Anderson",
          ownerName: null,
          categoryName: "Hardware",
        } as unknown as api.StaffTicketSummary,
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    const requester = render(<MyTickets />);
    const requesterRow = (await screen.findByText("Same ticket")).closest("tr")!;
    const requesterBadges = [
      within(requesterRow).getByText("HIGH").className,
      within(requesterRow).getByText("Reopened").className,
    ];
    requester.unmount();

    render(<StaffTicketQueue />);
    const staffRow = (await screen.findAllByText("Same ticket"))[0].closest("tr")!;
    expect(within(staffRow).getAllByText("HIGH")[0].className).toBe(requesterBadges[0]);
    expect(within(staffRow).getByText("Reopened").className).toBe(requesterBadges[1]);
  });
});
