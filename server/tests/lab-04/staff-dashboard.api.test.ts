import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { briefDescription, countsByKey, dashboardClock } from "../../src/dashboard.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";
import { DashboardFixtures } from "../helpers/dashboard-fixtures.js";

// Lab 4 F5 (docs/lab-04/tests.md §2 UNIT-05, §3.3 staff-dashboard: API-39..44, API-55..58).
// Every expected number is computed by raw SQL, written separately from the implementation, in the
// same test: the development database accumulates fixture rows, so no count is hard-coded.

const DAY = 86_400_000;
const OPEN = `('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')`;
const STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const WINDOW_SQL = `(date_trunc('day', $1::timestamptz AT TIME ZONE 'Asia/Bangkok') - interval '6 days') AT TIME ZONE 'Asia/Bangkok'`;

describe("brief description (UNIT-05, BR-27)", () => {
  it("leaves text of 120 characters or fewer unchanged", () => {
    expect(briefDescription("short")).toBe("short");
    expect(briefDescription("a".repeat(120))).toBe("a".repeat(120));
    expect(briefDescription("")).toBe("");
  });
  it("cuts longer text to the first 120 characters followed by an ellipsis", () => {
    expect(briefDescription("a".repeat(121))).toBe(`${"a".repeat(120)}…`);
    expect(briefDescription("b".repeat(500))).toBe(`${"b".repeat(120)}…`);
  });
  it("counts characters, not UTF-16 code units, so an emoji is not split", () => {
    const text = "😀".repeat(130);
    const cut = briefDescription(text);
    expect(cut).toBe(`${"😀".repeat(120)}…`);
    expect([...cut]).toHaveLength(121);
  });
});

describe("zero-filled counts (API-42, BR-23)", () => {
  it("keeps every key, with 0 for the ones that have no rows", () => {
    expect(countsByKey(STATUSES, [{ key: "OPEN", n: 3 }])).toEqual({
      NEW: 0, OPEN: 3, IN_PROGRESS: 0, WAITING_FOR_REQUESTER: 0, RESOLVED: 0, CLOSED: 0, REOPENED: 0, CANCELLED: 0,
    });
    expect(countsByKey(["LOW", "MEDIUM", "HIGH"], [])).toEqual({ LOW: 0, MEDIUM: 0, HIGH: 0 });
  });
});

describe("Staff and Administrator dashboard API", () => {
  const emails = {
    staff: "dash-staff-fixture@toktickit.test",
    staffB: "dash-staff-b-fixture@toktickit.test",
    fresh: "dash-staff-fresh-fixture@toktickit.test",
    admin: "dash-admin-fixture@toktickit.test",
    requester: "dash-staff-req-fixture@toktickit.test",
  };
  const ids = {} as Record<keyof typeof emails, number>;
  const agents = {} as Record<keyof typeof emails, request.Agent>;
  const fx = new DashboardFixtures();

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      const role = key === "requester" ? "REQUESTER" : key === "admin" ? "ADMINISTRATOR" : "IT_STAFF";
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

  const prisma = () => getPrisma();
  const rows = async <T>(sql: string, ...params: unknown[]) => prisma().$queryRawUnsafe<T[]>(sql, ...params);
  const num = async (sql: string, ...params: unknown[]) => Number((await rows<{ n: bigint }>(sql, ...params))[0].n);

  async function seedMix() {
    const base = Date.now();
    const mk = (status: Parameters<DashboardFixtures["ticket"]>[0]["status"], ownerId: number | null, itPriority: "LOW" | "MEDIUM" | "HIGH", minutesAgo: number) =>
      fx.ticket({ requesterId: ids.requester, status, ownerId, itPriority, updatedAt: new Date(base - minutesAgo * 60_000) });
    await mk("NEW", null, "HIGH", 1);
    await mk("OPEN", null, "LOW", 2);
    await mk("IN_PROGRESS", ids.staff, "MEDIUM", 3);
    await mk("WAITING_FOR_REQUESTER", ids.staff, "HIGH", 4);
    await mk("REOPENED", ids.staffB, "LOW", 5);
    await mk("RESOLVED", ids.staff, "MEDIUM", 6);
    await mk("CLOSED", null, "HIGH", 7);
    await mk("CANCELLED", ids.staffB, "LOW", 8);
    await mk("IN_PROGRESS", ids.staffB, "MEDIUM", 9);
    await mk("NEW", ids.admin, "MEDIUM", 10);
  }

  it("API-39: unassigned, assigned to me, by status, by IT priority and recent equal raw SQL over the same rows (open means five statuses)", async () => {
    await seedMix();
    const body = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
    const now = new Date(body.generatedAt).toISOString();
    expect(body.unassigned).toBe(await num(`SELECT count(*) AS n FROM "Ticket" WHERE "ownerId" IS NULL AND "currentStatus" IN ${OPEN}`));
    expect(body.assignedToMe).toBe(await num(`SELECT count(*) AS n FROM "Ticket" WHERE "ownerId" = $1 AND "currentStatus" IN ${OPEN}`, ids.staff));
    const byStatus = await rows<{ s: string; n: bigint }>(`SELECT "currentStatus"::text AS s, count(*) AS n FROM "Ticket" GROUP BY 1`);
    for (const status of STATUSES) expect(body.byStatus[status], status).toBe(Number(byStatus.find((r) => r.s === status)?.n ?? 0));
    const byPriority = await rows<{ p: string; n: bigint }>(`SELECT "itPriority"::text AS p, count(*) AS n FROM "Ticket" WHERE "currentStatus" IN ${OPEN} GROUP BY 1`);
    for (const priority of ["LOW", "MEDIUM", "HIGH"]) expect(body.byItPriority[priority], priority).toBe(Number(byPriority.find((r) => r.p === priority)?.n ?? 0));
    const recent = await rows<{ id: number }>(`SELECT id FROM "Ticket" WHERE "updatedAt" AT TIME ZONE 'UTC' >= ${WINDOW_SQL} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`, now);
    expect(body.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(recent.map((r) => r.id));
    // The fixture contributes known amounts: it is not just "equal to whatever is there".
    expect(body.unassigned).toBeGreaterThanOrEqual(2);
    expect(body.assignedToMe).toBeGreaterThanOrEqual(2);
    // Closed and cancelled tickets never count as unassigned or assigned to me, even with no owner.
    const closedUnowned = await num(`SELECT count(*) AS n FROM "Ticket" WHERE "ownerId" IS NULL AND "currentStatus" NOT IN ${OPEN}`);
    expect(closedUnowned).toBeGreaterThanOrEqual(1);
  });

  it("API-40: an Administrator gets user counts equal to raw SQL; IT Staff gets none", async () => {
    const admin = (await agents.admin.get("/api/dashboard/staff").expect(200)).body;
    const total = await num(`SELECT count(*) AS n FROM "User"`);
    const active = await num(`SELECT count(*) AS n FROM "User" WHERE "isActive" = true`);
    const byRole = await rows<{ r: string; n: bigint }>(`SELECT role::text AS r, count(*) AS n FROM "User" GROUP BY 1`);
    expect(admin.userCounts).toEqual({
      total,
      active,
      byRole: {
        REQUESTER: Number(byRole.find((r) => r.r === "REQUESTER")?.n ?? 0),
        IT_STAFF: Number(byRole.find((r) => r.r === "IT_STAFF")?.n ?? 0),
        ADMINISTRATOR: Number(byRole.find((r) => r.r === "ADMINISTRATOR")?.n ?? 0),
      },
    });
    const staff = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
    expect(staff).not.toHaveProperty("userCounts");
  });

  it("API-41: with many tickets the recent list holds at most 5 brief rows and there is no full list", async () => {
    for (let i = 0; i < 8; i++) await fx.ticket({ requesterId: ids.requester, status: "OPEN", updatedAt: new Date(Date.now() - i * 1000) });
    const body = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
    expect(body.recentlyUpdated).toHaveLength(5);
    for (const t of body.recentlyUpdated) expect(Object.keys(t).sort()).toEqual(["currentStatus", "id", "itPriority", "summary", "ticketNumber", "updatedAt"]);
    expect(body).not.toHaveProperty("tickets");
    expect(body.myRecentActions.length).toBeLessThanOrEqual(5);
  });

  it("API-42: every status and every IT priority is present as an integer, zeros kept, nothing null", async () => {
    const body = (await agents.fresh.get("/api/dashboard/staff").expect(200)).body;
    expect(Object.keys(body.byStatus).sort()).toEqual([...STATUSES].sort());
    expect(Object.keys(body.byItPriority).sort()).toEqual(["HIGH", "LOW", "MEDIUM"]);
    for (const v of [...Object.values(body.byStatus), ...Object.values(body.byItPriority), body.unassigned, body.assignedToMe, body.ticketsWithMyOpenActions]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(body.assignedToMe).toBe(0);
  });

  it("API-43: a Requester gets 403 and no session gets 401", async () => {
    await agents.requester.get("/api/dashboard/staff").expect(403);
    await request(app).get("/api/dashboard/staff").expect(401);
  });

  it("API-44: tickets one second either side of the Bangkok-midnight window start, and the same set computed by SQL for a fixed clock", async () => {
    const fixedNow = new Date("2026-10-31T10:00:00.000Z");
    dashboardClock.now = () => fixedNow;
    const start = new Date("2026-10-24T17:00:00.000Z");
    const before = await fx.ticket({ requesterId: ids.requester, status: "OPEN", updatedAt: new Date(start.getTime() - 1000) });
    const at = await fx.ticket({ requesterId: ids.requester, status: "OPEN", updatedAt: start });
    // Make these the newest tickets of the whole table for this clock, so they fill the top of the list.
    const newest = [] as number[];
    for (let i = 0; i < 4; i++) newest.push((await fx.ticket({ requesterId: ids.requester, status: "OPEN", updatedAt: new Date("2026-10-31T09:00:00.000Z") })).id);
    const body = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
    const expected = await rows<{ id: number }>(`SELECT id FROM "Ticket" WHERE "updatedAt" AT TIME ZONE 'UTC' >= ${WINDOW_SQL} ORDER BY "updatedAt" DESC, id DESC LIMIT 5`, fixedNow.toISOString());
    expect(body.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual(expected.map((r) => r.id));
    expect(body.generatedAt).toBe(fixedNow.toISOString());
    // The two boundary tickets: only the one at the start is inside, shown by the window count below.
    const inside = await num(`SELECT count(*) AS n FROM "Ticket" WHERE id IN ($2, $3) AND "updatedAt" AT TIME ZONE 'UTC' >= ${WINDOW_SQL}`, fixedNow.toISOString(), before.id, at.id);
    expect(inside).toBe(1);
    expect(newest).toHaveLength(4);
  });

  describe("current-user Actions Taken (API-55..58, BR-27)", () => {
    it("API-55: ticketsWithMyOpenActions equals raw SQL: distinct open tickets with my PLANNED or IN_PROGRESS action; resolved tickets, completed actions and other people's actions do not count", async () => {
      const open1 = await fx.ticket({ requesterId: ids.requester, status: "IN_PROGRESS", ownerId: ids.staff });
      const open2 = await fx.ticket({ requesterId: ids.requester, status: "WAITING_FOR_REQUESTER", ownerId: ids.staff });
      const resolved = await fx.ticket({ requesterId: ids.requester, status: "RESOLVED", ownerId: ids.staff });
      const closed = await fx.ticket({ requesterId: ids.requester, status: "CLOSED", ownerId: ids.staff });
      for (const status of ["PLANNED", "IN_PROGRESS"] as const) await fx.action({ ticketId: open1.id, performedById: ids.staffB, assigneeId: ids.staff, status });
      await fx.action({ ticketId: open2.id, performedById: ids.staffB, assigneeId: ids.staff, status: "PLANNED" });
      await fx.action({ ticketId: open2.id, performedById: ids.staffB, assigneeId: ids.staff, status: "COMPLETED" });
      await fx.action({ ticketId: resolved.id, performedById: ids.staffB, assigneeId: ids.staff, status: "PLANNED" });
      await fx.action({ ticketId: closed.id, performedById: ids.staffB, assigneeId: ids.staff, status: "IN_PROGRESS" });
      await fx.action({ ticketId: open1.id, performedById: ids.staff, assigneeId: ids.staffB, status: "PLANNED" });
      const body = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
      const expected = await num(
        `SELECT count(DISTINCT a."ticketId") AS n FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
          WHERE a."assigneeId" = $1 AND a.status IN ('PLANNED','IN_PROGRESS') AND t."currentStatus" IN ${OPEN}`,
        ids.staff
      );
      expect(body.ticketsWithMyOpenActions).toBe(expected);
      expect(body.ticketsWithMyOpenActions).toBeGreaterThanOrEqual(2);
      expect(Number.isInteger(body.ticketsWithMyOpenActions)).toBe(true);
    });

    it("API-56: myRecentActions is my 5 newest performed actions, actionAt then id descending, equal to raw SQL, brief fields only, description cut to 120", async () => {
      const t = await fx.ticket({ requesterId: ids.requester, status: "IN_PROGRESS", ownerId: ids.staff });
      const tie = new Date(Date.now() - 60_000);
      const longText = "x".repeat(300);
      for (let i = 0; i < 7; i++) {
        await fx.action({
          ticketId: t.id,
          performedById: ids.staff,
          status: i % 2 ? "COMPLETED" : "PLANNED",
          actionAt: i < 4 ? tie : new Date(Date.now() - i * 3_600_000),
          description: i === 0 ? longText : `Action number ${i}`,
          result: "A private result that must not appear",
          followUpNote: "A private follow-up note that must not appear",
        });
      }
      const other = await fx.action({ ticketId: t.id, performedById: ids.staffB, status: "PLANNED", actionAt: new Date(), description: "Done by someone else" });
      const body = (await agents.staff.get("/api/dashboard/staff").expect(200)).body;
      const expected = await rows<{ id: number }>(`SELECT id FROM "ActionTaken" WHERE "performedById" = $1 ORDER BY "actionAt" DESC, id DESC LIMIT 5`, ids.staff);
      expect(body.myRecentActions.map((a: { id: number }) => a.id)).toEqual(expected.map((r) => r.id));
      expect(body.myRecentActions).toHaveLength(5);
      expect(body.myRecentActions.map((a: { id: number }) => a.id)).not.toContain(other.id);
      for (const a of body.myRecentActions) {
        expect(Object.keys(a).sort()).toEqual(["actionAt", "description", "id", "status", "ticketId", "ticketNumber"]);
        const ticketRow = await getPrisma().ticket.findUniqueOrThrow({ where: { id: a.ticketId } });
        expect(a.ticketNumber).toBe(ticketRow.ticketNumber);
      }
      const json = JSON.stringify(body.myRecentActions);
      expect(json).not.toContain("private result");
      expect(json).not.toContain("private follow-up");
      const withLong = body.myRecentActions.find((a: { description: string }) => a.description.startsWith("xxx"));
      if (withLong) expect(withLong.description).toBe(`${"x".repeat(120)}…`);
    });

    it("API-56: a long description is cut to exactly 120 characters plus an ellipsis in the response", async () => {
      const t = await fx.ticket({ requesterId: ids.requester, status: "OPEN" });
      await fx.action({ ticketId: t.id, performedById: ids.fresh, description: "y".repeat(400), actionAt: new Date() });
      const body = (await agents.fresh.get("/api/dashboard/staff").expect(200)).body;
      expect(body.myRecentActions[0].description).toBe(`${"y".repeat(120)}…`);
    });

    it("API-57: a caller with no assigned and no performed actions gets 0 and [], never null or missing", async () => {
      // The "fresh" staff fixture has no actions at all at this point of the file.
      await getPrisma().actionTaken.deleteMany({ where: { OR: [{ performedById: ids.fresh }, { assigneeId: ids.fresh }] } });
      const body = (await agents.fresh.get("/api/dashboard/staff").expect(200)).body;
      expect(body.ticketsWithMyOpenActions).toBe(0);
      expect(body.myRecentActions).toEqual([]);
      expect(Object.keys(body)).toEqual(expect.arrayContaining(["ticketsWithMyOpenActions", "myRecentActions"]));
    });

    it("API-58: IT Staff and an Administrator each get their own numbers; userCounts only for the Administrator", async () => {
      const t = await fx.ticket({ requesterId: ids.requester, status: "OPEN", ownerId: ids.admin });
      await fx.action({ ticketId: t.id, performedById: ids.admin, assigneeId: ids.admin, status: "IN_PROGRESS", description: "Admin's own action" });
      const forAdmin = (await agents.admin.get("/api/dashboard/staff").expect(200)).body;
      const forStaffB = (await agents.staffB.get("/api/dashboard/staff").expect(200)).body;
      expect(forAdmin.ticketsWithMyOpenActions).toBe(
        await num(
          `SELECT count(DISTINCT a."ticketId") AS n FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
            WHERE a."assigneeId" = $1 AND a.status IN ('PLANNED','IN_PROGRESS') AND t."currentStatus" IN ${OPEN}`,
          ids.admin
        )
      );
      expect(forAdmin.myRecentActions.map((a: { description: string }) => a.description)).toContain("Admin's own action");
      expect(forStaffB.myRecentActions.map((a: { description: string }) => a.description)).not.toContain("Admin's own action");
      expect(forAdmin).toHaveProperty("userCounts");
      expect(forStaffB).not.toHaveProperty("userCounts");
    });
  });

  it("returns a safe 500 with no detail when the database fails", async () => {
    const spy = vi.spyOn(getPrisma().ticket, "count").mockRejectedValue(new Error("db host 10.0.0.5 refused the connection"));
    try {
      const response = await agents.staff.get("/api/dashboard/staff");
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to load the dashboard" });
    } finally {
      spy.mockRestore();
    }
  });
});
