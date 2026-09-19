import { useEffect, useState, FormEvent } from "react";
import { Requester, fetchRequesters } from "./api.js";

type LoadState = "loading" | "ready" | "error";

interface DevRequesterPickerProps {
  onSelect: (requester: Requester) => void;
}

// Lab 2 stands in for real authentication (arrives in Lab 3): before creating
// any ticket, the user must first pick which active Requester they are acting
// as. That choice then stays active across ticket creations until the user
// explicitly switches (see App.tsx), rather than being re-picked per ticket.
export default function DevRequesterPicker({ onSelect }: DevRequesterPickerProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchRequesters()
      .then((list) => {
        if (cancelled) return;
        setRequesters(list);
        setLoadState("ready");
      })
      .catch((error) => {
        console.error("Failed to load requesters:", error);
        if (!cancelled) setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const requester = requesters.find((r) => String(r.id) === selectedId);
    if (requester) onSelect(requester);
  }

  if (loadState === "loading") {
    return <p className="mt-4">Loading requesters…</p>;
  }

  if (loadState === "error") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        Unable to load requesters. Please make sure the backend server is running.
      </div>
    );
  }

  return (
    <form className="mt-4" onSubmit={handleSubmit}>
      <h2 className="h5">Select Development Requester</h2>
      <p className="text-muted small">
        Choose which Requester you're acting as. This stays active while you create
        tickets, until you switch.
      </p>

      <div className="mb-3">
        <label htmlFor="devRequesterId" className="form-label">
          Requester
        </label>
        <select
          id="devRequesterId"
          className="form-select"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Select a requester…</option>
          {requesters.map((requester) => (
            <option key={requester.id} value={requester.id}>
              {requester.name} ({requester.email})
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn-success" disabled={!selectedId}>
        Continue as this Requester
      </button>
    </form>
  );
}
