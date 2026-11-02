import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StaffTicketQueue from "../../src/StaffTicketQueue.js";
import MyTickets from "../../src/MyTickets.js";
import * as api from "../../src/api.js";

// Lab 4 F8 (ui-spec.md §2, §3; api-spec.md "Dashboards" drill-downs): the Ticket Queue and My Tickets open with the
// filter a dashboard link carries, say which filters are on (the open, recent and my-actions ones have no control of
// their own), and can open one ticket directly.

beforeEach(() => {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([{ id: 1, name: "Email" }]);
  vi.spyOn(api, "fetchActions").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const page = { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 };

function staffSpy() {
  return vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ tickets: [], pagination: page });
}
function requesterSpy() {
  return vi.spyOn(api, "fetchTickets").mockResolvedValue({ tickets: [], pagination: page });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastCall = (spy: { mock: { calls: any[][] } }) => spy.mock.calls[spy.mock.calls.length - 1][0];

function staffTicket(): api.StaffTicket {
  return {
    id: 12, ticketNumber: "TKT-2026-000012", requesterId: 1, requesterName: "Jennifer Anderson", requesterEmail: "j@x.test",
    ownerId: 5, ownerName: "Priya Nair", ownerEmail: "p@x.test", categoryId: 1, categoryName: "Hardware", relatedSystemId: 1,
    relatedSystemName: "Email", summary: "Dock does not charge", description: "d", requestedPriority: "MEDIUM", itPriority: "MEDIUM",
    currentStatus: "IN_PROGRESS", requesterMarkedResolvedAt: null, requesterMarkedResolvedById: null,
    createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", version: 1,
    allowedTransitions: ["RESOLVED"], resolutionGate: { ok: true, unmet: [] },
  };
}

describe("Ticket Queue opened from a dashboard link", () => {
  it("unassigned: asks for unassigned open tickets, and shows the Owner filter as Unassigned", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ ownerId: "unassigned", open: true }} />);

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ ownerId: 0, open: true });
    expect(screen.getByLabelText("Filter by owner")).toHaveValue("unassigned");
    expect(screen.getByRole("status")).toHaveTextContent("Open tickets only");
  });

  it("assigned to me: the Owner filter has an 'Assigned to me' choice and the request says ownerId me", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ ownerId: "me", open: true }} />);

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ ownerId: "me", open: true });
    expect(screen.getByLabelText("Filter by owner")).toHaveValue("me");
    expect(screen.getByRole("option", { name: "Assigned to me" })).toBeInTheDocument();
  });

  it("my open actions: asks for actionAssigneeId me and says so", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ actionAssigneeId: "me" }} />);

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ actionAssigneeId: "me" });
    expect(screen.getByRole("status")).toHaveTextContent("Tickets with my open actions");
  });

  it("a status or an IT priority from the link fills the matching filter control", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ currentStatus: "IN_PROGRESS", itPriority: "HIGH", open: true }} />);

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ currentStatus: "IN_PROGRESS", itPriority: "HIGH", open: true });
    expect(screen.getByLabelText("Filter by status")).toHaveValue("IN_PROGRESS");
    expect(screen.getByLabelText("Filter by IT priority")).toHaveValue("HIGH");
  });

  it("recent: asks for recent=1 sorted by last updated, newest first, and says so", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ recent: true, sortBy: "updatedAt" }} />);

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ recent: true, sortBy: "updatedAt", sortDir: "desc" });
    expect(screen.getByRole("status")).toHaveTextContent("Updated in the last 7 days");
  });

  it("the notice names every drill-down filter that is on, and Clear removes them and reloads the list", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ ownerId: "me", open: true, recent: true }} />);
    await screen.findByRole("heading", { name: "Ticket Queue" });
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Open tickets only");
    expect(notice).toHaveTextContent("Updated in the last 7 days");

    fireEvent.click(screen.getByRole("button", { name: "Clear dashboard filter" }));

    await waitFor(() => expect(lastCall(spy).open).toBeUndefined());
    expect(lastCall(spy).recent).toBeUndefined();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The visible controls are untouched by Clear.
    expect(screen.getByLabelText("Filter by owner")).toHaveValue("me");
  });

  it("a filter the user changes is added to the link's filter, not a replacement for it", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue initialFilters={{ ownerId: "unassigned", open: true }} />);
    await screen.findByRole("heading", { name: "Ticket Queue" });

    fireEvent.change(screen.getByLabelText("Filter by IT priority"), { target: { value: "LOW" } });

    await waitFor(() => expect(lastCall(spy)).toMatchObject({ itPriority: "LOW", ownerId: 0, open: true }));
  });

  it("without a link filter nothing extra is sent and no notice is shown", async () => {
    const spy = staffSpy();
    render(<StaffTicketQueue />);

    await screen.findByRole("heading", { name: "Ticket Queue" });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const params = lastCall(spy);
    expect(params.open).toBeUndefined();
    expect(params.recent).toBeUndefined();
    expect(params.actionAssigneeId).toBeUndefined();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("an empty drill-down says the filters matched nothing, rather than 'No tickets yet.'", async () => {
    staffSpy();
    render(<StaffTicketQueue initialFilters={{ actionAssigneeId: "me" }} />);

    expect(await screen.findByText("No tickets match your search and filters.")).toBeInTheDocument();
  });

  it("opens the given ticket straight away, and Back returns to the filtered queue", async () => {
    const spy = staffSpy();
    const detail = vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({ ticket: staffTicket(), attachments: [], comments: [], notes: [] });
    render(<StaffTicketQueue initialFilters={{ ownerId: "me", open: true }} initialTicketId={12} />);

    expect(await screen.findByRole("heading", { name: "TKT-2026-000012" })).toBeInTheDocument();
    expect(detail).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByRole("button", { name: /Back to Ticket Queue/ }));
    expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
    await waitFor(() => expect(lastCall(spy)).toMatchObject({ ownerId: "me", open: true }));
  });

  it("with section=actions-taken the ticket opens scrolled to the Actions Taken section", async () => {
    staffSpy();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({ ticket: staffTicket(), attachments: [], comments: [], notes: [] });
    render(<StaffTicketQueue initialTicketId={12} scrollToActions />);

    await screen.findByRole("heading", { name: "TKT-2026-000012" });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect((scrollIntoView.mock.contexts[0] as HTMLElement).id).toBe("actions-taken");
  });

  it("without scrollToActions the ticket does not scroll", async () => {
    staffSpy();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({ ticket: staffTicket(), attachments: [], comments: [], notes: [] });
    render(<StaffTicketQueue initialTicketId={12} />);

    await screen.findByRole("heading", { name: "TKT-2026-000012" });
    await screen.findByText("No actions recorded yet.");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("My Tickets opened from a dashboard link", () => {
  it("open: asks for open tickets only and says so", async () => {
    const spy = requesterSpy();
    render(<MyTickets initialFilters={{ open: true }} />);

    await screen.findByRole("heading", { name: /My Tickets/ });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ open: true });
    expect(screen.getByRole("status")).toHaveTextContent("Open tickets only");
  });

  it("waiting for you: fills the status filter", async () => {
    const spy = requesterSpy();
    render(<MyTickets initialFilters={{ currentStatus: "WAITING_FOR_REQUESTER" }} />);

    await screen.findByRole("heading", { name: /My Tickets/ });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ currentStatus: "WAITING_FOR_REQUESTER" });
    expect(screen.getByLabelText("Filter by status")).toHaveValue("WAITING_FOR_REQUESTER");
  });

  it("recent: asks for recent=1 ordered by last updated, newest first, and offers that ordering", async () => {
    const spy = requesterSpy();
    render(<MyTickets initialFilters={{ recent: true, sortBy: "updatedAt" }} />);

    await screen.findByRole("heading", { name: /My Tickets/ });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ recent: true, sortBy: "updatedAt", sortDir: "desc" });
    expect(screen.getByRole("status")).toHaveTextContent("Updated in the last 7 days");
    expect(screen.getByRole("option", { name: "Recently updated" })).toBeInTheDocument();
  });

  it("recently resolved: status Resolved and recent together", async () => {
    const spy = requesterSpy();
    render(<MyTickets initialFilters={{ currentStatus: "RESOLVED", recent: true }} />);

    await screen.findByRole("heading", { name: /My Tickets/ });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy)).toMatchObject({ currentStatus: "RESOLVED", recent: true });
  });

  it("Clear removes open and recent and reloads", async () => {
    const spy = requesterSpy();
    render(<MyTickets initialFilters={{ open: true, recent: true }} />);
    await screen.findByRole("heading", { name: /My Tickets/ });

    fireEvent.click(screen.getByRole("button", { name: "Clear dashboard filter" }));

    await waitFor(() => expect(lastCall(spy).open).toBeUndefined());
    expect(lastCall(spy).recent).toBeUndefined();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("without a link filter nothing extra is sent", async () => {
    const spy = requesterSpy();
    render(<MyTickets />);

    await screen.findByRole("heading", { name: /My Tickets/ });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(lastCall(spy).open).toBeUndefined();
    expect(lastCall(spy).recent).toBeUndefined();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens the given ticket straight away", async () => {
    requesterSpy();
    const detail = vi.spyOn(api, "fetchTicketDetail").mockResolvedValue({
      id: 5, ticketNumber: "TKT-2026-000005", requesterId: 1, ownerId: null, categoryId: 1, relatedSystemId: 1, summary: "S", description: "D",
      requestedPriority: "LOW", itPriority: "LOW", currentStatus: "NEW", requesterMarkedResolvedAt: null, requesterMarkedResolvedById: null,
      createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", version: 1,
    });
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([]);
    vi.spyOn(api, "fetchComments").mockResolvedValue([]);
    render(<MyTickets initialTicketId={5} />);

    expect(await screen.findByRole("heading", { name: "TKT-2026-000005" })).toBeInTheDocument();
    expect(detail).toHaveBeenCalledWith(5);
  });
});
