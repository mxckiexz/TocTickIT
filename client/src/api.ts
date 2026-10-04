const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export type Priority = "LOW" | "MEDIUM" | "HIGH";

export type TicketStatus =
  | "NEW"
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_REQUESTER"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED"
  | "CANCELLED";

// ---------------------------------------------------------------------------
// Lab 3 — Authentication (api-spec.md "POST /api/auth/login" etc.)
// ---------------------------------------------------------------------------
export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

// Thrown by every call below. `fieldErrors` is only set for a 400 that
// returned an `errors` object (keyed the same way each form's fields are
// named — see server/src/app.ts), so the UI can show each message next to
// its field.
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

// Every request carries the session cookie (FR-08/BR-03: identity comes
// from the session, never a client-supplied id) — credentials: "include" is
// required for the browser to send it cross-port in local dev, same as
// api-spec.md's CORS note.
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

async function parseJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new ApiError(body.error ?? fallbackMessage, response.status, body.errors);
  }
  return body;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return parseJsonOrThrow<AuthUser>(response, "Login failed");
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

// Returns null for a 401 (no/expired session) instead of throwing — the app
// shell treats "not logged in" as a normal state to check on mount, not an
// error (ui-spec.md §3).
export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await apiFetch("/api/auth/me");
  if (response.status === 401) return null;
  return parseJsonOrThrow<AuthUser>(response, "Failed to load current user");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<AuthUser> {
  const response = await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
  return parseJsonOrThrow<AuthUser>(response, "Password change failed");
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  ownerId: number | null;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: TicketStatus;
  requesterMarkedResolvedAt: string | null;
  requesterMarkedResolvedById: number | null;
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
  removedAt: string | null;
  removalReason: string | null;
}

// What GET /api/tickets/:id/attachments actually returns — public metadata
// only, no storedFilename (that's an internal, server-side detail).
export type AttachmentSummary = Omit<Attachment, "storedFilename">;

// Public Comments (api-spec.md "GET /api/tickets/:id/comments" etc.) —
// Internal Notes share this exact shape server-side but have no client UI
// yet (that's IT Staff Ticket Management, a later feature).
export interface Comment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorRole: Role;
  body: string;
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
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: Priority;
  currentStatus?: TicketStatus;
  sortBy?: TicketSortField;
  sortDir?: SortDir;
  page?: number;
  pageSize?: number;
}

export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
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
  const healthResponse = await fetch(`${API_URL}/api/health`);

  if (!healthResponse.ok) {
    throw new Error("Backend unavailable");
  }

  const categories = await fetchCategories();

  return {
    online: true,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Feature 3 — Create ticket form data + submission
// ---------------------------------------------------------------------------
export async function fetchCategories(): Promise<Category[]> {
  const response = await apiFetch("/api/categories");
  return parseJsonOrThrow<Category[]>(response, "Failed to load categories");
}

export async function fetchRelatedSystems(): Promise<RelatedSystem[]> {
  const response = await apiFetch("/api/related-systems");
  return parseJsonOrThrow<RelatedSystem[]>(response, "Failed to load related systems");
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const response = await apiFetch("/api/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<Ticket>(response, "Ticket submission failed");
}

// ---------------------------------------------------------------------------
// Feature 4/5 — My Tickets: list, search, filter, sort, and pagination
// ---------------------------------------------------------------------------
export async function fetchTickets(params: FetchTicketsParams): Promise<TicketListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("categoryId", String(params.categoryId));
  if (params.relatedSystemId) query.set("relatedSystemId", String(params.relatedSystemId));
  if (params.requestedPriority) query.set("requestedPriority", params.requestedPriority);
  if (params.currentStatus) query.set("currentStatus", params.currentStatus);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));

  const response = await apiFetch(`/api/tickets?${query.toString()}`);
  return parseJsonOrThrow<TicketListResponse>(response, "Failed to load tickets");
}

// ---------------------------------------------------------------------------
// Feature 6 — Ticket Detail screen
// ---------------------------------------------------------------------------
export async function fetchTicketDetail(ticketId: number): Promise<Ticket> {
  const response = await apiFetch(`/api/tickets/${ticketId}`);
  return parseJsonOrThrow<Ticket>(response, "Failed to load ticket");
}

export async function uploadAttachment(ticketId: number, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  return parseJsonOrThrow<Attachment>(response, "Attachment upload failed");
}

// ---------------------------------------------------------------------------
// Feature 7 — Inspect a ticket's attachments
// ---------------------------------------------------------------------------
export async function fetchTicketAttachments(ticketId: number): Promise<AttachmentSummary[]> {
  const response = await apiFetch(`/api/tickets/${ticketId}/attachments`);
  return parseJsonOrThrow<AttachmentSummary[]>(response, "Failed to load attachments");
}

// Not a fetch — just the URL to view/download one attachment, opened via a
// plain <a target="_blank">. The session cookie (SameSite=Lax) rides along
// on that top-level navigation the same way it would for any other link.
export function ticketAttachmentUrl(ticketId: number, attachmentId: number): string {
  return `${API_URL}/api/tickets/${ticketId}/attachments/${attachmentId}`;
}

// ---------------------------------------------------------------------------
// Feature 9 — Remove one of a Requester's own attachments (soft removal)
// ---------------------------------------------------------------------------
export async function removeAttachment(
  ticketId: number,
  attachmentId: number,
  reason?: string
): Promise<AttachmentSummary> {
  const response = await apiFetch(`/api/tickets/${ticketId}/attachments/${attachmentId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason: reason ?? null }),
  });
  return parseJsonOrThrow<AttachmentSummary>(response, "Failed to remove attachment");
}

// ---------------------------------------------------------------------------
// Feature 3 (Lab 3) — Public Comments and "Problem Appears Resolved"
// (docs/lab-03/api-spec.md "Comments, Notes, and 'mark resolved'")
// ---------------------------------------------------------------------------
export async function fetchComments(ticketId: number): Promise<Comment[]> {
  const response = await apiFetch(`/api/tickets/${ticketId}/comments`);
  return parseJsonOrThrow<Comment[]>(response, "Failed to load comments");
}

export async function postComment(ticketId: number, body: string): Promise<Comment> {
  const response = await apiFetch(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return parseJsonOrThrow<Comment>(response, "Failed to post comment");
}

export async function markTicketResolved(ticketId: number): Promise<Ticket> {
  const response = await apiFetch(`/api/tickets/${ticketId}/mark-resolved`, {
    method: "POST",
  });
  return parseJsonOrThrow<Ticket>(response, "Failed to mark ticket resolved");
}

// ---------------------------------------------------------------------------
// Feature 4 (Lab 3, issue #37) — IT Staff Ticket Queue
// (docs/lab-03/api-spec.md "GET /api/staff/tickets")
// ---------------------------------------------------------------------------
export type StaffTicketSortField = "createdAt" | "updatedAt" | "itPriority" | "currentStatus";

// The Lab 2 Ticket fields, plus the two the queue needs and Lab 2 never had
// a reason to join in: who the ticket belongs to, and who (if anyone) owns
// it on the IT Staff side.
export type StaffTicketSummary = Ticket & {
  requesterName: string;
  ownerName: string | null;
};

export interface StaffTicketListResponse {
  tickets: StaffTicketSummary[];
  pagination: Pagination;
}

export interface FetchStaffTicketsParams {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  itPriority?: Priority;
  currentStatus?: TicketStatus;
  // 0 means "unassigned only" — a meaningful, distinct value from "no
  // filter", so every call site here must check `!== undefined`, never
  // truthiness (0 is falsy but not absent).
  ownerId?: number;
  sortBy?: StaffTicketSortField;
  sortDir?: SortDir;
  page?: number;
  pageSize?: number;
}

export async function fetchStaffTickets(params: FetchStaffTicketsParams): Promise<StaffTicketListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.categoryId) query.set("categoryId", String(params.categoryId));
  if (params.relatedSystemId) query.set("relatedSystemId", String(params.relatedSystemId));
  if (params.itPriority) query.set("itPriority", params.itPriority);
  if (params.currentStatus) query.set("currentStatus", params.currentStatus);
  if (params.ownerId !== undefined) query.set("ownerId", String(params.ownerId));
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));

  const response = await apiFetch(`/api/staff/tickets?${query.toString()}`);
  return parseJsonOrThrow<StaffTicketListResponse>(response, "Failed to load the ticket queue");
}

// ---------------------------------------------------------------------------
// Feature 5 (Lab 3, issue #38) — IT Staff Ticket Detail & Workflow
// (docs/lab-03/api-spec.md "GET /api/staff/tickets/:id" onward)
// ---------------------------------------------------------------------------
export type StaffTicket = Ticket & {
  categoryName: string;
  relatedSystemName: string;
  requesterName: string;
  requesterEmail: string;
  ownerName: string | null;
  ownerEmail: string | null;
};

// Not a fetch — the URL IT Staff / Administrator open an attachment from (the
// read-only staff route; the Requester route above stays Requester-only).
export function staffTicketAttachmentUrl(ticketId: number, attachmentId: number): string {
  return `${API_URL}/api/staff/tickets/${ticketId}/attachments/${attachmentId}`;
}

export interface StaffTicketDetailResponse {
  ticket: StaffTicket;
  attachments: AttachmentSummary[];
  comments: Comment[];
  // InternalNote shares PublicComment's exact shape server-side.
  notes: Comment[];
}

export interface AssignableUser {
  id: number;
  name: string;
}

export async function fetchStaffTicketDetail(ticketId: number): Promise<StaffTicketDetailResponse> {
  const response = await apiFetch(`/api/staff/tickets/${ticketId}`);
  return parseJsonOrThrow<StaffTicketDetailResponse>(response, "Failed to load ticket");
}

export async function claimTicket(ticketId: number): Promise<Ticket> {
  const response = await apiFetch(`/api/staff/tickets/${ticketId}/claim`, { method: "POST" });
  return parseJsonOrThrow<Ticket>(response, "Failed to claim ticket");
}

export async function assignTicket(ticketId: number, ownerId: number): Promise<Ticket> {
  const response = await apiFetch(`/api/staff/tickets/${ticketId}/assign`, {
    method: "POST",
    body: JSON.stringify({ ownerId }),
  });
  return parseJsonOrThrow<Ticket>(response, "Failed to assign ticket");
}

export async function updateTicketItPriority(ticketId: number, itPriority: Priority): Promise<Ticket> {
  const response = await apiFetch(`/api/staff/tickets/${ticketId}/priority`, {
    method: "PATCH",
    body: JSON.stringify({ itPriority }),
  });
  return parseJsonOrThrow<Ticket>(response, "Failed to update priority");
}

export async function updateTicketStatus(
  ticketId: number,
  currentStatus: TicketStatus,
  confirm?: boolean
): Promise<Ticket> {
  const response = await apiFetch(`/api/staff/tickets/${ticketId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ currentStatus, confirm }),
  });
  return parseJsonOrThrow<Ticket>(response, "Failed to update status");
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const response = await apiFetch("/api/staff/assignable-users");
  return parseJsonOrThrow<AssignableUser[]>(response, "Failed to load assignable users");
}

// Internal Notes share Public Comments' request/response shape and
// validation rules server-side (docs/lab-03/api-spec.md) — IT Staff only.
export async function fetchNotes(ticketId: number): Promise<Comment[]> {
  const response = await apiFetch(`/api/tickets/${ticketId}/notes`);
  return parseJsonOrThrow<Comment[]>(response, "Failed to load notes");
}

export async function postNote(ticketId: number, body: string): Promise<Comment> {
  const response = await apiFetch(`/api/tickets/${ticketId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return parseJsonOrThrow<Comment>(response, "Failed to post note");
}

// ---------------------------------------------------------------------------
// Feature 6 (Lab 3, issue #39) — Administrator User Management
// (docs/lab-03/api-spec.md "Administrator endpoints")
// ---------------------------------------------------------------------------
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface FetchAdminUsersParams {
  search?: string;
  role?: Role;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
}

export async function fetchAdminUsers(params: FetchAdminUsersParams = {}): Promise<AdminUser[]> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);

  const response = await apiFetch(`/api/admin/users?${query.toString()}`);
  return parseJsonOrThrow<AdminUser[]>(response, "Failed to load users");
}

export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  const response = await apiFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<AdminUser>(response, "Failed to create user");
}

export async function updateUser(userId: number, input: UpdateUserInput): Promise<AdminUser> {
  const response = await apiFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<AdminUser>(response, "Failed to update user");
}

export async function resetUserPassword(userId: number, password: string): Promise<AdminUser> {
  const response = await apiFetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  return parseJsonOrThrow<AdminUser>(response, "Failed to reset password");
}
