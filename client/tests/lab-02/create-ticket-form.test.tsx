import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";

const categories = [
  { id: 1, name: "Hardware" },
  { id: 2, name: "Software" },
];
const relatedSystems = [
  { id: 1, name: "Email" },
  { id: 2, name: "VPN" },
];
const requesters = [
  { id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test" },
  { id: 2, name: "Michael Brown", email: "michael.brown@toktickit.test" },
];

const ticket = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  requesterId: 1,
  categoryId: 1,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drains much faster than usual.",
  requestedPriority: "MEDIUM" as const,
  currentStatus: "New",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function mockLookups() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
  vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);
}

async function openFormAsRequester(requesterLabel: RegExp = /Jennifer Anderson/) {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /New Ticket/i }));

  await screen.findByRole("button", { name: /Continue as this Requester/i });
  fireEvent.change(screen.getByLabelText(/^Requester/i), {
    target: { value: String(requesters.find((r) => requesterLabel.test(r.name))!.id) },
  });
  fireEvent.click(screen.getByRole("button", { name: /Continue as this Requester/i }));

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

describe("Development Requester + CreateTicketForm", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("does not fetch anything until New Ticket is clicked", () => {
    const fetchRequestersSpy = vi.spyOn(api, "fetchRequesters");
    const fetchCategoriesSpy = vi.spyOn(api, "fetchCategories");
    render(<App />);

    expect(fetchRequestersSpy).not.toHaveBeenCalled();
    expect(fetchCategoriesSpy).not.toHaveBeenCalled();
  });

  it("shows the Development Requester picker before the ticket form, and no Requester field inside the form", async () => {
    mockLookups();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /New Ticket/i }));

    await screen.findByRole("button", { name: /Continue as this Requester/i });
    expect(api.fetchCategories).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Requester/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue as this Requester/i }));

    await screen.findByRole("button", { name: /Submit Ticket/i });
    expect(screen.queryByLabelText(/^Requester/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Creating as/i)).toHaveTextContent("Jennifer Anderson");
  });

  it("submits the form as the selected requester and shows the returned unique Ticket Number", async () => {
    mockLookups();
    const createTicketSpy = vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    await openFormAsRequester();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("TKT-2026-000042")).toBeInTheDocument();
    expect(createTicketSpy).toHaveBeenCalledWith({
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Laptop battery drains quickly",
      description: "Battery drains much faster than usual.",
      requestedPriority: "MEDIUM",
    });
  });

  it("keeps the same requester active for creating another ticket", async () => {
    mockLookups();
    vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    await openFormAsRequester();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));
    await screen.findByText("TKT-2026-000042");

    fireEvent.click(screen.getByRole("button", { name: /Create another ticket/i }));

    expect(await screen.findByText(/Creating as/i)).toHaveTextContent("Jennifer Anderson");
    expect(screen.queryByLabelText(/^Requester/i)).not.toBeInTheDocument();
  });

  it("returns to the requester picker when Switch requester is clicked", async () => {
    mockLookups();
    await openFormAsRequester();

    fireEvent.click(screen.getByRole("button", { name: /Switch requester/i }));

    expect(await screen.findByRole("button", { name: /Continue as this Requester/i })).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    mockLookups();
    let resolveCreate: (value: typeof ticket) => void;
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    await openFormAsRequester();

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
    await openFormAsRequester();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("Summary is required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit Ticket/i })).toBeInTheDocument();
  });

  it("uploads the selected attachment as the active requester after the ticket is created", async () => {
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
    });
    await openFormAsRequester();

    fillRequiredFields();
    const file = new File(["fake-image-bytes"], "screenshot.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Supporting attachment/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    await screen.findByText("TKT-2026-000042");
    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(ticket.id, 1, file));
  });

  it("still shows the Ticket Number if the attachment upload fails", async () => {
    mockLookups();
    vi.spyOn(api, "createTicket").mockResolvedValue(ticket);
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new ApiError("Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.", 415)
    );
    await openFormAsRequester();

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
