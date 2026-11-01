import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ActionInput,
  ActionRevision,
  ActionStatus,
  ActionTakenItem,
  ApiError,
  AssignableUser,
  TicketStatus,
  createAction,
  fetchActionRevisions,
  fetchActions,
  fetchAssignableUsers,
  updateAction,
} from "./api.js";
import { ACTION_STATUS_LABELS, ActionStatusBadge } from "./ticketBadges.js";

// Lab 4 F6 (docs/lab-04/ui-spec.md §4, §6): the Actions Taken section of Ticket Detail. The same
// component serves IT Staff and Administrator (canWrite) and the Requester (read-only).

const DESCRIPTION_MAX = 2000;
const RESULT_MAX = 2000;
const NOTE_MAX = 1000;

const OPEN_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS"];
const isFinal = (status: ActionStatus) => status === "COMPLETED" || status === "CANCELLED";

// BR-06: the Status choices the form offers. Create: never Cancelled, and only Completed on a RESOLVED
// ticket (BR-10). Edit: the current status plus the moves allowed from it.
const EDIT_MOVES: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
  CANCELLED: ["CANCELLED"],
};

function statusChoices(mode: "create" | "edit", current: ActionStatus, ticketStatus: TicketStatus): ActionStatus[] {
  if (mode === "edit") return EDIT_MOVES[current];
  if (ticketStatus === "RESOLVED") return ["COMPLETED"];
  return ["PLANNED", "IN_PROGRESS", "COMPLETED"];
}

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
const formatWhen = (iso: string) => new Date(iso).toLocaleString();

interface FormValues {
  description: string;
  status: ActionStatus;
  result: string;
  actionAt: string;
  assigneeId: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

function initialValues(mode: "create" | "edit", action: ActionTakenItem | undefined, ticketStatus: TicketStatus): FormValues {
  if (mode === "edit" && action) {
    return {
      description: action.description,
      status: action.status,
      result: action.result,
      actionAt: toLocalInput(new Date(action.actionAt)),
      assigneeId: action.assignee ? String(action.assignee.id) : "",
      followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote,
      attachmentNotes: action.attachmentNotes,
    };
  }
  return {
    description: "",
    status: statusChoices("create", "PLANNED", ticketStatus)[0],
    result: "",
    actionAt: toLocalInput(new Date()),
    assigneeId: "",
    followUpRequired: false,
    followUpNote: "",
    attachmentNotes: "",
  };
}

// The same rules the server enforces (BR-03, BR-04, BR-06); the server stays the authority.
function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const description = values.description.trim();
  if (!description) errors.description = "Description is required.";
  else if (description.length > DESCRIPTION_MAX) errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  if (values.result.trim().length > RESULT_MAX) errors.result = `Result must be ${RESULT_MAX} characters or fewer.`;
  if (values.status === "COMPLETED" && !values.result.trim()) errors.result = "Result is required to complete an action.";
  if (values.followUpRequired && !values.followUpNote.trim()) errors.followUpNote = "Follow-up note is required when follow-up is required.";
  if (values.followUpNote.trim().length > NOTE_MAX) errors.followUpNote = `Follow-up note must be ${NOTE_MAX} characters or fewer.`;
  if (values.attachmentNotes.trim().length > NOTE_MAX) errors.attachmentNotes = `Attachment notes must be ${NOTE_MAX} characters or fewer.`;
  if (!values.actionAt || Number.isNaN(new Date(values.actionAt).getTime())) errors.actionAt = "Action time must be a valid date and time.";
  return errors;
}

type Notice = { kind: "stale" | "conflict" | "failure"; message: string };

interface ActionFormProps {
  mode: "create" | "edit";
  ticketId: number;
  ticketStatus: TicketStatus;
  action?: ActionTakenItem;
  people: AssignableUser[] | null;
  peopleFailed: boolean;
  onSaved: (saved: ActionTakenItem) => void;
  onCancel: () => void;
  onReload: () => Promise<void>;
}

function ActionForm({ mode, ticketId, ticketStatus, action, people, peopleFailed, onSaved, onCancel, onReload }: ActionFormProps) {
  const uid = useId();
  const [values, setValues] = useState<FormValues>(() => initialValues(mode, action, ticketStatus));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const originalActionAt = useRef(action?.actionAt);
  const originalLocal = action ? toLocalInput(new Date(action.actionAt)) : "";
  // The entry changed under the editor and is now final: nothing more can be saved.
  const becameFinal = mode === "edit" && !!action && isFinal(action.status);
  const choices = statusChoices(mode, mode === "edit" && action ? action.status : "PLANNED", ticketStatus);
  const title = mode === "create" ? "Add action" : "Edit action";

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const id = (name: string) => `${uid}-${name}`;
  const fieldProps = (name: string, extraDescribedBy?: string) => {
    const describedBy = [fieldErrors[name] ? id(`${name}-error`) : "", extraDescribedBy ?? ""].filter(Boolean).join(" ");
    return {
      id: id(name),
      "aria-invalid": fieldErrors[name] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };
  const errorFor = (name: string) =>
    fieldErrors[name] ? (
      <div id={id(`${name}-error`)} className="text-danger small mt-1">
        {fieldErrors[name]}
      </div>
    ) : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || becameFinal) return;
    const errors = validate(values);
    setFieldErrors(errors);
    setNotice(null);
    if (Object.keys(errors).length > 0) return;

    const input: ActionInput = {
      description: values.description.trim(),
      status: values.status,
      result: values.result.trim(),
      assigneeId: values.assigneeId ? Number(values.assigneeId) : null,
      followUpRequired: values.followUpRequired,
      followUpNote: values.followUpRequired ? values.followUpNote.trim() : "",
      attachmentNotes: values.attachmentNotes.trim(),
      actionAt:
        mode === "edit" && values.actionAt === originalLocal && originalActionAt.current
          ? originalActionAt.current
          : new Date(values.actionAt).toISOString(),
    };

    inFlight.current = true;
    setSaving(true);
    try {
      const saved = mode === "create" ? await createAction(ticketId, input) : await updateAction(ticketId, action!.id, input, action!.version);
      onSaved(saved);
    } catch (error) {
      console.error("Failed to save the action:", error);
      if (error instanceof ApiError && error.status === 409 && error.code === "STALE_VERSION") {
        setNotice({ kind: "stale", message: "Someone else changed this. Reload to see the latest, then try again." });
      } else if (error instanceof ApiError && error.status === 409) {
        setNotice({ kind: "conflict", message: error.message });
      } else if (error instanceof ApiError && error.status === 400 && error.fieldErrors) {
        setFieldErrors({ ...error.fieldErrors, ...(error.fieldErrors.assigneeId ? { assigneeId: error.fieldErrors.assigneeId } : {}) });
      } else {
        setNotice({ kind: "failure", message: "Unable to save the action. Check your connection and try again." });
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function handleReload() {
    setNotice(null);
    await onReload();
  }

  const requiresResult = values.status === "COMPLETED";
  const assigneeOptions = [...(people ?? [])];
  if (action?.assignee && !assigneeOptions.some((p) => p.id === action.assignee!.id)) assigneeOptions.push(action.assignee);

  return (
    <div className="border rounded p-3 mt-2 bg-white">
      {becameFinal && (
        <div className="alert alert-warning" role="alert">
          This action was completed or cancelled by someone else and can no longer be edited.
        </div>
      )}
      {notice && !becameFinal && (
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <span className="flex-grow-1">{notice.message}</span>
          {notice.kind === "stale" && (
            <button type="button" className="btn btn-outline-success btn-sm" onClick={handleReload}>
              Reload
            </button>
          )}
        </div>
      )}
      <form aria-label={title} onSubmit={handleSubmit} noValidate>
        <div className="mb-3">
          <label htmlFor={id("description")} className="form-label">
            Description <span aria-hidden="true">*</span>
          </label>
          <textarea
            className="form-control"
            rows={3}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            disabled={saving}
            {...fieldProps("description")}
          />
          {errorFor("description")}
        </div>

        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label htmlFor={id("status")} className="form-label">
              Status
            </label>
            <select
              className="form-select"
              value={values.status}
              onChange={(e) => set("status", e.target.value as ActionStatus)}
              disabled={saving || choices.length === 1}
              {...fieldProps("status", mode === "create" && ticketStatus === "RESOLVED" ? id("status-hint") : undefined)}
            >
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {ACTION_STATUS_LABELS[choice]}
                </option>
              ))}
            </select>
            {mode === "create" && ticketStatus === "RESOLVED" && (
              <div id={id("status-hint")} className="form-text">
                Reopen the ticket to add open work
              </div>
            )}
            {errorFor("status")}
          </div>
          <div className="col-md-4">
            <label htmlFor={id("assigneeId")} className="form-label">
              Assignee
            </label>
            <select
              className="form-select"
              value={values.assigneeId}
              onChange={(e) => set("assigneeId", e.target.value)}
              disabled={saving || (people === null && !peopleFailed)}
              {...fieldProps("assigneeId", peopleFailed ? id("people-failed") : undefined)}
            >
              <option value="">Unassigned</option>
              {assigneeOptions.map((person) => (
                <option key={person.id} value={String(person.id)}>
                  {person.name}
                </option>
              ))}
            </select>
            {peopleFailed && (
              <div id={id("people-failed")} className="form-text">
                Unable to load the list of people. You can still save without changing the assignee.
              </div>
            )}
            {errorFor("assigneeId")}
          </div>
          <div className="col-md-4">
            <label htmlFor={id("actionAt")} className="form-label">
              Action time
            </label>
            <input
              type="datetime-local"
              className="form-control"
              value={values.actionAt}
              onChange={(e) => set("actionAt", e.target.value)}
              disabled={saving}
              {...fieldProps("actionAt")}
            />
            {errorFor("actionAt")}
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor={id("result")} className="form-label">
            Result {requiresResult && <span aria-hidden="true">*</span>}
          </label>
          <textarea
            className="form-control"
            rows={2}
            value={values.result}
            onChange={(e) => set("result", e.target.value)}
            disabled={saving}
            aria-required={requiresResult ? "true" : undefined}
            {...fieldProps("result")}
          />
          {errorFor("result")}
        </div>

        <div className="form-check mb-2">
          <input
            type="checkbox"
            className="form-check-input"
            checked={values.followUpRequired}
            onChange={(e) => set("followUpRequired", e.target.checked)}
            disabled={saving}
            {...fieldProps("followUpRequired")}
          />
          <label htmlFor={id("followUpRequired")} className="form-check-label">
            Follow-up required
          </label>
        </div>
        <div className="mb-3">
          <label htmlFor={id("followUpNote")} className="form-label">
            Follow-up note {values.followUpRequired && <span aria-hidden="true">*</span>}
          </label>
          <textarea
            className="form-control"
            rows={2}
            value={values.followUpNote}
            onChange={(e) => set("followUpNote", e.target.value)}
            disabled={saving}
            aria-required={values.followUpRequired ? "true" : undefined}
            {...fieldProps("followUpNote")}
          />
          {errorFor("followUpNote")}
        </div>

        <div className="mb-3">
          <label htmlFor={id("attachmentNotes")} className="form-label">
            Attachment notes
          </label>
          <textarea
            className="form-control"
            rows={2}
            value={values.attachmentNotes}
            onChange={(e) => set("attachmentNotes", e.target.value)}
            disabled={saving}
            {...fieldProps("attachmentNotes")}
          />
          {errorFor("attachmentNotes")}
        </div>

        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-success" disabled={saving || becameFinal}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoryPanel({ ticketId, action, nameOf }: { ticketId: number; action: ActionTakenItem; nameOf: (id: number | null) => string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revisions, setRevisions] = useState<ActionRevision[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setRevisions(await fetchActionRevisions(ticketId, action.id));
      setState("ready");
    } catch (error) {
      console.error("Failed to load the history:", error);
      setState("error");
    }
  }, [ticketId, action.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div role="region" aria-label="History" className="border-start border-3 ps-3 mt-2">
      {state === "loading" && <p className="text-muted mb-0">Loading history…</p>}
      {state === "error" && (
        <div>
          <p className="text-danger mb-1">Unable to load the history.</p>
          <button type="button" className="btn btn-outline-success btn-sm" onClick={() => void load()}>
            Retry history
          </button>
        </div>
      )}
      {state === "ready" && (
        <ol className="list-unstyled mb-0">
          {revisions.map((r) => (
            <li key={r.revision} className="mb-2 small">
              <strong>Revision {r.revision}</strong> · {r.editedBy.name} · {formatWhen(r.editedAt)}
              <div>
                {ACTION_STATUS_LABELS[r.status]} · {nameOf(r.assigneeId)} · {formatWhen(r.actionAt)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{r.description}</div>
              {r.result && <div>Result: {r.result}</div>}
              {r.followUpRequired && <div>Follow-up: {r.followUpNote}</div>}
              {r.attachmentNotes && <div>Attachment notes: {r.attachmentNotes}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

interface ActionsTakenProps {
  ticketId: number;
  ticketStatus: TicketStatus;
  canWrite: boolean;
}

type LoadState = "loading" | "ready" | "error" | "forbidden";

export default function ActionsTaken({ ticketId, ticketStatus, canWrite }: ActionsTakenProps) {
  const headingId = useId();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("Unable to load actions.");
  const [actions, setActions] = useState<ActionTakenItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Set<number>>(new Set());
  const [people, setPeople] = useState<AssignableUser[] | null>(null);
  const [peopleFailed, setPeopleFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchActions(ticketId);
      setActions(result);
      setLoadState("ready");
    } catch (error) {
      console.error("Failed to load actions:", error);
      if (error instanceof ApiError && error.status === 403) {
        setLoadMessage("You do not have permission to view the actions of this ticket.");
        setLoadState("forbidden");
      } else if (error instanceof ApiError && error.status === 404) {
        setLoadMessage(error.message);
        setLoadState("error");
      } else {
        setLoadMessage("Unable to load actions.");
        setLoadState("error");
      }
    }
  }, [ticketId]);

  useEffect(() => {
    setLoadState("loading");
    void load();
  }, [load]);

  async function ensurePeople() {
    if (people !== null || !canWrite) return;
    try {
      setPeople(await fetchAssignableUsers());
      setPeopleFailed(false);
    } catch (error) {
      console.error("Failed to load assignable users:", error);
      setPeopleFailed(true);
    }
  }

  function openCreate() {
    setEditingId(null);
    setCreating(true);
    void ensurePeople();
  }
  function openEdit(id: number) {
    setCreating(false);
    setEditingId(id);
    void ensurePeople();
  }
  function toggleHistory(id: number) {
    setHistoryOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const nameOf = (userId: number | null): string => {
    if (userId === null) return "Unassigned";
    const known = people?.find((p) => p.id === userId) ?? actions.flatMap((a) => [a.assignee, a.performedBy]).find((p) => p?.id === userId);
    return known ? known.name : `User #${userId}`;
  };

  const ticketClosed = ticketStatus === "CLOSED" || ticketStatus === "CANCELLED";

  return (
    <section id="actions-taken" aria-labelledby={headingId} className="mt-4">
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h3 id={headingId} className="h6 mb-0">
          Actions Taken
        </h3>
        {canWrite && loadState === "ready" && !creating && (
          <button type="button" className="btn btn-success btn-sm" onClick={openCreate} disabled={ticketClosed}>
            Add action
          </button>
        )}
      </div>
      {canWrite && ticketClosed && loadState === "ready" && (
        <p className="text-muted small mt-1">This ticket is closed or cancelled, so no actions can be added.</p>
      )}

      {loadState === "loading" && <p className="mt-2">Loading actions…</p>}
      {(loadState === "error" || loadState === "forbidden") && (
        <div className="mt-2">
          <p className="text-danger mb-1">{loadMessage}</p>
          {loadState === "error" && (
            <button
              type="button"
              className="btn btn-outline-success btn-sm"
              onClick={() => {
                setLoadState("loading");
                void load();
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {loadState === "ready" && (
        <>
          {creating && (
            <ActionForm
              mode="create"
              ticketId={ticketId}
              ticketStatus={ticketStatus}
              people={people}
              peopleFailed={peopleFailed}
              onSaved={(saved) => {
                setActions((current) => [...current, saved]);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
              onReload={load}
            />
          )}
          {actions.length === 0 && !creating && <p className="text-muted mt-2">No actions recorded yet.</p>}
          {actions.length > 0 && (
            <ol className="list-unstyled mt-2 mb-0">
              {actions.map((a) => (
                <li key={a.id} className="mb-3 pb-3 border-bottom">
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <ActionStatusBadge status={a.status} />
                    <span className="text-muted small">{formatWhen(a.actionAt)}</span>
                    <span className="small">Performed by {a.performedBy.name}</span>
                    <span className="small">{a.assignee ? `Assigned to ${a.assignee.name}` : "Unassigned"}</span>
                    {a.followUpRequired && <span className="badge text-bg-warning">Follow-up needed</span>}
                  </div>
                  <p className="mb-1 mt-1" style={{ whiteSpace: "pre-wrap" }}>
                    {a.description}
                  </p>
                  {a.result && <p className="mb-1 small" style={{ whiteSpace: "pre-wrap" }}>Result: {a.result}</p>}
                  {a.followUpRequired && a.followUpNote && <p className="mb-1 small" style={{ whiteSpace: "pre-wrap" }}>Follow-up: {a.followUpNote}</p>}
                  {a.attachmentNotes && <p className="mb-1 small" style={{ whiteSpace: "pre-wrap" }}>Attachment notes: {a.attachmentNotes}</p>}

                  {canWrite && (
                    <div className="d-flex gap-2 mt-1">
                      {!isFinal(a.status) && editingId !== a.id && (
                        <button type="button" className="btn btn-outline-success btn-sm" onClick={() => openEdit(a.id)}>
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        aria-expanded={historyOpen.has(a.id)}
                        onClick={() => toggleHistory(a.id)}
                      >
                        {historyOpen.has(a.id) ? "Hide history" : "History"}
                      </button>
                    </div>
                  )}
                  {canWrite && historyOpen.has(a.id) && <HistoryPanel ticketId={ticketId} action={a} nameOf={nameOf} />}
                  {canWrite && editingId === a.id && (
                    <ActionForm
                      key={a.id}
                      mode="edit"
                      ticketId={ticketId}
                      ticketStatus={ticketStatus}
                      action={a}
                      people={people}
                      peopleFailed={peopleFailed}
                      onSaved={(saved) => {
                        setActions((current) => current.map((x) => (x.id === saved.id ? saved : x)));
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                      onReload={load}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
