import { FormEvent, useState, useEffect } from "react";
import {
  ApiError,
  AssignableUser,
  Comment,
  Priority,
  StaffTicket,
  TicketStatus,
  assignTicket,
  claimTicket,
  fetchAssignableUsers,
  fetchStaffTicketDetail,
  postComment,
  postNote,
  staffTicketAttachmentUrl,
  updateTicketItPriority,
  updateTicketStatus,
} from "./api.js";
import { PriorityBadge, STATUS_LABELS } from "./ticketBadges.js";

const COMMENT_MAX_LENGTH = 2000;

// Mirrors server/src/ticketStatus.ts's STATUS_TRANSITIONS exactly
// (docs/lab-03/specification.md §7.3) — duplicated client-side (as a plain
// string-keyed map, no Prisma dependency) so the status <select> can offer
// only legal next states without a round trip.
const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

const CONFIRMATION_REQUIRED_STATUSES = new Set<TicketStatus>([
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
]);


interface StaffTicketDetailProps {
  ticketId: number;
  onBack: () => void;
}

type LoadState = "loading" | "ready" | "error" | "forbidden";

// Lab 3 (Issue #38) — extends the Requester Ticket Detail layout (ui-spec.md
// §7) with the ownership control, IT Priority selector, status control, and
// an Internal Notes panel alongside Public Comments. Attachments/comments/
// notes all arrive bundled in one GET /api/staff/tickets/:id response — no
// separate fetches the way the Requester screen needs.
export default function StaffTicketDetail({ ticketId, onBack }: StaffTicketDetailProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [ticket, setTicket] = useState<StaffTicket | null>(null);
  const [attachments, setAttachments] = useState<
    { id: number; originalFilename: string; sizeBytes: number; createdAt: string; removedAt: string | null; removalReason: string | null }[]
  >([]);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentFieldError, setCommentFieldError] = useState("");
  const [commentPostState, setCommentPostState] = useState<"idle" | "posting">("idle");
  const [commentPostError, setCommentPostError] = useState("");

  const [notes, setNotes] = useState<Comment[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteFieldError, setNoteFieldError] = useState("");
  const [notePostState, setNotePostState] = useState<"idle" | "posting">("idle");
  const [notePostError, setNotePostError] = useState("");

  const [ownershipUiState, setOwnershipUiState] = useState<"idle" | "saving">("idle");
  const [ownershipError, setOwnershipError] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignSelection, setReassignSelection] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[] | null>(null);
  const [assignableUsersState, setAssignableUsersState] = useState<"idle" | "loading" | "error">("idle");

  const [priorityUiState, setPriorityUiState] = useState<"idle" | "saving">("idle");
  const [priorityError, setPriorityError] = useState("");

  const [statusPendingTarget, setStatusPendingTarget] = useState<TicketStatus | null>(null);
  const [statusUiState, setStatusUiState] = useState<"idle" | "saving">("idle");
  const [statusError, setStatusError] = useState("");

  // A fresh mount of this component happens every time a different ticket
  // is opened (StaffTicketQueue conditionally renders it, the same way
  // MyTickets does for the Requester screen), so ticketId never changes on
  // an already-mounted instance — no stale-response race to guard against.
  async function loadDetail() {
    try {
      const result = await fetchStaffTicketDetail(ticketId);
      setTicket(result.ticket);
      setAttachments(result.attachments);
      setComments(result.comments);
      setNotes(result.notes);
      setLoadState("ready");
    } catch (error) {
      console.error("Failed to load staff ticket detail:", error);
      if (error instanceof ApiError && error.status === 403) {
        setLoadState("forbidden");
        return;
      }
      setErrorMessage(error instanceof ApiError ? error.message : "Unable to load this ticket.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    setLoadState("loading");
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function handleClaim() {
    setOwnershipUiState("saving");
    setOwnershipError("");
    try {
      await claimTicket(ticketId);
      await loadDetail();
    } catch (error) {
      console.error("Failed to claim ticket:", error);
      setOwnershipError(error instanceof ApiError ? error.message : "Unable to claim this ticket.");
    } finally {
      setOwnershipUiState("idle");
    }
  }

  async function openReassign() {
    setReassignOpen(true);
    setReassignSelection("");
    setOwnershipError("");
    if (assignableUsers !== null) return;

    setAssignableUsersState("loading");
    try {
      const users = await fetchAssignableUsers();
      setAssignableUsers(users);
      setAssignableUsersState("idle");
    } catch (error) {
      console.error("Failed to load assignable users:", error);
      setAssignableUsersState("error");
    }
  }

  function cancelReassign() {
    setReassignOpen(false);
    setReassignSelection("");
  }

  async function confirmReassign() {
    if (!reassignSelection) return;
    setOwnershipUiState("saving");
    setOwnershipError("");
    try {
      await assignTicket(ticketId, Number(reassignSelection));
      setReassignOpen(false);
      await loadDetail();
    } catch (error) {
      console.error("Failed to reassign ticket:", error);
      setOwnershipError(error instanceof ApiError ? error.message : "Unable to reassign this ticket.");
    } finally {
      setOwnershipUiState("idle");
    }
  }

  async function handlePriorityChange(nextPriority: Priority) {
    setPriorityUiState("saving");
    setPriorityError("");
    try {
      await updateTicketItPriority(ticketId, nextPriority);
      await loadDetail();
    } catch (error) {
      console.error("Failed to update priority:", error);
      setPriorityError(error instanceof ApiError ? error.message : "Unable to update priority.");
    } finally {
      setPriorityUiState("idle");
    }
  }

  function handleStatusSelectChange(nextStatus: TicketStatus) {
    if (!ticket || nextStatus === ticket.currentStatus) return;
    setStatusError("");
    if (CONFIRMATION_REQUIRED_STATUSES.has(nextStatus)) {
      setStatusPendingTarget(nextStatus);
    } else {
      void applyStatusChange(nextStatus, false);
    }
  }

  function cancelStatusConfirm() {
    setStatusPendingTarget(null);
  }

  async function applyStatusChange(target: TicketStatus, confirm: boolean) {
    setStatusUiState("saving");
    setStatusError("");
    try {
      await updateTicketStatus(ticketId, target, confirm || undefined);
      setStatusPendingTarget(null);
      await loadDetail();
    } catch (error) {
      console.error("Failed to update status:", error);
      setStatusError(error instanceof ApiError ? error.message : "Unable to update status.");
    } finally {
      setStatusUiState("idle");
    }
  }

  async function handlePostComment(event: FormEvent) {
    event.preventDefault();
    if (commentPostState === "posting") return;

    const trimmed = commentBody.trim();
    setCommentFieldError("");
    setCommentPostError("");
    if (!trimmed) {
      setCommentFieldError("Comment cannot be empty.");
      return;
    }
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      setCommentFieldError(`Comment must be ${COMMENT_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setCommentPostState("posting");
    try {
      const comment = await postComment(ticketId, commentBody);
      setComments((current) => [...current, comment]);
      setCommentBody("");
    } catch (error) {
      console.error("Failed to post comment:", error);
      setCommentPostError(error instanceof ApiError ? error.message : "Unable to post your comment.");
    } finally {
      setCommentPostState("idle");
    }
  }

  async function handlePostNote(event: FormEvent) {
    event.preventDefault();
    if (notePostState === "posting") return;

    const trimmed = noteBody.trim();
    setNoteFieldError("");
    setNotePostError("");
    if (!trimmed) {
      setNoteFieldError("Note cannot be empty.");
      return;
    }
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      setNoteFieldError(`Note must be ${COMMENT_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setNotePostState("posting");
    try {
      const note = await postNote(ticketId, noteBody);
      setNotes((current) => [...current, note]);
      setNoteBody("");
    } catch (error) {
      console.error("Failed to post note:", error);
      setNotePostError(error instanceof ApiError ? error.message : "Unable to post your note.");
    } finally {
      setNotePostState("idle");
    }
  }

  function formatSize(sizeBytes: number) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  if (loadState === "loading") {
    return (
      <div className="mt-4">
        <button type="button" className="btn btn-link btn-sm p-0 mb-3" onClick={onBack}>
          ← Back to Ticket Queue
        </button>
        <p>Loading ticket…</p>
      </div>
    );
  }

  if (loadState === "forbidden") {
    return (
      <div className="mt-4">
        <button type="button" className="btn btn-link btn-sm p-0 mb-3" onClick={onBack}>
          ← Back to Ticket Queue
        </button>
        <div className="alert alert-danger" role="alert">
          You do not have permission to view this page.
        </div>
      </div>
    );
  }

  if (loadState === "error" || !ticket) {
    return (
      <div className="mt-4">
        <button type="button" className="btn btn-link btn-sm p-0 mb-3" onClick={onBack}>
          ← Back to Ticket Queue
        </button>
        <div className="alert alert-danger" role="alert">
          {errorMessage}
        </div>
      </div>
    );
  }

  const legalNextStatuses = STATUS_TRANSITIONS[ticket.currentStatus];

  return (
    <div className="mt-4">
      <button type="button" className="btn btn-link btn-sm p-0 mb-3" onClick={onBack}>
        ← Back to Ticket Queue
      </button>

      <h2 className="h5">{ticket.ticketNumber}</h2>

      <dl className="row">
        <dt className="col-sm-3">Requester</dt>
        <dd className="col-sm-9">
          {ticket.requesterName} ({ticket.requesterEmail})
        </dd>

        <dt className="col-sm-3">Category</dt>
        <dd className="col-sm-9">{ticket.categoryName}</dd>

        <dt className="col-sm-3">Related System</dt>
        <dd className="col-sm-9">{ticket.relatedSystemName}</dd>

        <dt className="col-sm-3">Summary</dt>
        <dd className="col-sm-9">{ticket.summary}</dd>

        <dt className="col-sm-3">Description</dt>
        <dd className="col-sm-9" style={{ whiteSpace: "pre-wrap" }}>
          {ticket.description}
        </dd>

        <dt className="col-sm-3">Requested Priority</dt>
        <dd className="col-sm-9">
          <PriorityBadge priority={ticket.requestedPriority} />
        </dd>

        <dt className="col-sm-3">IT Priority</dt>
        <dd className="col-sm-9">
          <select
            className="form-select form-select-sm d-inline-block"
            style={{ width: "auto" }}
            aria-label="IT Priority"
            value={ticket.itPriority}
            disabled={priorityUiState === "saving"}
            onChange={(event) => handlePriorityChange(event.target.value as Priority)}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          {priorityUiState === "saving" && <span className="ms-2 small text-muted">Saving…</span>}
          {priorityError && <div className="text-danger small mt-1">{priorityError}</div>}
        </dd>

        <dt className="col-sm-3">Owner</dt>
        <dd className="col-sm-9">
          {!ticket.ownerName && !reassignOpen && (
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={handleClaim}
              disabled={ownershipUiState === "saving"}
            >
              {ownershipUiState === "saving" ? "Claiming…" : "Claim this ticket"}
            </button>
          )}

          {ticket.ownerName && !reassignOpen && (
            <>
              <strong>{ticket.ownerName}</strong>{" "}
              <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={openReassign}>
                Reassign
              </button>
            </>
          )}

          {reassignOpen && (
            <div>
              {assignableUsersState === "loading" && <p className="small mb-1">Loading IT Staff…</p>}
              {assignableUsersState === "error" && (
                <p className="text-danger small mb-1">Unable to load the list of IT Staff.</p>
              )}
              {assignableUsersState === "idle" && assignableUsers && (
                <select
                  className="form-select form-select-sm d-inline-block mb-1"
                  style={{ width: "auto" }}
                  aria-label="Reassign to"
                  value={reassignSelection}
                  onChange={(event) => setReassignSelection(event.target.value)}
                >
                  <option value="">Select IT Staff…</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-success btn-sm" onClick={cancelReassign}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={!reassignSelection || ownershipUiState === "saving"}
                  onClick={confirmReassign}
                >
                  {ownershipUiState === "saving" ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
          {ownershipError && <div className="text-danger small mt-1">{ownershipError}</div>}
        </dd>

        <dt className="col-sm-3">Status</dt>
        <dd className="col-sm-9">
          <select
            className="form-select form-select-sm d-inline-block"
            style={{ width: "auto" }}
            aria-label="Status"
            value={statusPendingTarget ?? ticket.currentStatus}
            disabled={statusUiState === "saving"}
            onChange={(event) => handleStatusSelectChange(event.target.value as TicketStatus)}
          >
            <option value={ticket.currentStatus} disabled>
              {STATUS_LABELS[ticket.currentStatus]} (current)
            </option>
            {legalNextStatuses.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          {statusPendingTarget && (
            <div className="mt-2">
              <p className="mb-2 small">
                Change status to <strong>{STATUS_LABELS[statusPendingTarget]}</strong>? This requires
                confirmation.
              </p>
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-outline-success btn-sm" onClick={cancelStatusConfirm}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={statusUiState === "saving"}
                  onClick={() => applyStatusChange(statusPendingTarget, true)}
                >
                  {statusUiState === "saving" ? "Saving…" : "Confirm"}
                </button>
              </div>
            </div>
          )}
          {statusError && <div className="text-danger small mt-1">{statusError}</div>}

          {ticket.requesterMarkedResolvedAt && (
            <p className="text-success small mt-2 mb-0">
              Requester marked this resolved on{" "}
              {new Date(ticket.requesterMarkedResolvedAt).toLocaleString()}.
            </p>
          )}
        </dd>

        <dt className="col-sm-3">Created</dt>
        <dd className="col-sm-9">{new Date(ticket.createdAt).toLocaleString()}</dd>

        <dt className="col-sm-3">Last Updated</dt>
        <dd className="col-sm-9">{new Date(ticket.updatedAt).toLocaleString()}</dd>
      </dl>

      <h3 className="h6">Attachments</h3>
      {attachments.length === 0 && <p className="text-muted">No attachments on this ticket.</p>}
      {attachments.length > 0 && (
        <ul className="list-unstyled">
          {attachments.map((attachment) => (
            <li key={attachment.id} className={attachment.removedAt ? "mb-1 text-muted" : "mb-1"}>
              {attachment.removedAt ? (
                <span style={{ textDecoration: "line-through" }}>{attachment.originalFilename}</span>
              ) : (
                <a
                  href={staffTicketAttachmentUrl(ticketId, attachment.id)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {attachment.originalFilename}
                </a>
              )}{" "}
              <span className="text-muted small">
                ({formatSize(attachment.sizeBytes)}
                {attachment.removedAt
                  ? `, removed ${new Date(attachment.removedAt).toLocaleString()}${
                      attachment.removalReason ? ` — ${attachment.removalReason}` : ""
                    }`
                  : ""}
                )
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="h6 mt-4">Comments</h3>
      {comments.length === 0 && <p className="text-muted">No comments yet.</p>}
      {comments.length > 0 && (
        <ul className="list-unstyled">
          {comments.map((comment) => (
            <li key={comment.id} className="mb-2 pb-2 border-bottom">
              <div className="d-flex align-items-center gap-2">
                <strong>{comment.authorName}</strong>
                <span className="badge text-bg-secondary">{comment.authorRole}</span>
                <span className="text-muted small">{new Date(comment.createdAt).toLocaleString()}</span>
              </div>
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {commentPostError && (
        <div className="alert alert-danger py-1 px-2 small" role="alert">
          {commentPostError}
        </div>
      )}

      <form className="mt-2" onSubmit={handlePostComment}>
        <label htmlFor="newStaffComment" className="form-label small mb-1">
          Add a comment
        </label>
        <textarea
          id="newStaffComment"
          className="form-control form-control-sm"
          rows={2}
          maxLength={COMMENT_MAX_LENGTH}
          value={commentBody}
          onChange={(event) => setCommentBody(event.target.value)}
          disabled={commentPostState === "posting"}
        />
        {commentFieldError && <div className="text-danger small mt-1">{commentFieldError}</div>}
        <button type="submit" className="btn btn-success btn-sm mt-2" disabled={commentPostState === "posting"}>
          {commentPostState === "posting" ? "Posting…" : "Post comment"}
        </button>
      </form>

      {/* Visually distinct from Public Comments (different tint + border,
          explicit "Internal" label) so no one mistakes it for the public
          thread (ui-spec.md §7). */}
      <div
        className="mt-4 p-3 rounded border border-success"
        style={{ backgroundColor: "var(--zg-pale-green, #eef7ee)" }}
      >
        <h3 className="h6">
          Internal Notes <span className="badge text-bg-success">Internal — IT Staff only</span>
        </h3>
        {notes.length === 0 && <p className="text-muted">No notes yet.</p>}
        {notes.length > 0 && (
          <ul className="list-unstyled">
            {notes.map((note) => (
              <li key={note.id} className="mb-2 pb-2 border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <strong>{note.authorName}</strong>
                  <span className="badge text-bg-secondary">{note.authorRole}</span>
                  <span className="text-muted small">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {note.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        {notePostError && (
          <div className="alert alert-danger py-1 px-2 small" role="alert">
            {notePostError}
          </div>
        )}

        <form className="mt-2" onSubmit={handlePostNote}>
          <label htmlFor="newInternalNote" className="form-label small mb-1">
            Add an internal note
          </label>
          <textarea
            id="newInternalNote"
            className="form-control form-control-sm"
            rows={2}
            maxLength={COMMENT_MAX_LENGTH}
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            disabled={notePostState === "posting"}
          />
          {noteFieldError && <div className="text-danger small mt-1">{noteFieldError}</div>}
          <button type="submit" className="btn btn-success btn-sm mt-2" disabled={notePostState === "posting"}>
            {notePostState === "posting" ? "Posting…" : "Post note"}
          </button>
        </form>
      </div>
    </div>
  );
}
