import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import StaffDashboard from "../../src/StaffDashboard.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { parseRoute } from "../../src/routes.js";

// Lab 4 F8 (docs/lab-04/tests.md §5: UI-12, UI-13, UI-14, UI-17, UI-18; ui-spec.md §2).

afterEach(() => {
  vi.restoreAllMocks();
});

function data(overrides: Partial<api.StaffDashboardData> = {}): api.StaffDashboardData {
  return {
    generatedAt: "2026-11-01T10:00:00.000Z",
    timezone: "Asia/Bangkok",
    unassigned: 6,
    assignedToMe: 3,
    ticketsWithMyOpenActions: 2,
    myRecentActions: [
      {
        id: 31,
        ticketId: 12,
        ticketNumber: "TKT-2026-000012",
        status: "COMPLETED",
        actionAt: "2026-11-01T08:30:00.000Z",
        description: "Replaced the docking station",
      },
      {
        id: 30,
        ticketId: 9,
        ticketNumber: "TKT-2026-000009",
        status: "PLANNED",
        actionAt: "2026-10-31T08:30:00.000Z",
        description: "Order a new battery",
      },
    ],
    byStatus: { NEW: 2, OPEN: 1, IN_PROGRESS: 3, WAITING_FOR_REQUESTER: 0, RESOLVED: 1, CLOSED: 4, REOPENED: 0, CANCELLED: 1 },
    byItPriority: { LOW: 3, MEDIUM: 5, HIGH: 1 },
    recentlyUpdated: [
      { id: 12, ticketNumber: "TKT-2026-000012", summary: "Dock does not charge", currentStatus: "IN_PROGRESS", itPriority: "HIGH", updatedAt: "2026-11-01T08:31:00.000Z" },
      { id: 7, ticketNumber: "TKT-2026-000007", summary: "VPN drops every hour", currentStatus: "NEW", itPriority: "MEDIUM", updatedAt: "2026-10-31T09:00:00.000Z" },
    ],
    ...overrides,
  };
}

const ZERO: api.StaffDashboardData = data({
  unassigned: 0,
  assignedToMe: 0,
  ticketsWithMyOpenActions: 0,
  myRecentActions: [],
  byStatus: { NEW: 0, OPEN: 0, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, CLOSED: 0, REOPENED: 0, CANCELLED: 0 },
  byItPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  recentlyUpdated: [],
});

function renderWith(dashboard: api.StaffDashboardData) {
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(dashboard);
  return render(<StaffDashboard />);
}

// The route a link leads to, read back from its href: the same function App uses to open the page.
const routeOf = (link: HTMLElement) => parseRoute(link.getAttribute("href") ?? "");

describe("StaffDashboard: metric cards (UI-12)", () => {
  it("shows the three headline numbers, each with a View link whose accessible name carries the number", async () => {
    renderWith(data());

    const unassigned = await screen.findByRole("link", { name: "View 6 unassigned tickets" });
    expect(routeOf(unassigned)).toEqual({ view: "queue", filters: { ownerId: "unassigned", open: true } });

    const mine = screen.getByRole("link", { name: "View 3 tickets assigned to me" });
    expect(routeOf(mine)).toEqual({ view: "queue", filters: { ownerId: "me", open: true } });

    const actions = screen.getByRole("link", { name: "View 2 tickets with my open actions" });
    expect(routeOf(actions)).toEqual({ view: "queue", filters: { actionAssigneeId: "me" } });

    const card = (name: string) => screen.getByRole("heading", { name }).closest("[data-card]") as HTMLElement;
    expect(within(card("Unassigned")).getByText("6")).toBeInTheDocument();
    expect(within(card("Assigned to me")).getByText("3")).toBeInTheDocument();
    expect(within(card("Open actions assigned to me")).getByText("2")).toBeInTheDocument();
  });

  it("uses the singular for one ticket", async () => {
    renderWith(data({ unassigned: 1, ticketsWithMyOpenActions: 1 }));

    expect(await screen.findByRole("link", { name: "View 1 unassigned ticket" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View 1 ticket with my open actions" })).toBeInTheDocument();
  });

  it("By status lists all eight statuses with text, zeros included, each linking to that status", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "By status" });

    const section = screen.getByRole("heading", { name: "By status" }).closest("[data-card]") as HTMLElement;
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("New"),
      expect.stringContaining("Open"),
      expect.stringContaining("In Progress"),
      expect.stringContaining("Waiting for Requester"),
      expect.stringContaining("Resolved"),
      expect.stringContaining("Closed"),
      expect.stringContaining("Reopened"),
      expect.stringContaining("Cancelled"),
    ]);

    const inProgress = within(section).getByRole("link", { name: "View 3 In Progress tickets" });
    expect(routeOf(inProgress)).toEqual({ view: "queue", filters: { currentStatus: "IN_PROGRESS" } });
    // A status with nothing in it is shown as 0, and still has its link.
    const waiting = within(section).getByRole("link", { name: "View 0 Waiting for Requester tickets" });
    expect(routeOf(waiting)).toEqual({ view: "queue", filters: { currentStatus: "WAITING_FOR_REQUESTER" } });
  });

  it("By IT priority counts open tickets and links with open=1", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "By IT priority" });

    const section = screen.getByRole("heading", { name: "By IT priority" }).closest("[data-card]") as HTMLElement;
    expect(within(section).getByText(/open tickets/i)).toBeInTheDocument();
    const high = within(section).getByRole("link", { name: "View 1 High priority open ticket" });
    expect(routeOf(high)).toEqual({ view: "queue", filters: { itPriority: "HIGH", open: true } });
    expect(within(section).getByRole("link", { name: "View 5 Medium priority open tickets" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "View 3 Low priority open tickets" })).toBeInTheDocument();
  });

  it("no drill-down is a clickable div: every target is a link with a name", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "Unassigned" });

    for (const link of screen.getAllByRole("link")) {
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toMatch(/^#\//);
      expect(link).toHaveAccessibleName();
    }
    expect(document.querySelectorAll("[onclick], div[role='button'], div[tabindex]")).toHaveLength(0);
  });
});

describe("StaffDashboard: lists", () => {
  it("Recently updated rows show number, summary, status and IT priority as text, the time, and open the ticket", async () => {
    renderWith(data());
    const list = (await screen.findByRole("heading", { name: "Recently updated" })).closest("section") as HTMLElement;

    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("TKT-2026-000012");
    expect(rows[0]).toHaveTextContent("Dock does not charge");
    expect(rows[0]).toHaveTextContent("In Progress");
    expect(rows[0]).toHaveTextContent("HIGH");
    expect(rows[0]).toHaveTextContent(new Date("2026-11-01T08:31:00.000Z").toLocaleString());

    const open = within(rows[0]).getByRole("link", { name: /TKT-2026-000012/ });
    expect(routeOf(open)).toEqual({ view: "queue", filters: {}, ticketId: 12 });
    // And one link to the whole recent set.
    expect(routeOf(within(list).getByRole("link", { name: "View all recently updated tickets" }))).toEqual({
      view: "queue",
      filters: { recent: true, sortBy: "updatedAt" },
    });
  });

  it("shows 'No recent tickets' when the list is empty", async () => {
    renderWith(ZERO);
    expect(await screen.findByText("No recent tickets")).toBeInTheDocument();
  });

  it("UI-17: My recent actions rows open the ticket at the Actions Taken section, with status text, time and description", async () => {
    renderWith(data());
    const list = (await screen.findByRole("heading", { name: "My recent actions" })).closest("section") as HTMLElement;

    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const link = within(rows[0]).getByRole("link");
    expect(routeOf(link)).toEqual({ view: "queue", filters: {}, ticketId: 12, section: "actions-taken" });
    expect(link).toHaveTextContent("TKT-2026-000012");
    expect(link).toHaveTextContent("Completed");
    expect(link).toHaveTextContent("Replaced the docking station");
    expect(link).toHaveTextContent(new Date("2026-11-01T08:30:00.000Z").toLocaleString());
    expect(rows[1]).toHaveTextContent("Planned");
  });
});

describe("StaffDashboard: zero, loading, error, forbidden (UI-13, UI-18)", () => {
  it("a zero is shown as 0 with 'Nothing here', never hidden", async () => {
    renderWith(ZERO);
    await screen.findByRole("heading", { name: "Unassigned" });

    for (const name of ["Unassigned", "Assigned to me", "Open actions assigned to me"]) {
      const card = screen.getByRole("heading", { name }).closest("[data-card]") as HTMLElement;
      expect(within(card).getByText("0")).toBeInTheDocument();
      expect(within(card).getByText("Nothing here")).toBeInTheDocument();
    }
    expect(screen.getByText("You have not recorded any actions yet.")).toBeInTheDocument();
    expect(screen.getByText("There are no tickets yet.")).toBeInTheDocument();
  });

  it("UI-18: the my-actions zero state is its own message and does not claim there are no tickets", async () => {
    renderWith(data({ ticketsWithMyOpenActions: 0, myRecentActions: [] }));
    await screen.findByRole("heading", { name: "Open actions assigned to me" });

    const card = screen.getByRole("heading", { name: "Open actions assigned to me" }).closest("[data-card]") as HTMLElement;
    expect(within(card).getByText("0")).toBeInTheDocument();
    expect(within(card).getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("You have not recorded any actions yet.")).toBeInTheDocument();
    expect(screen.queryByText("There are no tickets yet.")).not.toBeInTheDocument();
  });

  it("shows 'Loading dashboard…' and no numbers while loading", () => {
    vi.spyOn(api, "fetchStaffDashboard").mockReturnValue(new Promise(() => {}));
    render(<StaffDashboard />);

    expect(screen.getByText("Loading dashboard…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Unassigned" })).not.toBeInTheDocument();
  });

  it("shows 'Unable to load the dashboard.' with Retry, and Retry loads it again without stale numbers", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchStaffDashboard")
      .mockRejectedValueOnce(new ApiError("Failed to load the dashboard", 500))
      .mockResolvedValue(data());
    render(<StaffDashboard />);

    expect(await screen.findByText("Unable to load the dashboard.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Unassigned" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "View 6 unassigned tickets" })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Unable to load the dashboard.")).not.toBeInTheDocument();
  });

  it("Retry goes back to 'Loading dashboard…' while the new request runs, not to the old error", async () => {
    vi.spyOn(api, "fetchStaffDashboard")
      .mockRejectedValueOnce(new ApiError("Failed to load the dashboard", 500))
      .mockReturnValue(new Promise(() => {}));
    render(<StaffDashboard />);
    await screen.findByText("Unable to load the dashboard.");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Loading dashboard…")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load the dashboard.")).not.toBeInTheDocument();
  });

  it("shows the forbidden panel on a 403", async () => {
    vi.spyOn(api, "fetchStaffDashboard").mockRejectedValue(new ApiError("Forbidden", 403));
    render(<StaffDashboard />);

    expect(await screen.findByText("You do not have permission to view this page.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("StaffDashboard: Administrator extras and quick actions (UI-14)", () => {
  const withUsers = { userCounts: { total: 18, active: 15, byRole: { REQUESTER: 10, IT_STAFF: 5, ADMINISTRATOR: 3 } } };

  it("an Administrator sees the user counts and a Manage users action", async () => {
    renderWith(data(withUsers));

    expect(await screen.findByText("Users: 18 total, 15 active")).toBeInTheDocument();
    const manage = screen.getAllByRole("link", { name: /Manage users|User Management/ });
    expect(manage.length).toBeGreaterThan(0);
    for (const link of manage) expect(routeOf(link)).toEqual({ view: "users" });
    expect(screen.getByRole("link", { name: "Manage users" })).toBeInTheDocument();
  });

  it("IT Staff (no userCounts in the response) see neither the counts nor Manage users", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "Unassigned" });

    expect(screen.queryByText(/^Users:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Manage users|User Management/ })).not.toBeInTheDocument();
  });

  it("both roles get 'Open Ticket Queue'", async () => {
    renderWith(data());
    const open = await screen.findByRole("link", { name: "Open Ticket Queue" });
    expect(routeOf(open)).toEqual({ view: "queue", filters: {} });
  });
});

describe("StaffDashboard: one h2, then h3 (ui-spec.md §8)", () => {
  it("has a single 'Dashboard' h2 and every section heading is an h3", async () => {
    renderWith(data());
    await screen.findByRole("heading", { name: "Unassigned" });

    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Dashboard"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Unassigned",
      "Assigned to me",
      "Open actions assigned to me",
      "By status",
      "By IT priority",
      "Recently updated",
      "My recent actions",
    ]);
  });
});
