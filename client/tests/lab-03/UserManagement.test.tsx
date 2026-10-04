import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";

function adminUser(overrides: Partial<api.AdminUser> = {}): api.AdminUser {
  return {
    id: 1,
    name: "Jennifer Anderson",
    email: "jennifer.anderson@toktickit.test",
    role: "REQUESTER",
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// UI-04/UI-10: User Management is only reachable through the Administrator
// nav destination — a Requester or IT Staff session never renders it.
async function openUserManagement() {
  mockLoggedInUser({ id: 9, name: "Grace Thompson", role: "ADMINISTRATOR" });
  render(<App />);
  await screen.findByRole("heading", { name: "User Management" });
}

describe("UserManagement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // UI-10
  it("shows a loading state, then the user list", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([adminUser()]);
    await openUserManagement();

    expect((await screen.findAllByText("jennifer.anderson@toktickit.test"))[0]).toBeInTheDocument();
  });

  it("shows 'No users match your search.' when the list is empty", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
    await openUserManagement();

    expect(await screen.findByText("No users match your search.")).toBeInTheDocument();
  });

  it("re-queries with search and role filter values", async () => {
    const fetchSpy = vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
    await openUserManagement();
    fetchSpy.mockClear();

    fireEvent.change(screen.getByLabelText(/Search users/i), { target: { value: "jen" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "jen" }))
    );

    fetchSpy.mockClear();
    fireEvent.change(screen.getByLabelText(/Filter by role/i), { target: { value: "IT_STAFF" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ role: "IT_STAFF" }))
    );
  });

  // UI-11
  describe("Create user", () => {
    it("shows field validation errors from the API", async () => {
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
      vi.spyOn(api, "createUser").mockRejectedValue(
        new ApiError("Validation failed", 400, { name: "Name is required." })
      );
      await openUserManagement();

      fireEvent.click(screen.getByRole("button", { name: /Create user/i }));
      fireEvent.click(screen.getAllByRole("button", { name: /Create user/i })[1]);

      expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    });

    it("surfaces a duplicate-email 409 as a field-level message under Email", async () => {
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
      vi.spyOn(api, "createUser").mockRejectedValue(
        new ApiError("Conflict", 409, { email: "This email is already in use." })
      );
      await openUserManagement();

      fireEvent.click(screen.getByRole("button", { name: /Create user/i }));
      fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: "Dup User" } });
      fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "dup@toktickit.test" } });
      fireEvent.change(screen.getByLabelText(/Default password/i), { target: { value: "Fixture-Pass1" } });
      fireEvent.click(screen.getAllByRole("button", { name: /Create user/i })[1]);

      expect(await screen.findByText("This email is already in use.")).toBeInTheDocument();
    });

    it("shows 'User created.' and refreshes the list on success", async () => {
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([]);
      vi.spyOn(api, "createUser").mockResolvedValue(adminUser({ name: "New Person" }));
      await openUserManagement();

      fireEvent.click(screen.getByRole("button", { name: /Create user/i }));
      fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: "New Person" } });
      fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: "new@toktickit.test" } });
      fireEvent.change(screen.getByLabelText(/Default password/i), { target: { value: "Fixture-Pass1" } });
      fireEvent.click(screen.getAllByRole("button", { name: /Create user/i })[1]);

      expect(await screen.findByText("User created.")).toBeInTheDocument();
    });
  });

  // UI-12
  describe("Edit user", () => {
    async function openEditPanel() {
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([adminUser({ id: 2, name: "Edit Target" })]);
      await openUserManagement();
      // The table row and the mobile card both render their own "Edit"
      // button (only one is visible per breakpoint via CSS, but jsdom
      // doesn't apply media queries, so both exist in the DOM) — the first
      // one (desktop table) is enough to open the panel.
      fireEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
      await screen.findByRole("heading", { name: "Edit user" });
    }

    it("shows the self-suspend guard message at the Active control", async () => {
      vi.spyOn(api, "updateUser").mockRejectedValue(
        new ApiError("You cannot suspend your own account.", 409)
      );
      await openEditPanel();

      fireEvent.click(screen.getByLabelText("Active"));
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      const message = await screen.findByText("You cannot suspend your own account.");
      expect(screen.getByLabelText("Active").closest("div")).toContainElement(message);
    });

    it("shows the last-admin guard message at the Role control", async () => {
      vi.spyOn(api, "updateUser").mockRejectedValue(
        new ApiError("At least one active Administrator is required.", 409)
      );
      await openEditPanel();

      fireEvent.change(screen.getByLabelText(/^Role$/i), { target: { value: "IT_STAFF" } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      const message = await screen.findByText("At least one active Administrator is required.");
      expect(screen.getByLabelText(/^Role$/i).closest("div")).toContainElement(message);
    });

    it("shows 'User updated.' and refreshes the list on success", async () => {
      vi.spyOn(api, "updateUser").mockResolvedValue(adminUser({ id: 2, name: "Renamed" }));
      await openEditPanel();

      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("User updated.")).toBeInTheDocument();
    });
  });

  // UI-13
  describe("Reset password", () => {
    it("shows the reset-password success message", async () => {
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([adminUser({ id: 3, name: "Reset Target" })]);
      vi.spyOn(api, "resetUserPassword").mockResolvedValue(
        adminUser({ id: 3, name: "Reset Target", mustChangePassword: true })
      );
      await openUserManagement();

      fireEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]);
      fireEvent.change(screen.getByLabelText(/New default password/i), {
        target: { value: "Brand-New-Pass1" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

      expect(
        await screen.findByText("Password reset. The user must set a new password at their next login.")
      ).toBeInTheDocument();
    });
  });

  it("shows the forbidden panel on a 403 from the list endpoint", async () => {
    vi.spyOn(api, "fetchAdminUsers").mockRejectedValue(new ApiError("Forbidden", 403));
    mockLoggedInUser({ id: 9, role: "ADMINISTRATOR" });
    render(<App />);

    expect(await screen.findByText("You do not have permission to view this page.")).toBeInTheDocument();
  });
});
