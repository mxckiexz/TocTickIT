import { FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  AttachmentSummary,
  Category,
  RelatedSystem,
  Requester,
  Ticket,
  fetchTicketAttachments,
  fetchTicketDetail,
  removeAttachment,
  ticketAttachmentUrl,
  uploadAttachment,
} from "./api.js";
import RequesterBanner from "./RequesterBanner.js";

// Mirrors server/src/app.ts's MAX_ACTIVE_ATTACHMENTS_PER_TICKET — a client-
// side hint only (disables the upload control at the limit); the server is
// the real gate and still enforces this with its own 409.
const MAX_ATTACHMENTS_PER_TICKET = 5;

interface TicketDetailProps {
  ticketId: number;
  requester: Requester;
  categories: Category[];
  relatedSystems: RelatedSystem[];
  onBack: () => void;
  onSwitchRequester: () => void;
}

type LoadState = "loading" | "ready" | "error";

export default function TicketDetail({
  ticketId,
  requester,
  categories,
  relatedSystems,
  onBack,
  onSwitchRequester,
}: TicketDetailProps) {
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

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    fetchTicketDetail(ticketId, requester.id)
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
  }, [ticketId, requester.id]);

  // Fetched independently of the ticket's own fields — a network hiccup on
  // one shouldn't have to block the other, and the ownership check runs
  // (redundantly but harmlessly) on both endpoints anyway.
  useEffect(() => {
    let cancelled = false;
    setAttachmentsState("loading");

    fetchTicketAttachments(ticketId, requester.id)
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
  }, [ticketId, requester.id, attachmentsRefreshKey]);

  async function handleUploadSubmit(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile || uploadState === "uploading") return;

    setUploadState("uploading");
    setUploadError("");

    try {
      await uploadAttachment(ticketId, requester.id, uploadFile);
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

  async function handleRemove(attachment: AttachmentSummary) {
    if (removingId !== null) return;
    if (!window.confirm(`Remove "${attachment.originalFilename}"? This cannot be undone.`)) {
      return;
    }

    setRemovingId(attachment.id);
    setRemoveError("");

    try {
      await removeAttachment(ticketId, attachment.id, requester.id);
      setAttachmentsRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Failed to remove attachment:", error);
      setRemoveError(
        error instanceof ApiError ? error.message : "Unable to remove the attachment."
      );
    } finally {
      setRemovingId(null);
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
      <RequesterBanner requester={requester} onSwitchRequester={onSwitchRequester} label="Viewing as" />

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
              {attachments.map((attachment) => (
                <li key={attachment.id} className="mb-1 d-flex align-items-center gap-2">
                  <a
                    href={ticketAttachmentUrl(ticket.id, attachment.id, requester.id)}
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
                    onClick={() => handleRemove(attachment)}
                  >
                    {removingId === attachment.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
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
                Add an attachment ({attachments.length}/{MAX_ATTACHMENTS_PER_TICKET}) — JPG, PNG,
                WEBP, or PDF, up to 5MB
              </label>
              <div className="d-flex gap-2">
                <input
                  key={attachmentsRefreshKey}
                  id="newAttachment"
                  type="file"
                  className="form-control form-control-sm"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  disabled={attachments.length >= MAX_ATTACHMENTS_PER_TICKET}
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                />
                <button
                  type="submit"
                  className="btn btn-success btn-sm"
                  disabled={
                    !uploadFile ||
                    uploadState === "uploading" ||
                    attachments.length >= MAX_ATTACHMENTS_PER_TICKET
                  }
                >
                  {uploadState === "uploading" ? "Uploading…" : "Upload"}
                </button>
              </div>
              {attachments.length >= MAX_ATTACHMENTS_PER_TICKET && (
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
        </div>
      )}
    </div>
  );
}
