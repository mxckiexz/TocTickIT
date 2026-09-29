import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  AttachmentSummary,
  Category,
  Comment,
  RelatedSystem,
  Ticket,
  fetchComments,
  fetchTicketAttachments,
  fetchTicketDetail,
  markTicketResolved,
  postComment,
  removeAttachment,
  ticketAttachmentUrl,
  uploadAttachment,
} from "./api.js";

// Mirrors server/src/app.ts's MAX_ACTIVE_ATTACHMENTS_PER_TICKET — a client-
// side hint only (disables the upload control at the limit); the server is
// the real gate and still enforces this with its own 409.
const MAX_ATTACHMENTS_PER_TICKET = 5;
// Mirrors the server's COMMENT_BODY_MAX_LENGTH (BR-26).
const COMMENT_MAX_LENGTH = 2000;
// ui-spec.md §5.2 — the button is hidden once the ticket is in one of these.
const RESOLVE_BLOCKED_STATUSES = ["RESOLVED", "CLOSED", "CANCELLED"];

interface TicketDetailProps {
  ticketId: number;
  categories: Category[];
  relatedSystems: RelatedSystem[];
  onBack: () => void;
}

type LoadState = "loading" | "ready" | "error";
type ResolveUiState = "idle" | "confirming" | "saving";

// Lab 3: identity comes from the logged-in session (FR-08/BR-03) — no
// Requester prop needed anymore. Adds Public Comments and "Problem Appears
// Resolved" below the Attachments section (ui-spec.md §5).
export default function TicketDetail({ ticketId, categories, relatedSystems, onBack }: TicketDetailProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [attachmentsState, setAttachmentsState] = useState<LoadState>("loading");
  const [attachmentsError, setAttachmentsError] = useState("");
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  // Bumped after a successful upload to re-trigger the attachments effect
  // below, so the new file shows up (with correct public-metadata shape
  // and ordering) without duplicating the fetch/response-handling logic.
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading">("idle");
  const [uploadError, setUploadError] = useState("");

  // Tracks which attachment's Remove button is mid-request, so only that
  // one row shows a busy state instead of disabling the whole list.
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState("");
  // The attachment awaiting confirmation in the in-app removal modal (below)
  // — null when the modal is closed. A native window.confirm() doesn't
  // match the app's look, and it has no room for the optional reason field.
  const [pendingRemoval, setPendingRemoval] = useState<AttachmentSummary | null>(null);
  const [removalReasonInput, setRemovalReasonInput] = useState("");

  const [commentsState, setCommentsState] = useState<LoadState>("loading");
  const [commentsError, setCommentsError] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentFieldError, setCommentFieldError] = useState("");
  const [commentPostState, setCommentPostState] = useState<"idle" | "posting">("idle");
  const [commentPostError, setCommentPostError] = useState("");

  const [resolveUiState, setResolveUiState] = useState<ResolveUiState>("idle");
  const [resolveError, setResolveError] = useState("");

  // Only active (non-removed) attachments count toward the 5-attachment
  // limit — a removed one stays in `attachments` (BR-14: still visible as
  // metadata) but shouldn't block adding a new file.
  const activeAttachments = attachments.filter((attachment) => !attachment.removedAt);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    fetchTicketDetail(ticketId)
      .then((result) => {
        if (cancelled) return;
        setTicket(result);
        setLoadState("ready");
      })
      .catch((error) => {
        console.error("Failed to load ticket detail:", error);
        if (cancelled) return;
        setErrorMessage(
          error instanceof ApiError ? error.message : "Unable to load this ticket."
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // Fetched independently of the ticket's own fields — a network hiccup on
  // one shouldn't have to block the other, and the ownership check runs
  // (redundantly but harmlessly) on both endpoints anyway.
  useEffect(() => {
    let cancelled = false;
    setAttachmentsState("loading");

    fetchTicketAttachments(ticketId)
      .then((result) => {
        if (cancelled) return;
        setAttachments(result);
        setAttachmentsState("ready");
      })
      .catch((error) => {
        console.error("Failed to load ticket attachments:", error);
        if (cancelled) return;
        setAttachmentsError(
          error instanceof ApiError ? error.message : "Unable to load attachments."
        );
        setAttachmentsState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId, attachmentsRefreshKey]);

  // Also fetched independently, same reasoning as attachments above.
  useEffect(() => {
    let cancelled = false;
    setCommentsState("loading");

    fetchComments(ticketId)
      .then((result) => {
        if (cancelled) return;
        setComments(result);
        setCommentsState("ready");
      })
      .catch((error) => {
        console.error("Failed to load comments:", error);
        if (cancelled) return;
        setCommentsError(error instanceof ApiError ? error.message : "Unable to load comments.");
        setCommentsState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function handleUploadSubmit(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile || uploadState === "uploading") return;

    setUploadState("uploading");
    setUploadError("");

    try {
      await uploadAttachment(ticketId, uploadFile);
      setUploadFile(null);
      setAttachmentsRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Failed to upload attachment:", error);
      setUploadError(
        error instanceof ApiError ? error.message : "Unable to upload the attachment."
      );
    } finally {
      setUploadState("idle");
    }
  }

  function openRemoveModal(attachment: AttachmentSummary) {
    if (removingId !== null) return;
    setRemoveError("");
    setRemovalReasonInput("");
    setPendingRemoval(attachment);
  }

  function cancelRemoveModal() {
    setPendingRemoval(null);
    setRemovalReasonInput("");
  }

  async function confirmRemoveModal() {
    if (!pendingRemoval) return;
    const attachment = pendingRemoval;
    const reason = removalReasonInput.trim();

    setPendingRemoval(null);
    setRemovingId(attachment.id);
    setRemoveError("");

    try {
      await removeAttachment(ticketId, attachment.id, reason || undefined);
      setAttachmentsRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Failed to remove attachment:", error);
      setRemoveError(
        error instanceof ApiError ? error.message : "Unable to remove the attachment."
      );
    } finally {
      setRemovingId(null);
      setRemovalReasonInput("");
    }
  }

  async function handlePostComment(event: FormEvent) {
    event.preventDefault();
    if (commentPostState === "posting") return;

    const trimmed = commentBody.trim();
    setCommentFieldError("");
    setCommentPostError("");

    // BR-25/BR-26, mirrored client-side; the server re-checks independently.
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
      setCommentPostError(
        error instanceof ApiError ? error.message : "Unable to post your comment."
      );
    } finally {
      setCommentPostState("idle");
    }
  }

  async function handleConfirmResolve() {
    setResolveUiState("saving");
    setResolveError("");

    try {
      const updated = await markTicketResolved(ticketId);
      setTicket(updated);
      setResolveUiState("idle");
    } catch (error) {
      console.error("Failed to mark ticket resolved:", error);
      setResolveError(
        error instanceof ApiError ? error.message : "Unable to mark this ticket resolved."
      );
      setResolveUiState("idle");
    }
  }

  function categoryName(id: number) {
    return categories.find((category) => category.id === id)?.name ?? `#${id}`;
  }

  function relatedSystemName(id: number) {
    return relatedSystems.find((system) => system.id === id)?.name ?? `#${id}`;
  }

  function formatSize(sizeBytes: number) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return (
    <div className="mt-4">
      <button type="button" className="btn btn-link btn-sm p-0 mb-3" onClick={onBack}>
        ← Back to My Tickets
      </button>

      {loadState === "loading" && <p>Loading ticket…</p>}

      {loadState === "error" && (
        <div className="alert alert-danger" role="alert">
          {errorMessage}
        </div>
      )}

      {loadState === "ready" && ticket && (
        <div>
          <h2 className="h5">{ticket.ticketNumber}</h2>

          <dl className="row">
            <dt className="col-sm-3">Summary</dt>
            <dd className="col-sm-9">{ticket.summary}</dd>

            <dt className="col-sm-3">Description</dt>
            <dd className="col-sm-9" style={{ whiteSpace: "pre-wrap" }}>
              {ticket.description}
            </dd>

            <dt className="col-sm-3">Category</dt>
            <dd className="col-sm-9">{categoryName(ticket.categoryId)}</dd>

            <dt className="col-sm-3">Related System</dt>
            <dd className="col-sm-9">{relatedSystemName(ticket.relatedSystemId)}</dd>

            <dt className="col-sm-3">Requested Priority</dt>
            <dd className="col-sm-9">{ticket.requestedPriority}</dd>

            <dt className="col-sm-3">Status</dt>
            <dd className="col-sm-9">{ticket.currentStatus}</dd>

            <dt className="col-sm-3">Created</dt>
            <dd className="col-sm-9">{new Date(ticket.createdAt).toLocaleString()}</dd>

            <dt className="col-sm-3">Last Updated</dt>
            <dd className="col-sm-9">{new Date(ticket.updatedAt).toLocaleString()}</dd>
          </dl>

          <h3 className="h6">Attachments</h3>

          {attachmentsState === "loading" && <p>Loading attachments…</p>}

          {attachmentsState === "error" && (
            <div className="alert alert-danger" role="alert">
              {attachmentsError}
            </div>
          )}

          {attachmentsState === "ready" && attachments.length === 0 && (
            <p className="text-muted">No attachments on this ticket.</p>
          )}

          {attachmentsState === "ready" && attachments.length > 0 && (
            <ul className="list-unstyled">
              {attachments.map((attachment) =>
                attachment.removedAt ? (
                  <li key={attachment.id} className="mb-1 text-muted">
                    <span style={{ textDecoration: "line-through" }}>
                      {attachment.originalFilename}
                    </span>{" "}
                    <span className="small">
                      ({formatSize(attachment.sizeBytes)}, removed{" "}
                      {new Date(attachment.removedAt).toLocaleString()}
                      {attachment.removalReason ? ` — ${attachment.removalReason}` : ""})
                    </span>
                  </li>
                ) : (
                  <li key={attachment.id} className="mb-1 d-flex align-items-center gap-2">
                    <a
                      href={ticketAttachmentUrl(ticket.id, attachment.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.originalFilename}
                    </a>{" "}
                    <span className="text-muted small">
                      ({formatSize(attachment.sizeBytes)}, uploaded{" "}
                      {new Date(attachment.createdAt).toLocaleString()})
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-sm text-danger p-0"
                      disabled={removingId !== null}
                      onClick={() => openRemoveModal(attachment)}
                    >
                      {removingId === attachment.id ? "Removing…" : "Remove"}
                    </button>
                  </li>
                )
              )}
            </ul>
          )}

          {removeError && (
            <div className="alert alert-danger py-1 px-2 small" role="alert">
              {removeError}
            </div>
          )}

          {attachmentsState === "ready" && (
            <form className="mt-2" onSubmit={handleUploadSubmit}>
              <label htmlFor="newAttachment" className="form-label small mb-1">
                Add an attachment ({activeAttachments.length}/{MAX_ATTACHMENTS_PER_TICKET}) — JPG,
                PNG, WEBP, or PDF, up to 5MB
              </label>
              <div className="d-flex gap-2">
                <input
                  key={attachmentsRefreshKey}
                  id="newAttachment"
                  type="file"
                  className="form-control form-control-sm"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  disabled={activeAttachments.length >= MAX_ATTACHMENTS_PER_TICKET}
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                />
                <button
                  type="submit"
                  className="btn btn-success btn-sm"
                  disabled={
                    !uploadFile ||
                    uploadState === "uploading" ||
                    activeAttachments.length >= MAX_ATTACHMENTS_PER_TICKET
                  }
                >
                  {uploadState === "uploading" ? "Uploading…" : "Upload"}
                </button>
              </div>
              {activeAttachments.length >= MAX_ATTACHMENTS_PER_TICKET && (
                <p className="text-muted small mt-1 mb-0">
                  This ticket already has the maximum of {MAX_ATTACHMENTS_PER_TICKET} attachments.
                </p>
              )}
              {uploadError && (
                <div className="alert alert-danger mt-2 py-1 px-2 small" role="alert">
                  {uploadError}
                </div>
              )}
            </form>
          )}

          <h3 className="h6 mt-4">Comments</h3>

          {commentsState === "loading" && <p>Loading comments…</p>}

          {commentsState === "error" && (
            <div className="alert alert-danger" role="alert">
              {commentsError}
            </div>
          )}

          {commentsState === "ready" && comments.length === 0 && (
            <p className="text-muted">No comments yet.</p>
          )}

          {commentsState === "ready" && comments.length > 0 && (
            <ul className="list-unstyled">
              {comments.map((comment) => (
                <li key={comment.id} className="mb-2 pb-2 border-bottom">
                  <div className="d-flex align-items-center gap-2">
                    <strong>{comment.authorName}</strong>
                    <span className="badge text-bg-secondary">{comment.authorRole}</span>
                    <span className="text-muted small">
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
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

          {commentsState === "ready" && (
            <form className="mt-2" onSubmit={handlePostComment}>
              <label htmlFor="newComment" className="form-label small mb-1">
                Add a comment
              </label>
              <textarea
                id="newComment"
                className="form-control form-control-sm"
                rows={2}
                maxLength={COMMENT_MAX_LENGTH}
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                disabled={commentPostState === "posting"}
              />
              {commentFieldError && (
                <div className="text-danger small mt-1">{commentFieldError}</div>
              )}
              <button
                type="submit"
                className="btn btn-success btn-sm mt-2"
                disabled={commentPostState === "posting"}
              >
                {commentPostState === "posting" ? "Posting…" : "Post comment"}
              </button>
            </form>
          )}

          {!RESOLVE_BLOCKED_STATUSES.includes(ticket.currentStatus) && (
            <div className="mt-4">
              <h3 className="h6">Problem Appears Resolved</h3>

              {ticket.requesterMarkedResolvedAt ? (
                <p className="text-success small mb-0">
                  You marked this as resolved on{" "}
                  {new Date(ticket.requesterMarkedResolvedAt).toLocaleString()}.
                </p>
              ) : resolveUiState === "confirming" ? (
                <div>
                  <p className="mb-2 small">
                    Mark this problem as resolved? This is a signal to IT Staff, not a status
                    change — the ticket stays open until IT Staff closes it.
                  </p>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-success btn-sm"
                      onClick={() => setResolveUiState("idle")}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={handleConfirmResolve}
                    >
                      Yes, mark resolved
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline-success btn-sm"
                  onClick={() => setResolveUiState("confirming")}
                  disabled={resolveUiState === "saving"}
                >
                  {resolveUiState === "saving" ? "Saving…" : "Problem Appears Resolved"}
                </button>
              )}

              {resolveError && (
                <div className="alert alert-danger py-1 px-2 small mt-2" role="alert">
                  {resolveError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {pendingRemoval && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)", zIndex: 1050 }}
          onClick={cancelRemoveModal}
        >
          <div
            className="bg-body rounded shadow p-3 border border-success"
            style={{ maxWidth: 420, width: "90%" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="h6">Remove attachment?</h3>
            <p className="mb-2">
              Remove "<strong>{pendingRemoval.originalFilename}</strong>"? This cannot be undone.
            </p>
            <label htmlFor="removalReason" className="form-label small mb-1">
              Reason (optional)
            </label>
            <textarea
              id="removalReason"
              className="form-control form-control-sm mb-3"
              rows={2}
              maxLength={500}
              value={removalReasonInput}
              onChange={(event) => setRemovalReasonInput(event.target.value)}
            />
            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-outline-success btn-sm"
                onClick={cancelRemoveModal}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-success btn-sm" onClick={confirmRemoveModal}>
                Remove attachment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
