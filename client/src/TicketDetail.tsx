import { useEffect, useState } from "react";
import { ApiError, Category, RelatedSystem, Requester, Ticket, fetchTicketDetail } from "./api.js";
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

  function categoryName(id: number) {
    return categories.find((category) => category.id === id)?.name ?? `#${id}`;
  }

  function relatedSystemName(id: number) {
    return relatedSystems.find((system) => system.id === id)?.name ?? `#${id}`;
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
        </div>
      )}
    </div>
  );
}
