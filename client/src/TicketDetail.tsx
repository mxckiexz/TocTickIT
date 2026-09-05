import { useEffect, useState } from "react";
import {
  ApiError,
  Attachment,
  Category,
  RelatedSystem,
  Requester,
  Ticket,
  fetchTicketAttachments,
  fetchTicketDetail,
  ticketAttachmentUrl,
} from "./api.js";
import RequesterBanner from "./RequesterBanner.js";

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);

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
  }, [ticketId, requester.id]);

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
                <li key={attachment.id} className="mb-1">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
