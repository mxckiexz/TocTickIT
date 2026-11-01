import { describe, it, expect } from "vitest";
import { allowedViews, parseRoute, routeHref, type Route } from "../../src/routes.js";

// Lab 4 F8 (ui-spec.md §1): every dashboard card, count and row is a real link, so the pages are addressed by the
// URL hash. These are the pure rules; the screens that use them are tested with their components.

describe("parseRoute", () => {
  it("an empty or unknown hash is the dashboard", () => {
    expect(parseRoute("")).toEqual({ view: "dashboard" });
    expect(parseRoute("#")).toEqual({ view: "dashboard" });
    expect(parseRoute("#/nowhere")).toEqual({ view: "dashboard" });
    expect(parseRoute("#/dashboard")).toEqual({ view: "dashboard" });
  });

  it("reads the simple pages", () => {
    expect(parseRoute("#/new-ticket")).toEqual({ view: "newTicket" });
    expect(parseRoute("#/users")).toEqual({ view: "users" });
  });

  it("reads Ticket Queue drill-down filters", () => {
    expect(parseRoute("#/queue?ownerId=unassigned&open=1")).toEqual({
      view: "queue",
      filters: { ownerId: "unassigned", open: true },
    });
    expect(parseRoute("#/queue?ownerId=me&open=1")).toEqual({ view: "queue", filters: { ownerId: "me", open: true } });
    expect(parseRoute("#/queue?actionAssigneeId=me")).toEqual({ view: "queue", filters: { actionAssigneeId: "me" } });
    expect(parseRoute("#/queue?currentStatus=IN_PROGRESS")).toEqual({ view: "queue", filters: { currentStatus: "IN_PROGRESS" } });
    expect(parseRoute("#/queue?itPriority=HIGH&open=1")).toEqual({ view: "queue", filters: { itPriority: "HIGH", open: true } });
    expect(parseRoute("#/queue?recent=1&sortBy=updatedAt")).toEqual({ view: "queue", filters: { recent: true, sortBy: "updatedAt" } });
  });

  it("drops values it does not know, so a hand-edited link cannot send the API something invalid", () => {
    expect(parseRoute("#/queue?ownerId=7&open=yes&currentStatus=BOGUS&itPriority=URGENT&sortBy=summary&x=1")).toEqual({
      view: "queue",
      filters: {},
    });
    expect(parseRoute("#/my-tickets?open=2&currentStatus=nope")).toEqual({ view: "myTickets", filters: {} });
  });

  it("reads My Tickets drill-down filters", () => {
    expect(parseRoute("#/my-tickets?open=1")).toEqual({ view: "myTickets", filters: { open: true } });
    expect(parseRoute("#/my-tickets?currentStatus=WAITING_FOR_REQUESTER")).toEqual({
      view: "myTickets",
      filters: { currentStatus: "WAITING_FOR_REQUESTER" },
    });
    expect(parseRoute("#/my-tickets?recent=1&sortBy=updatedAt")).toEqual({
      view: "myTickets",
      filters: { recent: true, sortBy: "updatedAt" },
    });
    expect(parseRoute("#/my-tickets?currentStatus=RESOLVED&recent=1")).toEqual({
      view: "myTickets",
      filters: { currentStatus: "RESOLVED", recent: true },
    });
  });

  it("reads a ticket to open, and the Actions Taken section", () => {
    expect(parseRoute("#/queue/12")).toEqual({ view: "queue", filters: {}, ticketId: 12 });
    expect(parseRoute("#/queue/12?section=actions-taken")).toEqual({
      view: "queue",
      filters: {},
      ticketId: 12,
      section: "actions-taken",
    });
    expect(parseRoute("#/my-tickets/5")).toEqual({ view: "myTickets", filters: {}, ticketId: 5 });
  });

  it("ignores a ticket id that is not a positive whole number", () => {
    expect(parseRoute("#/queue/abc")).toEqual({ view: "queue", filters: {} });
    expect(parseRoute("#/queue/0")).toEqual({ view: "queue", filters: {} });
    expect(parseRoute("#/queue/-3")).toEqual({ view: "queue", filters: {} });
    expect(parseRoute("#/queue/1.5")).toEqual({ view: "queue", filters: {} });
  });
});

describe("routeHref", () => {
  const routes: Route[] = [
    { view: "dashboard" },
    { view: "newTicket" },
    { view: "users" },
    { view: "queue", filters: {} },
    { view: "queue", filters: { ownerId: "unassigned", open: true } },
    { view: "queue", filters: { actionAssigneeId: "me" } },
    { view: "queue", filters: { recent: true, sortBy: "updatedAt" } },
    { view: "queue", filters: { itPriority: "HIGH", open: true } },
    { view: "queue", filters: {}, ticketId: 12, section: "actions-taken" },
    { view: "myTickets", filters: {} },
    { view: "myTickets", filters: { currentStatus: "RESOLVED", recent: true } },
    { view: "myTickets", filters: {}, ticketId: 5 },
  ];

  it.each(routes.map((route) => [JSON.stringify(route), route] as const))("%s round-trips through its href", (_name, route) => {
    expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it("builds readable hashes", () => {
    expect(routeHref({ view: "dashboard" })).toBe("#/dashboard");
    expect(routeHref({ view: "queue", filters: { ownerId: "unassigned", open: true } })).toBe("#/queue?ownerId=unassigned&open=1");
    expect(routeHref({ view: "queue", filters: {}, ticketId: 12, section: "actions-taken" })).toBe("#/queue/12?section=actions-taken");
  });
});

describe("allowedViews", () => {
  it("lists what each role may open, in navigation order (ui-spec.md §1)", () => {
    expect(allowedViews("REQUESTER")).toEqual(["dashboard", "newTicket", "myTickets"]);
    expect(allowedViews("IT_STAFF")).toEqual(["dashboard", "queue"]);
    expect(allowedViews("ADMINISTRATOR")).toEqual(["dashboard", "queue", "users"]);
  });
});
