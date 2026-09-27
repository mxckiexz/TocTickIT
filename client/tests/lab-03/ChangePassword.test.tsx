import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChangePassword from "../../src/ChangePassword.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";

const user = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer.anderson@toktickit.test",
  role: "REQUESTER" as const,
  mustChangePassword: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

function fillForm(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: confirm } });
}

// UI-03
describe("ChangePassword", () => {
  it("shows field-level validation errors returned by the API (400)", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new ApiError("Validation failed", 400, {
        newPassword: "New password must be at least 8 characters.",
      })
    );

    render(<ChangePassword onChanged={vi.fn()} />);
    fillForm("CurrentPass1", "short1", "short1");
    fireEvent.click(screen.getByRole("button", { name: /Save password/i }));

    expect(await screen.findByText("New password must be at least 8 characters.")).toBeInTheDocument();
  });

  // AC-08 — wrong current password message.
  it("shows 'Current password is incorrect.' on a 401", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(new ApiError("Current password is incorrect.", 401));

    render(<ChangePassword onChanged={vi.fn()} />);
    fillForm("WrongCurrent1", "BrandNewPass1", "BrandNewPass1");
    fireEvent.click(screen.getByRole("button", { name: /Save password/i }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
  });

  it("shows a loading state while saving", async () => {
    let resolveChange: (value: typeof user) => void = () => {};
    vi.spyOn(api, "changePassword").mockReturnValue(
      new Promise((resolve) => {
        resolveChange = resolve;
      })
    );

    render(<ChangePassword onChanged={vi.fn()} />);
    fillForm("CurrentPass1", "BrandNewPass1", "BrandNewPass1");
    fireEvent.click(screen.getByRole("button", { name: /Save password/i }));

    expect(await screen.findByRole("button", { name: /Saving…/i })).toBeDisabled();
    resolveChange({ ...user, mustChangePassword: false });
  });

  // AC-09
  it("calls onChanged with the updated user (mustChangePassword: false) on success", async () => {
    vi.spyOn(api, "changePassword").mockResolvedValue({ ...user, mustChangePassword: false });
    const onChanged = vi.fn();

    render(<ChangePassword onChanged={onChanged} />);
    fillForm("CurrentPass1", "BrandNewPass1", "BrandNewPass1");
    fireEvent.click(screen.getByRole("button", { name: /Save password/i }));

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: false }))
    );
  });
});
