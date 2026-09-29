import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";

const categories = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];
const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 2, name: "VPN" },
];

function staffTicket(overrides: Partial<api.StaffTicketSummary> = {}): api.StaffTicketSummary {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    requesterName: "Jennifer Anderson",
    ownerId: null,
    ownerName: null,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "NEW",
    requesterMarkedResolvedAt: null,
    requesterMarkedResolvedById: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockLookups() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
}

// UI-04/UI-07: the queue is only reachable through the IT Staff nav
// destination — a Requester or Administrator session never renders it.
async function openQueue() {
  mockLoggedInUser({ id: 5, name: "Priya Nair", role: "IT_STAFF" });
  render(<App />);
  await screen.findByRole("heading", { name: "Ticket Queue" });
}

describe("StaffTicketQueue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders for an IT Staff session without any nav click needed", async () => {
    mockLookups();
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
    });

    await openQueue();

    expect(screen.getByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
  });

  // Review fix: the mobile Filters disclosure sits above the search box and
  // collapses only the secondary filter dropdowns — search stays visible
  // (and usable) whether or not Filters is expanded.
  it("keeps the search box visible on mobile while the other filters are collapsed", async () => {
    mockLookups();
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
    });
    await openQueue();
    fetchSpy.mockClear();

    // Collapsed by default — "Filter by category" (a secondary filter) has
    // exactly one match (the desktop copy); the search box still has two
    // (mobile's always-visible one, plus the desktop copy).
    expect(screen.getAllByLabelText(/Search tickets/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/Filter by category/i)).toHaveLength(1);

    const searchBox = screen.getAllByLabelText(/Search tickets/i)[0];
    fireEvent.change(searchBox, { target: { value: "battery" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "battery" }))
    );
  });

  // UI-04: role-scoped nav — a Requester never sees the Ticket Queue.
  it("is never rendered for a Requester session", async () => {
    mockLookups();
    mockLoggedInUser({ id: 1, name: "Jennifer Anderson", role: "REQUESTER" });
    render(<App />);

    await screen.findByRole("button", { name: /New Ticket/i });
    expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
  });

  it("shows 'No tickets yet.' when nothing exists and no filter is active", async () => {
    mockLookups();
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
    });

    await openQueue();

    expect(await screen.findByText("No tickets yet.")).toBeInTheDocument();
  });

  it("shows 'No tickets match your search and filters.' when a filter narrows to nothing", async () => {
    mockLookups();
    const fetchSpy = vi
      .spyOn(api, "fetchStaffTickets")
      .mockResolvedValueOnce({
        tickets: [staffTicket()],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      })
      .mockResolvedValueOnce({
        tickets: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
      });

    await openQueue();
    // The ticket number/summary render in both the desktop table and the
    // (CSS-hidden, but still present in jsdom) mobile card list — scope to
    // the table so this doesn't match twice.
    within(await screen.findByRole("table")).getByText("TKT-2026-000001");

    fireEvent.change(screen.getByLabelText(/Filter by status/i), { target: { value: "CLOSED" } });

    expect(await screen.findByText("No tickets match your search and filters.")).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ currentStatus: "CLOSED" }))
    );
  });

  it("shows tickets from multiple Requesters, with requesterName/ownerName and priority/status badges", async () => {
    mockLookups();
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [
        staffTicket({ id: 1, requesterName: "Jennifer Anderson", ownerName: null }),
        staffTicket({
          id: 2,
          ticketNumber: "TKT-2026-000002",
          requesterName: "Michael Brown",
          ownerId: 5,
          ownerName: "Priya Nair",
          itPriority: "HIGH",
          currentStatus: "OPEN",
        }),
      ],
      pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
    });

    await openQueue();

    // Scoped to the desktop table — the same numbers/summary also render
    // (CSS-hidden) in the mobile card list, which jsdom doesn't hide.
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("TKT-2026-000001")).toBeInTheDocument();
    expect(table.getByText("TKT-2026-000002")).toBeInTheDocument();
    expect(table.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(table.getByText("Priya Nair")).toBeInTheDocument();
  });

  it("debounces the search box before calling the API", async () => {
    mockLookups();
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
    });
    await openQueue();
    fetchSpy.mockClear();

    // The search box renders twice — once always-visible on mobile, once
    // inside the CSS-hidden-but-still-in-jsdom desktop layout (review fix:
    // search now stays outside the mobile Filters disclosure) — either one
    // drives the same `searchInput` state, so acting on the first is enough.
    const searchBox = screen.getAllByLabelText(/Search tickets/i)[0];
    fireEvent.change(searchBox, { target: { value: "b" } });
    fireEvent.change(searchBox, { target: { value: "ba" } });
    fireEvent.change(searchBox, { target: { value: "battery" } });

    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "battery" }))
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches with the chosen category/priority/owner filters", async () => {
    mockLookups();
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
    });
    await openQueue();
    fetchSpy.mockClear();

    fireEvent.change(screen.getByLabelText(/Filter by category/i), { target: { value: "2" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 2, page: 1 }))
    );

    fireEvent.change(screen.getByLabelText(/Filter by IT priority/i), { target: { value: "HIGH" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ itPriority: "HIGH" }))
    );

    fireEvent.change(screen.getByLabelText(/Filter by owner/i), { target: { value: "unassigned" } });
    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ ownerId: 0 })));
  });

  it("sorts by clicking a sortable column header, toggling direction on a second click", async () => {
    mockLookups();
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [staffTicket()],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    await openQueue();
    fetchSpy.mockClear();

    fireEvent.click(screen.getByText(/IT Priority/i));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "itPriority", sortDir: "desc" })
      )
    );

    fireEvent.click(screen.getByText(/IT Priority/i));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "itPriority", sortDir: "asc" })
      )
    );
  });

  it("paginates results and disables Previous on page 1", async () => {
    mockLookups();
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [staffTicket()],
      pagination: { page: 1, pageSize: 20, totalItems: 25, totalPages: 2 },
    });
    await openQueue();

    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();

    fetchSpy.mockResolvedValue({
      tickets: [staffTicket({ id: 2 })],
      pagination: { page: 2, pageSize: 20, totalItems: 25, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  // Feature 5 (issue #38): clicking a ticket row opens the Staff Ticket
  // Detail screen.
  it("opens the Staff Ticket Detail screen when a ticket row is clicked", async () => {
    mockLookups();
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      tickets: [staffTicket()],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
      ticket: {
        ...staffTicket(),
        requesterEmail: "jennifer.anderson@toktickit.test",
        ownerEmail: null,
      },
      attachments: [],
      comments: [],
      notes: [],
    });

    await openQueue();
    const table = within(await screen.findByRole("table"));
    fireEvent.click(table.getByText("TKT-2026-000001"));

    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to Ticket Queue/i })).toBeInTheDocument();
  });

  it("shows the Forbidden panel on a 403, distinct from a generic error", async () => {
    mockLookups();
    vi.spyOn(api, "fetchStaffTickets").mockRejectedValue(
      new ApiError("You do not have permission to perform this action.", 403)
    );

    await openQueue();

    expect(
      await screen.findByText("You do not have permission to view this page.")
    ).toBeInTheDocument();
  });

  it("shows a generic error banner on a non-403 failure", async () => {
    mockLookups();
    vi.spyOn(api, "fetchStaffTickets").mockRejectedValue(new Error("network down"));

    await openQueue();

    expect(await screen.findByText("Unable to load the ticket queue.")).toBeInTheDocument();
  });
});
