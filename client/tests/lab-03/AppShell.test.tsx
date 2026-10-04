import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";

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
      expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
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
      expect(screen.getByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    });

    it("is not offered on the forced first-login screen (AC-02)", async () => {
      mockLoggedInUser({ mustChangePassword: true });
      render(<App />);

      await screen.findByRole("heading", { name: "Change your password" });
      expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
    });
  });

  describe("role-scoped navigation", () => {
    it("Requester: New Ticket and My Tickets — never the queue or User Management", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Jennifer Anderson", role: "REQUESTER" });
      render(<App />);

      expect(await screen.findByRole("button", { name: "New Ticket" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "My Tickets" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "User Management" })).not.toBeInTheDocument();
    });

    it("IT Staff: the Ticket Queue — never Requester navigation or User Management", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Priya Nair", role: "IT_STAFF" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Ticket Queue" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "New Ticket" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "My Tickets" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "User Management" })).not.toBeInTheDocument();
    });

    it("Administrator: User Management — never Requester navigation or the queue", async () => {
      mockScreens();
      mockLoggedInUser({ name: "Grace Thompson", role: "ADMINISTRATOR" });
      render(<App />);

      expect(await screen.findByRole("heading", { name: "User Management" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "New Ticket" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "My Tickets" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Ticket Queue" })).not.toBeInTheDocument();
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
    await screen.findByRole("button", { name: "New Ticket" });
    expect((requester.container.firstChild as HTMLElement).style.maxWidth).toBe("640px");
    requester.unmount();

    vi.restoreAllMocks();
    mockScreens();
    mockLoggedInUser({ role: "IT_STAFF" });
    const staff = render(<App />);
    await screen.findByRole("heading", { name: "Ticket Queue" });
    expect((staff.container.firstChild as HTMLElement).style.maxWidth).toBe("1140px");
  });
});
