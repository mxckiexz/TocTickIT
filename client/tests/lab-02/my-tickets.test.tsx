import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

const categories = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];
const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 2, name: "VPN" },
];
const requesters = [{ id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test" }];

function ticket(overrides: Partial<api.Ticket> = {}): api.Ticket {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    currentStatus: "New",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockLookups() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
  vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);
}

async function openMyTickets() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /My Tickets/i }));

  await screen.findByRole("button", { name: /Continue as this Requester/i });
  fireEvent.change(screen.getByLabelText(/^Requester/i), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue as this Requester/i }));

  await screen.findByRole("heading", { name: /My Tickets/i });
}

describe("MyTickets", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("does not fetch tickets until My Tickets is opened", () => {
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets");
    render(<App />);

    expect(fetchTicketsSpy).not.toHaveBeenCalled();
  });

  it("goes through the same Development Requester picker as New Ticket", async () => {
    mockLookups();
    vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });

    await openMyTickets();

    expect(screen.getByText(/Viewing as/i)).toHaveTextContent("Jennifer Anderson");
  });

  it("lists the requester's tickets with a default sort of newest first", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [ticket({ id: 1, summary: "Ticket one" }), ticket({ id: 2, summary: "Ticket two" })],
      pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
    });

    await openMyTickets();

    expect(await screen.findByText("Ticket one")).toBeInTheDocument();
    expect(screen.getByText("Ticket two")).toBeInTheDocument();
    expect(fetchTicketsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requesterId: 1, sortBy: "createdAt", sortDir: "desc", page: 1 })
    );
  });

  it("shows an empty state when nothing matches", async () => {
    mockLookups();
    vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });

    await openMyTickets();

    expect(await screen.findByText(/No tickets match/i)).toBeInTheDocument();
  });

  it("debounces the search box before calling the API", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });
    await openMyTickets();
    fetchTicketsSpy.mockClear();

    const searchBox = screen.getByLabelText(/Search tickets/i);
    fireEvent.change(searchBox, { target: { value: "b" } });
    fireEvent.change(searchBox, { target: { value: "ba" } });
    fireEvent.change(searchBox, { target: { value: "battery" } });

    expect(fetchTicketsSpy).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "battery" }))
    );
    expect(fetchTicketsSpy).toHaveBeenCalledTimes(1);
  });

  it("re-fetches with the chosen category filter", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });
    await openMyTickets();
    fetchTicketsSpy.mockClear();

    fireEvent.change(screen.getByLabelText(/Filter by category/i), { target: { value: "2" } });

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 2, page: 1 }))
    );
  });

  it("re-fetches with the chosen status filter", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });
    await openMyTickets();
    fetchTicketsSpy.mockClear();

    const statusSelect = screen.getByLabelText(/Filter by status/i);
    expect(screen.getByRole("option", { name: "All statuses" })).toBeInTheDocument();
    fireEvent.change(statusSelect, { target: { value: "New" } });

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ currentStatus: "New", page: 1 })
      )
    );
  });

  it("re-fetches with the chosen sort option", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });
    await openMyTickets();
    fetchTicketsSpy.mockClear();

    fireEvent.change(screen.getByLabelText(/Sort by/i), { target: { value: "summary-asc" } });

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: "summary", sortDir: "asc" })
      )
    );
  });

  it("pages forward and back, and disables Previous on page 1", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [ticket({ id: 1 })],
      pagination: { page: 1, pageSize: 10, totalItems: 15, totalPages: 2 },
    });
    await openMyTickets();

    expect(screen.getByRole("button", { name: /Previous/i })).toBeDisabled();

    fetchTicketsSpy.mockResolvedValue({
      tickets: [ticket({ id: 2 })],
      pagination: { page: 2, pageSize: 10, totalItems: 15, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    );
    expect(await screen.findByRole("button", { name: /^Next$/i })).toBeDisabled();
  });

  it("resets to page 1 when a filter changes", async () => {
    mockLookups();
    const fetchTicketsSpy = vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [ticket({ id: 1 })],
      pagination: { page: 1, pageSize: 10, totalItems: 15, totalPages: 2 },
    });
    await openMyTickets();

    fetchTicketsSpy.mockResolvedValue({
      tickets: [ticket({ id: 2 })],
      pagination: { page: 2, pageSize: 10, totalItems: 15, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }));
    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    );

    fetchTicketsSpy.mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });
    fireEvent.change(screen.getByLabelText(/Filter by priority/i), { target: { value: "HIGH" } });

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ requestedPriority: "HIGH", page: 1 })
      )
    );
  });

  it("switches to My Tickets from New Ticket without re-picking the requester", async () => {
    mockLookups();
    vi.spyOn(api, "fetchTickets").mockResolvedValue({
      tickets: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    });

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /New Ticket/i }));
    await screen.findByRole("button", { name: /Continue as this Requester/i });
    fireEvent.change(screen.getByLabelText(/^Requester/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue as this Requester/i }));
    await screen.findByRole("button", { name: /Submit Ticket/i });

    fireEvent.click(screen.getByRole("button", { name: /^My Tickets$/i }));

    expect(await screen.findByText(/Viewing as/i)).toHaveTextContent("Jennifer Anderson");
    expect(screen.queryByRole("button", { name: /Continue as this Requester/i })).not.toBeInTheDocument();
  });
});
