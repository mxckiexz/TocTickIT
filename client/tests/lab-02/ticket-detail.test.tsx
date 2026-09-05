import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";

const categories = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];
const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 2, name: "VPN" },
];
const requesters = [{ id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test" }];

const listedTicket: api.Ticket = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 2,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drains much faster than usual.",
  requestedPriority: "MEDIUM",
  currentStatus: "New",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function mockLookups() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
  vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);
}

async function openMyTicketsWithOneTicket() {
  mockLookups();
  vi.spyOn(api, "fetchTickets").mockResolvedValue({
    tickets: [listedTicket],
    pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /My Tickets/i }));

  await screen.findByRole("button", { name: /Continue as this Requester/i });
  fireEvent.change(screen.getByLabelText(/^Requester/i), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue as this Requester/i }));

  await screen.findByRole("heading", { name: /My Tickets/i });
}

describe("TicketDetail", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("does not fetch a ticket's detail until its row is clicked", async () => {
    const fetchDetailSpy = vi.spyOn(api, "fetchTicketDetail");
    await openMyTicketsWithOneTicket();

    expect(fetchDetailSpy).not.toHaveBeenCalled();
  });

  it("opens the detail screen and shows the ticket's full fields", async () => {
    await openMyTicketsWithOneTicket();
    const fetchDetailSpy = vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));

    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(fetchDetailSpy).toHaveBeenCalledWith(1, 1);
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText("Battery drains much faster than usual.")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  });

  it("keeps the previous search/filter/sort state after Back is clicked", async () => {
    await openMyTicketsWithOneTicket();
    const fetchTicketsSpy = vi.mocked(api.fetchTickets);

    // Put the list into a non-default state before opening the ticket.
    fireEvent.change(screen.getByLabelText(/Filter by category/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Sort by/i), { target: { value: "summary-asc" } });
    fireEvent.change(screen.getByLabelText(/Search tickets/i), { target: { value: "battery" } });

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryId: 2,
          sortBy: "summary",
          sortDir: "asc",
          search: "battery",
        })
      )
    );
    const callsBeforeOpening = fetchTicketsSpy.mock.calls.length;

    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    fireEvent.click(screen.getByRole("button", { name: /Back to My Tickets/i }));
    await screen.findByRole("heading", { name: /My Tickets/i });

    // The controls still reflect the state set before opening the ticket —
    // MyTickets never remounted (and never reset) while the detail screen
    // was showing.
    expect(screen.getByLabelText(/Filter by category/i)).toHaveValue("2");
    expect(screen.getByLabelText(/Sort by/i)).toHaveValue("summary-asc");
    expect(screen.getByLabelText(/Search tickets/i)).toHaveValue("battery");

    // Confirm it's actually preserved state, not a lucky-looking re-fetch:
    // no additional fetchTickets call happened while going through the
    // detail screen and back.
    expect(fetchTicketsSpy.mock.calls.length).toBe(callsBeforeOpening);
  });

  it("shows an error message when the detail request is rejected (e.g. ownership)", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockRejectedValue(
      new ApiError("You do not have permission to view this ticket.", 403)
    );

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));

    expect(
      await screen.findByText("You do not have permission to view this ticket.")
    ).toBeInTheDocument();
  });
});
