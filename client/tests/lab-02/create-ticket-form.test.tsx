import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import { mockLoggedInUser } from "../helpers/auth.js";

const categories = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];
const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 2, name: "VPN" },
];

const ticket: api.Ticket = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  requesterId: 1,
  ownerId: null,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drains much faster than usual.",
  requestedPriority: "MEDIUM",
  itPriority: "MEDIUM",
  currentStatus: "NEW",
  requesterMarkedResolvedAt: null,
  requesterMarkedResolvedById: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function mockLookups() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
}

// Lab 3: identity comes from the session (mocked getCurrentUser), not a
// Development Requester picker — opening the form is just a nav click now.
async function openForm() {
  mockLoggedInUser();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /New Ticket/i }));

  await screen.findByRole("button", { name: /Submit Ticket/i });
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^Category/i), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/Related System/i), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText(/^Summary/i), {
    target: { value: "Laptop battery drains quickly" },
  });
  fireEvent.change(screen.getByLabelText(/^Description/i), {
    target: { value: "Battery drains much faster than usual." },
  });
}

describe("CreateTicketForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch anything until New Ticket is clicked", async () => {
    mockLoggedInUser();
    const fetchCategoriesSpy = vi.spyOn(api, "fetchCategories");
    render(<App />);

    await screen.findByRole("button", { name: /New Ticket/i });
    expect(fetchCategoriesSpy).not.toHaveBeenCalled();
  });

  it("loads categories/related systems once New Ticket is opened, with no Requester field in the form", async () => {
    mockLookups();
    await openForm();

    expect(api.fetchCategories).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/^Requester/i)).not.toBeInTheDocument();
  });

  it("submits the form under the logged-in session's identity and shows the returned unique Ticket Number", async () => {
    mockLookups();
    const createTicketSpy = vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    await openForm();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
    expect(createTicketSpy).toHaveBeenCalledWith({
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Laptop battery drains quickly",
      description: "Battery drains much faster than usual.",
      requestedPriority: "MEDIUM",
    });
  });

  it("lets the same session submit another ticket", async () => {
    mockLookups();
    vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    await openForm();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));
    await screen.findByText("TKT-2026-000042");

    fireEvent.click(screen.getByRole("button", { name: /Create another ticket/i }));

    expect(await screen.findByRole("button", { name: /Submit Ticket/i })).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    mockLookups();
    let resolveCreate: (value: typeof ticket) => void;
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    await openForm();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByRole("button", { name: /Submitting/i })).toBeDisabled();

    resolveCreate!(ticket);
    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
  });

  it("shows field-level errors from a rejected submission without creating a ticket", async () => {
    mockLookups();
    vi.spyOn(api, "createTicket").mockRejectedValue(
      new ApiError("Ticket submission failed", 400, {
        summary: "Summary is required.",
      })
    );
    await openForm();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("Summary is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit Ticket/i })).toBeInTheDocument();
  });

  it("uploads the selected attachment after the ticket is created", async () => {
    mockLookups();
    vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      id: 1,
      ticketId: ticket.id,
      originalFilename: "screenshot.png",
      storedFilename: "abc.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      createdAt: new Date().toISOString(),
      removedAt: null,
      removalReason: null,
    });
    await openForm();

    fillRequiredFields();
    const file = new File(["fake-image-bytes"], "screenshot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Supporting attachment/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    await screen.findByText("TKT-2026-000042");
    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(ticket.id, file));
  });

  it("still shows the Ticket Number if the attachment upload fails", async () => {
    mockLookups();
    vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new ApiError("Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.", 415)
    );
    await openForm();

    fillRequiredFields();
    const file = new File(["not-an-image"], "malware.exe", { type: "application/x-msdownload" });
    fireEvent.change(screen.getByLabelText(/Supporting attachment/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
    expect(screen.getByText(/failed to upload/i)).toBeInTheDocument();
  });
});
