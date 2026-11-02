import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { createFixtureUser, deleteFixtureUser, loginAgent, withOrigin } from "../helpers/auth-fixtures.js";

// Lab 4 F11 (docs/lab-04/tests.md SEC-01, SEC-03; specification BR-24, BR-26, api-spec "order of checks": 401, 403, 400, 404, 409).
// Every route Lab 4 added, called as every role and with no session, so a route added without a role check, or one whose
// role set drifts from the authorization matrix, fails here. Lab 3's own sweep (authorization.api.test.ts) covers the Lab 3
// routes whose role set Lab 4 changed.

const emails = {
  owner: "sweep-owner-fixture@toktickit.test",
  other: "sweep-other-fixture@toktickit.test",
  staff: "sweep-staff-fixture@toktickit.test",
  admin: "sweep-admin-fixture@toktickit.test",
};
type Who = keyof typeof emails | "anonymous";
const agents = {} as Record<keyof typeof emails, request.Agent>;
const ids = {} as Record<keyof typeof emails, number>;
let ticketId = 0;
let actionId = 0;
let actionVersion = 1;

const as = (who: Who) => (who === "anonymous" ? request(app) : agents[who]);
// `origin` undefined sends the allowed Origin a browser would, null sends none, a string forges one.
const call = (who: Who, method: "get" | "post" | "patch", url: string, body?: object, origin?: string | null) => {
  let req = as(who)[method](url);
  if (method !== "get") req = origin === undefined ? withOrigin(req) : origin === null ? req : req.set("Origin", origin);
  return body ? req.send(body) : req;
};

describe("Lab 4 authorization sweep (SEC-01) and order of checks (SEC-03)", () => {
  beforeAll(async () => {
    const roles = { owner: "REQUESTER", other: "REQUESTER", staff: "IT_STAFF", admin: "ADMINISTRATOR" } as const;
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = (await createFixtureUser(emails[key], { role: roles[key] })).user.id;
      agents[key] = await loginAgent(emails[key]);
    }
    const prisma = getPrisma();
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TEST-SWEEP-${Date.now()}`,
        requesterId: ids.owner,
        categoryId: (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id,
        relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id,
        summary: "Sweep fixture",
        description: "Fixture.",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "IN_PROGRESS",
      },
    });
    ticketId = ticket.id;
    const action = await prisma.actionTaken.create({
      data: { ticketId, performedById: ids.staff, status: "PLANNED", actionAt: new Date(), description: "Sweep action" },
    });
    actionId = action.id;
    actionVersion = action.version;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.actionTakenRevision.deleteMany({ where: { actionTaken: { ticketId } } });
    await prisma.actionTaken.deleteMany({ where: { ticketId } });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    for (const email of Object.values(emails)) await deleteFixtureUser(email);
  });

  describe("SEC-01: role by route", () => {
    it("GET actions: the ticket's own Requester, IT Staff and Administrator read; another Requester gets 404 (no leak); no session 401", async () => {
      const url = `/api/tickets/${ticketId}/actions`;
      expect((await call("owner", "get", url)).status).toBe(200);
      expect((await call("staff", "get", url)).status).toBe(200);
      expect((await call("admin", "get", url)).status).toBe(200);
      expect((await call("other", "get", url)).status).toBe(404);
      expect((await call("anonymous", "get", url)).status).toBe(401);
    });

    it("POST actions: IT Staff and Administrator create; a Requester, even the ticket's own, gets 403; no session 401", async () => {
      const url = `/api/tickets/${ticketId}/actions`;
      const body = { description: "Created by the sweep" };
      expect((await call("owner", "post", url, body)).status).toBe(403);
      expect((await call("other", "post", url, body)).status).toBe(403);
      expect((await call("anonymous", "post", url, body)).status).toBe(401);
      expect((await call("staff", "post", url, body)).status).toBe(201);
      expect((await call("admin", "post", url, body)).status).toBe(201);
    });

    it("PATCH an action: IT Staff and Administrator edit; a Requester gets 403; no session 401", async () => {
      const url = `/api/tickets/${ticketId}/actions/${actionId}`;
      expect((await call("owner", "patch", url, { description: "x", version: actionVersion })).status).toBe(403);
      expect((await call("anonymous", "patch", url, { description: "x", version: actionVersion })).status).toBe(401);
      const staff = await call("staff", "patch", url, { description: "Edited by staff", version: actionVersion });
      expect(staff.status).toBe(200);
      const admin = await call("admin", "patch", url, { description: "Edited by the administrator", version: staff.body.version });
      expect(admin.status).toBe(200);
      actionVersion = admin.body.version;
    });

    it("GET an action's revisions: IT Staff and Administrator only; a Requester 403; no session 401", async () => {
      const url = `/api/tickets/${ticketId}/actions/${actionId}/revisions`;
      expect((await call("staff", "get", url)).status).toBe(200);
      expect((await call("admin", "get", url)).status).toBe(200);
      expect((await call("owner", "get", url)).status).toBe(403);
      expect((await call("anonymous", "get", url)).status).toBe(401);
    });

    it("dashboards: each only for its own roles; the Administrator uses the staff one; no session 401", async () => {
      expect((await call("owner", "get", "/api/dashboard/requester")).status).toBe(200);
      expect((await call("staff", "get", "/api/dashboard/requester")).status).toBe(403);
      expect((await call("admin", "get", "/api/dashboard/requester")).status).toBe(403);
      expect((await call("staff", "get", "/api/dashboard/staff")).status).toBe(200);
      expect((await call("admin", "get", "/api/dashboard/staff")).status).toBe(200);
      expect((await call("owner", "get", "/api/dashboard/staff")).status).toBe(403);
      expect((await call("anonymous", "get", "/api/dashboard/requester")).status).toBe(401);
      expect((await call("anonymous", "get", "/api/dashboard/staff")).status).toBe(401);
    });

    it("only the Administrator's own dashboard carries user counts", async () => {
      expect((await call("admin", "get", "/api/dashboard/staff")).body.userCounts).toBeDefined();
      expect((await call("staff", "get", "/api/dashboard/staff")).body.userCounts).toBeUndefined();
    });

    it("a forged or missing Origin on a write is 403, for a fully authorized caller, before anything is read or written", async () => {
      const before = await getPrisma().actionTaken.count({ where: { ticketId } });
      for (const origin of [null, "http://evil.example"]) {
        const response = await call("staff", "post", `/api/tickets/${ticketId}/actions`, { description: "Forged" }, origin);
        expect(response.status, String(origin)).toBe(403);
      }
      expect(await getPrisma().actionTaken.count({ where: { ticketId } })).toBe(before);
    });
  });

  describe("SEC-03: when two things are wrong, the earlier check in 401, 403, 400, 404, 409 answers", () => {
    it("no session and an invalid body: 401, not 400", async () => {
      expect((await call("anonymous", "post", `/api/tickets/${ticketId}/actions`, { description: "" })).status).toBe(401);
    });

    it("a Requester and an invalid body: 403, not 400", async () => {
      expect((await call("owner", "post", `/api/tickets/${ticketId}/actions`, { description: "" })).status).toBe(403);
    });

    it("a malformed ticket id and an invalid body: 400, not 404", async () => {
      const response = await call("staff", "post", "/api/tickets/abc/actions", { description: "" });
      expect(response.status).toBe(400);
    });

    it("a ticket that does not exist and a valid body: 404", async () => {
      expect((await call("staff", "post", "/api/tickets/2147483000/actions", { description: "Valid" })).status).toBe(404);
    });

    it("a stale version and an invalid field: 400 (the field), not 409", async () => {
      const response = await call("staff", "patch", `/api/tickets/${ticketId}/actions/${actionId}`, { description: "", version: 1 });
      expect(response.status).toBe(400);
      expect(response.body.errors?.description).toBeDefined();
    });

    it("a stale version and a valid field: 409 STALE_VERSION", async () => {
      const response = await call("staff", "patch", `/api/tickets/${ticketId}/actions/${actionId}`, { description: "Valid text", version: 1 });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("STALE_VERSION");
    });
  });
});
