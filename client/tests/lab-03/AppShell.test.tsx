import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";
import { mockDashboards } from "../helpers/dashboards.js";

// docs/lab-03/tests.md UI-04 (ui-spec.md §3): the App Shell shows only the
// current role's navigation destinations and the authenticated user's name and
// role, and routes Login / forced Change Password / app by session state.
function mockScreens() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([{ id: 1, name: "VPN" }]);
  vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
    tickets: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
  });
  vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
  // Lab 4 F8: every role now lands on a dashboard.
  mockDashboards();
}

describe("App Shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state before the session check resolves", () => {
    vi.spyOn(api, "getCurrentUser").mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows Login when there is no session", async () => {
    vi.spyOn(api, "getCurrentUser").mockResolvedValue(null);
    render(<App />);
    expect(await screen.findByRole("button", { name: /^Log in$/i })).toBeInTheDocument();
  });

  it("shows only Change Password (no navigation, no logout bar) while mustChangePassword is true (AC-02)", async () => {
    mockLoggedInUser({ mustChangePassword: true });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Change your password" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Ticket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  // UI-17 (sheet section 7: "Logout and permitted profile/password actions")
  describe("voluntary Change password", () => {
    const savedUser = (role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR") => ({
      id: 1,
      name: "Priya Nair",
      email: "priya.nair@toktickit.test",
      role,
      mustChangePassword: false,
    });

    it.each(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const)(
      "%s sees a Change password action next to Log out",
      async (role) => {
        mockScreens();
        mockLoggedInUser({ role });
        render(<App />);

        expect(await screen.findByRole("button", { name: "Change password" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
      }
    );

    it("opens the Change Password screen, and Cancel returns to the shell", async () => {
      mockScreens();
      mockLoggedInUser({ role: "IT_STAFF" });
      render(<App />);

      fireEvent.click(await screen.findByRole("button", { name: "Change password" }));
      expect(await screen.findByRole("heading", { name: "Change your password" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.queryByText("Password changed.")).not.toBeInTheDocument();
    });

    it("after a successful change, returns to the shell with a 'Password changed.' confirmation", async () => {
      mockScreens();
      mockLoggedInUser({ role: "IT_STAFF" });
      vi.spyOn(api, "changePassword").mockResolvedValue(savedUser("IT_STAFF"));
      render(<App />);

      fireEvent.click(await screen.findByRole("button", { name: "Change password" }));
      fireEvent.change(await screen.findByLabelText(/Current password/i), { target: { value: "OldPassword1" } });
      fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: "NewPassword1" } });
      fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: "NewPassword1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password/i }));

      expect(await screen.findByText("Password changed.")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    });

    it("is not offered on the forced first-login screen (AC-02)", async () => {
      mockLoggedInUser({ mustChangePassword: true });
      render(<App />);

      await screen.findByRole("heading", { name: "Change your password" });
      expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
    });
  });

  // Lab 4 F8 (docs/lab-04/ui-spec.md §1, tests.md UI-16): one navigation row per role, the Dashboard first and the
  // landing page, `aria-current` on the current page. These replace the Lab 3 tests that expected the Ticket Queue
  // (IT Staff) or User Management (Administrator) as the landing page (docs/lab-04/tests.md §9).
  describe("role-scoped navigation", () => {
    const navItems = () => within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("button").map((b) => b.textContent);
    const nav = () => within(screen.getByRole("navigation", { name: "Main" }));

    it("Requester: Dashboard, New Ticket and My Tickets, landing on the Dashboard; never the queue or User Management", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Jennifer Anderson", role: "REQUESTER" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(navItems()).toEqual(["Dashboard", "New Ticket", "My Tickets"]);
      expect(nav().getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "User Management" })).not.toBeInTheDocument();
    });

    it("IT Staff: Dashboard and Ticket Queue, landing on the Dashboard; never Requester navigation or User Management", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Priya Nair", role: "IT_STAFF" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(navItems()).toEqual(["Dashboard", "Ticket Queue"]);
      expect(nav().getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("button", { name: "New Ticket" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "My Tickets" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "User Management" })).not.toBeInTheDocument();
    });

    // docs/lab-04/specification.md D-2, D-6: the Administrator works on tickets like IT Staff.
    it("Administrator: Dashboard, Ticket Queue and User Management, landing on the Dashboard; never Requester navigation", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Grace Thompson", role: "ADMINISTRATOR" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(navItems()).toEqual(["Dashboard", "Ticket Queue", "User Management"]);
      expect(nav().getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      expect(screen.queryByRole("button", { name: "New Ticket" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "My Tickets" })).not.toBeInTheDocument();
    });

    it("Administrator: moves between the three pages, marking the current one and showing only that page", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Grace Thompson", role: "ADMINISTRATOR" });
      render(<App />);
      await screen.findByRole("heading", { name: "Dashboard" });

      fireEvent.click(nav().getByRole("button", { name: "Ticket Queue" }));
      expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
      expect(nav().getByRole("button", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
      expect(nav().getByRole("button", { name: "Dashboard" })).not.toHaveAttribute("aria-current");

      fireEvent.click(nav().getByRole("button", { name: "User Management" }));
      expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
      expect(nav().getByRole("button", { name: "User Management" })).toHaveAttribute("aria-current", "page");

      fireEvent.click(nav().getByRole("button", { name: "Dashboard" }));
      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    });

    it("Requester: New Ticket and My Tickets open from the navigation, and the Dashboard comes back", async () => {
      mockScreens();
      vi.spyOn(api, "fetchTickets").mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
      });
      mockLoggedInUser({ role: "REQUESTER" });
      render(<App />);
      await screen.findByRole("heading", { name: "Dashboard" });

      fireEvent.click(nav().getByRole("button", { name: "My Tickets" }));
      expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
      expect(nav().getByRole("button", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");

      fireEvent.click(nav().getByRole("button", { name: "New Ticket" }));
      expect(await screen.findByRole("button", { name: /Submit|Create/i })).toBeInTheDocument();
      expect(nav().getByRole("button", { name: "New Ticket" })).toHaveAttribute("aria-current", "page");

      fireEvent.click(nav().getByRole("button", { name: "Dashboard" }));
      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    });

    it("a page the role cannot use is not opened by its address: the Dashboard is shown, and the API would answer 403 anyway", async () => {
      mockScreens();
      window.location.hash = "#/users";
      mockLoggedInUser({ role: "IT_STAFF" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "User Management" })).not.toBeInTheDocument();
    });

    it("a Requester's address cannot open the staff Ticket Queue either", async () => {
      mockScreens();
      window.location.hash = "#/queue";
      mockLoggedInUser({ role: "REQUESTER" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
    });
  });

  // UI-12 and UI-15 meet the real pages here: a dashboard link opens the list it counts.
  describe("dashboard drill-down links (ui-spec.md §2, §3)", () => {
    it("IT Staff: 'View 6 unassigned tickets' opens the Ticket Queue showing unassigned open tickets", async () => {
      mockScreens();
      const queue = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
      });
      mockLoggedInUser({ role: "IT_STAFF" });
      render(<App />);

      fireEvent.click(await screen.findByRole("link", { name: "View 6 unassigned tickets" }));

      expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
      await waitFor(() => expect(queue).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 0, open: true })));
      expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
      expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Ticket Queue" })).toHaveAttribute("aria-current", "page");
    });

    it("Requester: 'View 4 open tickets' opens My Tickets showing open tickets", async () => {
      mockScreens();
      const list = vi.spyOn(api, "fetchTickets").mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
      });
      mockLoggedInUser({ role: "REQUESTER" });
      render(<App />);

      fireEvent.click(await screen.findByRole("link", { name: "View 4 open tickets" }));

      expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
      await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ open: true })));
    });

    it("a deep link opens the ticket at its Actions Taken section after login", async () => {
      mockScreens();
      vi.spyOn(api, "fetchActions").mockResolvedValue([]);
      vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
      });
      const detail = vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
        ticket: {
          id: 12, ticketNumber: "TKT-2026-000012", requesterId: 1, requesterName: "J", requesterEmail: "j@x.test", ownerId: null, ownerName: null,
          ownerEmail: null, categoryId: 1, categoryName: "Hardware", relatedSystemId: 1, relatedSystemName: "Email", summary: "S", description: "D",
          requestedPriority: "LOW", itPriority: "LOW", currentStatus: "NEW", requesterMarkedResolvedAt: null, requesterMarkedResolvedById: null,
          createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", version: 1, allowedTransitions: ["OPEN"],
          resolutionGate: { ok: false, unmet: ["NO_OWNER", "NO_COMPLETED_ACTION"] },
        },
        attachments: [], comments: [], notes: [],
      });
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      window.location.hash = "#/queue/12?section=actions-taken";
      mockLoggedInUser({ role: "IT_STAFF" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "TKT-2026-000012" })).toBeInTheDocument();
      expect(detail).toHaveBeenCalledWith(12);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it("clicking the current navigation item while a ticket is open goes back to that list", async () => {
      mockScreens();
      vi.spyOn(api, "fetchActions").mockResolvedValue([]);
      vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
      });
      vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
        ticket: {
          id: 12, ticketNumber: "TKT-2026-000012", requesterId: 1, requesterName: "J", requesterEmail: "j@x.test", ownerId: null, ownerName: null,
          ownerEmail: null, categoryId: 1, categoryName: "Hardware", relatedSystemId: 1, relatedSystemName: "Email", summary: "S", description: "D",
          requestedPriority: "LOW", itPriority: "LOW", currentStatus: "NEW", requesterMarkedResolvedAt: null, requesterMarkedResolvedById: null,
          createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", version: 1, allowedTransitions: ["OPEN"],
          resolutionGate: { ok: false, unmet: ["NO_OWNER", "NO_COMPLETED_ACTION"] },
        },
        attachments: [], comments: [], notes: [],
      });
      window.location.hash = "#/queue/12";
      mockLoggedInUser({ role: "IT_STAFF" });
      render(<App />);
      await screen.findByRole("heading", { name: "TKT-2026-000012" });

      fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Ticket Queue" }));

      expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "TKT-2026-000012" })).not.toBeInTheDocument();
    });

    it("Log out forgets the address, so the next person to log in lands on their own Dashboard", async () => {
      mockScreens();
      vi.spyOn(api, "logout").mockResolvedValue(undefined);
      vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
        tickets: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 },
      });
      window.location.hash = "#/queue?ownerId=me&open=1";
      mockLoggedInUser({ role: "IT_STAFF" });
      render(<App />);
      await screen.findByRole("heading", { name: "Ticket Queue" });

      fireEvent.click(screen.getByRole("button", { name: "Log out" }));

      await screen.findByRole("button", { name: /^Log in$/i });
      expect(window.location.hash).toBe("");
    });
  });

  it("shows the authenticated user's name and role in the header", async () => {
    mockScreens();
    mockLoggedInUser({ name: "Priya Nair", role: "IT_STAFF" });
    render(<App />);

    expect(await screen.findByText("Priya Nair")).toBeInTheDocument();
    expect(screen.getByText("IT_STAFF")).toBeInTheDocument();
  });

  it("Log out ends the session and returns to Login, clearing the role-scoped screen", async () => {
    mockScreens();
    mockLoggedInUser({ role: "ADMINISTRATOR" });
    const logoutSpy = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    await waitFor(() => expect(logoutSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: /^Log in$/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "User Management" })).not.toBeInTheDocument();
  });

  it("the Requester screens' shell is narrower than the staff/admin shell (their tables need the room)", async () => {
    mockScreens();
    mockLoggedInUser({ role: "REQUESTER" });
    const requester = render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    expect((requester.container.firstChild as HTMLElement).style.maxWidth).toBe("640px");
    requester.unmount();

    vi.restoreAllMocks();
    mockScreens();
    mockLoggedInUser({ role: "IT_STAFF" });
    const staff = render(<App />);
    await screen.findByRole("heading", { name: "Dashboard" });
    expect((staff.container.firstChild as HTMLElement).style.maxWidth).toBe("1140px");
  });
});
