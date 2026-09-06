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
const requesters = [{ id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test" }];

const listedTicket: api.Ticket = {
  id: 1,
  ticketNumber: "TKT-2026-000001",
  requesterId: 1,
  categoryId: 2,
  relatedSystemId: 1,
  summary: "Laptop battery drains quickly",
  description: "Battery drains much faster than usual.",
  requestedPriority: "MEDIUM",
  currentStatus: "New",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function mockLookups() {
  vi.spyOn(api, "fetchCategories").mockResolvedValue(categories);
  vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue(relatedSystems);
  vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);
}

async function openMyTicketsWithOneTicket() {
  mockLookups();
  vi.spyOn(api, "fetchTickets").mockResolvedValue({
    tickets: [listedTicket],
    pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  });

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /My Tickets/i }));

  await screen.findByRole("button", { name: /Continue as this Requester/i });
  fireEvent.change(screen.getByLabelText(/^Requester/i), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue as this Requester/i }));

  await screen.findByRole("heading", { name: /My Tickets/i });
}

describe("TicketDetail", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("does not fetch a ticket's detail until its row is clicked", async () => {
    const fetchDetailSpy = vi.spyOn(api, "fetchTicketDetail");
    await openMyTicketsWithOneTicket();

    expect(fetchDetailSpy).not.toHaveBeenCalled();
  });

  it("opens the detail screen and shows the ticket's full fields", async () => {
    await openMyTicketsWithOneTicket();
    const fetchDetailSpy = vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));

    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(fetchDetailSpy).toHaveBeenCalledWith(1, 1);
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText("Battery drains much faster than usual.")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  });

  it("shows the ticket's attachments with a link to view/download each one", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    const fetchAttachmentsSpy = vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(fetchAttachmentsSpy).toHaveBeenCalledWith(1, 1);
    const link = await screen.findByRole("link", { name: "screenshot.png" });
    expect(link).toHaveAttribute(
      "href",
      api.ticketAttachmentUrl(1, 10, 1)
    );
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it("shows an empty-state message when the ticket has no attachments", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(await screen.findByText("No attachments on this ticket.")).toBeInTheDocument();
  });

  it("shows an attachments error without hiding the rest of the ticket's fields", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockRejectedValue(
      new ApiError("You do not have permission to view this ticket's attachments.", 403)
    );

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(
      await screen.findByText("You do not have permission to view this ticket's attachments.")
    ).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
  });

  it("keeps the previous search/filter/sort state after Back is clicked", async () => {
    await openMyTicketsWithOneTicket();
    const fetchTicketsSpy = vi.mocked(api.fetchTickets);

    // Put the list into a non-default state before opening the ticket.
    fireEvent.change(screen.getByLabelText(/Filter by category/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/Sort by/i), { target: { value: "summary-asc" } });
    fireEvent.change(screen.getByLabelText(/Search tickets/i), { target: { value: "battery" } });

    await waitFor(() =>
      expect(fetchTicketsSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryId: 2,
          sortBy: "summary",
          sortDir: "asc",
          search: "battery",
        })
      )
    );
    const callsBeforeOpening = fetchTicketsSpy.mock.calls.length;

    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    fireEvent.click(screen.getByRole("button", { name: /Back to My Tickets/i }));
    await screen.findByRole("heading", { name: /My Tickets/i });

    // The controls still reflect the state set before opening the ticket —
    // MyTickets never remounted (and never reset) while the detail screen
    // was showing.
    expect(screen.getByLabelText(/Filter by category/i)).toHaveValue("2");
    expect(screen.getByLabelText(/Sort by/i)).toHaveValue("summary-asc");
    expect(screen.getByLabelText(/Search tickets/i)).toHaveValue("battery");

    // Confirm it's actually preserved state, not a lucky-looking re-fetch:
    // no additional fetchTickets call happened while going through the
    // detail screen and back.
    expect(fetchTicketsSpy.mock.calls.length).toBe(callsBeforeOpening);
  });

  it("shows an error message when the detail request is rejected (e.g. ownership)", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockRejectedValue(
      new ApiError("You do not have permission to view this ticket.", 403)
    );
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));

    expect(
      await screen.findByText("You do not have permission to view this ticket.")
    ).toBeInTheDocument();
  });

  it("shows the current attachment count next to the upload control", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(await screen.findByText(/Add an attachment \(1\/5\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("uploads a new attachment and refreshes the attachments list", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    const fetchAttachmentsSpy = vi
      .spyOn(api, "fetchTicketAttachments")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          ticketId: 1,
          originalFilename: "new-file.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          createdAt: "2026-09-06T09:00:00.000Z",
          removedAt: null,
          removalReason: null,
        },
      ]);
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      id: 11,
      ticketId: 1,
      originalFilename: "new-file.png",
      storedFilename: "abc.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      createdAt: "2026-09-06T09:00:00.000Z",
      removedAt: null,
      removalReason: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    await screen.findByText("No attachments on this ticket.");

    const file = new File(["fake bytes"], "new-file.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/Add an attachment/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(1, 1, file));
    expect(await screen.findByRole("link", { name: "new-file.png" })).toBeInTheDocument();
    expect(fetchAttachmentsSpy).toHaveBeenCalledTimes(2);
  });

  it("shows an error message when the upload is rejected, leaving the existing attachment list unchanged", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    const fetchAttachmentsSpy = vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
    ]);
    vi.spyOn(api, "uploadAttachment").mockRejectedValue(
      new ApiError("Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.", 415)
    );

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    await screen.findByRole("link", { name: "screenshot.png" });

    const file = new File(["not an image"], "malware.exe", {
      type: "application/x-msdownload",
    });
    fireEvent.change(screen.getByLabelText(/Add an attachment/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(
      await screen.findByText("Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.")
    ).toBeInTheDocument();
    // The existing attachment is still there — a rejected upload doesn't
    // touch the list, and (since fetchTicketAttachments wasn't called
    // again) it wasn't just a lucky re-fetch that happened to look the same.
    expect(screen.getByRole("link", { name: "screenshot.png" })).toBeInTheDocument();
    expect(fetchAttachmentsSpy).toHaveBeenCalledTimes(1);
  });

  it("disables the upload control once the ticket has the maximum of 5 attachments", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: index + 1,
        ticketId: 1,
        originalFilename: `file-${index}.png`,
        mimeType: "image/png",
        sizeBytes: 100,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      }))
    );

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(await screen.findByText(/Add an attachment \(5\/5\)/)).toBeInTheDocument();
    expect(screen.getByText(/already has the maximum of 5 attachments/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Add an attachment/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("removes an attachment after confirming in the modal, and refreshes the list", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    const fetchAttachmentsSpy = vi
      .spyOn(api, "fetchTicketAttachments")
      .mockResolvedValueOnce([
        {
          id: 10,
          ticketId: 1,
          originalFilename: "screenshot.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          createdAt: "2026-09-01T11:00:00.000Z",
          removedAt: null,
          removalReason: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 10,
          ticketId: 1,
          originalFilename: "screenshot.png",
          mimeType: "image/png",
          sizeBytes: 2048,
          createdAt: "2026-09-01T11:00:00.000Z",
          removedAt: "2026-09-06T12:00:00.000Z",
          removalReason: null,
        },
      ]);
    const removeSpy = vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: 10,
      ticketId: 1,
      originalFilename: "screenshot.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      createdAt: "2026-09-01T11:00:00.000Z",
      removedAt: "2026-09-06T12:00:00.000Z",
      removalReason: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    await screen.findByRole("link", { name: "screenshot.png" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByRole("heading", { name: /Remove attachment\?/i });
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));

    await waitFor(() => expect(removeSpy).toHaveBeenCalledWith(1, 10, 1, undefined));
    // BR-14: a removed attachment stays visible (struck-through, no link),
    // it isn't hidden as if it never existed.
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "screenshot.png" })).not.toBeInTheDocument()
    );
    expect(screen.getByText("screenshot.png")).toBeInTheDocument();
    expect(screen.getByText(/removed/i)).toBeInTheDocument();
    expect(fetchAttachmentsSpy).toHaveBeenCalledTimes(2);
  });

  it("sends the optional removal reason typed into the modal", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
    ]);
    const removeSpy = vi.spyOn(api, "removeAttachment").mockResolvedValue({
      id: 10,
      ticketId: 1,
      originalFilename: "screenshot.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      createdAt: "2026-09-01T11:00:00.000Z",
      removedAt: "2026-09-06T12:00:00.000Z",
      removalReason: "Uploaded the wrong file",
    });

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    await screen.findByRole("link", { name: "screenshot.png" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.change(await screen.findByLabelText(/Reason \(optional\)/i), {
      target: { value: "Uploaded the wrong file" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));

    await waitFor(() =>
      expect(removeSpy).toHaveBeenCalledWith(1, 10, 1, "Uploaded the wrong file")
    );
  });

  it("does not remove the attachment when the modal is cancelled", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
    ]);
    const removeSpy = vi.spyOn(api, "removeAttachment");

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    await screen.findByRole("link", { name: "screenshot.png" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByRole("heading", { name: /Remove attachment\?/i });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(removeSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "screenshot.png" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Remove attachment\?/i })).not.toBeInTheDocument();
  });

  it("shows an error message when removal is rejected, leaving the attachment in place", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
    ]);
    vi.spyOn(api, "removeAttachment").mockRejectedValue(
      new ApiError("You do not have permission to remove attachments from this ticket.", 403)
    );

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    await screen.findByRole("link", { name: "screenshot.png" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));

    expect(
      await screen.findByText("You do not have permission to remove attachments from this ticket.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "screenshot.png" })).toBeInTheDocument();
  });

  it("renders a removed attachment as a struck-through row with no download link or Remove button", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "old-screenshot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: "2026-09-02T09:00:00.000Z",
        removalReason: "No longer relevant",
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(await screen.findByText("old-screenshot.png")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "old-screenshot.png" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByText(/No longer relevant/)).toBeInTheDocument();
  });

  it("does not count a removed attachment toward the 5-attachment limit", async () => {
    await openMyTicketsWithOneTicket();
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(listedTicket);
    vi.spyOn(api, "fetchTicketAttachments").mockResolvedValue([
      {
        id: 10,
        ticketId: 1,
        originalFilename: "active.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: null,
        removalReason: null,
      },
      {
        id: 11,
        ticketId: 1,
        originalFilename: "removed.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        createdAt: "2026-09-01T11:00:00.000Z",
        removedAt: "2026-09-02T09:00:00.000Z",
        removalReason: null,
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "TKT-2026-000001" }));
    await screen.findByRole("heading", { name: "TKT-2026-000001" });

    expect(await screen.findByText(/Add an attachment \(1\/5\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Add an attachment/)).not.toBeDisabled();
  });
});
