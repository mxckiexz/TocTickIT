import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import type { ActionStatus, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import {
  actionsTakenHooks,
  isAllowedActionEditMove,
  isAllowedActionCreateStatus,
  validateActionFields,
  resolveActionCreate,
  resolveActionEdit,
} from "../../src/actionsTaken.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 4 F3 (docs/lab-04/tests.md §2 UNIT-01, UNIT-03; §3.1 API-01..19, 46..49, 60..64, 69).
// The ticket-status routes belong to F4, so tickets are put in a given status
// directly in the database here.

const ALL_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const NOW = new Date("2026-10-14T10:00:00.000Z");
const iso = (d: Date) => d.toISOString();

describe("action status moves (UNIT-01, BR-06)", () => {
  const allowedEdit: Array<[ActionStatus, ActionStatus]> = [
    ["PLANNED", "IN_PROGRESS"],
    ["PLANNED", "COMPLETED"],
    ["PLANNED", "CANCELLED"],
    ["IN_PROGRESS", "COMPLETED"],
    ["IN_PROGRESS", "CANCELLED"],
  ];

  it("on edit allows exactly the five moves and nothing else, generated over every pair", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = allowedEdit.some(([f, t]) => f === from && t === to);
        expect(isAllowedActionEditMove(from, to), `${from} -> ${to}`).toBe(expected);
      }
    }
  });

  it("an unchanged status is not a move: the edit helper still reports it as not a move", () => {
    for (const status of ALL_STATUSES) expect(isAllowedActionEditMove(status, status)).toBe(false);
  });

  it("on create allows PLANNED, IN_PROGRESS and COMPLETED, never CANCELLED or an unknown value", () => {
    expect(isAllowedActionCreateStatus("PLANNED")).toBe(true);
    expect(isAllowedActionCreateStatus("IN_PROGRESS")).toBe(true);
    expect(isAllowedActionCreateStatus("COMPLETED")).toBe(true);
    expect(isAllowedActionCreateStatus("CANCELLED")).toBe(false);
    expect(isAllowedActionCreateStatus("DONE")).toBe(false);
    expect(isAllowedActionCreateStatus(undefined)).toBe(false);
  });
});

describe("action validator (UNIT-03, BR-03, BR-04, BR-05, BR-06)", () => {
  const create = (body: unknown) => {
    const fields = validateActionFields(body, NOW);
    return fields.errors ? { errors: fields.errors } : resolveActionCreate(fields.values, NOW);
  };

  it("trims the description and measures length after trimming: 1 to 2000", () => {
    expect(create({ description: "  fix the dock \n" })).toMatchObject({ values: { description: "fix the dock" } });
    expect(create({ description: "a".repeat(2000) })).toHaveProperty("values");
    expect(create({ description: ` ${"a".repeat(2000)} ` })).toHaveProperty("values");
    for (const bad of ["", "   ", "\n\t", "a".repeat(2001), undefined, null, 5, {}]) {
      expect(create({ description: bad }), JSON.stringify(bad)).toHaveProperty("errors.description");
    }
  });

  it("limits result, followUpNote and attachmentNotes (2000, 1000, 1000) and rejects non-strings", () => {
    const base = { description: "x" };
    expect(create({ ...base, result: "a".repeat(2001) })).toHaveProperty("errors.result");
    expect(create({ ...base, result: "a".repeat(2000) })).toHaveProperty("values");
    expect(create({ ...base, followUpRequired: true, followUpNote: "a".repeat(1001) })).toHaveProperty("errors.followUpNote");
    expect(create({ ...base, attachmentNotes: "a".repeat(1001) })).toHaveProperty("errors.attachmentNotes");
    expect(create({ ...base, attachmentNotes: "a".repeat(1000) })).toHaveProperty("values");
    expect(create({ ...base, result: 5 })).toHaveProperty("errors.result");
    expect(create({ ...base, followUpRequired: "yes" })).toHaveProperty("errors.followUpRequired");
  });

  it("requires a follow-up note when follow-up is required, and stores it empty when it is not (BR-04)", () => {
    expect(create({ description: "x", followUpRequired: true })).toHaveProperty("errors.followUpNote");
    expect(create({ description: "x", followUpRequired: true, followUpNote: "   " })).toHaveProperty("errors.followUpNote");
    expect(create({ description: "x", followUpRequired: true, followUpNote: "call back" })).toMatchObject({
      values: { followUpRequired: true, followUpNote: "call back" },
    });
    expect(create({ description: "x", followUpRequired: false, followUpNote: "ignored" })).toMatchObject({
      values: { followUpRequired: false, followUpNote: "" },
    });
  });

  it("allows actionAt in the past and up to 5 minutes ahead, rejects later or not a date (BR-05)", () => {
    const at = (offsetMs: number) => iso(new Date(NOW.getTime() + offsetMs));
    expect(create({ description: "x", actionAt: at(-30 * 86_400_000) })).toHaveProperty("values");
    expect(create({ description: "x", actionAt: at(5 * 60_000) })).toHaveProperty("values");
    expect(create({ description: "x", actionAt: at(5 * 60_000 + 1) })).toHaveProperty("errors.actionAt");
    for (const bad of ["tomorrow", "2026-13-45", 12, {}, ""]) {
      expect(create({ description: "x", actionAt: bad }), String(bad)).toHaveProperty("errors.actionAt");
    }
  });

  it("defaults the status to PLANNED, requires a result for COMPLETED, rejects CANCELLED on create", () => {
    expect(create({ description: "x" })).toMatchObject({ values: { status: "PLANNED", result: "" } });
    expect(create({ description: "x", status: "COMPLETED" })).toHaveProperty("errors.result");
    expect(create({ description: "x", status: "COMPLETED", result: "  " })).toHaveProperty("errors.result");
    expect(create({ description: "x", status: "COMPLETED", result: "done" })).toHaveProperty("values");
    expect(create({ description: "x", status: "CANCELLED" })).toHaveProperty("errors.status");
    expect(create({ description: "x", status: "WHATEVER" })).toHaveProperty("errors.status");
  });

  it("on edit merges the stored values, checks the move, and requires a result when the resulting status is COMPLETED", () => {
    const stored = {
      status: "PLANNED" as ActionStatus,
      assigneeId: null,
      actionAt: NOW,
      description: "old",
      result: "",
      followUpRequired: false,
      followUpNote: "",
      attachmentNotes: "",
    };
    const edit = (body: unknown) => {
      const fields = validateActionFields(body, NOW);
      return fields.errors ? { errors: fields.errors } : resolveActionEdit(stored, fields.values);
    };
    expect(edit({ description: "new" })).toMatchObject({ values: { description: "new", status: "PLANNED" } });
    expect(edit({ status: "PLANNED", description: "new" })).toHaveProperty("values");
    expect(edit({ status: "IN_PROGRESS" })).toHaveProperty("values");
    expect(edit({ status: "COMPLETED" })).toHaveProperty("errors.result");
    expect(edit({ status: "COMPLETED", result: "ok" })).toHaveProperty("values");
    expect(edit({ followUpRequired: true })).toHaveProperty("errors.followUpNote");
    const inProgress = { ...stored, status: "IN_PROGRESS" as ActionStatus };
    const back = resolveActionEdit(inProgress, { status: "PLANNED" });
    expect(back).toHaveProperty("errors.status");
  });
});

describe("Actions Taken API", () => {
  const emails = {
    requester: "actions-requester-fixture@toktickit.test",
    otherRequester: "actions-other-requester-fixture@toktickit.test",
    staff: "actions-staff-fixture@toktickit.test",
    staffB: "actions-staff-b-fixture@toktickit.test",
    admin: "actions-admin-fixture@toktickit.test",
    inactiveStaff: "actions-inactive-staff-fixture@toktickit.test",
  };
  let requester: request.Agent;
  let otherRequester: request.Agent;
  let staff: request.Agent;
  let staffB: request.Agent;
  let admin: request.Agent;
  const ids: Record<keyof typeof emails, number> = {} as any;
  const ticketIds: number[] = [];
  let categoryId: number;
  let relatedSystemId: number;

  async function makeTicket(overrides: { status?: TicketStatus; ownerId?: number | null; requesterId?: number } = {}) {
    const ticket = await getPrisma().ticket.create({
      data: {
        ticketNumber: `TEST-ACT-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        requesterId: overrides.requesterId ?? ids.requester,
        categoryId,
        relatedSystemId,
        summary: "Actions Taken fixture ticket",
        description: "Fixture.",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: overrides.status ?? "IN_PROGRESS",
        ownerId: overrides.ownerId === undefined ? ids.staff : overrides.ownerId,
      },
    });
    ticketIds.push(ticket.id);
    return ticket.id;
  }
  const post = (agent: request.Agent, ticketId: number | string, body: unknown) =>
    agent.post(`/api/tickets/${ticketId}/actions`).set("Origin", CLIENT_ORIGIN).send(body as object);
  const patch = (agent: request.Agent, ticketId: number | string, actionId: number | string, body: unknown) =>
    agent.patch(`/api/tickets/${ticketId}/actions/${actionId}`).set("Origin", CLIENT_ORIGIN).send(body as object);
  const countRows = async (ticketId: number) => ({
    actions: await getPrisma().actionTaken.count({ where: { ticketId } }),
    revisions: await getPrisma().actionTakenRevision.count({ where: { actionTaken: { ticketId } } }),
  });

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      const role = key === "requester" || key === "otherRequester" ? "REQUESTER" : key === "admin" ? "ADMINISTRATOR" : "IT_STAFF";
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
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    for (const email of Object.values(emails)) await deleteFixtureUser(email);
  });

  beforeEach(() => {
    actionsTakenHooks.afterUpdate = undefined;
  });

  describe("create (API-01..06, 16, 17, 46, 49)", () => {
    it("API-01: IT Staff creates an action: 201, performer is the caller, version 1, PLANNED, assignee null", async () => {
      const ticketId = await makeTicket();
      const response = await post(staff, ticketId, { description: "Replaced the docking station" }).expect(201);
      expect(response.body).toMatchObject({
        ticketId,
        performedBy: { id: ids.staff, name: emails.staff },
        assignee: null,
        status: "PLANNED",
        description: "Replaced the docking station",
        result: "",
        followUpRequired: false,
        followUpNote: "",
        attachmentNotes: "",
        version: 1,
      });
      expect(typeof response.body.id).toBe("number");
      expect(new Date(response.body.createdAt).toString()).not.toBe("Invalid Date");
      expect(new Date(response.body.actionAt).toString()).not.toBe("Invalid Date");
      expect(await countRows(ticketId)).toEqual({ actions: 1, revisions: 1 });
    });

    it("API-01: creating an action writes revision 1 equal to the created values (BR-08)", async () => {
      const ticketId = await makeTicket();
      const created = (await post(staff, ticketId, { description: "First", assigneeId: ids.staffB, followUpRequired: true, followUpNote: "Call back", attachmentNotes: "photo" }).expect(201)).body;
      const revisions = await getPrisma().actionTakenRevision.findMany({ where: { actionTakenId: created.id } });
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({
        revision: 1,
        editedById: ids.staff,
        status: "PLANNED",
        assigneeId: ids.staffB,
        description: "First",
        followUpRequired: true,
        followUpNote: "Call back",
        attachmentNotes: "photo",
      });
    });

    it("API-02: a Requester cannot create an action, even on their own ticket: 403 and nothing stored", async () => {
      const ticketId = await makeTicket();
      await post(requester, ticketId, { description: "I did it myself" }).expect(403);
      expect(await countRows(ticketId)).toEqual({ actions: 0, revisions: 0 });
    });

    it("API-03: empty, whitespace and 2001-character descriptions are 400 at description", async () => {
      const ticketId = await makeTicket();
      for (const description of ["", "   ", "a".repeat(2001)]) {
        const response = await post(staff, ticketId, { description }).expect(400);
        expect(response.body.errors.description).toEqual(expect.any(String));
      }
      expect(await countRows(ticketId)).toEqual({ actions: 0, revisions: 0 });
    });

    it("API-04: follow-up required needs a note; a note with follow-up false is stored empty", async () => {
      const ticketId = await makeTicket();
      const missing = await post(staff, ticketId, { description: "x", followUpRequired: true }).expect(400);
      expect(missing.body.errors.followUpNote).toEqual(expect.any(String));
      const withNote = await post(staff, ticketId, { description: "x", followUpRequired: true, followUpNote: "Check Friday" }).expect(201);
      expect(withNote.body).toMatchObject({ followUpRequired: true, followUpNote: "Check Friday" });
      const notRequired = await post(staff, ticketId, { description: "x", followUpRequired: false, followUpNote: "stray" }).expect(201);
      expect(notRequired.body).toMatchObject({ followUpRequired: false, followUpNote: "" });
    });

    it("API-05: performedById in the body is ignored; the session user is stored", async () => {
      const ticketId = await makeTicket();
      const response = await post(staff, ticketId, { description: "x", performedById: ids.staffB }).expect(201);
      expect(response.body.performedBy.id).toBe(ids.staff);
    });

    it("API-06: assigneeId must be an active IT Staff or Administrator", async () => {
      const ticketId = await makeTicket();
      for (const bad of [ids.inactiveStaff, ids.requester, 99999999, "5", 1.5, 0]) {
        const response = await post(staff, ticketId, { description: "x", assigneeId: bad }).expect(400);
        expect(response.body.errors.assigneeId, String(bad)).toEqual(expect.any(String));
      }
      const toStaff = await post(staff, ticketId, { description: "x", assigneeId: ids.staffB }).expect(201);
      expect(toStaff.body.assignee).toEqual({ id: ids.staffB, name: emails.staffB });
      const toAdmin = await post(staff, ticketId, { description: "x", assigneeId: ids.admin }).expect(201);
      expect(toAdmin.body.assignee.id).toBe(ids.admin);
      const none = await post(staff, ticketId, { description: "x", assigneeId: null }).expect(201);
      expect(none.body.assignee).toBeNull();
    });

    it("API-17: actionAt defaults to now, may be in the past, rejects 6 minutes ahead and a non-date", async () => {
      const ticketId = await makeTicket();
      const before = Date.now();
      const defaulted = await post(staff, ticketId, { description: "x" }).expect(201);
      expect(Math.abs(new Date(defaulted.body.actionAt).getTime() - before)).toBeLessThan(10_000);
      const past = iso(new Date(Date.now() - 3 * 86_400_000));
      expect((await post(staff, ticketId, { description: "x", actionAt: past }).expect(201)).body.actionAt).toBe(past);
      for (const bad of [iso(new Date(Date.now() + 6 * 60_000)), "yesterday"]) {
        const response = await post(staff, ticketId, { description: "x", actionAt: bad }).expect(400);
        expect(response.body.errors.actionAt).toEqual(expect.any(String));
      }
    });

    it("API-46: status omitted, PLANNED, IN_PROGRESS, COMPLETED with and without a result, CANCELLED, unknown", async () => {
      const ticketId = await makeTicket();
      expect((await post(staff, ticketId, { description: "x" }).expect(201)).body.status).toBe("PLANNED");
      expect((await post(staff, ticketId, { description: "x", status: "PLANNED" }).expect(201)).body.status).toBe("PLANNED");
      expect((await post(staff, ticketId, { description: "x", status: "IN_PROGRESS" }).expect(201)).body.status).toBe("IN_PROGRESS");
      const done = await post(staff, ticketId, { description: "x", status: "COMPLETED", result: "Replaced, tested" }).expect(201);
      expect(done.body).toMatchObject({ status: "COMPLETED", result: "Replaced, tested" });
      expect((await post(staff, ticketId, { description: "x", status: "COMPLETED" }).expect(400)).body.errors.result).toEqual(expect.any(String));
      expect((await post(staff, ticketId, { description: "x", status: "CANCELLED" }).expect(400)).body.errors.status).toEqual(expect.any(String));
      expect((await post(staff, ticketId, { description: "x", status: "DONE" }).expect(400)).body.errors.status).toEqual(expect.any(String));
    });

    it("API-49: an action by staff B on a ticket owned by staff A: performer is B, owner is still A", async () => {
      const ticketId = await makeTicket({ ownerId: ids.staff });
      const response = await post(staffB, ticketId, { description: "Helped out" }).expect(201);
      expect(response.body.performedBy.id).toBe(ids.staffB);
      expect((await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } })).ownerId).toBe(ids.staff);
    });

    it("an action can be recorded on a ticket that has no owner, and by an Administrator (BR-26, BR-28)", async () => {
      const ticketId = await makeTicket({ ownerId: null });
      expect((await post(admin, ticketId, { description: "Admin step" }).expect(201)).body.performedBy.id).toBe(ids.admin);
    });

    it("API-16: CLOSED and CANCELLED tickets reject a new action with 409 TICKET_CLOSED and store nothing", async () => {
      for (const status of ["CLOSED", "CANCELLED"] as TicketStatus[]) {
        const ticketId = await makeTicket({ status });
        const response = await post(staff, ticketId, { description: "too late" }).expect(409);
        expect(response.body.code).toBe("TICKET_CLOSED");
        expect(await countRows(ticketId)).toEqual({ actions: 0, revisions: 0 });
      }
    });
  });

  describe("RESOLVED tickets (API-67 direct-status variant, API-69, BR-10)", () => {
    it("API-67: on a RESOLVED ticket an open action is 409 TICKET_RESOLVED and nothing is stored; COMPLETED with a result is accepted", async () => {
      const ticketId = await makeTicket({ status: "RESOLVED" });
      for (const status of ["PLANNED", "IN_PROGRESS"]) {
        const response = await post(staff, ticketId, { description: "late", status }).expect(409);
        expect(response.body.code).toBe("TICKET_RESOLVED");
      }
      expect((await post(staff, ticketId, { description: "late default" }).expect(409)).body.code).toBe("TICKET_RESOLVED");
      expect(await countRows(ticketId)).toEqual({ actions: 0, revisions: 0 });
      expect((await post(staff, ticketId, { description: "late, no result", status: "COMPLETED" }).expect(400)).body.errors.result).toEqual(expect.any(String));
      await post(staff, ticketId, { description: "late record", status: "COMPLETED", result: "Verified fixed" }).expect(201);
      const open = await getPrisma().actionTaken.count({ where: { ticketId, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
      expect(open).toBe(0);
    });

    it("API-67: after the ticket is reopened an open action is accepted again", async () => {
      const ticketId = await makeTicket({ status: "RESOLVED" });
      await post(staff, ticketId, { description: "blocked" }).expect(409);
      await getPrisma().ticket.update({ where: { id: ticketId }, data: { currentStatus: "REOPENED" } });
      await post(staff, ticketId, { description: "accepted" }).expect(201);
    });

    it("API-69: an inconsistent open action on a RESOLVED ticket cannot be edited four ways; only COMPLETED or CANCELLED is accepted", async () => {
      const prisma = getPrisma();
      const ticketId = await makeTicket({ status: "RESOLVED" });
      const action = await prisma.actionTaken.create({
        data: { ticketId, performedById: ids.staff, description: "inconsistent", status: "PLANNED" },
      });
      await prisma.actionTakenRevision.create({
        data: { actionTakenId: action.id, revision: 1, editedById: ids.staff, status: "PLANNED", actionAt: action.actionAt, description: "inconsistent", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" },
      });
      const attempts = [
        { version: 1, status: "IN_PROGRESS" },
        { version: 1, description: "description only" },
        { version: 1, description: "description and status", status: "PLANNED" },
        { version: 1, result: "some result", followUpRequired: true, followUpNote: "note" },
      ];
      for (const body of attempts) {
        const response = await patch(staff, ticketId, action.id, body).expect(409);
        expect(response.body.code, JSON.stringify(body)).toBe("TICKET_RESOLVED");
        const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
        expect(row).toMatchObject({ description: "inconsistent", status: "PLANNED", version: 1, result: "" });
        expect(await prisma.actionTakenRevision.count({ where: { actionTakenId: action.id } })).toBe(1);
      }
      const done = await patch(staff, ticketId, action.id, { version: 1, status: "COMPLETED", result: "Fixed by hand" }).expect(200);
      expect(done.body).toMatchObject({ status: "COMPLETED", version: 2 });
    });
  });

  describe("list (API-07, 08, 47)", () => {
    it("API-07: equal actionAt values come back in the same order every time (actionAt, then id)", async () => {
      const ticketId = await makeTicket();
      const at = iso(new Date(Date.now() - 86_400_000));
      const created: number[] = [];
      for (const description of ["one", "two", "three", "four"]) {
        created.push((await post(staff, ticketId, { description, actionAt: at }).expect(201)).body.id);
      }
      const earlier = (await post(staff, ticketId, { description: "earlier", actionAt: iso(new Date(Date.now() - 2 * 86_400_000)) }).expect(201)).body.id;
      const orders: number[][] = [];
      for (let i = 0; i < 5; i++) {
        const response = await staff.get(`/api/tickets/${ticketId}/actions`).expect(200);
        orders.push(response.body.actions.map((a: { id: number }) => a.id));
      }
      for (const order of orders) expect(order).toEqual([earlier, ...created]);
    });

    it("API-08: a Requester lists their own ticket's actions (200), not another's (404); staff and admin list any (200)", async () => {
      const ticketId = await makeTicket();
      await post(staff, ticketId, { description: "visible" }).expect(201);
      expect((await requester.get(`/api/tickets/${ticketId}/actions`).expect(200)).body.actions).toHaveLength(1);
      const other = await otherRequester.get(`/api/tickets/${ticketId}/actions`).expect(404);
      expect(other.body).toEqual({ error: "Ticket not found." });
      const missing = await otherRequester.get("/api/tickets/99999999/actions").expect(404);
      expect(missing.body).toEqual(other.body);
      await staff.get(`/api/tickets/${ticketId}/actions`).expect(200);
      await admin.get(`/api/tickets/${ticketId}/actions`).expect(200);
    });

    it("an empty list is [] and the response key is always present (BR-23)", async () => {
      const ticketId = await makeTicket();
      expect((await staff.get(`/api/tickets/${ticketId}/actions`).expect(200)).body).toEqual({ actions: [] });
    });

    it("API-47: a Requester receives exactly the same fields as staff, every one of them (D-5)", async () => {
      const ticketId = await makeTicket();
      await post(staff, ticketId, {
        description: "Full",
        status: "COMPLETED",
        result: "Done and tested",
        assigneeId: ids.staffB,
        followUpRequired: true,
        followUpNote: "Check next week",
        attachmentNotes: "Photo on the shared drive",
      }).expect(201);
      const forStaff = (await staff.get(`/api/tickets/${ticketId}/actions`).expect(200)).body;
      const forRequester = (await requester.get(`/api/tickets/${ticketId}/actions`).expect(200)).body;
      expect(forRequester).toEqual(forStaff);
      expect(Object.keys(forRequester.actions[0]).sort()).toEqual(
        ["actionAt", "assignee", "attachmentNotes", "createdAt", "description", "followUpNote", "followUpRequired", "id", "performedBy", "result", "status", "ticketId", "updatedAt", "version"].sort()
      );
      expect(forRequester.actions[0]).toMatchObject({ followUpNote: "Check next week", attachmentNotes: "Photo on the shared drive", result: "Done and tested", assignee: { id: ids.staffB } });
    });
  });

  describe("edit (API-09..15, 48, 60..64)", () => {
    async function makeAction(overrides: Record<string, unknown> = {}, ticketOverrides: Parameters<typeof makeTicket>[0] = {}) {
      const ticketId = await makeTicket(ticketOverrides);
      const action = (await post(staff, ticketId, { description: "Original", ...overrides }).expect(201)).body;
      return { ticketId, action };
    }

    it("API-09: an edit with the current version changes the fields and bumps version by 1", async () => {
      const { ticketId, action } = await makeAction();
      const response = await patch(staff, ticketId, action.id, {
        version: 1,
        description: "Changed",
        status: "IN_PROGRESS",
        assigneeId: ids.staffB,
        followUpRequired: true,
        followUpNote: "Later",
        attachmentNotes: "note",
      }).expect(200);
      expect(response.body).toMatchObject({
        id: action.id,
        description: "Changed",
        status: "IN_PROGRESS",
        assignee: { id: ids.staffB },
        followUpRequired: true,
        followUpNote: "Later",
        attachmentNotes: "note",
        version: 2,
      });
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(action.updatedAt).getTime());
    });

    it("API-09: an Administrator and a different staff member can edit too (BR-26, BR-28)", async () => {
      const { ticketId, action } = await makeAction();
      expect((await patch(admin, ticketId, action.id, { version: 1, description: "By admin" }).expect(200)).body.version).toBe(2);
      expect((await patch(staffB, ticketId, action.id, { version: 2, description: "By B" }).expect(200)).body.version).toBe(3);
    });

    it("API-10: a stale version is 409 STALE_VERSION with currentVersion and changes nothing", async () => {
      const { ticketId, action } = await makeAction();
      await patch(staff, ticketId, action.id, { version: 1, description: "Second" }).expect(200);
      const response = await patch(staff, ticketId, action.id, { version: 1, description: "Third" }).expect(409);
      expect(response.body).toMatchObject({ code: "STALE_VERSION", currentVersion: 2 });
      expect(response.body.error).toEqual(expect.any(String));
      const row = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } });
      expect(row).toMatchObject({ description: "Second", version: 2 });
    });

    it("API-10: a missing or non-integer version is 400 at version and changes nothing", async () => {
      const { ticketId, action } = await makeAction();
      for (const body of [{ description: "x" }, { version: "1", description: "x" }, { version: 1.5, description: "x" }, { version: null, description: "x" }]) {
        const response = await patch(staff, ticketId, action.id, body).expect(400);
        expect(response.body.errors.version, JSON.stringify(body)).toEqual(expect.any(String));
      }
      expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } })).version).toBe(1);
    });

    it("API-11: two edits with the same version at once: exactly one 200 and one 409", async () => {
      for (let round = 0; round < 5; round++) {
        const { ticketId, action } = await makeAction();
        const [a, b] = await Promise.all([
          patch(staff, ticketId, action.id, { version: 1, description: "from A" }),
          patch(staffB, ticketId, action.id, { version: 1, description: "from B" }),
        ]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        const loser = a.status === 409 ? a : b;
        expect(loser.body.code).toBe("STALE_VERSION");
        expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } })).version).toBe(2);
        expect(await getPrisma().actionTakenRevision.count({ where: { actionTakenId: action.id } })).toBe(2);
      }
    });

    it("API-12: editing a COMPLETED or a CANCELLED action is 409 ACTION_FINAL", async () => {
      const { ticketId, action: completed } = await makeAction({ status: "COMPLETED", result: "done" });
      const { ticketId: ticketId2, action: toCancel } = await makeAction();
      const cancelled = (await patch(staff, ticketId2, toCancel.id, { version: 1, status: "CANCELLED" }).expect(200)).body;
      for (const [t, a] of [[ticketId, completed], [ticketId2, cancelled]] as const) {
        const response = await patch(staff, t, a.id, { version: a.version, description: "too late" }).expect(409);
        expect(response.body.code).toBe("ACTION_FINAL");
      }
    });

    it("API-13: every pair of action statuses on edit, generated from the move table", async () => {
      const allowed = new Set(["PLANNED>IN_PROGRESS", "PLANNED>COMPLETED", "PLANNED>CANCELLED", "IN_PROGRESS>COMPLETED", "IN_PROGRESS>CANCELLED"]);
      for (const from of ["PLANNED", "IN_PROGRESS"] as ActionStatus[]) {
        for (const to of ALL_STATUSES) {
          const { ticketId, action } = await makeAction({ status: from });
          const response = await patch(staff, ticketId, action.id, { version: 1, status: to, result: "done" });
          const key = `${from}>${to}`;
          if (from === to) {
            expect(response.status, key).toBe(200);
          } else if (allowed.has(key)) {
            expect(response.status, key).toBe(200);
            expect(response.body.status).toBe(to);
          } else {
            expect(response.status, key).toBe(400);
            expect(response.body.errors.status).toEqual(expect.any(String));
          }
        }
      }
    });

    it("API-14: editing to COMPLETED needs a result; with one it is 200", async () => {
      const { ticketId, action } = await makeAction();
      const missing = await patch(staff, ticketId, action.id, { version: 1, status: "COMPLETED" }).expect(400);
      expect(missing.body.errors.result).toEqual(expect.any(String));
      const blank = await patch(staff, ticketId, action.id, { version: 1, status: "COMPLETED", result: "  " }).expect(400);
      expect(blank.body.errors.result).toEqual(expect.any(String));
      const ok = await patch(staff, ticketId, action.id, { version: 1, status: "COMPLETED", result: "Fixed" }).expect(200);
      expect(ok.body).toMatchObject({ status: "COMPLETED", result: "Fixed", version: 2 });
    });

    it("an edit applies the same field validation as create and keeps the stored values it was not given", async () => {
      const { ticketId, action } = await makeAction({ attachmentNotes: "keep me" });
      expect((await patch(staff, ticketId, action.id, { version: 1, description: "" }).expect(400)).body.errors.description).toEqual(expect.any(String));
      expect((await patch(staff, ticketId, action.id, { version: 1, followUpRequired: true }).expect(400)).body.errors.followUpNote).toEqual(expect.any(String));
      expect((await patch(staff, ticketId, action.id, { version: 1, assigneeId: ids.inactiveStaff }).expect(400)).body.errors.assigneeId).toEqual(expect.any(String));
      expect((await patch(staff, ticketId, action.id, { version: 1, actionAt: "nope" }).expect(400)).body.errors.actionAt).toEqual(expect.any(String));
      const ok = await patch(staff, ticketId, action.id, { version: 1, description: "Renamed" }).expect(200);
      expect(ok.body).toMatchObject({ description: "Renamed", attachmentNotes: "keep me", status: "PLANNED" });
      const cleared = await patch(staff, ticketId, action.id, { version: 2, assigneeId: null }).expect(200);
      expect(cleared.body.assignee).toBeNull();
    });

    it("API-48: ticketId, performer and createdAt never change; an edit cannot move the action or change its performer", async () => {
      const { ticketId, action } = await makeAction();
      const otherTicket = await makeTicket();
      const response = await patch(staffB, ticketId, action.id, {
        version: 1,
        description: "Edited by B",
        ticketId: otherTicket,
        performedById: ids.staffB,
        createdAt: "2001-01-01T00:00:00.000Z",
      }).expect(200);
      expect(response.body.ticketId).toBe(ticketId);
      expect(response.body.performedBy.id).toBe(ids.staff);
      expect(response.body.createdAt).toBe(action.createdAt);
      expect(response.body.version).toBe(2);
      expect(await getPrisma().actionTakenRevision.count({ where: { actionTakenId: action.id } })).toBe(2);
    });

    it("API-15: there is no DELETE route for an action", async () => {
      const { ticketId, action } = await makeAction();
      for (const agent of [staff, admin]) {
        const response = await agent.delete(`/api/tickets/${ticketId}/actions/${action.id}`).set("Origin", CLIENT_ORIGIN);
        expect([404, 405]).toContain(response.status);
      }
      expect(await getPrisma().actionTaken.count({ where: { id: action.id } })).toBe(1);
    });

    it("a ticket in CLOSED or CANCELLED rejects an edit with 409 TICKET_CLOSED", async () => {
      for (const status of ["CLOSED", "CANCELLED"] as TicketStatus[]) {
        const { ticketId, action } = await makeAction();
        await getPrisma().ticket.update({ where: { id: ticketId }, data: { currentStatus: status } });
        const response = await patch(staff, ticketId, action.id, { version: 1, description: "x" }).expect(409);
        expect(response.body.code).toBe("TICKET_CLOSED");
      }
    });

    it("404 when the ticket or action is missing, or the action belongs to another ticket; a Requester gets 403", async () => {
      const { ticketId, action } = await makeAction();
      const otherTicket = await makeTicket();
      await patch(staff, 99999999, action.id, { version: 1, description: "x" }).expect(404);
      await patch(staff, ticketId, 99999999, { version: 1, description: "x" }).expect(404);
      await patch(staff, otherTicket, action.id, { version: 1, description: "x" }).expect(404);
      await patch(requester, ticketId, action.id, { version: 1, description: "x" }).expect(403);
      expect((await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } })).version).toBe(1);
    });
  });

  describe("revisions (API-60..63, AC-48, AC-49, BR-08)", () => {
    it("API-60: create then two edits: three revisions numbered 1 to 3, each holding the values at that point", async () => {
      const ticketId = await makeTicket();
      const created = (await post(staff, ticketId, { description: "v1 text", attachmentNotes: "first notes" }).expect(201)).body;
      await patch(staffB, ticketId, created.id, { version: 1, description: "v2 text", status: "IN_PROGRESS" }).expect(200);
      await patch(admin, ticketId, created.id, { version: 2, description: "v3 text", status: "COMPLETED", result: "Done" }).expect(200);
      const response = await staff.get(`/api/tickets/${ticketId}/actions/${created.id}/revisions`).expect(200);
      const revisions = response.body.revisions;
      expect(revisions.map((r: { revision: number }) => r.revision)).toEqual([1, 2, 3]);
      expect(revisions[0]).toMatchObject({ description: "v1 text", status: "PLANNED", attachmentNotes: "first notes", result: "", editedBy: { id: ids.staff } });
      expect(revisions[1]).toMatchObject({ description: "v2 text", status: "IN_PROGRESS", editedBy: { id: ids.staffB } });
      expect(revisions[2]).toMatchObject({ description: "v3 text", status: "COMPLETED", result: "Done", editedBy: { id: ids.admin } });
      for (const r of revisions) {
        expect(new Date(r.editedAt).toString()).not.toBe("Invalid Date");
        expect(Object.keys(r).sort()).toEqual(
          ["actionAt", "assigneeId", "attachmentNotes", "description", "editedAt", "editedBy", "followUpNote", "followUpRequired", "result", "revision", "status"].sort()
        );
      }
      const current = (await staff.get(`/api/tickets/${ticketId}/actions`).expect(200)).body.actions[0];
      expect(current.version).toBe(3);
      expect(revisions[2].revision).toBe(current.version);
    });

    it("API-61: a stale edit, an edit of a final action and an invalid edit each add no revision", async () => {
      const ticketId = await makeTicket();
      const created = (await post(staff, ticketId, { description: "start" }).expect(201)).body;
      const final = (await post(staff, ticketId, { description: "final", status: "COMPLETED", result: "done" }).expect(201)).body;
      await patch(staff, ticketId, created.id, { version: 1, description: "ok" }).expect(200);
      await patch(staff, ticketId, created.id, { version: 1, description: "stale" }).expect(409);
      await patch(staff, ticketId, created.id, { version: 2, description: "" }).expect(400);
      await patch(staff, ticketId, final.id, { version: 1, description: "no" }).expect(409);
      expect(await getPrisma().actionTakenRevision.count({ where: { actionTakenId: created.id } })).toBe(2);
      expect(await getPrisma().actionTakenRevision.count({ where: { actionTakenId: final.id } })).toBe(1);
    });

    it("API-62: revisions have no write route, and a Requester cannot read them; 404 for a wrong ticket or action", async () => {
      const ticketId = await makeTicket();
      const otherTicket = await makeTicket();
      const created = (await post(staff, ticketId, { description: "x" }).expect(201)).body;
      const url = `/api/tickets/${ticketId}/actions/${created.id}/revisions`;
      for (const method of ["post", "patch", "delete", "put"] as const) {
        const response = await staff[method](url).set("Origin", CLIENT_ORIGIN).send({ description: "hack" });
        expect([404, 405], method).toContain(response.status);
      }
      await requester.get(url).expect(403);
      await staff.get(`/api/tickets/${otherTicket}/actions/${created.id}/revisions`).expect(404);
      await staff.get(`/api/tickets/${ticketId}/actions/99999999/revisions`).expect(404);
      await staff.get(`/api/tickets/${ticketId}/actions/abc/revisions`).expect(400);
      await request(app).get(url).expect(401);
      expect((await staff.get(url).expect(200)).body.revisions).toHaveLength(1);
    });

    it("API-63: a failure after the update inside the edit transaction leaves the action and its revisions untouched", async () => {
      const ticketId = await makeTicket();
      const created = (await post(staff, ticketId, { description: "before" }).expect(201)).body;
      actionsTakenHooks.afterUpdate = () => {
        throw new Error("forced failure after the update");
      };
      const response = await patch(staff, ticketId, created.id, { version: 1, description: "after" });
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toMatch(/forced failure|stack|prisma/i);
      actionsTakenHooks.afterUpdate = undefined;
      const row = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: created.id } });
      expect(row).toMatchObject({ description: "before", version: 1 });
      expect(await getPrisma().actionTakenRevision.count({ where: { actionTakenId: created.id } })).toBe(1);
      await patch(staff, ticketId, created.id, { version: 1, description: "after" }).expect(200);
    });

    it("API-64: edits of different actions of one ticket, and creates, running together never deadlock or 500 (20 rounds)", async () => {
      const ticketId = await makeTicket();
      const a = (await post(staff, ticketId, { description: "a" }).expect(201)).body;
      const b = (await post(staff, ticketId, { description: "b" }).expect(201)).body;
      let versionA = 1;
      let versionB = 1;
      for (let round = 0; round < 20; round++) {
        const [ra, rb, rc] = await Promise.all([
          patch(staff, ticketId, a.id, { version: versionA, description: `a${round}` }),
          patch(staffB, ticketId, b.id, { version: versionB, description: `b${round}` }),
          post(admin, ticketId, { description: `c${round}` }),
        ]);
        expect(ra.status).toBe(200);
        expect(rb.status).toBe(200);
        expect(rc.status).toBe(201);
        versionA = ra.body.version;
        versionB = rb.body.version;
      }
      expect(versionA).toBe(21);
    });
  });

  describe("authentication, order of checks, origin (API-18, 19, SEC-02)", () => {
    it("API-18: no session is 401 before anything else, on every action route", async () => {
      const ticketId = await makeTicket();
      await request(app).get(`/api/tickets/${ticketId}/actions`).expect(401);
      await request(app).post(`/api/tickets/${ticketId}/actions`).set("Origin", CLIENT_ORIGIN).send({ description: "x" }).expect(401);
      await request(app).patch(`/api/tickets/${ticketId}/actions/1`).set("Origin", CLIENT_ORIGIN).send({ version: 1 }).expect(401);
    });

    it("API-18: non-numeric ids are 400, a missing ticket is 404, and 400 is checked before 404 for an invalid body", async () => {
      await staff.get("/api/tickets/abc/actions").expect(400);
      await staff.get("/api/tickets/0/actions").expect(400);
      await post(staff, "abc", { description: "x" }).expect(400);
      await patch(staff, 1, "abc", { version: 1 }).expect(400);
      await post(staff, 99999999, { description: "x" }).expect(404);
      const both = await post(staff, 99999999, { description: "" }).expect(400);
      expect(both.body.errors.description).toEqual(expect.any(String));
      await patch(staff, 99999999, 1, { description: "x" }).expect(400);
    });

    it("SEC-03 (part): a Requester is rejected 403 before the ticket is looked up, so the response never reveals whether it exists", async () => {
      const mine = await makeTicket();
      const a = await post(requester, mine, { description: "x" }).expect(403);
      const b = await post(requester, 99999999, { description: "x" }).expect(403);
      expect(a.body).toEqual(b.body);
    });

    it("API-19: a forged or missing Origin is 403 on POST and PATCH, even with a valid session", async () => {
      const ticketId = await makeTicket();
      const created = (await post(staff, ticketId, { description: "x" }).expect(201)).body;
      await staff.post(`/api/tickets/${ticketId}/actions`).send({ description: "x" }).expect(403);
      await staff.post(`/api/tickets/${ticketId}/actions`).set("Origin", "http://evil.example").send({ description: "x" }).expect(403);
      await staff.patch(`/api/tickets/${ticketId}/actions/${created.id}`).send({ version: 1, description: "y" }).expect(403);
      await staff.patch(`/api/tickets/${ticketId}/actions/${created.id}`).set("Origin", "http://evil.example").send({ version: 1, description: "y" }).expect(403);
      expect(await countRows(ticketId)).toEqual({ actions: 1, revisions: 1 });
    });

    it("SEC-02: Requester A asking for B's ticket's actions gets the same 404 as a missing ticket", async () => {
      const ticketId = await makeTicket();
      const response = await otherRequester.get(`/api/tickets/${ticketId}/actions`).expect(404);
      expect(response.body).toEqual({ error: "Ticket not found." });
    });

    it("a Requester whose password change is still required is rejected on every action route", async () => {
      const email = "actions-mustchange-fixture@toktickit.test";
      await createFixtureUser(email, { role: "IT_STAFF", mustChangePassword: true });
      try {
        const agent = await loginAgent(email);
        const ticketId = await makeTicket();
        const list = await agent.get(`/api/tickets/${ticketId}/actions`).expect(403);
        expect(list.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
        await post(agent, ticketId, { description: "x" }).expect(403);
      } finally {
        await deleteFixtureUser(email);
      }
    });
  });
});
