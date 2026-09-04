import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", () => {
    render(<App />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 4
  it("shows Online and the seeded categories on success", async () => {
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
      screen.getByRole("button", { name: /Check System/i })
    );

    expect(screen.getByText("Loading categories...")).toBeInTheDocument();

    expect(await screen.findByText("Online")).toBeInTheDocument();

    expect(screen.getByText("Account and Access")).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
  });

  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(
      new Error("Backend unavailable")
    );

    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /Check System/i })
    );

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent("Offline");
    expect(alert).toHaveTextContent(
      "Unable to connect to the TokTickIT API"
    );
  });
});