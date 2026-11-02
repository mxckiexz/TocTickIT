import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { ActionStatus, Priority, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { STATUS_TRANSITIONS, statusRequiresConfirmation } from "../../src/ticketStatus.js";
import { lockTicket } from "../../src/actionsTaken.js";
import { evaluateResolutionGate, workflowHooks } from "../../src/ticketWorkflow.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 4 F4 (docs/lab-04/tests.md §2 UNIT-02; §3.2 API-20..32, 50..54, 65, 66; §3.1 API-64 status half,
// API-67 and API-68 through the gate). Status routes are exercised directly against the API, including
// calls the UI would never make.

const ALL_STATUSES = Object.keys(STATUS_TRANSITIONS) as TicketStatus[];

describe("resolution gate evaluator (UNIT-02, BR-12)", () => {
  const a = (status: ActionStatus) => ({ status });

  it("reports NO_OWNER, NO_COMPLETED_ACTION and OPEN_ACTIONS exactly when each is true", () => {
    expect(evaluateResolutionGate({ ownerId: null }, [])).toEqual(["NO_OWNER", "NO_COMPLETED_ACTION"]);
    expect(evaluateResolutionGate({ ownerId: 1 }, [])).toEqual(["NO_COMPLETED_ACTION"]);
    expect(evaluateResolutionGate({ ownerId: 1 }, [a("PLANNED")])).toEqual(["NO_COMPLETED_ACTION", "OPEN_ACTIONS"]);
    expect(evaluateResolutionGate({ ownerId: 1 }, [a("COMPLETED"), a("IN_PROGRESS")])).toEqual(["OPEN_ACTIONS"]);
    expect(evaluateResolutionGate({ ownerId: null }, [a("COMPLETED")])).toEqual(["NO_OWNER"]);
    expect(evaluateResolutionGate({ ownerId: null }, [a("PLANNED")])).toEqual(["NO_OWNER", "NO_COMPLETED_ACTION", "OPEN_ACTIONS"]);
  });

  it("passes with an owner, a COMPLETED action and nothing open; CANCELLED actions are ignored", () => {
    expect(evaluateResolutionGate({ ownerId: 1 }, [a("COMPLETED")])).toEqual([]);
    expect(evaluateResolutionGate({ ownerId: 1 }, [a("COMPLETED"), a("CANCELLED")])).toEqual([]);
    expect(evaluateResolutionGate({ ownerId: 1 }, [a("CANCELLED")])).toEqual(["NO_COMPLETED_ACTION"]);
  });
});

describe("Ticket workflow API", () => {
  const emails = {
    requester: "workflow-requester-fixture@toktickit.test",
    otherRequester: "workflow-other-requester-fixture@toktickit.test",
    staff: "workflow-staff-fixture@toktickit.test",
    staffB: "workflow-staff-b-fixture@toktickit.test",
    admin: "workflow-admin-fixture@toktickit.test",
    inactiveStaff: "workflow-inactive-staff-fixture@toktickit.test",
    ownerCandidate: "workflow-owner-candidate-fixture@toktickit.test",
  };
  let requester: request.Agent;
  let otherRequester: request.Agent;
  let staff: request.Agent;
  let staffB: request.Agent;
  let admin: request.Agent;
  const ids = {} as Record<keyof typeof emails, number>;
  const ticketIds: number[] = [];
  let categoryId: number;
  let relatedSystemId: number;

  type TicketOpts = {
    status?: TicketStatus;
    ownerId?: number | null;
    actions?: ActionStatus[];
    itPriority?: Priority;
    requesterId?: number;
  };
  async function makeTicket(o: TicketOpts = {}) {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-WF-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        requesterId: o.requesterId ?? ids.requester,
        categoryId,
        relatedSystemId,
        summary: "Workflow fixture ticket",
        description: "Fixture.",
        requestedPriority: "LOW",
        itPriority: o.itPriority ?? "LOW",
        currentStatus: o.status ?? "IN_PROGRESS",
        ownerId: o.ownerId === undefined ? ids.staff : o.ownerId,
      },
    });
    ticketIds.push(ticket.id);
    for (const status of o.actions ?? []) {
      await prisma.actionTaken.create({
        data: { ticketId: ticket.id, performedById: ids.staff, description: `fixture ${status}`, status, result: status === "COMPLETED" ? "done" : "" },
      });
    }
    return ticket.id;
  }
  const version = async (ticketId: number) => (await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } })).version;
  const row = (ticketId: number) => getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const OMIT = Symbol("omit confirm");
  const setStatus = (agent: request.Agent, ticketId: number, currentStatus: string, v: unknown, confirm: unknown = true) => {
    const body: Record<string, unknown> = { currentStatus, version: v };
    if (confirm !== OMIT) body.confirm = confirm;
    return agent.patch(`/api/staff/tickets/${ticketId}/status`).set("Origin", CLIENT_ORIGIN).send(body);
  };
  const claim = (agent: request.Agent, ticketId: number, body: object = {}) =>
    agent.post(`/api/staff/tickets/${ticketId}/claim`).set("Origin", CLIENT_ORIGIN).send(body);
  const assign = (agent: request.Agent, ticketId: number, body: object) =>
    agent.post(`/api/staff/tickets/${ticketId}/assign`).set("Origin", CLIENT_ORIGIN).send(body);
  const priority = (agent: request.Agent, ticketId: number, body: object) =>
    agent.patch(`/api/staff/tickets/${ticketId}/priority`).set("Origin", CLIENT_ORIGIN).send(body);
  const markResolved = (agent: request.Agent, ticketId: number, body: object) =>
    agent.post(`/api/tickets/${ticketId}/mark-resolved`).set("Origin", CLIENT_ORIGIN).send(body);
  const postAction = (agent: request.Agent, ticketId: number, body: object) =>
    agent.post(`/api/tickets/${ticketId}/actions`).set("Origin", CLIENT_ORIGIN).send(body);
  const patchAction = (agent: request.Agent, ticketId: number, actionId: number, body: object) =>
    agent.patch(`/api/tickets/${ticketId}/actions/${actionId}`).set("Origin", CLIENT_ORIGIN).send(body);

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      const role = key.toLowerCase().includes("requester") ? "REQUESTER" : key === "admin" ? "ADMINISTRATOR" : "IT_STAFF";
      const { user } = await createFixtureUser(emails[key], { role, isActive: key !== "inactiveStaff" });
      ids[key] = user.id;
    }
    requester = await loginAgent(emails.requester);
    otherRequester = await loginAgent(emails.otherRequester);
    staff = await loginAgent(emails.staff);
    staffB = await loginAgent(emails.staffB);
    admin = await loginAgent(emails.admin);
    categoryId = (await getPrisma().category.findFirstOrThrow({ where: { isActive: true } })).id;
    relatedSystemId = (await getPrisma().relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.actionTakenRevision.deleteMany({ where: { actionTaken: { ticketId: { in: ticketIds } } } });
    await prisma.actionTaken.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    for (const email of Object.values(emails)) await deleteFixtureUser(email);
  });

  beforeEach(() => {
    workflowHooks.afterOwnerCheck = undefined;
    workflowHooks.beforeWrite = undefined;
  });

  describe("status matrix, called directly (API-20, 21, 22, BR-11)", () => {
    it("API-20: every allowed cell of the matrix succeeds (gate satisfied for RESOLVED), the status changes and the version rises by 1", async () => {
      for (const from of ALL_STATUSES) {
        for (const to of STATUS_TRANSITIONS[from]) {
          const ticketId = await makeTicket({ status: from, actions: ["COMPLETED"] });
          const v = await version(ticketId);
          const response = await setStatus(staff, ticketId, to, v, statusRequiresConfirmation(to) ? true : OMIT);
          expect(response.status, `${from} -> ${to}`).toBe(200);
          expect(response.body.ticket.currentStatus).toBe(to);
          expect(response.body.ticket.version).toBe(v + 1);
          expect((await row(ticketId)).currentStatus).toBe(to);
        }
      }
    });

    it("API-21: every other cell, including every self-transition, is 409 ILLEGAL_TRANSITION and changes nothing", async () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          if (STATUS_TRANSITIONS[from].includes(to)) continue;
          // No owner and no actions: the matrix is checked before the gate, so this must still be ILLEGAL_TRANSITION.
          const ticketId = await makeTicket({ status: from, ownerId: null });
          const v = await version(ticketId);
          const response = await setStatus(staff, ticketId, to, v);
          expect(response.status, `${from} -> ${to}`).toBe(409);
          expect(response.body.code, `${from} -> ${to}`).toBe("ILLEGAL_TRANSITION");
          const after = await row(ticketId);
          expect(after.currentStatus).toBe(from);
          expect(after.version).toBe(v);
        }
      }
    });

    it("API-22: a Requester gets 403 and nothing changes; an Administrator's legal change is 200 with the same body shape as IT Staff", async () => {
      const t1 = await makeTicket({ status: "NEW" });
      const forbidden = await setStatus(requester, t1, "OPEN", await version(t1)).expect(403);
      expect(forbidden.body.error).toEqual(expect.any(String));
      expect((await row(t1)).currentStatus).toBe("NEW");
      const t2 = await makeTicket({ status: "NEW" });
      const t3 = await makeTicket({ status: "NEW" });
      const byStaff = await setStatus(staff, t2, "OPEN", await version(t2)).expect(200);
      const byAdmin = await setStatus(admin, t3, "OPEN", await version(t3)).expect(200);
      expect(Object.keys(byAdmin.body.ticket).sort()).toEqual(Object.keys(byStaff.body.ticket).sort());
      expect(Object.keys(byAdmin.body).sort()).toEqual(Object.keys(byStaff.body).sort());
      expect(byAdmin.body.ticket.allowedTransitions).toEqual(STATUS_TRANSITIONS.OPEN);
    });

    it("an unknown status value, a missing status and a missing confirm are 400; the order is 400, 404, then the 409s", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED"] });
      const v = await version(ticketId);
      expect((await setStatus(staff, ticketId, "DONE", v).expect(400)).body.errors.currentStatus).toEqual(expect.any(String));
      expect((await setStatus(staff, ticketId, undefined as never, v).expect(400)).body.errors.currentStatus).toEqual(expect.any(String));
      expect((await setStatus(staff, ticketId, "RESOLVED", v, false).expect(400)).body.errors.confirm).toEqual(expect.any(String));
      await setStatus(staff, 99999999, "OPEN", 1).expect(404);
      await staff.patch("/api/staff/tickets/abc/status").set("Origin", CLIENT_ORIGIN).send({ currentStatus: "OPEN", version: 1 }).expect(400);
      expect((await row(ticketId)).currentStatus).toBe("IN_PROGRESS");
    });
  });

  describe("resolution gate through the status route (API-23, 24, 25, 32, 67, 68, BR-12)", () => {
    it("API-23: RESOLVED with no owner is 409 RESOLUTION_GATE listing NO_OWNER, and the ticket is unchanged", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", ownerId: null, actions: ["COMPLETED"] });
      const response = await setStatus(staff, ticketId, "RESOLVED", await version(ticketId)).expect(409);
      expect(response.body).toMatchObject({ code: "RESOLUTION_GATE", unmet: ["NO_OWNER"] });
      expect((await row(ticketId)).currentStatus).toBe("IN_PROGRESS");
    });

    it("API-24: an owner but no COMPLETED action is 409 listing NO_COMPLETED_ACTION (a CANCELLED action does not count)", async () => {
      const none = await makeTicket({ status: "IN_PROGRESS" });
      expect((await setStatus(staff, none, "RESOLVED", await version(none)).expect(409)).body.unmet).toEqual(["NO_COMPLETED_ACTION"]);
      const cancelled = await makeTicket({ status: "IN_PROGRESS", actions: ["CANCELLED"] });
      expect((await setStatus(staff, cancelled, "RESOLVED", await version(cancelled)).expect(409)).body.unmet).toEqual(["NO_COMPLETED_ACTION"]);
    });

    it("API-25: a PLANNED or IN_PROGRESS action is 409 OPEN_ACTIONS; once completed or cancelled the transition succeeds", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED", "PLANNED", "IN_PROGRESS"] });
      const blocked = await setStatus(staff, ticketId, "RESOLVED", await version(ticketId)).expect(409);
      expect(blocked.body).toMatchObject({ code: "RESOLUTION_GATE", unmet: ["OPEN_ACTIONS"] });
      const open = await getPrisma().actionTaken.findMany({ where: { ticketId, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
      await getPrisma().actionTaken.update({ where: { id: open[0].id }, data: { status: "COMPLETED", result: "done" } });
      await getPrisma().actionTaken.update({ where: { id: open[1].id }, data: { status: "CANCELLED" } });
      const ok = await setStatus(staff, ticketId, "RESOLVED", await version(ticketId)).expect(200);
      expect(ok.body.ticket.currentStatus).toBe("RESOLVED");
    });

    it("API-32: RESOLVED without confirm on a ticket that also fails the gate is 400 first; with confirm it is 409", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", ownerId: null });
      const v = await version(ticketId);
      await setStatus(staff, ticketId, "RESOLVED", v, OMIT).expect(400);
      await setStatus(staff, ticketId, "RESOLVED", v, true).expect(409);
    });

    it("API-67 and API-68 through the gate: after RESOLVED an open action is refused; after reopening it is accepted and blocks resolving again until completed", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED"] });
      await setStatus(staff, ticketId, "RESOLVED", await version(ticketId)).expect(200);
      for (const status of ["PLANNED", "IN_PROGRESS"]) {
        expect((await postAction(staff, ticketId, { description: "late", status }).expect(409)).body.code).toBe("TICKET_RESOLVED");
      }
      await postAction(staff, ticketId, { description: "late record", status: "COMPLETED", result: "verified" }).expect(201);
      expect(await getPrisma().actionTaken.count({ where: { ticketId, status: { in: ["PLANNED", "IN_PROGRESS"] } } })).toBe(0);
      await setStatus(staff, ticketId, "REOPENED", await version(ticketId)).expect(200);
      const planned = (await postAction(staff, ticketId, { description: "follow-up work" }).expect(201)).body;
      await setStatus(staff, ticketId, "IN_PROGRESS", await version(ticketId)).expect(200);
      const gate = await setStatus(staff, ticketId, "RESOLVED", await version(ticketId)).expect(409);
      expect(gate.body).toMatchObject({ code: "RESOLUTION_GATE", unmet: ["OPEN_ACTIONS"] });
      await patchAction(staff, ticketId, planned.id, { version: 1, status: "COMPLETED", result: "done again" }).expect(200);
      await setStatus(staff, ticketId, "RESOLVED", await version(ticketId)).expect(200);
    });
  });

  describe("advisory Requester signal (API-27, BR-15)", () => {
    it("API-27: marking 'appears resolved' leaves currentStatus and the gate result unchanged and records who and when", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS" });
      const gateBefore = (await staff.get(`/api/staff/tickets/${ticketId}`).expect(200)).body.ticket.resolutionGate;
      const v = await version(ticketId);
      const response = await markResolved(requester, ticketId, { version: v }).expect(200);
      expect(response.body.currentStatus).toBe("IN_PROGRESS");
      expect(response.body.version).toBe(v + 1);
      const after = await row(ticketId);
      expect(after.currentStatus).toBe("IN_PROGRESS");
      expect(after.requesterMarkedResolvedById).toBe(ids.requester);
      expect(after.requesterMarkedResolvedAt).not.toBeNull();
      const gateAfter = (await staff.get(`/api/staff/tickets/${ticketId}`).expect(200)).body.ticket.resolutionGate;
      expect(gateAfter).toEqual(gateBefore);
      expect(gateAfter.ok).toBe(false);
    });

    it("a Requester cannot mark another Requester's ticket (404), and a RESOLVED or CLOSED ticket is 409 (BR-40)", async () => {
      const ticketId = await makeTicket();
      await markResolved(otherRequester, ticketId, { version: await version(ticketId) }).expect(404);
      for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as TicketStatus[]) {
        const t = await makeTicket({ status });
        await markResolved(requester, t, { version: await version(t) }).expect(409);
      }
    });
  });

  describe("optimistic locking on every state-changing ticket route (API-28, 29, 30, 65, 66, BR-17)", () => {
    it("API-28: a stale version is 409 STALE_VERSION with currentVersion; none or a non-integer is 400 at version; nothing changes", async () => {
      const ticketId = await makeTicket({ status: "NEW" });
      const v = await version(ticketId);
      await setStatus(staff, ticketId, "OPEN", v).expect(200);
      const stale = await setStatus(staff, ticketId, "IN_PROGRESS", v).expect(409);
      expect(stale.body).toMatchObject({ code: "STALE_VERSION", currentVersion: v + 1 });
      for (const bad of [undefined, "1", 1.5, null]) {
        const response = await setStatus(staff, ticketId, "IN_PROGRESS", bad).expect(400);
        expect(response.body.errors.version, String(bad)).toEqual(expect.any(String));
      }
      const after = await row(ticketId);
      expect(after.currentStatus).toBe("OPEN");
      expect(after.version).toBe(v + 1);
    });

    it("API-29: a successful status change returns the new status, version, allowedTransitions and resolutionGate", async () => {
      const ticketId = await makeTicket({ status: "NEW" });
      const response = await setStatus(staff, ticketId, "IN_PROGRESS", await version(ticketId)).expect(200);
      expect(response.body.ticket).toMatchObject({
        id: ticketId,
        currentStatus: "IN_PROGRESS",
        allowedTransitions: STATUS_TRANSITIONS.IN_PROGRESS,
        resolutionGate: { ok: false, unmet: ["NO_COMPLETED_ACTION"] },
      });
      expect(typeof response.body.ticket.version).toBe("number");
    });

    const routes: Array<[string, (ticketId: number, v: unknown, agent?: request.Agent) => request.Test, () => Promise<number>]> = [
      ["claim", (t, v, a = staff) => claim(a, t, { version: v }), () => makeTicket({ ownerId: null })],
      ["assign", (t, v, a = staff) => assign(a, t, { ownerId: ids.staffB, version: v }), () => makeTicket({ ownerId: null })],
      ["priority", (t, v, a = staff) => priority(a, t, { itPriority: "HIGH", version: v }), () => makeTicket()],
      ["mark-resolved", (t, v, a = requester) => markResolved(a, t, { version: v }), () => makeTicket()],
    ];
    for (const [name, call, make] of routes) {
      it(`API-30: ${name} with the current version succeeds and bumps it by 1; a stale one is 409; none is 400 at version; the last two write nothing`, async () => {
        const ticketId = await make();
        const v = await version(ticketId);
        const snapshot = await row(ticketId);
        const missing = await call(ticketId, undefined).expect(400);
        expect(missing.body.errors.version).toEqual(expect.any(String));
        await call(ticketId, "1").expect(400);
        expect(await row(ticketId)).toEqual(snapshot);
        const ok = await call(ticketId, v).expect(200);
        expect(ok.body.version).toBe(v + 1);
        expect((await row(ticketId)).version).toBe(v + 1);
        const afterOk = await row(ticketId);
        const stale = await call(ticketId, v).expect(409);
        expect(stale.body).toMatchObject({ code: "STALE_VERSION", currentVersion: v + 1 });
        expect(await row(ticketId)).toEqual(afterOk);
      });
    }

    it("API-30: a claim of an already-owned ticket is still 409 and does not bump the version", async () => {
      const ticketId = await makeTicket({ ownerId: ids.staffB });
      const v = await version(ticketId);
      const response = await claim(staff, ticketId, { version: v }).expect(409);
      expect(response.body.error).toEqual(expect.any(String));
      expect(await version(ticketId)).toBe(v);
    });

    it("API-65: two callers claim, assign or change priority from the same loaded version at once: exactly one succeeds and its value is the stored one", async () => {
      for (let round = 0; round < 5; round++) {
        const t1 = await makeTicket({ ownerId: null });
        const v1 = await version(t1);
        const [c1, c2] = await Promise.all([claim(staff, t1, { version: v1 }), claim(staffB, t1, { version: v1 })]);
        expect([c1.status, c2.status].sort()).toEqual([200, 409]);
        expect((await row(t1)).ownerId).toBe(c1.status === 200 ? ids.staff : ids.staffB);

        const t2 = await makeTicket({ ownerId: null });
        const v2 = await version(t2);
        const [a1, a2] = await Promise.all([
          assign(staff, t2, { ownerId: ids.staff, version: v2 }),
          assign(admin, t2, { ownerId: ids.staffB, version: v2 }),
        ]);
        expect([a1.status, a2.status].sort()).toEqual([200, 409]);
        expect((await row(t2)).ownerId).toBe(a1.status === 200 ? ids.staff : ids.staffB);

        const t3 = await makeTicket();
        const v3 = await version(t3);
        const [p1, p2] = await Promise.all([
          priority(staff, t3, { itPriority: "HIGH", version: v3 }),
          priority(staffB, t3, { itPriority: "MEDIUM", version: v3 }),
        ]);
        expect([p1.status, p2.status].sort()).toEqual([200, 409]);
        expect((await row(t3)).itPriority).toBe(p1.status === 200 ? "HIGH" : "MEDIUM");
        expect((await row(t3)).version).toBe(v3 + 1);
      }
    });

    it("API-66: a comment and a note need no version and do not bump the ticket version", async () => {
      const ticketId = await makeTicket();
      const v = await version(ticketId);
      await staff.post(`/api/tickets/${ticketId}/comments`).set("Origin", CLIENT_ORIGIN).send({ body: "hello" }).expect(201);
      await staff.post(`/api/tickets/${ticketId}/notes`).set("Origin", CLIENT_ORIGIN).send({ body: "internal" }).expect(201);
      expect(await version(ticketId)).toBe(v);
    });
  });

  describe("the write itself enforces the loaded version (BR-17, D-4, API-73)", () => {
    // The Ticket lock already serializes these routes, so a stale caller is normally stopped by
    // the version comparison made under the lock. These tests bump the version through the same
    // transaction after that comparison and before the write, which only the write's own
    // `WHERE id = ? AND version = ?` can still catch.
    const bump = async (tx: Parameters<NonNullable<typeof workflowHooks.beforeWrite>>[0], ticketId: number) => {
      await tx.ticket.update({ where: { id: ticketId }, data: { version: { increment: 1 } } });
    };
    const cases: Array<[string, TicketOpts, (t: number, v: number) => request.Test, (before: Awaited<ReturnType<typeof row>>, after: Awaited<ReturnType<typeof row>>) => void]> = [
      ["claim", { ownerId: null }, (t, v) => claim(staff, t, { version: v }), (b, a) => expect(a.ownerId).toBe(b.ownerId)],
      ["assign", { ownerId: null }, (t, v) => assign(staff, t, { ownerId: ids.staffB, version: v }), (b, a) => expect(a.ownerId).toBe(b.ownerId)],
      ["priority", { itPriority: "LOW" }, (t, v) => priority(staff, t, { itPriority: "HIGH", version: v }), (b, a) => expect(a.itPriority).toBe(b.itPriority)],
      ["status", { status: "NEW" }, (t, v) => setStatus(staff, t, "OPEN", v), (b, a) => expect(a.currentStatus).toBe(b.currentStatus)],
      [
        "mark-resolved",
        {},
        (t, v) => markResolved(requester, t, { version: v }),
        (b, a) => {
          expect(a.requesterMarkedResolvedAt).toBeNull();
          expect(a.requesterMarkedResolvedById).toBeNull();
        },
      ],
    ];
    for (const [name, opts, call, unchanged] of cases) {
      it(`${name}: a version that changes after the check but before the write is 409 STALE_VERSION and the row is not modified`, async () => {
        const ticketId = await makeTicket(opts);
        const before = await row(ticketId);
        workflowHooks.beforeWrite = (tx) => bump(tx, ticketId);
        const response = await call(ticketId, before.version).expect(409);
        workflowHooks.beforeWrite = undefined;
        expect(response.body).toMatchObject({ code: "STALE_VERSION", currentVersion: before.version + 1 });
        const after = await row(ticketId);
        unchanged(before, after);
        // The only change is the simulated writer's own bump; the request added nothing.
        expect(after.version).toBe(before.version + 1);
        expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
      });
    }

    it("a request that sends the version it actually loaded still succeeds when nothing intervenes", async () => {
      const ticketId = await makeTicket({ ownerId: null });
      const v = await version(ticketId);
      workflowHooks.beforeWrite = () => undefined;
      await claim(staff, ticketId, { version: v }).expect(200);
      expect(await version(ticketId)).toBe(v + 1);
    });
  });

  describe("staff detail and Requester detail carry version, transitions and gate (API-31, FR-12)", () => {
    it("API-31: IT Staff and Administrator get version, allowedTransitions and resolutionGate, identical for both roles", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", actions: ["PLANNED"] });
      const forStaff = (await staff.get(`/api/staff/tickets/${ticketId}`).expect(200)).body.ticket;
      const forAdmin = (await admin.get(`/api/staff/tickets/${ticketId}`).expect(200)).body.ticket;
      expect(forStaff.version).toBe(await version(ticketId));
      expect(forStaff.allowedTransitions).toEqual(STATUS_TRANSITIONS.IN_PROGRESS);
      expect(forStaff.resolutionGate).toEqual({ ok: false, unmet: ["NO_COMPLETED_ACTION", "OPEN_ACTIONS"] });
      expect(forAdmin.allowedTransitions).toEqual(forStaff.allowedTransitions);
      expect(forAdmin.resolutionGate).toEqual(forStaff.resolutionGate);
    });

    it("the gate reports ok when it passes, and the Requester's own detail carries the version needed to mark resolved", async () => {
      const ticketId = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED"] });
      expect((await staff.get(`/api/staff/tickets/${ticketId}`).expect(200)).body.ticket.resolutionGate).toEqual({ ok: true, unmet: [] });
      expect((await requester.get(`/api/tickets/${ticketId}`).expect(200)).body.version).toBe(await version(ticketId));
    });
  });

  describe("Administrator performs IT Staff behavior (API-50, 51, 52, 53, 54, BR-26)", () => {
    it("API-50: an Administrator claims, assigns, sets priority, changes status, posts a comment and a note, creates and edits an action; each succeeds with the IT Staff shape", async () => {
      const t = await makeTicket({ ownerId: null, status: "NEW" });
      const claimed = await claim(admin, t, { version: await version(t) }).expect(200);
      expect(claimed.body.ownerId).toBe(ids.admin);
      const assigned = await assign(admin, t, { ownerId: ids.staffB, version: await version(t) }).expect(200);
      expect(assigned.body.ownerId).toBe(ids.staffB);
      await priority(admin, t, { itPriority: "HIGH", version: await version(t) }).expect(200);
      await setStatus(admin, t, "OPEN", await version(t)).expect(200);
      await admin.post(`/api/tickets/${t}/comments`).set("Origin", CLIENT_ORIGIN).send({ body: "admin comment" }).expect(201);
      await admin.post(`/api/tickets/${t}/notes`).set("Origin", CLIENT_ORIGIN).send({ body: "admin note" }).expect(201);
      const action = (await postAction(admin, t, { description: "admin action" }).expect(201)).body;
      await patchAction(admin, t, action.id, { version: 1, description: "edited by admin" }).expect(200);
      const t2 = await makeTicket({ ownerId: null });
      const byStaff = await claim(staff, t2, { version: await version(t2) }).expect(200);
      expect(Object.keys(claimed.body).sort()).toEqual(Object.keys(byStaff.body).sort());
    });

    it("API-51: the same calls as a Requester are 403 (a comment on their own ticket stays 201)", async () => {
      const t = await makeTicket({ ownerId: null });
      const v = await version(t);
      await claim(requester, t, { version: v }).expect(403);
      await assign(requester, t, { ownerId: ids.staff, version: v }).expect(403);
      await priority(requester, t, { itPriority: "HIGH", version: v }).expect(403);
      await setStatus(requester, t, "OPEN", v).expect(403);
      await requester.post(`/api/tickets/${t}/notes`).set("Origin", CLIENT_ORIGIN).send({ body: "x" }).expect(403);
      await requester.get(`/api/tickets/${t}/notes`).expect(403);
      await requester.get("/api/staff/assignable-users").expect(403);
      await postAction(requester, t, { description: "x" }).expect(403);
      await requester.post(`/api/tickets/${t}/comments`).set("Origin", CLIENT_ORIGIN).send({ body: "my own comment" }).expect(201);
      const after = await row(t);
      expect(after).toMatchObject({ ownerId: null, itPriority: "LOW", version: v });
    });

    it("API-52: assign accepts an active IT Staff and an active Administrator, and rejects an inactive user, a Requester and a missing id with 400", async () => {
      const t = await makeTicket({ ownerId: null });
      await assign(staff, t, { ownerId: ids.staffB, version: await version(t) }).expect(200);
      await assign(staff, t, { ownerId: ids.admin, version: await version(t) }).expect(200);
      expect((await row(t)).ownerId).toBe(ids.admin);
      for (const ownerId of [ids.inactiveStaff, ids.requester, 99999999]) {
        const response = await assign(staff, t, { ownerId, version: await version(t) }).expect(400);
        expect(response.body.errors.ownerId, String(ownerId)).toEqual(expect.any(String));
      }
      expect((await assign(staff, t, { version: await version(t) }).expect(400)).body.errors.ownerId).toEqual(expect.any(String));
      expect((await row(t)).ownerId).toBe(ids.admin);
    });

    it("API-52: an owner made ineligible between the early check and the write is 400 and nothing is written (re-checked in the transaction)", async () => {
      for (const change of [{ isActive: false }, { role: "REQUESTER" as const }]) {
        const t = await makeTicket({ ownerId: null });
        await getPrisma().user.update({ where: { id: ids.ownerCandidate }, data: { isActive: true, role: "IT_STAFF" } });
        workflowHooks.afterOwnerCheck = async () => {
          await getPrisma().user.update({ where: { id: ids.ownerCandidate }, data: change });
        };
        const v = await version(t);
        const response = await assign(staff, t, { ownerId: ids.ownerCandidate, version: v }).expect(400);
        expect(response.body.errors.ownerId).toEqual(expect.any(String));
        expect(await row(t)).toMatchObject({ ownerId: null, version: v });
        workflowHooks.afterOwnerCheck = undefined;
      }
      await getPrisma().user.update({ where: { id: ids.ownerCandidate }, data: { isActive: true, role: "IT_STAFF" } });
    });

    it("API-53: assignable users lists active IT Staff and Administrators, ordered by name, for both staff roles; 403 for a Requester; 401 with no session", async () => {
      const forStaff = (await staff.get("/api/staff/assignable-users").expect(200)).body as Array<{ id: number; name: string }>;
      const forAdmin = (await admin.get("/api/staff/assignable-users").expect(200)).body;
      expect(forAdmin).toEqual(forStaff);
      const idsListed = forStaff.map((u) => u.id);
      expect(idsListed).toEqual(expect.arrayContaining([ids.staff, ids.staffB, ids.admin]));
      expect(idsListed).not.toContain(ids.inactiveStaff);
      expect(idsListed).not.toContain(ids.requester);
      const names = forStaff.map((u) => u.name);
      expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      await requester.get("/api/staff/assignable-users").expect(403);
      await request(app).get("/api/staff/assignable-users").expect(401);
    });

    it("API-54: an Administrator who claimed a ticket is its owner and passes the gate's owner rule", async () => {
      const t = await makeTicket({ ownerId: null, actions: ["COMPLETED"] });
      await claim(admin, t, { version: await version(t) }).expect(200);
      const gate = (await admin.get(`/api/staff/tickets/${t}`).expect(200)).body.ticket.resolutionGate;
      expect(gate.unmet).not.toContain("NO_OWNER");
      expect(gate.ok).toBe(true);
      await setStatus(admin, t, "RESOLVED", await version(t)).expect(200);
    });
  });

  describe("concurrency with the ticket lock (API-26, API-64 status half, BR-13)", () => {
    it("API-26: RESOLVED fired together with an action create, 20 rounds, always ends in one of the two serial orders and never a resolved ticket with an open action", async () => {
      let resolvedFirst = 0;
      let actionFirst = 0;
      for (let round = 0; round < 20; round++) {
        const t = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED"] });
        const v = await version(t);
        const [status, created] = await Promise.all([setStatus(staff, t, "RESOLVED", v), postAction(staffB, t, { description: `race ${round}` })]);
        const open = await getPrisma().actionTaken.count({ where: { ticketId: t, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
        const final = (await row(t)).currentStatus;
        if (status.status === 200) {
          expect(created.status).toBe(409);
          expect(created.body.code).toBe("TICKET_RESOLVED");
          expect(final).toBe("RESOLVED");
          expect(open).toBe(0);
          resolvedFirst++;
        } else {
          expect(status.status).toBe(409);
          expect(status.body).toMatchObject({ code: "RESOLUTION_GATE", unmet: ["OPEN_ACTIONS"] });
          expect(created.status).toBe(201);
          expect(final).toBe("IN_PROGRESS");
          expect(open).toBe(1);
          actionFirst++;
        }
      }
      expect(resolvedFirst + actionFirst).toBe(20);
    });

    it("API-26: RESOLVED fired together with completing the only open action, 20 rounds: either order is valid and the invariant holds", async () => {
      for (let round = 0; round < 20; round++) {
        const t = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED", "PLANNED"] });
        const open = await getPrisma().actionTaken.findFirstOrThrow({ where: { ticketId: t, status: "PLANNED" } });
        const v = await version(t);
        const [status, edit] = await Promise.all([
          setStatus(staff, t, "RESOLVED", v),
          patchAction(staffB, t, open.id, { version: 1, status: "COMPLETED", result: "done" }),
        ]);
        expect(edit.status).toBe(status.status === 200 ? 409 : 200);
        if (status.status === 200) expect(edit.body.code).toBe("TICKET_RESOLVED");
        else expect(status.body.code).toBe("RESOLUTION_GATE");
        const stillOpen = await getPrisma().actionTaken.count({ where: { ticketId: t, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
        if ((await row(t)).currentStatus === "RESOLVED") expect(stillOpen).toBe(0);
      }
    });

    it("API-26: with the ticket lock held elsewhere, an action create, an action edit and a status change all wait until it is released", async () => {
      const t = await makeTicket({ status: "IN_PROGRESS", actions: ["COMPLETED", "PLANNED"] });
      const planned = await getPrisma().actionTaken.findFirstOrThrow({ where: { ticketId: t, status: "PLANNED" } });
      const v = await version(t);
      const settled = { create: false, edit: false, status: false };
      let pending: Promise<unknown>[] = [];
      await getPrisma().$transaction(
        async (tx) => {
          await lockTicket(tx, t);
          pending = [
            postAction(staff, t, { description: "waits" }).then((r) => ((settled.create = true), r)),
            patchAction(staffB, t, planned.id, { version: 1, description: "waits too" }).then((r) => ((settled.edit = true), r)),
            setStatus(admin, t, "WAITING_FOR_REQUESTER", v).then((r) => ((settled.status = true), r)),
          ];
          await new Promise((resolve) => setTimeout(resolve, 600));
          expect(settled).toEqual({ create: false, edit: false, status: false });
        },
        { timeout: 20_000 }
      );
      const results = (await Promise.all(pending)) as Array<{ status: number }>;
      expect(results.map((r) => r.status)).toEqual([201, 200, 200]);
    });

    it("API-64: status changes, action edits and action creates running together never deadlock or 500 (20 rounds)", async () => {
      const t = await makeTicket({ status: "NEW", actions: ["PLANNED"] });
      const planned = await getPrisma().actionTaken.findFirstOrThrow({ where: { ticketId: t } });
      let actionVersion = 1;
      let status: TicketStatus = "NEW";
      const toggle: Record<string, TicketStatus> = { NEW: "OPEN", OPEN: "IN_PROGRESS", IN_PROGRESS: "WAITING_FOR_REQUESTER", WAITING_FOR_REQUESTER: "IN_PROGRESS" };
      for (let round = 0; round < 20; round++) {
        const next: TicketStatus = toggle[status];
        const [s, e, c] = await Promise.all([
          setStatus(staff, t, next, await version(t)),
          patchAction(staffB, t, planned.id, { version: actionVersion, description: `edit ${round}` }),
          postAction(admin, t, { description: `create ${round}` }),
        ]);
        for (const r of [s, e, c]) expect(r.status).toBeLessThan(500);
        expect(e.status).toBe(200);
        expect(c.status).toBe(201);
        actionVersion = e.body.version;
        if (s.status === 200) status = next;
      }
      expect(status).not.toBe("NEW");
    });
  });
});
