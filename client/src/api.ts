const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface Requester {
  id: number;
  name: string;
  email: string;
}

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: number;
  ticketId: number;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export type TicketSortField = "createdAt" | "summary" | "requestedPriority";
export type SortDir = "asc" | "desc";

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketListResponse {
  tickets: Ticket[];
  pagination: Pagination;
}

export interface FetchTicketsParams {
  requesterId: number;
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: Priority;
  currentStatus?: string;
  sortBy?: TicketSortField;
  sortDir?: SortDir;
  page?: number;
  pageSize?: number;
}

export interface CreateTicketInput {
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
}

// Thrown by the ticket-creation calls below. `fieldErrors` is only set for a
// 400 from POST /api/tickets, keyed the same way the form's fields are named
// (see server/src/app.ts), so the UI can show each message next to its field.
export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — call the backend.
// Steps: fetch `${API_URL}/api/health`; if not ok, throw.
//        then fetch `${API_URL}/api/categories`; if not ok, throw.
//        return { online: true, categories }.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  // TODO(Issue 2 & 4): implement the two fetch calls described above.
  const healthResponse = await fetch(`${API_URL}/api/health`);

  if (!healthResponse.ok) {
    throw new Error("Backend unavailable");
  }

  return {
    online: true,
    categories: [],
  };
}

// ---------------------------------------------------------------------------
// Feature 3 — Create ticket form data + submission
// ---------------------------------------------------------------------------
export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch(`${API_URL}/api/categories`);

  if (!response.ok) {
    throw new ApiError("Failed to load categories", response.status);
  }

  return response.json();
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await fetch(`${API_URL}/api/related-systems`);

  if (!response.ok) {
    throw new ApiError("Failed to load related systems", response.status);
  }

  return response.json();
}

export async function fetchRequesters(): Promise<Requester[]> {
  const response = await fetch(`${API_URL}/api/requesters`);

  if (!response.ok) {
    throw new ApiError("Failed to load requesters", response.status);
  }

  return response.json();
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const response = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new ApiError("Ticket submission failed", response.status, body.errors);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Feature 4/5 — My Tickets: list, search, filter, sort, and pagination
// ---------------------------------------------------------------------------
export async function fetchTickets(params: FetchTicketsParams): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  query.set("requesterId", String(params.requesterId));
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("categoryId", String(params.categoryId));
  if (params.relatedSystemId) query.set("relatedSystemId", String(params.relatedSystemId));
  if (params.requestedPriority) query.set("requestedPriority", params.requestedPriority);
  if (params.currentStatus) query.set("currentStatus", params.currentStatus);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));

  const response = await fetch(`${API_URL}/api/tickets?${query.toString()}`);
  const body = await response.json();

  if (!response.ok) {
    throw new ApiError(body.error ?? "Failed to load tickets", response.status);
  }

  return body;
}

export async function uploadAttachment(
  ticketId: number,
  requesterId: number,
  file: File
): Promise<Attachment> {
  const formData = new FormData();
  formData.append("requesterId", String(requesterId));
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    body: formData,
  });

  const body = await response.json();

  if (!response.ok) {
    throw new ApiError(body.error ?? "Attachment upload failed", response.status);
  }

  return body;
}