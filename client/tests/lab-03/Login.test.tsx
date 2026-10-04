import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Login from "../../src/Login.js";
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

// UI-01
describe("Login", () => {
  it("disables submit until both fields are filled, and shows field validation on empty submit", async () => {
    render(<Login onLoginSuccess={vi.fn()} />);

    const submit = screen.getByRole("button", { name: /Log in/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.test" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "x" } });
    expect(submit).toBeEnabled();
  });

  it("shows a loading state while submitting", async () => {
    let resolveLogin: (value: typeof user) => void = () => {};
    vi.spyOn(api, "login").mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );

    render(<Login onLoginSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.test" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    expect(await screen.findByRole("button", { name: /Logging in…/i })).toBeDisabled();
    resolveLogin(user);
  });

  // API-02 / BR-07 — the client shows the exact same message regardless of cause.
  it("shows the safe 'Invalid email or password' message on a 401, without saying why", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new ApiError("Invalid email or password.", 401));

    render(<Login onLoginSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.test" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("shows a generic offline message on a network/500 failure", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new Error("network down"));

    render(<Login onLoginSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "a@b.test" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    expect(await screen.findByText(/Unable to log in/i)).toBeInTheDocument();
  });

  // UI-02
  it("calls onLoginSuccess with the returned user on success", async () => {
    vi.spyOn(api, "login").mockResolvedValue(user);
    const onLoginSuccess = vi.fn();

    render(<Login onLoginSuccess={onLoginSuccess} />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: /Log in/i }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(user));
  });
});
