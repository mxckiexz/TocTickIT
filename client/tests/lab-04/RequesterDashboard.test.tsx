import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RequesterDashboard from "../../src/RequesterDashboard.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { parseRoute } from "../../src/routes.js";

// Lab 4 F8 (docs/lab-04/tests.md §5: UI-15, and the Requester part of UI-13 states; ui-spec.md §3).

afterEach(() => {
  vi.restoreAllMocks();
});

function data(overrides: Partial<api.RequesterDashboardData> = {}): api.RequesterDashboardData {
  return {
    generatedAt: "2026-11-01T10:00:00.000Z",
    timezone: "Asia/Bangkok",
    openTickets: 4,
    waitingForRequester: 1,
    recentlyUpdated: [
      { id: 21, ticketNumber: "TKT-2026-000021", summary: "Laptop battery drains", currentStatus: "WAITING_FOR_REQUESTER", itPriority: "HIGH", updatedAt: "2026-11-01T08:00:00.000Z" },
      { id: 18, ticketNumber: "TKT-2026-000018", summary: "VPN will not connect", currentStatus: "IN_PROGRESS", itPriority: "MEDIUM", updatedAt: "2026-10-31T08:00:00.000Z" },
    ],
    recentlyResolved: [
      { id: 15, ticketNumber: "TKT-2026-000015", summary: "Printer offline", currentStatus: "RESOLVED", itPriority: "LOW", updatedAt: "2026-10-30T08:00:00.000Z" },
    ],
    ...overrides,
  };
}

const EMPTY = data({ openTickets: 0, waitingForRequester: 0, recentlyUpdated: [], recentlyResolved: [] });

function renderWith(dashboard: api.RequesterDashboardData) {
  vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(dashboard);
  return render(<RequesterDashboard />);
}

const routeOf = (link: HTMLElement) => parseRoute(link.getAttribute("href") ?? "");

describe("RequesterDashboard (UI-15)", () => {
  it("shows Open tickets and Waiting for you with their numbers, each with a View link to My Tickets and that filter", async () => {
    renderWith(data());

    const open = await screen.findByRole("link", { name: "View 4 open tickets" });
    expect(routeOf(open)).toEqual({ view: "myTickets", filters: { open: true } });
    const waiting = screen.getByRole("link", { name: "View 1 ticket waiting for you" });
    expect(routeOf(waiting)).toEqual({ view: "myTickets", filters: { currentStatus: "WAITING_FOR_REQUESTER" } });

    const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-card]") as HTMLElement;
    expect(within(card("Open tickets")).getByText("4")).toBeInTheDocument();
    expect(within(card("Waiting for you")).getByText("1")).toBeInTheDocument();
  });

  it("Recently updated rows open the ticket and show number, summary, status text and time (no IT priority)", async () => {
    renderWith(data());
    const section = (await screen.findByRole("heading", { name: "Recently updated" })).closest("section") as HTMLElement;

    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("TKT-2026-000021");
    expect(rows[0]).toHaveTextContent("Laptop battery drains");
    expect(rows[0]).toHaveTextContent("Waiting for Requester");
    expect(rows[0]).toHaveTextContent(new Date("2026-11-01T08:00:00.000Z").toLocaleString());
    expect(rows[0]).not.toHaveTextContent("HIGH");
    expect(routeOf(within(rows[0]).getByRole("link", { name: "TKT-2026-000021" }))).toEqual({ view: "myTickets", filters: {}, ticketId: 21 });
    expect(routeOf(within(section).getByRole("link", { name: "View all recently updated tickets" }))).toEqual({
      view: "myTickets",
      filters: { recent: true, sortBy: "updatedAt" },
    });
  });

  it("Recently resolved is its own list, linking to resolved tickets from the window", async () => {
    renderWith(data());
    const section = (await screen.findByRole("heading", { name: "Recently resolved" })).closest("section") as HTMLElement;

    expect(within(section).getAllByRole("listitem")).toHaveLength(1);
    expect(within(section).getByRole("listitem")).toHaveTextContent("Printer offline");
    expect(routeOf(within(section).getByRole("link", { name: "View all recently resolved tickets" }))).toEqual({
      view: "myTickets",
      filters: { currentStatus: "RESOLVED", recent: true },
    });
  });

  it("an empty list says so without hiding the other list or the cards", async () => {
    renderWith(data({ recentlyResolved: [] }));

    expect(await screen.findByText("No recently resolved tickets")).toBeInTheDocument();
    expect(screen.queryByText("You have no tickets yet.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View 4 open tickets" })).toBeInTheDocument();
  });

  it("a zero is shown as 0 with 'Nothing here'", async () => {
    renderWith(data({ waitingForRequester: 0 }));
    const card = (await screen.findByRole("heading", { name: "Waiting for you" })).closest("[data-card]") as HTMLElement;

    expect(within(card).getByText("0")).toBeInTheDocument();
    expect(within(card).getByText("Nothing here")).toBeInTheDocument();
  });

  it("with nothing at all, says 'You have no tickets yet.' and offers New Ticket as the main action", async () => {
    renderWith(EMPTY);

    expect(await screen.findByText("You have no tickets yet.")).toBeInTheDocument();
    const create = screen.getByRole("link", { name: "New Ticket" });
    expect(create).toHaveClass("btn-success");
    expect(routeOf(create)).toEqual({ view: "newTicket" });
  });

  it("is not a copy of My Tickets: no table, no search, no filters", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "Open tickets" });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("has one 'Dashboard' h2 and h3 section headings", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "Open tickets" });

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Dashboard"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Open tickets",
      "Waiting for you",
      "Recently updated",
      "Recently resolved",
    ]);
  });
});

describe("RequesterDashboard states", () => {
  it("shows 'Loading dashboard…' and no numbers while loading", () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockReturnValue(new Promise(() => {}));
    render(<RequesterDashboard />);

    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Open tickets" })).not.toBeInTheDocument();
  });

  it("shows 'Unable to load the dashboard.' with Retry", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchRequesterDashboard")
      .mockRejectedValueOnce(new ApiError("Failed to load the dashboard", 500))
      .mockResolvedValue(data());
    render(<RequesterDashboard />);

    expect(await screen.findByText("Unable to load the dashboard.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "View 4 open tickets" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shows the forbidden panel on a 403", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockRejectedValue(new ApiError("Forbidden", 403));
    render(<RequesterDashboard />);

    expect(await screen.findByText("You do not have permission to view this page.")).toBeInTheDocument();
  });
});
