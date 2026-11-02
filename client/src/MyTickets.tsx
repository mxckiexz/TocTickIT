import { useEffect, useState } from "react";
import {
  Category,
  Pagination,
  Priority,
  RelatedSystem,
  Ticket,
  TicketStatus,
  fetchCategories,
  fetchRelatedSystems,
  fetchTickets,
} from "./api.js";
import { MyTicketFilters, routeHref } from "./routes.js";
import TicketDetail from "./TicketDetail.js";
import { PriorityBadge, STATUS_OPTIONS, StatusBadge } from "./ticketBadges.js";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

type LookupState = "loading" | "ready" | "error";
type ListState = "loading" | "ready" | "error";

const SORT_OPTIONS = [
  { value: "createdAt-desc", label: "Newest first", sortBy: "createdAt", sortDir: "desc" },
  { value: "createdAt-asc", label: "Oldest first", sortBy: "createdAt", sortDir: "asc" },
  // Lab 4 F8: what the Requester dashboard's "recently updated" links ask for.
  { value: "updatedAt-desc", label: "Recently updated", sortBy: "updatedAt", sortDir: "desc" },
  { value: "summary-asc", label: "Summary (A–Z)", sortBy: "summary", sortDir: "asc" },
  { value: "summary-desc", label: "Summary (Z–A)", sortBy: "summary", sortDir: "desc" },
] as const;

// Lab 3: currentStatus is a proper TicketStatus enum (not Lab 2's free text);
// labels, options and badges come from ./ticketBadges.tsx, shared with the
// staff screens.

// Lab 3: identity comes from the logged-in session (FR-08/BR-03) — always
// scoped to the caller's own tickets, no Requester prop needed anymore.
interface MyTicketsProps {
  // Lab 4 F8: what a dashboard link asked for (routes.ts). Absent for the plain My Tickets.
  initialFilters?: MyTicketFilters;
  initialTicketId?: number;
}

export default function MyTickets({ initialFilters = {}, initialTicketId }: MyTicketsProps = {}) {
  const [lookupState, setLookupState] = useState<LookupState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [currentStatus, setCurrentStatus] = useState<string>(initialFilters.currentStatus ?? "");
  const [sortValue, setSortValue] = useState<(typeof SORT_OPTIONS)[number]["value"]>(
    initialFilters.sortBy === "updatedAt" ? "updatedAt-desc" : "createdAt-desc"
  );
  // `open` and `recent` have no control of their own (api-spec.md "Dashboards"): the screen says when they are on and
  // offers Clear.
  const [drill, setDrill] = useState({ open: Boolean(initialFilters.open), recent: Boolean(initialFilters.recent) });
  const [page, setPage] = useState(1);

  const [listState, setListState] = useState<ListState>("loading");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(initialTicketId ?? null);

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
        console.error("Failed to load My Tickets filter options:", error);
        if (!cancelled) setLookupState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the free-text search box so we don't fire a request per
  // keystroke — wait for a short pause in typing first.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any change to search/filter/sort invalidates the current page number —
  // always land back on page 1 rather than showing a now-out-of-range page.
  useEffect(() => {
    setPage(1);
  }, [search, categoryId, relatedSystemId, requestedPriority, currentStatus, drill, sortValue]);

  useEffect(() => {
    if (lookupState !== "ready") return;

    let cancelled = false;
    setListState("loading");

    const sortOption = SORT_OPTIONS.find((option) => option.value === sortValue) ?? SORT_OPTIONS[0];

    fetchTickets({
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      relatedSystemId: relatedSystemId ? Number(relatedSystemId) : undefined,
      requestedPriority: (requestedPriority as Priority) || undefined,
      currentStatus: (currentStatus as TicketStatus) || undefined,
      open: drill.open || undefined,
      recent: drill.recent || undefined,
      sortBy: sortOption.sortBy,
      sortDir: sortOption.sortDir,
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
        console.error("Failed to load tickets:", error);
        if (!cancelled) setListState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    search,
    categoryId,
    relatedSystemId,
    requestedPriority,
    currentStatus,
    drill,
    sortValue,
    page,
    lookupState,
  ]);

  function categoryName(id: number) {
    return categories.find((category) => category.id === id)?.name ?? `#${id}`;
  }

  function relatedSystemName(id: number) {
    return relatedSystems.find((system) => system.id === id)?.name ?? `#${id}`;
  }

  if (lookupState === "loading") {
    return <p className="mt-4">Loading My Tickets…</p>;
  }

  if (lookupState === "error") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        Unable to load My Tickets. Please make sure the backend server is running.
      </div>
    );
  }

  if (selectedTicketId !== null) {
    return (
      <TicketDetail
        ticketId={selectedTicketId}
        categories={categories}
        relatedSystems={relatedSystems}
        onBack={() => {
          setSelectedTicketId(null);
          // A ticket opened from a link has its own address; do not leave it behind (see StaffTicketQueue).
          if (initialTicketId !== undefined) {
            window.history.replaceState(null, "", routeHref({ view: "myTickets", filters: initialFilters }));
          }
        }}
      />
    );
  }

  return (
    <div className="mt-4">
      <h2 className="h5">My Tickets</h2>

      {(drill.open || drill.recent) && (
        <div className="alert alert-info d-flex flex-wrap align-items-center gap-2 py-2" role="status">
          <span>
            Showing:{" "}
            {[drill.open && "Open tickets only", drill.recent && "Updated in the last 7 days"].filter(Boolean).join(" · ")}
          </span>
          <button
            type="button"
            className="btn btn-outline-success btn-sm"
            onClick={() => setDrill({ open: false, recent: false })}
          >
            Clear dashboard filter
          </button>
        </div>
      )}

      <div className="row g-2 mb-3">
        <div className="col-12 col-md-4">
          <input
            type="search"
            className="form-control"
            placeholder="Search summary, description, or ticket number…"
            aria-label="Search tickets"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="col-12 col-sm-6">
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
        <div className="col-12 col-sm-6">
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
        <div className="col-12 col-sm-6">
          <select
            className="form-select"
            aria-label="Filter by priority"
            value={requestedPriority}
            onChange={(event) => setRequestedPriority(event.target.value)}
          >
            <option value="">All priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div className="col-12 col-sm-6">
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
        <div className="col-12 col-sm-6">
          <select
            className="form-select"
            aria-label="Sort by"
            value={sortValue}
            onChange={(event) => setSortValue(event.target.value as typeof sortValue)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {listState === "loading" && <p>Loading tickets…</p>}

      {listState === "error" && (
        <div className="alert alert-danger" role="alert">
          Unable to load tickets. Please try again.
        </div>
      )}

      {listState === "ready" && tickets.length === 0 && (
        <p className="text-muted">No tickets match your search and filters.</p>
      )}

      {listState === "ready" && tickets.length > 0 && (
        <>
          <div className="table-responsive">
            <table className="table table-sm align-middle zg-table-phone-compact">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col" className="d-none d-md-table-cell">Category</th>
                  <th scope="col" className="d-none d-md-table-cell">Related System</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="d-none d-md-table-cell">Created</th>
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
                    <td className="text-break">{ticket.summary}</td>
                    <td className="d-none d-md-table-cell">{categoryName(ticket.categoryId)}</td>
                    <td className="d-none d-md-table-cell">{relatedSystemName(ticket.relatedSystemId)}</td>
                    <td>
                      <PriorityBadge priority={ticket.requestedPriority} />
                    </td>
                    <td>
                      <StatusBadge status={ticket.currentStatus} />
                    </td>
                    <td className="d-none d-md-table-cell">{new Date(ticket.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
