import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ApiError,
  fetchRequesterDashboard,
  fetchStaffDashboard,
  fetchStaffTickets,
  fetchTickets,
} from "../../src/api.js";

// Lab 4 F8: the query strings of the drill-down links (api-spec.md "Dashboards" and the two list filters).

function mockFetch(body: unknown = {}, status = 200) {
  const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}
const urlOf = (spy: ReturnType<typeof vi.fn>) => new URL(spy.mock.calls[0][0] as string);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard requests", () => {
  it("fetchStaffDashboard and fetchRequesterDashboard call their own endpoints and return the body", async () => {
    const staff = mockFetch({ unassigned: 2 });
    expect(await fetchStaffDashboard()).toEqual({ unassigned: 2 });
    expect(urlOf(staff).pathname).toBe("/api/dashboard/staff");

    const requester = mockFetch({ openTickets: 1 });
    expect(await fetchRequesterDashboard()).toEqual({ openTickets: 1 });
    expect(urlOf(requester).pathname).toBe("/api/dashboard/requester");
  });

  it("a failed request throws an ApiError that keeps the status, so the screen can tell forbidden from an error", async () => {
    mockFetch({ error: "Forbidden" }, 403);
    await expect(fetchStaffDashboard()).rejects.toMatchObject({ status: 403 });
    mockFetch({ error: "Failed to load the dashboard" }, 500);
    await expect(fetchRequesterDashboard()).rejects.toBeInstanceOf(ApiError);
  });
});

describe("Ticket Queue drill-down parameters", () => {
  it("sends ownerId=me, ownerId=unassigned and a numeric ownerId as given, and 0 as before", async () => {
    for (const [ownerId, expected] of [["me", "me"], ["unassigned", "unassigned"], [0, "0"], [7, "7"]] as const) {
      const spy = mockFetch({ tickets: [], pagination: {} });
      await fetchStaffTickets({ ownerId });
      expect(urlOf(spy).searchParams.get("ownerId")).toBe(expected);
    }
  });

  it("sends open=1, recent=1, actionAssigneeId=me and sortBy=updatedAt, and nothing when they are not set", async () => {
    const spy = mockFetch({ tickets: [], pagination: {} });
    await fetchStaffTickets({ open: true, recent: true, actionAssigneeId: "me", sortBy: "updatedAt", sortDir: "desc" });
    const params = urlOf(spy).searchParams;
    expect(params.get("open")).toBe("1");
    expect(params.get("recent")).toBe("1");
    expect(params.get("actionAssigneeId")).toBe("me");
    expect(params.get("sortBy")).toBe("updatedAt");

    const plain = mockFetch({ tickets: [], pagination: {} });
    await fetchStaffTickets({});
    const plainParams = urlOf(plain).searchParams;
    for (const key of ["open", "recent", "actionAssigneeId", "ownerId"]) expect(plainParams.has(key)).toBe(false);
  });
});

describe("My Tickets drill-down parameters", () => {
  it("sends open=1, recent=1 and sortBy=updatedAt", async () => {
    const spy = mockFetch({ tickets: [], pagination: {} });
    await fetchTickets({ open: true, recent: true, sortBy: "updatedAt", sortDir: "desc", currentStatus: "RESOLVED" });
    const params = urlOf(spy).searchParams;
    expect(params.get("open")).toBe("1");
    expect(params.get("recent")).toBe("1");
    expect(params.get("sortBy")).toBe("updatedAt");
    expect(params.get("currentStatus")).toBe("RESOLVED");
  });

  it("sends neither when they are not set", async () => {
    const spy = mockFetch({ tickets: [], pagination: {} });
    await fetchTickets({});
    expect(urlOf(spy).searchParams.has("open")).toBe(false);
    expect(urlOf(spy).searchParams.has("recent")).toBe(false);
  });
});
