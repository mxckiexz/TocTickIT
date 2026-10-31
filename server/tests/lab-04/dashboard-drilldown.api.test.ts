import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { getPrisma } from "../../src/prisma.js";
import { dashboardClock } from "../../src/dashboard.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";
import { DashboardFixtures } from "../helpers/dashboard-fixtures.js";

// Lab 4 F5 (docs/lab-04/tests.md API-33, API-45, API-59; AC-29, AC-47, FR-17): the list behind every dashboard
// number is exactly the set that was counted. The same fixture is read through the dashboard and through the
// queue with the drill-down parameters of api-spec.md.

const DAY = 86_400_000;
// BR-20 window start, written in SQL separately from recentWindowStart. "updatedAt" is a UTC `timestamp`, so it is
// compared as `"updatedAt" AT TIME ZONE 'UTC'` to stay independent of the session's time zone.
const WINDOW_SQL = (nowParam: string) =>
  `(date_trunc('day', ${nowParam}::timestamptz AT TIME ZONE 'Asia/Bangkok') - interval '6 days') AT TIME ZONE 'Asia/Bangkok'`;
const IN_WINDOW = (nowParam: string) => `("updatedAt" AT TIME ZONE 'UTC') >= ${WINDOW_SQL(nowParam)}`;

const STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;

describe("Dashboard drill-downs", () => {
  const emails = {
    staff: "drill-staff-fixture@toktickit.test",
    staffB: "drill-staff-b-fixture@toktickit.test",
    admin: "drill-admin-fixture@toktickit.test",
    requester: "drill-req-fixture@toktickit.test",
    otherRequester: "drill-other-req-fixture@toktickit.test",
  };
  const ids = {} as Record<keyof typeof emails, number>;
  const agents = {} as Record<keyof typeof emails, request.Agent>;
  const fx = new DashboardFixtures();

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      const role = key.toLowerCase().includes("req") ? "REQUESTER" : key === "admin" ? "ADMINISTRATOR" : "IT_STAFF";
      ids[key] = (await createFixtureUser(emails[key], { role })).user.id;
      agents[key] = await loginAgent(emails[key]);
    }
    await fx.init();
    const now = Date.now();
    for (const [i, status] of STATUSES.entries()) {
      await fx.ticket({ requesterId: ids.requester, status, ownerId: i % 3 === 0 ? null : i % 3 === 1 ? ids.staff : ids.staffB, itPriority: (["LOW", "MEDIUM", "HIGH"] as const)[i % 3], updatedAt: new Date(now - i * 60_000) });
      await fx.ticket({ requesterId: ids.requester, status, ownerId: null, itPriority: "HIGH", updatedAt: new Date(now - i * 61_000) });
      await fx.ticket({ requesterId: ids.otherRequester, status, ownerId: ids.staff, itPriority: "LOW", updatedAt: new Date(now - i * 62_000) });
    }
    const open = await getPrisma().ticket.findMany({ where: { id: { in: fx.ticketIds }, currentStatus: { in: ["IN_PROGRESS", "OPEN", "RESOLVED"] } }, take: 4 });
    for (const t of open) await fx.action({ ticketId: t.id, performedById: ids.staffB, assigneeId: ids.staff, status: "PLANNED" });
    await fx.action({ ticketId: open[0].id, performedById: ids.staffB, assigneeId: ids.staff, status: "IN_PROGRESS" });
  });
  afterAll(async () => {
    await fx.cleanup();
    for (const email of Object.values(emails)) await deleteFixtureUser(email);
  });

  async function allIds(agent: request.Agent, path: string, query: string): Promise<{ ids: number[]; total: number }> {
    const out: number[] = [];
    let total = 0;
    for (let page = 1; page < 50; page++) {
      const response = await agent.get(`${path}?${query}&pageSize=50&page=${page}`).expect(200);
      out.push(...response.body.tickets.map((t: { id: number }) => t.id));
      total = response.body.pagination.totalItems;
      if (page >= response.body.pagination.totalPages) break;
    }
    return { ids: out, total };
  }
  const sqlOrderedIds = async (sql: string, ...params: unknown[]) => (await getPrisma().$queryRawUnsafe<Array<{ id: number }>>(sql, ...params)).map((r) => r.id);
  const sqlIds = async (sql: string, ...params: unknown[]) => (await getPrisma().$queryRawUnsafe<Array<{ id: number }>>(sql, ...params)).map((r) => r.id).sort((a, b) => a - b);
  const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
  const OPEN = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;

  describe("Staff queue (API-33, API-45, API-59)", () => {
    it("API-45: unassigned, assigned to me, each status and each IT priority: the queue lists exactly the counted tickets", async () => {
      const dash = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;

      const unassigned = await allIds(agents.staff, "/api/staff/tickets", "ownerId=unassigned&open=1");
      expect(unassigned.total).toBe(dash.unassigned);
      expect(sorted(unassigned.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "ownerId" IS NULL AND "currentStatus" IN ${OPEN}`));

      const mine = await allIds(agents.staff, "/api/staff/tickets", "ownerId=me&open=1");
      expect(mine.total).toBe(dash.assignedToMe);
      expect(sorted(mine.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "ownerId" = $1 AND "currentStatus" IN ${OPEN}`, ids.staff));

      for (const status of STATUSES) {
        const list = await allIds(agents.staff, "/api/staff/tickets", `currentStatus=${status}`);
        expect(list.total, status).toBe(dash.byStatus[status]);
      }
      for (const priority of ["LOW", "MEDIUM", "HIGH"]) {
        const list = await allIds(agents.staff, "/api/staff/tickets", `itPriority=${priority}&open=1`);
        expect(list.total, priority).toBe(dash.byItPriority[priority]);
        expect(sorted(list.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "itPriority"::text = $1 AND "currentStatus" IN ${OPEN}`, priority));
      }
    });

    it("API-33: ownerId=me lists only the caller's tickets, ownerId=unassigned only unowned ones (an alias of ownerId=0), anything else is 400", async () => {
      const mine = await allIds(agents.staffB, "/api/staff/tickets", "ownerId=me");
      expect(mine.ids.length).toBeGreaterThan(0);
      expect(sorted(mine.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "ownerId" = $1`, ids.staffB));
      const unowned = await allIds(agents.staff, "/api/staff/tickets", "ownerId=unassigned");
      expect(sorted(unowned.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "ownerId" IS NULL`));
      expect(sorted((await allIds(agents.staff, "/api/staff/tickets", "ownerId=0")).ids)).toEqual(sorted(unowned.ids));
      // The Administrator's "me" is the Administrator.
      const adminMine = await allIds(agents.admin, "/api/staff/tickets", "ownerId=me");
      expect(sorted(adminMine.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "ownerId" = $1`, ids.admin));
      for (const bad of ["abc", "-1", "1.5", "ME", ""]) {
        await agents.staff.get(`/api/staff/tickets?ownerId=${bad}`).expect(400);
      }
      for (const bad of ["2", "true", "", "yes"]) {
        await agents.staff.get(`/api/staff/tickets?open=${bad}`).expect(400);
      }
    });

    it("API-59: actionAssigneeId=me lists exactly the open tickets counted by ticketsWithMyOpenActions, each once; a bad value is 400", async () => {
      const dash = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
      const list = await allIds(agents.staff, "/api/staff/tickets", "actionAssigneeId=me");
      expect(list.total).toBe(dash.ticketsWithMyOpenActions);
      expect(new Set(list.ids).size).toBe(list.ids.length);
      expect(sorted(list.ids)).toEqual(
        await sqlIds(
          `SELECT DISTINCT a."ticketId" AS id FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
            WHERE a."assigneeId" = $1 AND a.status IN ('PLANNED','IN_PROGRESS') AND t."currentStatus" IN ${OPEN}`,
          ids.staff
        )
      );
      expect(list.total).toBeGreaterThanOrEqual(2);
      // A ticket whose only open action is on a RESOLVED ticket is not listed.
      const resolvedWithAction = await getPrisma().ticket.findFirst({ where: { id: { in: fx.ticketIds }, currentStatus: "RESOLVED", actionsTaken: { some: { assigneeId: ids.staff, status: "PLANNED" } } } });
      if (resolvedWithAction) expect(list.ids).not.toContain(resolvedWithAction.id);
      for (const bad of ["5", "abc", "ME", "", "0"]) {
        await agents.staff.get(`/api/staff/tickets?actionAssigneeId=${bad}`).expect(400);
      }
      // Combines with the other filters (AND).
      const narrowed = await allIds(agents.staff, "/api/staff/tickets", "actionAssigneeId=me&currentStatus=RESOLVED");
      expect(narrowed.total).toBe(0);
    });

    it("the new parameters are staff-only like the rest of the queue: a Requester is 403", async () => {
      await agents.requester.get("/api/staff/tickets?ownerId=me&open=1").expect(403);
      await agents.requester.get("/api/staff/tickets?actionAssigneeId=me").expect(403);
    });
  });

  describe("Requester list (API-45 for the Requester)", () => {
    it("open=1 lists exactly the open tickets counted, currentStatus=WAITING_FOR_REQUESTER the waiting ones, and only this Requester's", async () => {
      const dash = (await agents.requester.get("/api/dashboard/requester").expect(200)).body;
      const open = await allIds(agents.requester, "/api/tickets", "open=1");
      expect(open.total).toBe(dash.openTickets);
      expect(sorted(open.ids)).toEqual(await sqlIds(`SELECT id FROM "Ticket" WHERE "requesterId" = $1 AND "currentStatus" IN ${OPEN}`, ids.requester));
      const waiting = await allIds(agents.requester, "/api/tickets", "currentStatus=WAITING_FOR_REQUESTER");
      expect(waiting.total).toBe(dash.waitingForRequester);
      const resolved = await allIds(agents.requester, "/api/tickets", "currentStatus=RESOLVED");
      for (const id of resolved.ids) expect(sorted(await sqlIds(`SELECT id FROM "Ticket" WHERE "requesterId" = $1`, ids.requester))).toContain(id);
    });

    it("sortBy=updatedAt orders by updatedAt (newest first by default), the order the dashboard's recently updated list uses", async () => {
      const response = await agents.requester.get("/api/tickets?sortBy=updatedAt&pageSize=50").expect(200);
      const times = response.body.tickets.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
      const asc = await agents.requester.get("/api/tickets?sortBy=updatedAt&sortDir=asc&pageSize=50").expect(200);
      const ascTimes = asc.body.tickets.map((t: { updatedAt: string }) => new Date(t.updatedAt).getTime());
      expect(ascTimes).toEqual([...ascTimes].sort((a, b) => a - b));
      const dash = (await agents.requester.get("/api/dashboard/requester").expect(200)).body;
      expect(dash.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(response.body.tickets.slice(0, dash.recentlyUpdated.length).map((t: { id: number }) => t.id));
    });

    it("a bad open value is 400", async () => {
      for (const bad of ["2", "true", "", "yes"]) await agents.requester.get(`/api/tickets?open=${bad}`).expect(400);
    });
  });

  describe("Recent drill-downs: recent=1 (API-45, FR-17, BR-20)", () => {
    // A fixed clock so the window cannot move between the dashboard call, the list calls and the SQL.
    const fixedNow = new Date();
    const old = {} as Record<"updated" | "resolved" | "staffOnly" | "resolvedJustBefore", number>;
    let resolvedAtStart = 0;

    beforeAll(async () => {
      dashboardClock.now = () => fixedNow;
      const start = (await getPrisma().$queryRawUnsafe<Array<{ s: Date }>>(`SELECT ${WINDOW_SQL("$1")} AS s`, fixedNow.toISOString()))[0].s;
      const eightDaysAgo = new Date(fixedNow.getTime() - 8 * DAY);
      old.updated = (await fx.ticket({ requesterId: ids.requester, status: "OPEN", updatedAt: eightDaysAgo, summary: "older than the window" })).id;
      old.resolved = (await fx.ticket({ requesterId: ids.requester, status: "RESOLVED", updatedAt: eightDaysAgo, summary: "resolved before the window" })).id;
      old.staffOnly = (await fx.ticket({ requesterId: ids.otherRequester, status: "IN_PROGRESS", updatedAt: eightDaysAgo, summary: "another requester, old" })).id;
      old.resolvedJustBefore = (await fx.ticket({ requesterId: ids.requester, status: "RESOLVED", updatedAt: new Date(start.getTime() - 1000), summary: "one second before" })).id;
      resolvedAtStart = (await fx.ticket({ requesterId: ids.requester, status: "RESOLVED", updatedAt: start, summary: "exactly at the start" })).id;
    });
    afterAll(() => {
      dashboardClock.now = () => new Date();
    });

    it("staff recently updated: recent=1&sortBy=updatedAt lists exactly the in-window tickets, in the dashboard's order", async () => {
      const dash = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
      const list = await allIds(agents.staff, "/api/staff/tickets", "recent=1&sortBy=updatedAt");
      expect(list.ids).toEqual(await sqlOrderedIds(`SELECT id FROM "Ticket" WHERE ${IN_WINDOW("$1")} ORDER BY "updatedAt" DESC, id DESC`, fixedNow.toISOString()));
      expect(list.ids.slice(0, dash.recentlyUpdated.length)).toEqual(dash.recentlyUpdated.map((t: { id: number }) => t.id));
      for (const id of Object.values(old)) expect(list.ids).not.toContain(id);
      // Without recent=1 the old tickets are in the queue: the filter is what keeps them out.
      const unfiltered = await allIds(agents.staff, "/api/staff/tickets", "sortBy=updatedAt");
      for (const id of Object.values(old)) expect(unfiltered.ids).toContain(id);
    });

    it("Requester recently updated: recent=1&sortBy=updatedAt lists exactly the in-window own tickets, in the dashboard's order", async () => {
      const dash = (await agents.requester.get("/api/dashboard/requester").expect(200)).body;
      const list = await allIds(agents.requester, "/api/tickets", "recent=1&sortBy=updatedAt");
      expect(list.ids).toEqual(
        await sqlOrderedIds(`SELECT id FROM "Ticket" WHERE "requesterId" = $2 AND ${IN_WINDOW("$1")} ORDER BY "updatedAt" DESC, id DESC`, fixedNow.toISOString(), ids.requester)
      );
      expect(list.ids.slice(0, dash.recentlyUpdated.length)).toEqual(dash.recentlyUpdated.map((t: { id: number }) => t.id));
      expect(list.ids).not.toContain(old.updated);
      expect(list.ids).not.toContain(old.resolved);
      expect(list.ids).not.toContain(old.resolvedJustBefore);
      expect(list.ids).toContain(resolvedAtStart);
    });

    it("Requester recently resolved: currentStatus=RESOLVED&recent=1 lists exactly the dashboard's set; older RESOLVED tickets are not listed", async () => {
      const dash = (await agents.requester.get("/api/dashboard/requester").expect(200)).body;
      const list = await allIds(agents.requester, "/api/tickets", "currentStatus=RESOLVED&recent=1&sortBy=updatedAt");
      expect(list.ids).toEqual(
        await sqlOrderedIds(
          `SELECT id FROM "Ticket" WHERE "requesterId" = $2 AND "currentStatus" = 'RESOLVED' AND ${IN_WINDOW("$1")} ORDER BY "updatedAt" DESC, id DESC`,
          fixedNow.toISOString(),
          ids.requester
        )
      );
      expect(list.ids.slice(0, dash.recentlyResolved.length)).toEqual(dash.recentlyResolved.map((t: { id: number }) => t.id));
      expect(list.ids).toContain(resolvedAtStart);
      expect(list.ids).not.toContain(old.resolved);
      expect(list.ids).not.toContain(old.resolvedJustBefore);
      // The plain status filter still lists them: recent=1 is what matches the dashboard.
      const unfiltered = await allIds(agents.requester, "/api/tickets", "currentStatus=RESOLVED");
      expect(unfiltered.ids).toContain(old.resolved);
    });

    it("a bad recent value is 400 on both lists", async () => {
      for (const bad of ["2", "true", "", "yes", "0"]) {
        await agents.requester.get(`/api/tickets?recent=${bad}`).expect(400);
        await agents.staff.get(`/api/staff/tickets?recent=${bad}`).expect(400);
      }
    });
  });
});
