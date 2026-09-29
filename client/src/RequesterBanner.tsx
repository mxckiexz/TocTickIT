import { Requester } from "./api.js";

interface RequesterBannerProps {
  requester: Requester;
  onSwitchRequester: () => void;
  label?: string;
}

// Shared between CreateTicketForm and MyTickets — both are gated behind the
// same active Development Requester (AC-05) and need the same "who am I
// acting as, and how do I change that" affordance.
export default function RequesterBanner({
  requester,
  onSwitchRequester,
  label = "Creating as",
}: RequesterBannerProps) {
  return (
    <p className="text-muted small mb-3">
      {label} <strong>{requester.name}</strong> ({requester.email}){" "}
      <button
        type="button"
        className="btn btn-link btn-sm p-0 align-baseline"
        onClick={onSwitchRequester}
      >
        Switch requester
      </button>
    </p>
  );
}
