import { useEffect, useState } from "react";
import {
  Category,
  Pagination,
  Priority,
  RelatedSystem,
  Requester,
  Ticket,
  fetchCategories,
  fetchRelatedSystems,
  fetchTickets,
} from "./api.js";
import RequesterBanner from "./RequesterBanner.js";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

interface MyTicketsProps {
  requester: Requester;
  onSwitchRequester: () => void;
}

type LookupState = "loading" | "ready" | "error";
type ListState = "loading" | "ready" | "error";

const SORT_OPTIONS = [
  { value: "createdAt-desc", label: "Newest first", sortBy: "createdAt", sortDir: "desc" },
  { value: "createdAt-asc", label: "Oldest first", sortBy: "createdAt", sortDir: "asc" },
  { value: "summary-asc", label: "Summary (A–Z)", sortBy: "summary", sortDir: "asc" },
  { value: "summary-desc", label: "Summary (Z–A)", sortBy: "summary", sortDir: "desc" },
] as const;

export default function MyTickets({ requester, onSwitchRequester }: MyTicketsProps) {
  const [lookupState, setLookupState] = useState<LookupState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [relatedSystemId, setRelatedSystemId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [sortValue, setSortValue] = useState<(typeof SORT_OPTIONS)[number]["value"]>(
    "createdAt-desc"
  );
  const [page, setPage] = useState(1);

  const [listState, setListState] = useState<ListState>("loading");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

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
  }, [search, categoryId, relatedSystemId, requestedPriority, sortValue]);

  useEffect(() => {
    if (lookupState !== "ready") return;

    let cancelled = false;
    setListState("loading");

    const sortOption = SORT_OPTIONS.find((option) => option.value === sortValue) ?? SORT_OPTIONS[0];

    fetchTickets({
      requesterId: requester.id,
      search: search || undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      relatedSystemId: relatedSystemId ? Number(relatedSystemId) : undefined,
      requestedPriority: (requestedPriority as Priority) || undefined,
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
  }, [requester.id, search, categoryId, relatedSystemId, requestedPriority, sortValue, page, lookupState]);

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

  return (
    <div className="mt-4">
      <RequesterBanner requester={requester} onSwitchRequester={onSwitchRequester} label="Viewing as" />

      <h2 className="h5">My Tickets</h2>

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
        <div className="col-6 col-md-2">
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
        <div className="col-6 col-md-2">
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
        <div className="col-6 col-md-2">
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
        <div className="col-6 col-md-2">
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
            <table className="table table-sm align-middle">
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Related System</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.ticketNumber}</td>
                    <td>{ticket.summary}</td>
                    <td>{categoryName(ticket.categoryId)}</td>
                    <td>{relatedSystemName(ticket.relatedSystemId)}</td>
                    <td>{ticket.requestedPriority}</td>
                    <td>{ticket.currentStatus}</td>
                    <td>{new Date(ticket.createdAt).toLocaleString()}</td>
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
