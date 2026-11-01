import type { AuthUser, Priority, TicketStatus } from "./api.js";

// Lab 4 F8 (ui-spec.md §1, §2): the pages are addressed by the URL hash, so every dashboard card, count and row can be
// a real link (it opens in a new tab, it works with the Back button) without adding a router library.
//
//   #/dashboard   #/new-ticket   #/users
//   #/queue?ownerId=unassigned&open=1        Ticket Queue with a drill-down filter
//   #/queue/12?section=actions-taken         one ticket, scrolled to Actions Taken
//   #/my-tickets?currentStatus=RESOLVED&recent=1   #/my-tickets/5

export type View = "dashboard" | "newTicket" | "myTickets" | "queue" | "users";

// The drill-downs of api-spec.md "Dashboards". They are the only filters the Ticket Queue takes from a link.
export interface QueueFilters {
  ownerId?: "me" | "unassigned";
  open?: boolean;
  recent?: boolean;
  actionAssigneeId?: "me";
  currentStatus?: TicketStatus;
  itPriority?: Priority;
  sortBy?: "updatedAt";
}

export interface MyTicketFilters {
  open?: boolean;
  recent?: boolean;
  currentStatus?: TicketStatus;
  sortBy?: "updatedAt";
}

export type Route =
  | { view: "dashboard" }
  | { view: "newTicket" }
  | { view: "users" }
  | { view: "queue"; filters: QueueFilters; ticketId?: number; section?: "actions-taken" }
  | { view: "myTickets"; filters: MyTicketFilters; ticketId?: number };

const STATUSES: readonly string[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];
const PRIORITIES: readonly string[] = ["LOW", "MEDIUM", "HIGH"];

// What each role may open, in navigation order. An item a role cannot use is never rendered; the API still answers
// 403 for it (Lab 3 FR-07).
export function allowedViews(role: AuthUser["role"]): View[] {
  if (role === "REQUESTER") return ["dashboard", "newTicket", "myTickets"];
  if (role === "IT_STAFF") return ["dashboard", "queue"];
  return ["dashboard", "queue", "users"];
}

function ticketIdOf(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return undefined;
  return Number(raw);
}

// A hand-edited link must not be able to send the API anything it does not understand, so unknown values are dropped.
function sharedFilters(params: URLSearchParams): MyTicketFilters {
  const filters: MyTicketFilters = {};
  if (params.get("open") === "1") filters.open = true;
  if (params.get("recent") === "1") filters.recent = true;
  const status = params.get("currentStatus");
  if (status && STATUSES.includes(status)) filters.currentStatus = status as TicketStatus;
  if (params.get("sortBy") === "updatedAt") filters.sortBy = "updatedAt";
  return filters;
}

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const [, page, id] = path.split("/");

  if (page === "new-ticket") return { view: "newTicket" };
  if (page === "users") return { view: "users" };

  if (page === "my-tickets") {
    const route: Route = { view: "myTickets", filters: sharedFilters(params) };
    const ticketId = ticketIdOf(id);
    if (ticketId !== undefined) route.ticketId = ticketId;
    return route;
  }

  if (page === "queue") {
    const filters: QueueFilters = sharedFilters(params);
    const owner = params.get("ownerId");
    if (owner === "me" || owner === "unassigned") filters.ownerId = owner;
    if (params.get("actionAssigneeId") === "me") filters.actionAssigneeId = "me";
    const priority = params.get("itPriority");
    if (priority && PRIORITIES.includes(priority)) filters.itPriority = priority as Priority;
    const route: Route = { view: "queue", filters };
    const ticketId = ticketIdOf(id);
    if (ticketId !== undefined) {
      route.ticketId = ticketId;
      if (params.get("section") === "actions-taken") route.section = "actions-taken";
    }
    return route;
  }

  return { view: "dashboard" };
}

export function routeHref(route: Route): string {
  switch (route.view) {
    case "dashboard":
      return "#/dashboard";
    case "newTicket":
      return "#/new-ticket";
    case "users":
      return "#/users";
    case "queue": {
      const params = new URLSearchParams();
      const f = route.filters;
      if (f.ownerId) params.set("ownerId", f.ownerId);
      if (f.actionAssigneeId) params.set("actionAssigneeId", f.actionAssigneeId);
      if (f.currentStatus) params.set("currentStatus", f.currentStatus);
      if (f.itPriority) params.set("itPriority", f.itPriority);
      if (f.open) params.set("open", "1");
      if (f.recent) params.set("recent", "1");
      if (f.sortBy) params.set("sortBy", f.sortBy);
      if (route.ticketId !== undefined && route.section) params.set("section", route.section);
      const query = params.toString();
      return `#/queue${route.ticketId !== undefined ? `/${route.ticketId}` : ""}${query ? `?${query}` : ""}`;
    }
    case "myTickets": {
      const params = new URLSearchParams();
      const f = route.filters;
      if (f.currentStatus) params.set("currentStatus", f.currentStatus);
      if (f.open) params.set("open", "1");
      if (f.recent) params.set("recent", "1");
      if (f.sortBy) params.set("sortBy", f.sortBy);
      const query = params.toString();
      return `#/my-tickets${route.ticketId !== undefined ? `/${route.ticketId}` : ""}${query ? `?${query}` : ""}`;
    }
  }
}
