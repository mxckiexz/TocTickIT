import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ActionsTaken from "../../src/ActionsTaken.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import type { ActionTakenItem } from "../../src/api.js";

// Lab 4 F6 (docs/lab-04/tests.md §5: UI-01..06, UI-19 (actions part), UI-20..23, UI-25; ui-spec.md §4, §6).

function action(overrides: Partial<ActionTakenItem> = {}): ActionTakenItem {
  return {
    id: 1,
    ticketId: 7,
    performedBy: { id: 3, name: "Priya Nair" },
    assignee: null,
    status: "PLANNED",
    actionAt: "2026-10-08T03:15:00.000Z",
    description: "Replaced the docking station",
    result: "",
    followUpRequired: false,
    followUpNote: "",
    attachmentNotes: "",
    createdAt: "2026-10-08T03:15:00.000Z",
    updatedAt: "2026-10-08T03:15:00.000Z",
    version: 1,
    ...overrides,
  };
}

const staffUsers = [
  { id: 3, name: "Priya Nair" },
  { id: 5, name: "Marcus Chen" },
];

function mockLoad(actions: ActionTakenItem[]) {
  vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue(staffUsers);
  return vi.spyOn(api, "fetchActions").mockResolvedValue(actions);
}

function renderStaff(props: Partial<{ ticketStatus: api.TicketStatus }> = {}) {
  return render(<ActionsTaken ticketId={7} ticketStatus={props.ticketStatus ?? "IN_PROGRESS"} canWrite />);
}

const optionTexts = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

async function openCreate() {
  fireEvent.click(await screen.findByRole("button", { name: "Add action" }));
  return screen.findByRole("form", { name: "Add action" });
}

describe("ActionsTaken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("list and states (UI-01)", () => {
    it("shows a loading message, then the actions in exactly the order the API returned them", async () => {
      let resolve!: (value: ActionTakenItem[]) => void;
      vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue(staffUsers);
      vi.spyOn(api, "fetchActions").mockReturnValue(new Promise((r) => (resolve = r)));
      renderStaff();
      expect(screen.getByText("Loading actions…")).toBeInTheDocument();
      // Newest-first on purpose: the component must not re-sort by time.
      resolve([
        action({ id: 3, description: "Third by time", actionAt: "2026-10-09T10:00:00.000Z" }),
        action({ id: 1, description: "First by time", actionAt: "2026-10-01T10:00:00.000Z" }),
        action({ id: 2, description: "Second by time", actionAt: "2026-10-05T10:00:00.000Z" }),
      ]);
      await screen.findByText("Third by time");
      const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
      expect(items[0]).toContain("Third by time");
      expect(items[1]).toContain("First by time");
      expect(items[2]).toContain("Second by time");
    });

    it("shows 'No actions recorded yet.' and, for staff, the Add action button", async () => {
      mockLoad([]);
      renderStaff();
      expect(await screen.findByText("No actions recorded yet.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add action" })).toBeInTheDocument();
    });

    it("shows 'Unable to load actions.' with a Retry that loads again", async () => {
      const spy = vi.spyOn(api, "fetchActions").mockRejectedValueOnce(new Error("boom")).mockResolvedValue([action({ description: "Back again" })]);
      vi.spyOn(api, "fetchAssignableUsers").mockResolvedValue(staffUsers);
      renderStaff();
      expect(await screen.findByText("Unable to load actions.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("Back again")).toBeInTheDocument();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("shows the server's message for a 404 and a permission message for a 403", async () => {
      vi.spyOn(api, "fetchActions").mockRejectedValue(new ApiError("Ticket not found.", 404));
      const { unmount } = renderStaff();
      expect(await screen.findByText("Ticket not found.")).toBeInTheDocument();
      unmount();
      vi.restoreAllMocks();
      vi.spyOn(api, "fetchActions").mockRejectedValue(new ApiError("You do not have permission to perform this action.", 403));
      renderStaff();
      expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument();
    });

    it("disables Add action on a closed or cancelled ticket and says why", async () => {
      mockLoad([]);
      renderStaff({ ticketStatus: "CLOSED" });
      const button = await screen.findByRole("button", { name: "Add action" });
      expect(button).toBeDisabled();
      expect(screen.getByText(/closed or cancelled/i)).toBeInTheDocument();
    });
  });

  describe("Requester view is read-only (UI-04, UI-22)", () => {
    it("UI-04: shows the list with no Add, Edit or History buttons", async () => {
      mockLoad([action({ status: "PLANNED" }), action({ id: 2, status: "COMPLETED", result: "Done", description: "Second entry" })]);
      render(<ActionsTaken ticketId={7} ticketStatus="IN_PROGRESS" canWrite={false} />);
      await screen.findByText("Replaced the docking station");
      expect(screen.queryByRole("button", { name: /add action|edit|history/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("UI-22: shows every field of an entry: performer, assignee, status text, result, follow-up note and attachment notes", async () => {
      mockLoad([
        action({
          status: "COMPLETED",
          assignee: { id: 5, name: "Marcus Chen" },
          result: "Dock replaced and tested",
          followUpRequired: true,
          followUpNote: "Check again next week",
          attachmentNotes: "Photo kept on the shared drive",
        }),
      ]);
      render(<ActionsTaken ticketId={7} ticketStatus="IN_PROGRESS" canWrite={false} />);
      const item = (await screen.findByText("Replaced the docking station")).closest("li")!;
      const entry = within(item);
      expect(entry.getByText(/Priya Nair/)).toBeInTheDocument();
      expect(entry.getByText(/Marcus Chen/)).toBeInTheDocument();
      expect(entry.getByText("Completed")).toBeInTheDocument();
      expect(entry.getByText(/Dock replaced and tested/)).toBeInTheDocument();
      expect(entry.getByText("Follow-up needed")).toBeInTheDocument();
      expect(entry.getByText(/Check again next week/)).toBeInTheDocument();
      expect(entry.getByText(/Photo kept on the shared drive/)).toBeInTheDocument();
    });

    it("shows 'Unassigned' when there is no assignee, and the status as text", async () => {
      mockLoad([action({ status: "IN_PROGRESS", assignee: null })]);
      render(<ActionsTaken ticketId={7} ticketStatus="IN_PROGRESS" canWrite={false} />);
      const item = (await screen.findByText("Replaced the docking station")).closest("li")!;
      expect(within(item).getByText(/Unassigned/)).toBeInTheDocument();
      expect(within(item).getByText("In progress")).toBeInTheDocument();
    });
  });

  describe("Edit buttons (UI-05, UI-19)", () => {
    it("UI-05: PLANNED and IN_PROGRESS entries have Edit; COMPLETED and CANCELLED do not; there is never a Delete", async () => {
      mockLoad([
        action({ id: 1, status: "PLANNED", description: "planned one" }),
        action({ id: 2, status: "IN_PROGRESS", description: "in progress one" }),
        action({ id: 3, status: "COMPLETED", description: "completed one", result: "ok" }),
        action({ id: 4, status: "CANCELLED", description: "cancelled one" }),
      ]);
      renderStaff();
      await screen.findByText("planned one");
      const has = (text: string) => within(screen.getByText(text).closest("li")!).queryByRole("button", { name: /^edit/i });
      expect(has("planned one")).toBeInTheDocument();
      expect(has("in progress one")).toBeInTheDocument();
      expect(has("completed one")).not.toBeInTheDocument();
      expect(has("cancelled one")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete|remove/i })).not.toBeInTheDocument();
    });

    it("UI-19: staff and Administrator get the same controls: Add action, Edit and History", async () => {
      mockLoad([action({ status: "PLANNED" })]);
      renderStaff();
      expect(await screen.findByRole("button", { name: "Add action" })).toBeEnabled();
      expect(screen.getByRole("button", { name: /^edit/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^history/i })).toBeInTheDocument();
    });
  });

  describe("create mode (UI-02, UI-20, UI-25)", () => {
    it("UI-20: Status offers exactly Planned (selected), In progress and Completed; Cancelled is not offered", async () => {
      mockLoad([]);
      renderStaff();
      const form = await openCreate();
      const status = within(form).getByLabelText("Status");
      expect(optionTexts(status)).toEqual(["Planned", "In progress", "Completed"]);
      expect(status).toHaveValue("PLANNED");
    });

    it("UI-02: an empty Description is an error directly under the field, tied to it, and nothing is sent", async () => {
      mockLoad([]);
      const create = vi.spyOn(api, "createAction");
      renderStaff();
      const form = await openCreate();
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      const error = await within(form).findByText("Description is required.");
      const field = within(form).getByLabelText(/Description/);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")).toContain(error.id);
      expect(create).not.toHaveBeenCalled();
    });

    it("UI-02: the Follow-up note becomes required when Follow-up required is checked", async () => {
      mockLoad([]);
      const create = vi.spyOn(api, "createAction");
      renderStaff();
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Rebooted the router" } });
      fireEvent.click(within(form).getByLabelText("Follow-up required"));
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      expect(await within(form).findByText("Follow-up note is required when follow-up is required.")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("UI-02, UI-20: choosing Completed makes Result required, with the message, and blocks Save", async () => {
      mockLoad([]);
      const create = vi.spyOn(api, "createAction");
      renderStaff();
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Swapped the cable" } });
      fireEvent.change(within(form).getByLabelText("Status"), { target: { value: "COMPLETED" } });
      expect(within(form).getByLabelText(/^Result/)).toHaveAttribute("aria-required", "true");
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      expect(await within(form).findByText("Result is required to complete an action.")).toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("sends the typed values (trimmed, assignee as a number, action time as ISO), adds the new entry to the list and closes the form", async () => {
      mockLoad([action({ id: 1, description: "Existing" })]);
      const created = action({ id: 2, description: "Swapped the cable", status: "COMPLETED", result: "Works" });
      const create = vi.spyOn(api, "createAction").mockResolvedValue(created);
      renderStaff();
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "  Swapped the cable  " } });
      fireEvent.change(within(form).getByLabelText("Status"), { target: { value: "COMPLETED" } });
      fireEvent.change(within(form).getByLabelText(/^Result/), { target: { value: "Works" } });
      await waitFor(() => expect(within(form).getByLabelText("Assignee")).toBeEnabled());
      fireEvent.change(within(form).getByLabelText("Assignee"), { target: { value: "5" } });
      fireEvent.change(within(form).getByLabelText("Action time"), { target: { value: "2026-10-08T10:30" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      await screen.findByText("Swapped the cable");
      expect(create).toHaveBeenCalledTimes(1);
      const [ticketId, body] = create.mock.calls[0];
      expect(ticketId).toBe(7);
      expect(body).toMatchObject({
        description: "Swapped the cable",
        status: "COMPLETED",
        result: "Works",
        assigneeId: 5,
        followUpRequired: false,
        followUpNote: "",
        actionAt: new Date("2026-10-08T10:30").toISOString(),
      });
      expect(screen.queryByRole("form", { name: "Add action" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("listitem").some((li) => li.textContent?.includes("Existing"))).toBe(true);
    });

    it("UI-02: the Assignee select lists Unassigned first, then the active staff, and a failed load does not block the form", async () => {
      vi.spyOn(api, "fetchActions").mockResolvedValue([]);
      vi.spyOn(api, "fetchAssignableUsers").mockRejectedValue(new Error("down"));
      renderStaff();
      const form = await openCreate();
      expect(await within(form).findByText(/Unable to load the list of people/i)).toBeInTheDocument();
      expect(within(form).getByLabelText(/Description/)).toBeEnabled();
      expect(optionTexts(within(form).getByLabelText("Assignee"))[0]).toBe("Unassigned");
    });

    it("UI-02: server field errors land under their own fields and everything typed stays", async () => {
      mockLoad([]);
      vi.spyOn(api, "createAction").mockRejectedValue(new ApiError("Please correct the highlighted fields.", 400, { assigneeId: "Assignee must be an active IT Staff or Administrator." }));
      renderStaff();
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Keep this text" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      expect(await within(form).findByText("Assignee must be an active IT Staff or Administrator.")).toBeInTheDocument();
      expect(within(form).getByLabelText(/Description/)).toHaveValue("Keep this text");
    });

    it("UI-02: a request failure shows a banner above the form and keeps the typed values", async () => {
      mockLoad([]);
      vi.spyOn(api, "createAction").mockRejectedValue(new Error("network down"));
      renderStaff();
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Keep this text" } });
      fireEvent.change(within(form).getByLabelText("Attachment notes"), { target: { value: "and these notes" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent(/Unable to save/i);
      expect(within(form).getByLabelText(/Description/)).toHaveValue("Keep this text");
      expect(within(form).getByLabelText("Attachment notes")).toHaveValue("and these notes");
      expect(within(form).getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("Cancel closes the form without sending anything", async () => {
      mockLoad([]);
      const create = vi.spyOn(api, "createAction");
      renderStaff();
      const form = await openCreate();
      fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("form", { name: "Add action" })).not.toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    });

    it("UI-25: on a RESOLVED ticket the Status offers only Completed, with the hint to reopen", async () => {
      mockLoad([]);
      renderStaff({ ticketStatus: "RESOLVED" });
      const form = await openCreate();
      expect(optionTexts(within(form).getByLabelText("Status"))).toEqual(["Completed"]);
      expect(within(form).getByText("Reopen the ticket to add open work")).toBeInTheDocument();
    });

    it("UI-25: a 409 TICKET_RESOLVED from the server shows the conflict banner and keeps what was typed", async () => {
      mockLoad([]);
      vi.spyOn(api, "createAction").mockRejectedValue(new ApiError("Reopen the ticket before adding open work.", 409, undefined, { code: "TICKET_RESOLVED" }));
      renderStaff({ ticketStatus: "IN_PROGRESS" });
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Typed text stays" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("Reopen the ticket before adding open work.");
      expect(within(form).getByLabelText(/Description/)).toHaveValue("Typed text stays");
    });
  });

  describe("in-flight protection (UI-06)", () => {
    it("Save is disabled and reads 'Saving…' while the request runs, and a double click sends one request", async () => {
      mockLoad([]);
      let finish!: (a: ActionTakenItem) => void;
      const create = vi.spyOn(api, "createAction").mockReturnValue(new Promise((r) => (finish = r)));
      renderStaff();
      const form = await openCreate();
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "Once only" } });
      const save = within(form).getByRole("button", { name: "Save" });
      fireEvent.click(save);
      fireEvent.click(save);
      expect(await within(form).findByRole("button", { name: "Saving…" })).toBeDisabled();
      expect(create).toHaveBeenCalledTimes(1);
      finish(action({ id: 9, description: "Once only" }));
      await screen.findByText("Once only");
    });
  });

  describe("edit mode (UI-03, UI-21)", () => {
    it("UI-21: from Planned the Status offers Planned, In progress, Completed and Cancelled; from In progress only itself, Completed and Cancelled", async () => {
      mockLoad([action({ id: 1, status: "PLANNED", description: "from planned" }), action({ id: 2, status: "IN_PROGRESS", description: "from in progress" })]);
      renderStaff();
      await screen.findByText("from planned");
      fireEvent.click(within(screen.getByText("from planned").closest("li")!).getByRole("button", { name: /^edit/i }));
      let form = await screen.findByRole("form", { name: "Edit action" });
      expect(optionTexts(within(form).getByLabelText("Status"))).toEqual(["Planned", "In progress", "Completed", "Cancelled"]);
      fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
      fireEvent.click(within(screen.getByText("from in progress").closest("li")!).getByRole("button", { name: /^edit/i }));
      form = await screen.findByRole("form", { name: "Edit action" });
      expect(optionTexts(within(form).getByLabelText("Status"))).toEqual(["In progress", "Completed", "Cancelled"]);
      expect(within(form).queryByRole("button", { name: /delete|remove/i })).not.toBeInTheDocument();
    });

    it("UI-03: the form is filled with the entry and Save sends the loaded version; the list shows the saved entry", async () => {
      mockLoad([action({ id: 4, version: 3, description: "Old text", assignee: { id: 5, name: "Marcus Chen" } })]);
      const update = vi.spyOn(api, "updateAction").mockResolvedValue(action({ id: 4, version: 4, description: "New text" }));
      renderStaff();
      fireEvent.click(await screen.findByRole("button", { name: /^edit/i }));
      const form = await screen.findByRole("form", { name: "Edit action" });
      expect(within(form).getByLabelText(/Description/)).toHaveValue("Old text");
      await waitFor(() => expect(within(form).getByLabelText("Assignee")).toHaveValue("5"));
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "New text" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      await screen.findByText("New text");
      expect(update).toHaveBeenCalledTimes(1);
      const [ticketId, actionId, , version] = update.mock.calls[0];
      expect([ticketId, actionId, version]).toEqual([7, 4, 3]);
      expect(screen.queryByRole("form", { name: "Edit action" })).not.toBeInTheDocument();
    });

    it("UI-03: a 409 STALE_VERSION shows the conflict banner above the form with Reload, keeping the typed input; Reload refetches and the next Save sends the latest version", async () => {
      const fetchSpy = mockLoad([action({ id: 4, version: 1, description: "Original" })]);
      const update = vi
        .spyOn(api, "updateAction")
        .mockRejectedValueOnce(new ApiError("This record was changed by someone else. Reload and try again.", 409, undefined, { code: "STALE_VERSION", currentVersion: 2 }))
        .mockResolvedValue(action({ id: 4, version: 3, description: "My edit" }));
      renderStaff();
      fireEvent.click(await screen.findByRole("button", { name: /^edit/i }));
      const form = await screen.findByRole("form", { name: "Edit action" });
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "My edit" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("Someone else changed this. Reload to see the latest, then try again.");
      expect(within(form).getByLabelText(/Description/)).toHaveValue("My edit");

      fetchSpy.mockResolvedValue([action({ id: 4, version: 2, description: "Changed by someone else" })]);
      fireEvent.click(within(banner).getByRole("button", { name: "Reload" }));
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      expect(within(screen.getByRole("form", { name: "Edit action" })).getByLabelText(/Description/)).toHaveValue("My edit");

      fireEvent.click(within(screen.getByRole("form", { name: "Edit action" })).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
      expect(update.mock.calls[1][3]).toBe(2);
    });

    it("UI-03: if the entry became final while editing, Reload says it can no longer be edited and Save stays disabled", async () => {
      const fetchSpy = mockLoad([action({ id: 4, version: 1 })]);
      vi.spyOn(api, "updateAction").mockRejectedValue(new ApiError("stale", 409, undefined, { code: "STALE_VERSION", currentVersion: 2 }));
      renderStaff();
      fireEvent.click(await screen.findByRole("button", { name: /^edit/i }));
      const form = await screen.findByRole("form", { name: "Edit action" });
      fireEvent.change(within(form).getByLabelText(/Description/), { target: { value: "edited" } });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      const banner = await screen.findByRole("alert");
      fetchSpy.mockResolvedValue([action({ id: 4, version: 2, status: "COMPLETED", result: "done by someone else" })]);
      fireEvent.click(within(banner).getByRole("button", { name: "Reload" }));
      expect(await screen.findByText(/can no longer be edited/i)).toBeInTheDocument();
      expect(within(screen.getByRole("form", { name: "Edit action" })).getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("an ACTION_FINAL or TICKET_CLOSED conflict shows its message in the same banner, without a Reload button", async () => {
      mockLoad([action({ id: 4 })]);
      vi.spyOn(api, "updateAction").mockRejectedValue(new ApiError("A completed or cancelled action can no longer be edited.", 409, undefined, { code: "ACTION_FINAL" }));
      renderStaff();
      fireEvent.click(await screen.findByRole("button", { name: /^edit/i }));
      const form = await screen.findByRole("form", { name: "Edit action" });
      fireEvent.click(within(form).getByRole("button", { name: "Save" }));
      const banner = await screen.findByRole("alert");
      expect(banner).toHaveTextContent("A completed or cancelled action can no longer be edited.");
      expect(within(banner).queryByRole("button", { name: "Reload" })).not.toBeInTheDocument();
    });
  });

  describe("history (UI-23)", () => {
    it("UI-23: History expands the revisions oldest first with revision number, editor, time and values", async () => {
      mockLoad([action({ id: 4, version: 2 })]);
      const spy = vi.spyOn(api, "fetchActionRevisions").mockResolvedValue([
        { revision: 1, editedBy: { id: 3, name: "Priya Nair" }, editedAt: "2026-10-08T03:15:00.000Z", status: "PLANNED", assigneeId: null, actionAt: "2026-10-08T03:15:00.000Z", description: "First text", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" },
        { revision: 2, editedBy: { id: 5, name: "Marcus Chen" }, editedAt: "2026-10-09T08:00:00.000Z", status: "IN_PROGRESS", assigneeId: 5, actionAt: "2026-10-08T03:15:00.000Z", description: "Second text", result: "", followUpRequired: true, followUpNote: "Call back", attachmentNotes: "" },
      ]);
      renderStaff();
      fireEvent.click(await screen.findByRole("button", { name: /^history/i }));
      const region = await screen.findByRole("region", { name: /history/i });
      expect(spy).toHaveBeenCalledWith(7, 4);
      const rows = within(region).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent(/Revision 1/);
      expect(rows[0]).toHaveTextContent("Priya Nair");
      expect(rows[0]).toHaveTextContent("First text");
      expect(rows[1]).toHaveTextContent(/Revision 2/);
      expect(rows[1]).toHaveTextContent("Marcus Chen");
      expect(rows[1]).toHaveTextContent("Second text");
      expect(rows[1]).toHaveTextContent("Call back");
      fireEvent.click(screen.getByRole("button", { name: /^hide history/i }));
      expect(screen.queryByRole("region", { name: /history/i })).not.toBeInTheDocument();
    });

    it("a failed history load says so and can be retried", async () => {
      mockLoad([action({ id: 4 })]);
      const spy = vi.spyOn(api, "fetchActionRevisions").mockRejectedValueOnce(new Error("x")).mockResolvedValue([]);
      renderStaff();
      fireEvent.click(await screen.findByRole("button", { name: /^history/i }));
      expect(await screen.findByText("Unable to load the history.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    });
  });
});
