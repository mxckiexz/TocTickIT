import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";

// Lab 4 F7 (docs/lab-04/tests.md §5: UI-07 to UI-10, UI-19 ticket controls, UI-24; ui-spec.md §5, §6).
// UI-11 and the Requester part of UI-24 live in tests/lab-02/ticket-detail.test.tsx next to the Lab 3
// "Problem Appears Resolved" tests they extend.

beforeEach(() => {
  vi.spyOn(api, "fetchActions").mockResolvedValue([]);
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue([{ id: 5, name: "Priya Nair" }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  // jsdom has no scrollIntoView; one test installs a stand-in.
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

function staffTicket(overrides: Partial<api.StaffTicket> = {}): api.StaffTicket {
  return {
    id: 1,
    ticketNumber: "TKT-2026-000001",
    requesterId: 1,
    requesterName: "Jennifer Anderson",
    requesterEmail: "jennifer.anderson@toktickit.test",
    ownerId: 5,
    ownerName: "Priya Nair",
    ownerEmail: "priya.nair@toktickit.test",
    categoryId: 1,
    categoryName: "Hardware",
    relatedSystemId: 1,
    relatedSystemName: "Corporate Laptop",
    summary: "Laptop battery drains quickly",
    description: "Battery drains much faster than usual.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "IN_PROGRESS",
    requesterMarkedResolvedAt: null,
    requesterMarkedResolvedById: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    version: 1,
    allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    resolutionGate: { ok: true, unmet: [] },
    ...overrides,
  };
}

function detail(ticket: api.StaffTicket): api.StaffTicketDetailResponse {
  return { ticket, attachments: [], comments: [], notes: [] };
}

function mockDetail(...tickets: api.StaffTicket[]) {
  const spy = vi.spyOn(api, "fetchStaffTicketDetail");
  tickets.forEach((ticket, index) => {
    if (index === tickets.length - 1) spy.mockResolvedValue(detail(ticket));
    else spy.mockResolvedValueOnce(detail(ticket));
  });
  return spy;
}

async function renderDetail() {
  render(<StaffTicketDetail ticketId={1} onBack={() => {}} />);
  await screen.findByRole("heading", { name: "TKT-2026-000001" });
}

const statusGroup = () => screen.getByRole("group", { name: "Change status" });
const statusButtons = () => within(statusGroup()).queryAllByRole("button").map((b) => b.textContent);

const STALE = new ApiError("Version mismatch.", 409, undefined, { code: "STALE_VERSION", currentVersion: 2 });
const STALE_TEXT = "Someone else changed this. Reload to see the latest, then try again.";

describe("TicketWorkflow: status buttons", () => {
  it("UI-07: shows exactly the statuses in allowedTransitions as buttons, and no Status select", async () => {
    mockDetail(staffTicket({ currentStatus: "NEW", allowedTransitions: ["OPEN", "IN_PROGRESS", "CANCELLED"] }));
    await renderDetail();

    expect(statusButtons()).toEqual(["Open", "In Progress", "Cancelled"]);
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
  });

  it("UI-07: the list comes from the server, not from a copy in the client", async () => {
    // IN_PROGRESS would normally offer three moves; the server says only one is allowed.
    mockDetail(staffTicket({ currentStatus: "IN_PROGRESS", allowedTransitions: ["WAITING_FOR_REQUESTER"] }));
    await renderDetail();

    expect(statusButtons()).toEqual(["Waiting for Requester"]);
  });

  it("UI-07: shows the current status as text, and no buttons when nothing is allowed", async () => {
    mockDetail(staffTicket({ currentStatus: "CLOSED", allowedTransitions: [] }));
    await renderDetail();

    expect(screen.getByText("Closed", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Change status" })).not.toBeInTheDocument();
  });

  describe("UI-08: resolution gate", () => {
    it("keeps Resolved visible but disabled, and lists every unmet condition in text", async () => {
      mockDetail(
        staffTicket({
          ownerId: null,
          ownerName: null,
          ownerEmail: null,
          resolutionGate: { ok: false, unmet: ["NO_OWNER", "NO_COMPLETED_ACTION", "OPEN_ACTIONS"] },
        })
      );
      await renderDetail();

      const resolved = within(statusGroup()).getByRole("button", { name: "Resolved" });
      expect(resolved).toBeDisabled();
      expect(screen.getByText("Needs an owner")).toBeInTheDocument();
      expect(screen.getByText("Needs a completed action")).toBeInTheDocument();
      expect(screen.getByText("Finish or cancel open actions")).toBeInTheDocument();
      // The reasons are tied to the button for assistive technology.
      const describedBy = resolved.getAttribute("aria-describedby") ?? "";
      expect(describedBy).not.toBe("");
      const described = describedBy.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      expect(described).toContain("Needs an owner");
      expect(described).toContain("Finish or cancel open actions");
    });

    it("lists only the conditions that are unmet", async () => {
      mockDetail(staffTicket({ resolutionGate: { ok: false, unmet: ["OPEN_ACTIONS"] } }));
      await renderDetail();

      expect(screen.getByText("Finish or cancel open actions")).toBeInTheDocument();
      expect(screen.queryByText("Needs an owner")).not.toBeInTheDocument();
      expect(screen.queryByText("Needs a completed action")).not.toBeInTheDocument();
    });

    it("enables Resolved and shows no reasons when the gate is ok; other buttons stay enabled while it is not", async () => {
      mockDetail(staffTicket());
      await renderDetail();
      expect(within(statusGroup()).getByRole("button", { name: "Resolved" })).toBeEnabled();
      expect(screen.queryByText("Needs an owner")).not.toBeInTheDocument();
      cleanup();

      mockDetail(staffTicket({ resolutionGate: { ok: false, unmet: ["NO_COMPLETED_ACTION"] } }));
      await renderDetail();
      expect(within(statusGroup()).getByRole("button", { name: "Cancelled" })).toBeEnabled();
      expect(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" })).toBeEnabled();
    });

    it("a disabled Resolved button sends nothing when clicked", async () => {
      mockDetail(staffTicket({ resolutionGate: { ok: false, unmet: ["NO_OWNER"] } }));
      const update = vi.spyOn(api, "updateTicketStatus");
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Resolved" }));
      expect(update).not.toHaveBeenCalled();
      expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument();
    });

    it("recording a completed action refreshes the gate, so Resolved becomes available without a reload", async () => {
      const blocked = staffTicket({ resolutionGate: { ok: false, unmet: ["NO_COMPLETED_ACTION"] } });
      mockDetail(blocked, staffTicket());
      const created: api.ActionTakenItem = {
        id: 9,
        ticketId: 1,
        performedBy: { id: 5, name: "Priya Nair" },
        assignee: null,
        status: "COMPLETED",
        actionAt: "2026-10-08T03:15:00.000Z",
        description: "Swapped the battery",
        result: "Battery holds charge",
        followUpRequired: false,
        followUpNote: "",
        attachmentNotes: "",
        createdAt: "2026-10-08T03:15:00.000Z",
        updatedAt: "2026-10-08T03:15:00.000Z",
        version: 1,
      };
      vi.spyOn(api, "createAction").mockResolvedValue(created);
      await renderDetail();
      expect(within(statusGroup()).getByRole("button", { name: "Resolved" })).toBeDisabled();

      fireEvent.click(await screen.findByRole("button", { name: "Add action" }));
      const form = await screen.findByRole("form", { name: "Add action" });
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Swapped the battery" } });
      fireEvent.change(within(form).getByLabelText(/^Status/), { target: { value: "COMPLETED" } });
      fireEvent.change(within(form).getByLabelText(/^Result/), { target: { value: "Battery holds charge" } });
      fireEvent.click(within(form).getByRole("button", { name: /^Save/ }));

      await waitFor(() => expect(within(statusGroup()).getByRole("button", { name: "Resolved" })).toBeEnabled());
      expect(screen.queryByText("Needs a completed action")).not.toBeInTheDocument();
    });
  });

  describe("UI-09: confirm step", () => {
    it.each([
      ["RESOLVED", "Resolved", "IN_PROGRESS"],
      ["CANCELLED", "Cancelled", "IN_PROGRESS"],
      ["CLOSED", "Closed", "RESOLVED"],
      ["REOPENED", "Reopened", "CLOSED"],
    ] as const)("%s asks for confirmation, sends nothing until Confirm, and then sends confirm:true", async (target, label, from) => {
      mockDetail(staffTicket({ currentStatus: from, allowedTransitions: [target] }), staffTicket({ currentStatus: target, allowedTransitions: [] }));
      const update = vi.spyOn(api, "updateTicketStatus").mockResolvedValue(staffTicket({ currentStatus: target }));
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: label }));
      expect(await screen.findByText(/requires confirmation/i)).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      await waitFor(() => expect(update).toHaveBeenCalledWith(1, target, 1, true));
      await waitFor(() => expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument());
    });

    it("Cancel closes the confirm step and sends nothing", async () => {
      mockDetail(staffTicket());
      const update = vi.spyOn(api, "updateTicketStatus");
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Resolved" }));
      await screen.findByText(/requires confirmation/i);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
      expect(within(statusGroup()).getByRole("button", { name: "Resolved" })).toBeEnabled();
    });

    it("the confirm step takes focus, so a keyboard user lands on it", async () => {
      mockDetail(staffTicket());
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Resolved" }));
      const confirm = await screen.findByRole("button", { name: "Confirm" });
      await waitFor(() => expect(confirm.closest("[tabindex='-1']")).toHaveFocus());
    });

    it("a status without a confirm step is sent at once, without confirm", async () => {
      mockDetail(staffTicket(), staffTicket({ currentStatus: "WAITING_FOR_REQUESTER", allowedTransitions: ["IN_PROGRESS"] }));
      const update = vi.spyOn(api, "updateTicketStatus").mockResolvedValue(staffTicket());
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));

      await waitFor(() => expect(update).toHaveBeenCalledWith(1, "WAITING_FOR_REQUESTER", 1, undefined));
      expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument();
    });
  });

  describe("UI-10: conflicts and refresh", () => {
    it("a stale status change shows the banner above the controls, with Reload, and sends no second request", async () => {
      mockDetail(staffTicket());
      const update = vi.spyOn(api, "updateTicketStatus").mockRejectedValue(STALE);
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));

      const banner = (await screen.findByText(STALE_TEXT)).closest("[role='alert']") as HTMLElement;
      expect(banner).not.toBeNull();
      expect(within(banner).getByRole("button", { name: "Reload" })).toBeInTheDocument();
      expect(update).toHaveBeenCalledTimes(1);
      // Above the status controls in document order.
      expect(banner.compareDocumentPosition(statusGroup()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("the banner takes focus and is scrolled into view when it appears", async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      mockDetail(staffTicket());
      vi.spyOn(api, "updateTicketStatus").mockRejectedValue(STALE);
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));

      const banner = (await screen.findByText(STALE_TEXT)).closest("[role='alert']") as HTMLElement;
      await waitFor(() => expect(banner).toHaveFocus());
      expect(scrollIntoView.mock.contexts).toContain(banner);
    });

    it("Reload refetches the ticket, clears the banner, and the next change carries the fresh version", async () => {
      const fetchSpy = mockDetail(
        staffTicket({ version: 1 }),
        staffTicket({ version: 2, currentStatus: "WAITING_FOR_REQUESTER", allowedTransitions: ["IN_PROGRESS", "RESOLVED"] })
      );
      const update = vi
        .spyOn(api, "updateTicketStatus")
        .mockRejectedValueOnce(STALE)
        .mockResolvedValue(staffTicket({ version: 3 }));
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Cancelled" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
      await screen.findByText(STALE_TEXT);

      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
      await waitFor(() => expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument());
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(statusButtons()).toEqual(["In Progress", "Resolved"]);

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "In Progress" }));
      await waitFor(() => expect(update).toHaveBeenLastCalledWith(1, "IN_PROGRESS", 2, undefined));
    });

    it("the confirm step is closed when the change is rejected, so a retry starts from the fresh state", async () => {
      mockDetail(staffTicket());
      vi.spyOn(api, "updateTicketStatus").mockRejectedValue(STALE);
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Cancelled" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
      await screen.findByText(STALE_TEXT);

      expect(screen.queryByText(/requires confirmation/i)).not.toBeInTheDocument();
    });

    it.each([
      ["RESOLUTION_GATE", "The resolution conditions are not met."],
      ["ILLEGAL_TRANSITION", "Cannot transition from NEW to CLOSED."],
    ])("%s uses the same banner with the server's message", async (code, message) => {
      mockDetail(staffTicket());
      vi.spyOn(api, "updateTicketStatus").mockRejectedValue(new ApiError(message, 409, undefined, { code }));
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));

      const banner = (await screen.findByText(message)).closest("[role='alert']") as HTMLElement;
      expect(banner).not.toBeNull();
      expect(within(banner).getByRole("button", { name: "Reload" })).toBeInTheDocument();
      expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument();
    });

    it("a successful change refreshes the summary, version, buttons and gate from the server", async () => {
      mockDetail(
        staffTicket({ version: 1, updatedAt: "2026-09-01T10:00:00.000Z" }),
        staffTicket({
          version: 2,
          currentStatus: "WAITING_FOR_REQUESTER",
          allowedTransitions: ["IN_PROGRESS", "RESOLVED"],
          resolutionGate: { ok: false, unmet: ["OPEN_ACTIONS"] },
        })
      );
      vi.spyOn(api, "updateTicketStatus").mockResolvedValue(staffTicket({ version: 2 }));
      await renderDetail();

      fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));

      await waitFor(() => expect(statusButtons()).toEqual(["In Progress", "Resolved"]));
      expect(within(statusGroup()).getByRole("button", { name: "Resolved" })).toBeDisabled();
      expect(screen.getByText("Finish or cancel open actions")).toBeInTheDocument();
      expect(screen.getByText("Waiting for Requester", { selector: ".badge" })).toBeInTheDocument();
    });

    it("a stale claim or priority change shows the same banner, and Reload clears it", async () => {
      mockDetail(staffTicket({ ownerId: null, ownerName: null, ownerEmail: null }));
      vi.spyOn(api, "claimTicket").mockRejectedValue(STALE);
      vi.spyOn(api, "updateTicketItPriority").mockRejectedValue(STALE);
      await renderDetail();

      fireEvent.click(screen.getByRole("button", { name: /Claim this ticket/i }));
      await screen.findByText(STALE_TEXT);
      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
      await waitFor(() => expect(screen.queryByText(STALE_TEXT)).not.toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("IT Priority"), { target: { value: "HIGH" } });
      expect(await screen.findByText(STALE_TEXT)).toBeInTheDocument();
    });

    it("a status button is disabled while a change is in flight, so a double click sends one request", async () => {
      mockDetail(staffTicket());
      let finish!: (value: api.Ticket) => void;
      const update = vi.spyOn(api, "updateTicketStatus").mockReturnValue(new Promise((resolve) => (finish = resolve)));
      await renderDetail();

      const button = within(statusGroup()).getByRole("button", { name: "Waiting for Requester" });
      fireEvent.click(button);
      fireEvent.click(button);

      expect(update).toHaveBeenCalledTimes(1);
      expect(button).toBeDisabled();
      finish(staffTicket());
    });
  });
});

describe("TicketWorkflow: a refresh that fails after a write", () => {
  const REFRESH_FAILED = "Could not refresh this ticket. What you see may be out of date.";

  it("keeps the page and what the user typed, shows a notice with Retry, and Retry loads the new state", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchStaffTicketDetail")
      .mockResolvedValueOnce(detail(staffTicket()))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(detail(staffTicket({ version: 2, currentStatus: "WAITING_FOR_REQUESTER", allowedTransitions: ["IN_PROGRESS"] })));
    const update = vi.spyOn(api, "updateTicketStatus").mockResolvedValue(staffTicket({ version: 2 }));
    await renderDetail();
    fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: "Half-written reply" } });

    fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));

    const notice = (await screen.findByText(REFRESH_FAILED)).closest("[role='alert']") as HTMLElement;
    expect(update).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Half-written reply");
    expect(screen.queryByText("Unable to load this ticket.")).not.toBeInTheDocument();

    fireEvent.click(within(notice).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText(REFRESH_FAILED)).not.toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(statusButtons()).toEqual(["In Progress"]);
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Half-written reply");
  });

  it("the same holds after an action was saved", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail")
      .mockResolvedValueOnce(detail(staffTicket()))
      .mockRejectedValue(new Error("network down"));
    vi.spyOn(api, "createAction").mockResolvedValue({
      id: 9, ticketId: 1, performedBy: { id: 5, name: "Priya Nair" }, assignee: null, status: "PLANNED",
      actionAt: "2026-10-08T03:15:00.000Z", description: "Check the dock", result: "", followUpRequired: false,
      followUpNote: "", attachmentNotes: "", createdAt: "2026-10-08T03:15:00.000Z", updatedAt: "2026-10-08T03:15:00.000Z", version: 1,
    });
    await renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Add action" }));
    const form = await screen.findByRole("form", { name: "Add action" });
    fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Check the dock" } });
    fireEvent.click(within(form).getByRole("button", { name: /^Save/ }));

    expect(await screen.findByText(REFRESH_FAILED)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "TKT-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText("Check the dock")).toBeInTheDocument();
  });

  it("a ticket that cannot be loaded the first time still shows the full error screen", async () => {
    vi.spyOn(api, "fetchStaffTicketDetail").mockRejectedValue(new ApiError("Ticket not found.", 404));
    render(<StaffTicketDetail ticketId={1} onBack={() => {}} />);

    expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
    expect(screen.queryByText(REFRESH_FAILED)).not.toBeInTheDocument();
  });
});

describe("TicketWorkflow: versions on writes (UI-24, staff side)", () => {
  it("claim, assign, priority and status each send the version that was loaded", async () => {
    mockDetail(staffTicket({ version: 7, ownerId: null, ownerName: null, ownerEmail: null }));
    const claim = vi.spyOn(api, "claimTicket").mockResolvedValue(staffTicket());
    const priority = vi.spyOn(api, "updateTicketItPriority").mockResolvedValue(staffTicket());
    const status = vi.spyOn(api, "updateTicketStatus").mockResolvedValue(staffTicket());
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: /Claim this ticket/i }));
    await waitFor(() => expect(claim).toHaveBeenCalledWith(1, 7));
    fireEvent.change(screen.getByLabelText("IT Priority"), { target: { value: "HIGH" } });
    await waitFor(() => expect(priority).toHaveBeenCalledWith(1, "HIGH", 7));
    fireEvent.click(within(statusGroup()).getByRole("button", { name: "Waiting for Requester" }));
    await waitFor(() => expect(status).toHaveBeenCalledWith(1, "WAITING_FOR_REQUESTER", 7, undefined));
  });

  it("assign sends the loaded version", async () => {
    mockDetail(staffTicket({ version: 4 }));
    const assign = vi.spyOn(api, "assignTicket").mockResolvedValue(staffTicket());
    await renderDetail();

    fireEvent.click(screen.getByRole("button", { name: /Reassign/i }));
    fireEvent.change(await screen.findByLabelText(/Reassign to/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(1, 5, 4));
  });
});

describe("TicketWorkflow: Administrator controls (UI-19, ticket part)", () => {
  // The Administrator opens the same component as IT Staff (App.tsx), so one render covers both roles.
  it("offers claim or reassign, IT Priority, status buttons, comment and note forms, and Actions Taken", async () => {
    mockDetail(staffTicket({ ownerId: null, ownerName: null, ownerEmail: null }));
    await renderDetail();

    expect(screen.getByRole("button", { name: /Claim this ticket/i })).toBeEnabled();
    expect(screen.getByLabelText("IT Priority")).toBeEnabled();
    expect(statusButtons().length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Add a comment")).toBeEnabled();
    expect(screen.getByLabelText("Add an internal note")).toBeEnabled();
    expect(await screen.findByRole("button", { name: "Add action" })).toBeEnabled();
  });
});
