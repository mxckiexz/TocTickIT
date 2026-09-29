import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";

function staffTicket(overrides: Partial<api.StaffTicket> = {}): api.StaffTicket {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    requesterName: "Jennifer Anderson",
    requesterEmail: "jennifer.anderson@toktickit.test",
    ownerId: null,
    ownerName: null,
    ownerEmail: null,
    categoryId: 1,
    relatedSystemId: 1,
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "NEW",
    requesterMarkedResolvedAt: null,
    requesterMarkedResolvedById: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function mockDetail(ticket: api.StaffTicket, overrides: Partial<api.StaffTicketDetailResponse> = {}) {
  return vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
    ticket,
    attachments: [],
    comments: [],
    notes: [],
    ...overrides,
  });
}

const onBack = () => {};

describe("StaffTicketDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the ticket's fields, including the requester's name/email", async () => {
    mockDetail(staffTicket());
    render(<StaffTicketDetail ticketId={1} onBack={onBack} />);

    expect(await screen.findByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText(/Jennifer Anderson/)).toBeInTheDocument();
    expect(screen.getByText(/jennifer.anderson@toktickit.test/)).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText("MEDIUM")).toBeInTheDocument();
  });

  it("shows a 'Ticket not found.' error for a 404", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(new ApiError("Ticket not found.", 404));
    render(<StaffTicketDetail ticketId={999} onBack={onBack} />);

    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
  });

  it("shows the Forbidden panel on a 403", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(
      new ApiError("You do not have permission to perform this action.", 403)
    );
    render(<StaffTicketDetail ticketId={1} onBack={onBack} />);

    expect(
      await screen.findByText("You do not have permission to view this page.")
    ).toBeInTheDocument();
  });

  // UI-08: claim/reassign control.
  describe("Ownership control", () => {
    it("shows a Claim button for an unassigned ticket, and claims it", async () => {
      mockDetail(staffTicket({ ownerId: null, ownerName: null }));
      const claimSpy = vi.spyOn(api, "claimTicket").mockResolvedValue(staffTicket({ ownerId: 5 }));
      const refetchSpy = vi
        .spyOn(api, "fetchStaffTicketDetail")
        .mockResolvedValueOnce({
          ticket: staffTicket({ ownerId: null, ownerName: null }),
          attachments: [],
          comments: [],
          notes: [],
        })
        .mockResolvedValueOnce({
          ticket: staffTicket({ ownerId: 5, ownerName: "Priya Nair", ownerEmail: "priya.nair@toktickit.test" }),
          attachments: [],
          comments: [],
          notes: [],
        });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByRole("button", { name: /Claim this ticket/i });

      fireEvent.click(screen.getByRole("button", { name: /Claim this ticket/i }));

      expect(await screen.findByText("Priya Nair")).toBeInTheDocument();
      expect(claimSpy).toHaveBeenCalledWith(1);
      expect(refetchSpy).toHaveBeenCalledTimes(2);
    });

    it("shows the owner's name and a Reassign control for an assigned ticket", async () => {
      mockDetail(staffTicket({ ownerId: 5, ownerName: "Priya Nair", ownerEmail: "priya.nair@toktickit.test" }));
      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);

      expect(await screen.findByText("Priya Nair")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reassign/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Claim this ticket/i })).not.toBeInTheDocument();
    });

    it("reassigns to a different IT Staff member chosen from the dropdown", async () => {
      mockDetail(staffTicket({ ownerId: 5, ownerName: "Priya Nair", ownerEmail: "priya.nair@toktickit.test" }));
      vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([
        { id: 5, name: "Priya Nair" },
        { id: 6, name: "Marcus Chen" },
      ]);
      const assignSpy = vi.spyOn(api, "assignTicket").mockResolvedValue(staffTicket({ ownerId: 6 }));
      vi.spyOn(api, "fetchStaffTicketDetail")
        .mockResolvedValueOnce({
          ticket: staffTicket({ ownerId: 5, ownerName: "Priya Nair", ownerEmail: "priya.nair@toktickit.test" }),
          attachments: [],
          comments: [],
          notes: [],
        })
        .mockResolvedValueOnce({
          ticket: staffTicket({ ownerId: 6, ownerName: "Marcus Chen", ownerEmail: "marcus.chen@toktickit.test" }),
          attachments: [],
          comments: [],
          notes: [],
        });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByText("Priya Nair");

      fireEvent.click(screen.getByRole("button", { name: /Reassign/i }));
      const select = await screen.findByLabelText(/Reassign to/i);
      fireEvent.change(select, { target: { value: "6" } });
      fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

      await waitFor(() => expect(assignSpy).toHaveBeenCalledWith(1, 6));
      expect(await screen.findByText("Marcus Chen")).toBeInTheDocument();
    });
  });

  // UI-08: IT Priority selector next to the read-only Requested Priority.
  describe("IT Priority", () => {
    it("changes IT Priority independently of the read-only Requested Priority", async () => {
      mockDetail(staffTicket({ requestedPriority: "LOW", itPriority: "LOW" }));
      const prioritySpy = vi
        .spyOn(api, "updateTicketItPriority")
        .mockResolvedValue(staffTicket({ requestedPriority: "LOW", itPriority: "HIGH" }));
      vi.spyOn(api, "fetchStaffTicketDetail")
        .mockResolvedValueOnce({
          ticket: staffTicket({ requestedPriority: "LOW", itPriority: "LOW" }),
          attachments: [],
          comments: [],
          notes: [],
        })
        .mockResolvedValueOnce({
          ticket: staffTicket({ requestedPriority: "LOW", itPriority: "HIGH" }),
          attachments: [],
          comments: [],
          notes: [],
        });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByRole("heading", { name: "TKT-2026-000001" });

      fireEvent.change(screen.getByLabelText("IT Priority"), { target: { value: "HIGH" } });

      await waitFor(() => expect(prioritySpy).toHaveBeenCalledWith(1, "HIGH"));
    });
  });

  // UI-08/UI-14: status control limited to legal next states, confirm flow.
  describe("Status control", () => {
    it("offers only the current status's legal next states, plus the current value (disabled)", async () => {
      mockDetail(staffTicket({ currentStatus: "NEW" }));
      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByRole("heading", { name: "TKT-2026-000001" });

      const select = screen.getByLabelText("Status") as HTMLSelectElement;
      const options = within(select)
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value);

      // NEW's legal next states, per specification.md §7.3.
      expect(options.sort()).toEqual(["CANCELLED", "IN_PROGRESS", "NEW", "OPEN"].sort());
      const currentOption = within(select).getByRole("option", { name: /New \(current\)/i });
      expect(currentOption).toBeDisabled();
    });

    it("applies a non-confirm-required transition immediately, no confirm step", async () => {
      mockDetail(staffTicket({ currentStatus: "NEW" }));
      const statusSpy = vi
        .spyOn(api, "updateTicketStatus")
        .mockResolvedValue(staffTicket({ currentStatus: "IN_PROGRESS" }));
      vi.spyOn(api, "fetchStaffTicketDetail")
        .mockResolvedValueOnce({
          ticket: staffTicket({ currentStatus: "NEW" }),
          attachments: [],
          comments: [],
          notes: [],
        })
        .mockResolvedValueOnce({
          ticket: staffTicket({ currentStatus: "IN_PROGRESS" }),
          attachments: [],
          comments: [],
          notes: [],
        });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByRole("heading", { name: "TKT-2026-000001" });

      fireEvent.change(screen.getByLabelText("Status"), { target: { value: "IN_PROGRESS" } });

      await waitFor(() => expect(statusSpy).toHaveBeenCalledWith(1, "IN_PROGRESS", undefined));
      expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument();
    });

    it("opens a confirm step for a confirm-required target, and sends confirm:true only on confirm", async () => {
      mockDetail(staffTicket({ currentStatus: "IN_PROGRESS" }));
      const statusSpy = vi
        .spyOn(api, "updateTicketStatus")
        .mockResolvedValue(staffTicket({ currentStatus: "RESOLVED" }));
      vi.spyOn(api, "fetchStaffTicketDetail")
        .mockResolvedValueOnce({
          ticket: staffTicket({ currentStatus: "IN_PROGRESS" }),
          attachments: [],
          comments: [],
          notes: [],
        })
        .mockResolvedValueOnce({
          ticket: staffTicket({ currentStatus: "RESOLVED" }),
          attachments: [],
          comments: [],
          notes: [],
        });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByRole("heading", { name: "TKT-2026-000001" });

      fireEvent.change(screen.getByLabelText("Status"), { target: { value: "RESOLVED" } });

      expect(await screen.findByText(/requires confirmation/i)).toBeInTheDocument();
      expect(statusSpy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));

      await waitFor(() => expect(statusSpy).toHaveBeenCalledWith(1, "RESOLVED", true));
    });

    it("cancelling the confirm step sends nothing and reverts the select", async () => {
      mockDetail(staffTicket({ currentStatus: "IN_PROGRESS" }));
      const statusSpy = vi.spyOn(api, "updateTicketStatus");

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByRole("heading", { name: "TKT-2026-000001" });

      const select = screen.getByLabelText("Status") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "RESOLVED" } });
      await screen.findByText(/requires confirmation/i);

      fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));

      expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument();
      expect(select.value).toBe("IN_PROGRESS");
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it("shows the requester-marked-resolved note when set", async () => {
      mockDetail(
        staffTicket({
          currentStatus: "IN_PROGRESS",
          requesterMarkedResolvedAt: "2026-09-02T08:00:00.000Z",
          requesterMarkedResolvedById: 1,
        })
      );
      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);

      expect(await screen.findByText(/Requester marked this resolved on/i)).toBeInTheDocument();
    });
  });

  // Public Comments — staff can post too.
  describe("Comments", () => {
    it("shows 'No comments yet.' for an empty thread", async () => {
      mockDetail(staffTicket());
      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
    });

    it("posts a comment and appends it to the thread", async () => {
      mockDetail(staffTicket());
      const postSpy = vi.spyOn(api, "postComment").mockResolvedValue({
        id: 1,
        ticketId: 1,
        authorId: 5,
        authorName: "Priya Nair",
        authorRole: "IT_STAFF",
        body: "Looking into this now.",
        createdAt: "2026-09-01T12:00:00.000Z",
      });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByText("No comments yet.");

      fireEvent.change(screen.getByLabelText(/Add a comment/i), {
        target: { value: "Looking into this now." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Post comment/i }));

      expect(await screen.findByText("Looking into this now.")).toBeInTheDocument();
      expect(postSpy).toHaveBeenCalledWith(1, "Looking into this now.");
    });
  });

  // UI-09: Internal Notes — visually distinct, separate from Public Comments.
  describe("Internal Notes", () => {
    it("shows the 'Internal — IT Staff only' label, distinct from Comments", async () => {
      mockDetail(staffTicket());
      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);

      expect(await screen.findByText("Internal — IT Staff only")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /Internal Notes/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /^Comments$/i })).toBeInTheDocument();
    });

    it("shows 'No notes yet.' for an empty Internal Notes thread", async () => {
      mockDetail(staffTicket());
      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
    });

    it("shows existing notes, kept out of the Public Comments thread", async () => {
      mockDetail(staffTicket(), {
        comments: [],
        notes: [
          {
            id: 1,
            ticketId: 1,
            authorId: 5,
            authorName: "Priya Nair",
            authorRole: "IT_STAFF",
            body: "Internal-only triage note.",
            createdAt: "2026-09-01T12:00:00.000Z",
          },
        ],
      });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);

      expect(await screen.findByText("Internal-only triage note.")).toBeInTheDocument();
      expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    });

    it("posts a note and appends it to the Internal Notes thread", async () => {
      mockDetail(staffTicket());
      const postSpy = vi.spyOn(api, "postNote").mockResolvedValue({
        id: 1,
        ticketId: 1,
        authorId: 5,
        authorName: "Priya Nair",
        authorRole: "IT_STAFF",
        body: "Escalating to networking team.",
        createdAt: "2026-09-01T12:00:00.000Z",
      });

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByText("No notes yet.");

      fireEvent.change(screen.getByLabelText(/Add an internal note/i), {
        target: { value: "Escalating to networking team." },
      });
      fireEvent.click(screen.getByRole("button", { name: /Post note/i }));

      expect(await screen.findByText("Escalating to networking team.")).toBeInTheDocument();
      expect(postSpy).toHaveBeenCalledWith(1, "Escalating to networking team.");
    });

    it("rejects an empty note client-side without calling the API", async () => {
      mockDetail(staffTicket());
      const postSpy = vi.spyOn(api, "postNote");

      render(<StaffTicketDetail ticketId={1} onBack={onBack} />);
      await screen.findByText("No notes yet.");

      fireEvent.click(screen.getByRole("button", { name: /Post note/i }));

      expect(await screen.findByText("Note cannot be empty.")).toBeInTheDocument();
      expect(postSpy).not.toHaveBeenCalled();
    });
  });

  it("calls onBack when 'Back to Ticket Queue' is clicked", async () => {
    mockDetail(staffTicket());
    const onBackSpy = vi.fn();
    render(<StaffTicketDetail ticketId={1} onBack={onBackSpy} />);

    await screen.findByRole("heading", { name: "TKT-2026-000001" });
    fireEvent.click(screen.getByRole("button", { name: /Back to Ticket Queue/i }));

    expect(onBackSpy).toHaveBeenCalledTimes(1);
  });
});
