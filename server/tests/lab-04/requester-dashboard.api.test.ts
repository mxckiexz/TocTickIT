import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { dashboardClock, recentWindowStart } from "../../src/dashboard.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";
import { DashboardFixtures } from "../helpers/dashboard-fixtures.js";

// Lab 4 F5 (docs/lab-04/tests.md §2 UNIT-04, §3.3 requester-dashboard: API-34..38, API-44 for the Requester).
// Every expected number below is computed by raw SQL written separately from the implementation.

const DAY = 86_400_000;
const OPEN = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;
const WINDOW_SQL = (nowParam: string) =>
  `(date_trunc('day', ${nowParam}::timestamptz AT TIME ZONE 'Asia/Bangkok') - interval '6 days') AT TIME ZONE 'Asia/Bangkok'`;

describe("recent window start (UNIT-04, BR-20)", () => {
  it("is Bangkok midnight six days before the Bangkok date of now, as a UTC instant", () => {
    // 2026-10-31 10:00Z is 17:00 on 31 Oct in Bangkok: the window starts 25 Oct 00:00 +07 = 24 Oct 17:00Z.
    expect(recentWindowStart(new Date("2026-10-31T10:00:00.000Z")).toISOString()).toBe("2026-10-24T17:00:00.000Z");
  });

  it("moves exactly at Bangkok midnight: one second before and at 00:00 on 1 Nov give different starts", () => {
    expect(recentWindowStart(new Date("2026-10-31T16:59:59.000Z")).toISOString()).toBe("2026-10-24T17:00:00.000Z");
    expect(recentWindowStart(new Date("2026-10-31T17:00:00.000Z")).toISOString()).toBe("2026-10-25T17:00:00.000Z");
  });

  it("is not shifted by the server's own timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(recentWindowStart(new Date("2026-10-31T16:59:59.000Z")).toISOString(), tz).toBe("2026-10-24T17:00:00.000Z");
        expect(recentWindowStart(new Date("2026-10-31T17:00:00.000Z")).toISOString(), tz).toBe("2026-10-25T17:00:00.000Z");
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("agrees with PostgreSQL's AT TIME ZONE for a spread of instants, including month and year ends", async () => {
    const instants = ["2026-01-01T00:00:00Z", "2026-01-06T16:59:59Z", "2026-03-01T17:00:00Z", "2026-12-31T20:00:00Z", "2027-01-01T16:59:59Z", "2026-07-15T03:04:05Z"];
    for (const instant of instants) {
      const rows = await getPrisma().$queryRawUnsafe<Array<{ s: Date }>>(`SELECT ${WINDOW_SQL("$1")} AS s`, instant);
      expect(recentWindowStart(new Date(instant)).toISOString(), instant).toBe(rows[0].s.toISOString());
    }
  });
});

describe("Requester dashboard API", () => {
  const emails = {
    a: "dash-req-a-fixture@toktickit.test",
    b: "dash-req-b-fixture@toktickit.test",
    empty: "dash-req-empty-fixture@toktickit.test",
    staff: "dash-req-staff-fixture@toktickit.test",
    admin: "dash-req-admin-fixture@toktickit.test",
  };
  const ids = {} as Record<keyof typeof emails, number>;
  const agents = {} as Record<keyof typeof emails, request.Agent>;
  const fx = new DashboardFixtures();

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      const role = key === "staff" ? "IT_STAFF" : key === "admin" ? "ADMINISTRATOR" : "REQUESTER";
      ids[key] = (await createFixtureUser(emails[key], { role })).user.id;
      agents[key] = await loginAgent(emails[key]);
    }
    await fx.init();
  });
  afterAll(async () => {
    await fx.cleanup();
    for (const email of Object.values(emails)) await deleteFixtureUser(email);
  });
  beforeEach(() => {
    dashboardClock.now = () => new Date();
  });

  const sqlForRequester = async (requesterId: number, now: Date) => {
    const prisma = getPrisma();
    const iso = now.toISOString();
    const one = async (sql: string) => Number((await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(sql, requesterId, iso))[0].n);
    return {
      open: await one(`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = $1 AND "currentStatus" IN ${OPEN}`),
      waiting: await one(`SELECT count(*) AS n FROM "Ticket" WHERE "requesterId" = $1 AND "currentStatus" = 'WAITING_FOR_REQUESTER'`),
      recent: (
        await prisma.$queryRawUnsafe<Array<{ id: number }>>(
          `SELECT id FROM "Ticket" WHERE "requesterId" = $1 AND "updatedAt" AT TIME ZONE 'UTC' >= ${WINDOW_SQL("$2")} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`,
          requesterId,
          iso
        )
      ).map((r) => r.id),
      resolved: (
        await prisma.$queryRawUnsafe<Array<{ id: number }>>(
          `SELECT id FROM "Ticket" WHERE "requesterId" = $1 AND "currentStatus" = 'RESOLVED' AND "updatedAt" AT TIME ZONE 'UTC' >= ${WINDOW_SQL("$2")} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`,
          requesterId,
          iso
        )
      ).map((r) => r.id),
    };
  };

  it("API-34: every number and list equals raw SQL over this Requester's tickets only; another Requester's newer tickets never appear", async () => {
    const now = new Date();
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const statuses = ["NEW", "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "WAITING_FOR_REQUESTER", "REOPENED", "RESOLVED", "RESOLVED", "CLOSED", "CANCELLED"] as const;
    for (const [i, status] of statuses.entries()) await fx.ticket({ requesterId: ids.a, status, updatedAt: ago(i * 0.4) });
    await fx.ticket({ requesterId: ids.a, status: "RESOLVED", updatedAt: ago(20) });
    await fx.ticket({ requesterId: ids.a, status: "IN_PROGRESS", updatedAt: ago(30) });
    for (let i = 0; i < 8; i++) await fx.ticket({ requesterId: ids.b, status: i % 2 ? "RESOLVED" : "OPEN", updatedAt: new Date(now.getTime() + i * 1000) });

    const body = (await agents.a.get("/api/dashboard/requester").expect(200)).body;
    const expected = await sqlForRequester(ids.a, new Date(body.generatedAt));
    expect(body.openTickets).toBe(expected.open);
    expect(body.waitingForRequester).toBe(expected.waiting);
    expect(body.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(expected.recent);
    expect(body.recentlyResolved.map((t: { id: number }) => t.id)).toEqual(expected.resolved);
    expect(body.openTickets).toBeGreaterThanOrEqual(7);
    expect(body.waitingForRequester).toBe(2);
    expect(body.timezone).toBe("Asia/Bangkok");
    expect(new Date(body.generatedAt).toString()).not.toBe("Invalid Date");
    const mine = new Set((await getPrisma().ticket.findMany({ where: { requesterId: ids.a }, select: { id: true } })).map((t) => t.id));
    for (const t of [...body.recentlyUpdated, ...body.recentlyResolved]) expect(mine.has(t.id)).toBe(true);
  });

  it("API-35: a Requester with no tickets gets zeros and empty lists, never null or missing", async () => {
    const body = (await agents.empty.get("/api/dashboard/requester").expect(200)).body;
    expect(body).toMatchObject({ openTickets: 0, waitingForRequester: 0, recentlyUpdated: [], recentlyResolved: [], timezone: "Asia/Bangkok" });
    expect(Object.keys(body).sort()).toEqual(["generatedAt", "openTickets", "recentlyResolved", "recentlyUpdated", "timezone", "waitingForRequester"]);
  });

  it("API-36: with many recent tickets each list holds at most 5, only the brief fields, and there is no full list", async () => {
    for (let i = 0; i < 9; i++) await fx.ticket({ requesterId: ids.b, status: "RESOLVED", updatedAt: new Date(Date.now() - i * 1000) });
    const body = (await agents.b.get("/api/dashboard/requester").expect(200)).body;
    expect(body.recentlyUpdated).toHaveLength(5);
    expect(body.recentlyResolved).toHaveLength(5);
    for (const t of [...body.recentlyUpdated, ...body.recentlyResolved]) {
      expect(Object.keys(t).sort()).toEqual(["currentStatus", "id", "itPriority", "summary", "ticketNumber", "updatedAt"]);
    }
    expect(JSON.stringify(body)).not.toContain("description");
    expect(body).not.toHaveProperty("tickets");
  });

  it("API-37: IT Staff and an Administrator get 403 and no session gets 401", async () => {
    await agents.staff.get("/api/dashboard/requester").expect(403);
    await agents.admin.get("/api/dashboard/requester").expect(403);
    await request(app).get("/api/dashboard/requester").expect(401);
  });

  it("API-38: recently resolved lists RESOLVED tickets only, ordered by updatedAt newest first, within the 7-day window", async () => {
    const now = Date.now();
    const old = await fx.ticket({ requesterId: ids.empty, status: "RESOLVED", updatedAt: new Date(now - 20 * DAY) });
    const first = await fx.ticket({ requesterId: ids.empty, status: "RESOLVED", updatedAt: new Date(now - 3 * DAY) });
    const second = await fx.ticket({ requesterId: ids.empty, status: "RESOLVED", updatedAt: new Date(now - 1 * DAY) });
    await fx.ticket({ requesterId: ids.empty, status: "CLOSED", updatedAt: new Date(now - 0.5 * DAY) });
    const body = (await agents.empty.get("/api/dashboard/requester").expect(200)).body;
    expect(body.recentlyResolved.map((t: { id: number }) => t.id)).toEqual([second.id, first.id]);
    expect(body.recentlyResolved.map((t: { id: number }) => t.id)).not.toContain(old.id);
    for (const t of body.recentlyResolved) expect(t.currentStatus).toBe("RESOLVED");
    await getPrisma().ticket.deleteMany({ where: { requesterId: ids.empty } });
  });

  it("API-44 (Requester): tickets one second either side of the Bangkok-midnight window start fall on the correct side", async () => {
    const fixedNow = new Date("2026-10-31T10:00:00.000Z");
    dashboardClock.now = () => fixedNow;
    const start = new Date("2026-10-24T17:00:00.000Z");
    const justBefore = await fx.ticket({ requesterId: ids.empty, updatedAt: new Date(start.getTime() - 1000), summary: "one second before" });
    const atStart = await fx.ticket({ requesterId: ids.empty, updatedAt: start, summary: "exactly at the start" });
    const justAfter = await fx.ticket({ requesterId: ids.empty, updatedAt: new Date(start.getTime() + 1000), summary: "one second after" });
    const body = (await agents.empty.get("/api/dashboard/requester").expect(200)).body;
    const listed = body.recentlyUpdated.map((t: { id: number }) => t.id);
    expect(listed).toContain(atStart.id);
    expect(listed).toContain(justAfter.id);
    expect(listed).not.toContain(justBefore.id);
    expect(body.generatedAt).toBe(fixedNow.toISOString());
    const expected = await sqlForRequester(ids.empty, fixedNow);
    expect(listed).toEqual(expected.recent);
    await getPrisma().ticket.deleteMany({ where: { requesterId: ids.empty } });
  });

  it("a user whose password change is still required is rejected", async () => {
    const email = "dash-req-mustchange-fixture@toktickit.test";
    await createFixtureUser(email, { mustChangePassword: true });
    try {
      const response = await (await loginAgent(email)).get("/api/dashboard/requester").expect(403);
      expect(response.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    } finally {
      await deleteFixtureUser(email);
    }
  });

  it("returns a safe 500 with no detail when the database fails", async () => {
    const spy = vi.spyOn(getPrisma().ticket, "count").mockRejectedValue(new Error("db host 10.0.0.5 refused the connection"));
    try {
      const response = await agents.a.get("/api/dashboard/requester");
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to load the dashboard" });
    } finally {
      spy.mockRestore();
    }
  });
});
