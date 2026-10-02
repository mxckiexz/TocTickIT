import { useEffect, useState } from "react";
import {
  ApiError,
  Category,
  Priority,
  RelatedSystem,
  StaffTicketSortField,
  StaffTicketSummary,
  TicketStatus,
  fetchCategories,
  fetchRelatedSystems,
  fetchStaffTickets,
} from "./api.js";
import StaffTicketDetail from "./StaffTicketDetail.js";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type LookupState = "loading" | "ready" | "error";
type ListState = "loading" | "ready" | "error" | "forbidden";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_FOR_REQUESTER", label: "Waiting for Requester" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "REOPENED", label: "Reopened" },
  { value: "CANCELLED", label: "Cancelled" },
];

// Only these four are sortable server-side (docs/lab-03/api-spec.md
// "GET /api/staff/tickets") — the rest of the table's columns are display
// only, same as Lab 2's My Tickets.
const SORT_COLUMNS: { field: StaffTicketSortField; label: string }[] = [
  { field: "createdAt", label: "Created" },
  { field: "itPriority", label: "IT Priority" },
  { field: "currentStatus", label: "Status" },
  { field: "updatedAt", label: "Last Updated" },
];

function priorityBadgeClass(priority: Priority) {
  switch (priority) {
    case "HIGH":
      return "badge text-bg-danger";
    case "MEDIUM":
      return "badge text-bg-warning";
    case "LOW":
    default:
      return "badge text-bg-secondary";
  }
}

function statusBadgeClass(status: TicketStatus) {
  switch (status) {
    case "RESOLVED":
    case "CLOSED":
      return "badge text-bg-success";
    case "CANCELLED":
      return "badge text-bg-secondary";
    case "REOPENED":
    case "WAITING_FOR_REQUESTER":
      return "badge text-bg-warning";
    case "IN_PROGRESS":
      return "badge text-bg-info";
    case "OPEN":
    case "NEW":
    default:
      return "badge text-bg-secondary";
  }
}

function statusLabel(status: TicketStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function sortIndicator(active: boolean, sortDir: "asc" | "desc") {
  if (!active) return "";
  return sortDir === "asc" ? " ▲" : " ▼";
}

// Lab 3 (Issue #37) — the IT Staff Ticket Queue (ui-spec.md §6). Owner
// filtering here is limited to "All owners" / "Unassigned only": a full
// per-staff-member picker needs GET /api/staff/assignable-users, which is
// Feature 5's (IT Staff Ticket Detail & Workflow) job, not this screen's.
export default function StaffTicketQueue() {
  const [lookupState, setLookupState] = useState<LookupState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [itPriority, setItPriority] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"" | "unassigned">("");
  const [sortBy, setSortBy] = useState<StaffTicketSortField>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [listState, setListState] = useState<ListState>("loading");
  const [tickets, setTickets] = useState<StaffTicketSummary[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  } | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const filtersActive = Boolean(
    search || categoryId || relatedSystemId || itPriority || currentStatus || ownerFilter
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([categoryList, relatedSystemList]) => {
        if (cancelled) return;
        setCategories(categoryList);
        setRelatedSystems(relatedSystemList);
        setLookupState("ready");
      })
      .catch((error) => {
        console.error("Failed to load Ticket Queue filter options:", error);
        if (!cancelled) setLookupState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryId, relatedSystemId, itPriority, currentStatus, ownerFilter, sortBy, sortDir]);

  useEffect(() => {
    if (lookupState !== "ready") return;

    let cancelled = false;
    setListState("loading");

    fetchStaffTickets({
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      relatedSystemId: relatedSystemId ? Number(relatedSystemId) : undefined,
      itPriority: (itPriority as Priority) || undefined,
      currentStatus: (currentStatus as TicketStatus) || undefined,
      ownerId: ownerFilter === "unassigned" ? 0 : undefined,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (cancelled) return;
        setTickets(result.tickets);
        setPagination(result.pagination);
        setListState("ready");
      })
      .catch((error) => {
        console.error("Failed to load the ticket queue:", error);
        if (cancelled) return;
        setListState(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [search, categoryId, relatedSystemId, itPriority, currentStatus, ownerFilter, sortBy, sortDir, page, lookupState]);

  function categoryName(id: number) {
    return categories.find((category) => category.id === id)?.name ?? `#${id}`;
  }

  function relatedSystemName(id: number) {
    return relatedSystems.find((system) => system.id === id)?.name ?? `#${id}`;
  }

  function toggleSort(field: StaffTicketSortField) {
    if (sortBy === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  if (lookupState === "loading") {
    return <p className="mt-4">Loading Ticket Queue…</p>;
  }

  if (lookupState === "error") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        Unable to load the ticket queue. Please make sure the backend server is running.
      </div>
    );
  }

  if (selectedTicketId !== null) {
    return <StaffTicketDetail ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />;
  }

  if (listState === "forbidden") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        You do not have permission to view this page.
      </div>
    );
  }

  // Search stays visible regardless of the mobile Filters disclosure
  // (ui-spec.md §6: "Filters collapse into a single 'Filters' disclosure
  // button above the search box" — the button sits above search, and search
  // itself is never part of what collapses).
  const searchInputEl = (
    <input
      type="search"
      className="form-control"
      placeholder="Search summary, description, or ticket number…"
      aria-label="Search tickets"
      value={searchInput}
      onChange={(event) => setSearchInput(event.target.value)}
    />
  );

  const filterControls = (
    <div className="row g-2 mb-3">
      <div className="col-6 col-lg-2">
        <select
          className="form-select"
          aria-label="Filter by category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-6 col-lg-2">
        <select
          className="form-select"
          aria-label="Filter by related system"
          value={relatedSystemId}
          onChange={(event) => setRelatedSystemId(event.target.value)}
        >
          <option value="">All related systems</option>
          {relatedSystems.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-6 col-lg-2">
        <select
          className="form-select"
          aria-label="Filter by IT priority"
          value={itPriority}
          onChange={(event) => setItPriority(event.target.value)}
        >
          <option value="">All priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </div>
      <div className="col-6 col-lg-2">
        <select
          className="form-select"
          aria-label="Filter by status"
          value={currentStatus}
          onChange={(event) => setCurrentStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="col-6 col-lg-2">
        <select
          className="form-select"
          aria-label="Filter by owner"
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value as "" | "unassigned")}
        >
          <option value="">All owners</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="mt-4">
      <h2 className="h5">Ticket Queue</h2>

      {/* Mobile: Filters disclosure button, then the always-visible search
          box, then the rest of the filter controls only when open. */}
      <div className="d-md-none mb-2">
        <button
          type="button"
          className="btn btn-outline-success btn-sm"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          Filters {filtersOpen ? "▲" : "▼"}
        </button>
      </div>
      <div className="d-md-none mb-2">{searchInputEl}</div>
      {filtersOpen && <div className="d-md-none">{filterControls}</div>}

      {/* Desktop/tablet: search and filters shown together, no disclosure. */}
      <div className="d-none d-md-block">
        <div className="row g-2 mb-3">
          {/* Stacked, not side by side: with the search box beside five
              filters each dropdown got ~100px and its "All categories" /
              "All related systems" labels were clipped (seen in the Feature 7
              desktop screenshot). */}
          <div className="col-12">{searchInputEl}</div>
          <div className="col-12">{filterControls}</div>
        </div>
      </div>

      {listState === "loading" && <p>Loading tickets…</p>}

      {listState === "error" && (
        <div className="alert alert-danger" role="alert">
          Unable to load the ticket queue.
        </div>
      )}

      {listState === "ready" && tickets.length === 0 && (
        <p className="text-muted">
          {filtersActive ? "No tickets match your search and filters." : "No tickets yet."}
        </p>
      )}

      {listState === "ready" && tickets.length > 0 && (
        <>
          {/* Desktop/tablet: a table, with Category and Last Updated dropped
              below the lg breakpoint (ui-spec.md §6's tablet layout). */}
          <div className="table-responsive d-none d-md-block">
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th scope="col">Ticket No.</th>
                  <th
                    scope="col"
                    role="button"
                    onClick={() => toggleSort("createdAt")}
                    style={{ cursor: "pointer" }}
                  >
                    Created{sortIndicator(sortBy === "createdAt", sortDir)}
                  </th>
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-lg-table-cell">
                    Category
                  </th>
                  <th scope="col">Requested Priority</th>
                  <th
                    scope="col"
                    role="button"
                    onClick={() => toggleSort("itPriority")}
                    style={{ cursor: "pointer" }}
                  >
                    IT Priority{sortIndicator(sortBy === "itPriority", sortDir)}
                  </th>
                  <th
                    scope="col"
                    role="button"
                    onClick={() => toggleSort("currentStatus")}
                    style={{ cursor: "pointer" }}
                  >
                    Status{sortIndicator(sortBy === "currentStatus", sortDir)}
                  </th>
                  <th scope="col">Owner</th>
                  <th
                    scope="col"
                    role="button"
                    className="d-none d-lg-table-cell"
                    onClick={() => toggleSort("updatedAt")}
                    style={{ cursor: "pointer" }}
                  >
                    Last Updated{sortIndicator(sortBy === "updatedAt", sortDir)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 align-baseline"
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        {ticket.ticketNumber}
                      </button>
                    </td>
                    <td>{new Date(ticket.createdAt).toLocaleString()}</td>
                    <td>{ticket.summary}</td>
                    <td className="d-none d-lg-table-cell">{categoryName(ticket.categoryId)}</td>
                    <td>
                      <span className={priorityBadgeClass(ticket.requestedPriority)}>
                        {ticket.requestedPriority}
                      </span>
                    </td>
                    <td>
                      <span className={priorityBadgeClass(ticket.itPriority)}>{ticket.itPriority}</span>
                    </td>
                    <td>
                      <span className={statusBadgeClass(ticket.currentStatus)}>
                        {statusLabel(ticket.currentStatus)}
                      </span>
                    </td>
                    <td>{ticket.ownerName ?? "Unassigned"}</td>
                    <td className="d-none d-lg-table-cell">
                      {new Date(ticket.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards (ui-spec.md §6's mobile layout). */}
          <div className="d-md-none">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="border rounded p-2 mb-2"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTicketId(ticket.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedTicketId(ticket.id);
                  }
                }}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <strong>{ticket.ticketNumber}</strong>
                  <span className={statusBadgeClass(ticket.currentStatus)}>
                    {statusLabel(ticket.currentStatus)}
                  </span>
                </div>
                <div>{ticket.summary}</div>
                <div className="d-flex gap-2 mt-1">
                  <span className={priorityBadgeClass(ticket.requestedPriority)}>
                    Requested: {ticket.requestedPriority}
                  </span>
                  <span className={priorityBadgeClass(ticket.itPriority)}>
                    IT: {ticket.itPriority}
                  </span>
                </div>
                <div className="text-muted small mt-1">
                  {ticket.ownerName ?? "Unassigned"} · Updated{" "}
                  {new Date(ticket.updatedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {pagination && (
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted small">
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} tickets)
              </span>
              <div className="btn-group btn-group-sm">
                <button
                  type="button"
                  className="btn btn-outline-success"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn btn-outline-success"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
