import { useEffect, useState, FormEvent } from "react";
import {
  ApiError,
  Category,
  Priority,
  RelatedSystem,
  Requester,
  Ticket,
  createTicket,
  fetchCategories,
  fetchRelatedSystems,
  fetchRequesters,
  uploadAttachment,
} from "./api.js";

const SUMMARY_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 2000;

type LookupState = "loading" | "ready" | "error";
type SubmitState = "idle" | "submitting";

export default function CreateTicketForm() {
  const [lookupState, setLookupState] = useState<LookupState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [requesters, setRequesters] = useState<Requester[]>([]);

  const [requesterId, setRequesterId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [requestedPriority, setRequestedPriority] = useState<Priority>("MEDIUM");
  const [file, setFile] = useState<File | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");
  const [attachmentWarning, setAttachmentWarning] = useState("");
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLookups() {
      try {
        const [categoryList, relatedSystemList, requesterList] = await Promise.all([
          fetchCategories(),
          fetchRelatedSystems(),
          fetchRequesters(),
        ]);

        if (cancelled) return;

        setCategories(categoryList);
        setRelatedSystems(relatedSystemList);
        setRequesters(requesterList);
        setLookupState("ready");
      } catch (error) {
        console.error("Failed to load ticket form data:", error);
        if (!cancelled) setLookupState("error");
      }
    }

    loadLookups();

    return () => {
      cancelled = true;
    };
  }, []);

  function resetForNewTicket() {
    setCreatedTicket(null);
    setRequesterId("");
    setCategoryId("");
    setRelatedSystemId("");
    setSummary("");
    setDescription("");
    setRequestedPriority("MEDIUM");
    setFile(null);
    setFieldErrors({});
    setSubmitError("");
    setAttachmentWarning("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Belt-and-braces guard alongside the backend's BR-02 duplicate-submission
    // window: a disabled button already prevents this, but ignore a stray
    // re-entrant submit too.
    if (submitState === "submitting") return;

    setFieldErrors({});
    setSubmitError("");
    setAttachmentWarning("");
    setSubmitState("submitting");

    try {
      const ticket = await createTicket({
        requesterId: Number(requesterId),
        categoryId: Number(categoryId),
        relatedSystemId: Number(relatedSystemId),
        summary,
        description,
        requestedPriority,
      });

      if (file) {
        try {
          await uploadAttachment(ticket.id, file);
        } catch (attachmentError) {
          console.error("Attachment upload failed:", attachmentError);
          setAttachmentWarning(
            attachmentError instanceof ApiError
              ? `Ticket created, but the attachment failed to upload: ${attachmentError.message}`
              : "Ticket created, but the attachment failed to upload."
          );
        }
      }

      setCreatedTicket(ticket);
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
      } else {
        setSubmitError("Unable to submit the ticket. Please try again.");
      }
    } finally {
      setSubmitState("idle");
    }
  }

  if (lookupState === "loading") {
    return <p className="mt-4">Loading ticket form…</p>;
  }

  if (lookupState === "error") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        Unable to load the ticket form. Please make sure the backend server is running.
      </div>
    );
  }

  if (createdTicket) {
    return (
      <div className="alert alert-success mt-4" role="status">
        <p className="mb-1">Ticket created successfully.</p>
        <p className="mb-3">
          Your Ticket Number: <strong>{createdTicket.ticketNumber}</strong>
        </p>
        {attachmentWarning && <p className="text-danger mb-3">{attachmentWarning}</p>}
        <button
          type="button"
          className="btn btn-outline-success btn-sm"
          onClick={resetForNewTicket}
        >
          Create another ticket
        </button>
      </div>
    );
  }

  return (
    <form className="mt-4" onSubmit={handleSubmit} noValidate>
      <h2 className="h5">Create a New Ticket</h2>

      <div className="mb-3">
        <label htmlFor="requesterId" className="form-label">
          Requester
        </label>
        <select
          id="requesterId"
          className="form-select"
          value={requesterId}
          onChange={(event) => setRequesterId(event.target.value)}
        >
          <option value="">Select a requester…</option>
          {requesters.map((requester) => (
            <option key={requester.id} value={requester.id}>
              {requester.name} ({requester.email})
            </option>
          ))}
        </select>
        {fieldErrors.requesterId && (
          <div className="text-danger small mt-1">{fieldErrors.requesterId}</div>
        )}
      </div>

      <div className="mb-3">
        <label htmlFor="categoryId" className="form-label">
          Category
        </label>
        <select
          id="categoryId"
          className="form-select"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Select a category…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {fieldErrors.categoryId && (
          <div className="text-danger small mt-1">{fieldErrors.categoryId}</div>
        )}
      </div>

      <div className="mb-3">
        <label htmlFor="relatedSystemId" className="form-label">
          Related System
        </label>
        <select
          id="relatedSystemId"
          className="form-select"
          value={relatedSystemId}
          onChange={(event) => setRelatedSystemId(event.target.value)}
        >
          <option value="">Select a related system…</option>
          {relatedSystems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
        {fieldErrors.relatedSystemId && (
          <div className="text-danger small mt-1">{fieldErrors.relatedSystemId}</div>
        )}
      </div>

      <div className="mb-3">
        <label htmlFor="summary" className="form-label">
          Summary{" "}
          <span className="text-muted small">
            ({summary.length}/{SUMMARY_MAX_LENGTH})
          </span>
        </label>
        <input
          id="summary"
          type="text"
          className="form-control"
          maxLength={SUMMARY_MAX_LENGTH}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        {fieldErrors.summary && <div className="text-danger small mt-1">{fieldErrors.summary}</div>}
      </div>

      <div className="mb-3">
        <label htmlFor="description" className="form-label">
          Description{" "}
          <span className="text-muted small">
            ({description.length}/{DESCRIPTION_MAX_LENGTH})
          </span>
        </label>
        <textarea
          id="description"
          className="form-control"
          rows={4}
          maxLength={DESCRIPTION_MAX_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        {fieldErrors.description && (
          <div className="text-danger small mt-1">{fieldErrors.description}</div>
        )}
      </div>

      <div className="mb-3">
        <label htmlFor="requestedPriority" className="form-label">
          Requested Priority
        </label>
        <select
          id="requestedPriority"
          className="form-select"
          value={requestedPriority}
          onChange={(event) => setRequestedPriority(event.target.value as Priority)}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        {fieldErrors.requestedPriority && (
          <div className="text-danger small mt-1">{fieldErrors.requestedPriority}</div>
        )}
      </div>

      <div className="mb-3">
        <label htmlFor="attachment" className="form-label">
          Supporting attachment (optional — JPG, PNG, WEBP, or PDF, up to 5MB)
        </label>
        <input
          id="attachment"
          type="file"
          className="form-control"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>

      {submitError && (
        <div className="alert alert-danger" role="alert">
          {submitError}
        </div>
      )}

      <button type="submit" className="btn btn-success" disabled={submitState === "submitting"}>
        {submitState === "submitting" ? "Submitting…" : "Submit Ticket"}
      </button>
    </form>
  );
}
