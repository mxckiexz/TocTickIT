import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", async () => {
    mockLoggedInUser();
    render(<App />);
    expect(await screen.findByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 4. Lab 3: Check System now lives inside the authenticated shell
  // (its own API calls require a session too), so every test here logs in
  // first via the mocked GET /api/auth/me.
  it("shows Online and the seeded categories on success", async () => {
    mockLoggedInUser();
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" },
      ],
    });

    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Check System/i })
    );

    expect(screen.getByText("Loading categories...")).toBeInTheDocument();

    expect(await screen.findByText("Online")).toBeInTheDocument();

    expect(screen.getByText("Account and Access")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    mockLoggedInUser();
    vi.spyOn(api, "checkSystem").mockRejectedValue(
      new Error("Backend unavailable")
    );

    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Check System/i })
    );

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("Offline");
    expect(alert).toHaveTextContent(
      "Unable to connect to the TokTickIT API"
    );
  });
});
