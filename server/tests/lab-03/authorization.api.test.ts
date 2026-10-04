import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// docs/lab-03/tests.md §2.2 (SEC-01..SEC-08): the cross-cutting authorization
// sweeps. Each feature's own test file covers its routes in depth; this file
// is the one place that walks the *whole* protected API surface against the
// role x action matrix in specification.md §3.4 — so a route added later
// without a role check, or without the Origin gate, fails here even if its
// own feature never wrote that test.

const E = {
  requesterA: "authz-requester-a-fixture@toktickit.test",
  requesterB: "authz-requester-b-fixture@toktickit.test",
  staff: "authz-staff-fixture@toktickit.test",
  admin: "authz-admin-fixture@toktickit.test",
  midSession: "authz-midsession-fixture@toktickit.test",
};

type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";
type Method = "get" | "post" | "patch" | "delete";

// Same directory the download route serves from (server/uploads).
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");
const ATTACHMENT_BODY = "authorization sweep attachment fixture";

describe("Authorization sweeps (SEC-01..SEC-08)", () => {
  let agents: Record<Role, request.Agent>;
  let requesterBAgent: request.Agent;
  let ticketAId: number; // owned by requester A
  let ticketBId: number; // owned by requester B
  let attachmentAId: number; // a real, downloadable attachment on ticket A
  let attachmentFilename: string;
  let requesterAId: number;
  let requesterBId: number;
  let staffId: number;
  const createdTicketIds: number[] = [];

  beforeAll(async () => {
    const prisma = getPrisma();
    const { user: a } = await createFixtureUser(E.requesterA);
    const { user: b } = await createFixtureUser(E.requesterB);
    const { user: staff } = await createFixtureUser(E.staff, { role: "IT_STAFF" });
    await createFixtureUser(E.admin, { role: "ADMINISTRATOR" });
    requesterAId = a.id;
    requesterBId = b.id;
    staffId = staff.id;

    agents = {
      REQUESTER: await loginAgent(E.requesterA),
      IT_STAFF: await loginAgent(E.staff),
      ADMINISTRATOR: await loginAgent(E.admin),
    };
    requesterBAgent = await loginAgent(E.requesterB);

    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    for (const [requesterId, label] of [[a.id, "A"], [b.id, "B"]] as const) {
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: `TEST-AUTHZ-${label}-${Date.now()}-${Math.random()}`,
          requesterId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: `Authorization sweep ticket ${label}`,
          description: "Fixture.",
          requestedPriority: "LOW",
          itPriority: "LOW",
        },
      });
      createdTicketIds.push(ticket.id);
      if (label === "A") ticketAId = ticket.id;
      else ticketBId = ticket.id;
    }

    // A real attachment (row + file on disk) on requester A's ticket, so the
    // download route's "owner passes the gate" case is a genuine 200 rather
    // than a 404 for an id that doesn't exist.
    attachmentFilename = `authz-sweep-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(path.join(UPLOAD_DIR, attachmentFilename), ATTACHMENT_BODY);
    const attachment = await prisma.attachment.create({
      data: {
        ticketId: ticketAId,
        originalFilename: "authz-sweep.txt",
        storedFilename: attachmentFilename,
        mimeType: "text/plain",
        sizeBytes: ATTACHMENT_BODY.length,
      },
    });
    attachmentAId = attachment.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    await prisma.attachment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
    rmSync(path.join(UPLOAD_DIR, attachmentFilename), { force: true });
    await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    for (const email of Object.values(E)) await deleteFixtureUser(email);
  });

  // The role x action matrix (specification.md §3.4) for every protected
  // route: which roles may reach it. A role listed here must get past the
  // gate (anything but 401/403 — the dummy payloads may well 400/404); every
  // role *not* listed must get 403, and no session at all must get 401.
  // Requester-scoped routes use requester A's own ticket.
  function routes(): Array<{ label: string; method: Method; url: string; body?: object; allowed: Role[] }> {
    const t = ticketAId;
    return [
      { label: "POST /api/tickets", method: "post", url: "/api/tickets", body: {}, allowed: ["REQUESTER"] },
      { label: "GET /api/tickets", method: "get", url: "/api/tickets", allowed: ["REQUESTER"] },
      { label: "GET /api/tickets/:id", method: "get", url: `/api/tickets/${t}`, allowed: ["REQUESTER"] },
      { label: "GET /api/tickets/:id/attachments", method: "get", url: `/api/tickets/${t}/attachments`, allowed: ["REQUESTER"] },
      { label: "GET /api/tickets/:id/attachments/:aid", method: "get", url: `/api/tickets/${t}/attachments/${attachmentAId}`, allowed: ["REQUESTER"] },
      { label: "POST /api/tickets/:id/attachments", method: "post", url: `/api/tickets/${t}/attachments`, allowed: ["REQUESTER"] },
      { label: "DELETE /api/tickets/:id/attachments/:aid", method: "delete", url: `/api/tickets/${t}/attachments/999999`, allowed: ["REQUESTER"] },
      { label: "POST /api/tickets/:id/mark-resolved", method: "post", url: `/api/tickets/${t}/mark-resolved`, allowed: ["REQUESTER"] },
      { label: "GET /api/tickets/:id/comments", method: "get", url: `/api/tickets/${t}/comments`, allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
      { label: "POST /api/tickets/:id/comments", method: "post", url: `/api/tickets/${t}/comments`, body: {}, allowed: ["REQUESTER", "IT_STAFF"] },
      { label: "GET /api/tickets/:id/notes", method: "get", url: `/api/tickets/${t}/notes`, allowed: ["IT_STAFF", "ADMINISTRATOR"] },
      { label: "POST /api/tickets/:id/notes", method: "post", url: `/api/tickets/${t}/notes`, body: {}, allowed: ["IT_STAFF"] },
      { label: "GET /api/staff/tickets", method: "get", url: "/api/staff/tickets", allowed: ["IT_STAFF", "ADMINISTRATOR"] },
      { label: "GET /api/staff/tickets/:id", method: "get", url: `/api/staff/tickets/${t}`, allowed: ["IT_STAFF", "ADMINISTRATOR"] },
      { label: "GET /api/staff/tickets/:id/attachments/:aid", method: "get", url: `/api/staff/tickets/${t}/attachments/${attachmentAId}`, allowed: ["IT_STAFF", "ADMINISTRATOR"] },
      { label: "POST /api/staff/tickets/:id/claim", method: "post", url: `/api/staff/tickets/${t}/claim`, allowed: ["IT_STAFF"] },
      { label: "POST /api/staff/tickets/:id/assign", method: "post", url: `/api/staff/tickets/${t}/assign`, body: {}, allowed: ["IT_STAFF"] },
      { label: "PATCH /api/staff/tickets/:id/priority", method: "patch", url: `/api/staff/tickets/${t}/priority`, body: {}, allowed: ["IT_STAFF"] },
      { label: "PATCH /api/staff/tickets/:id/status", method: "patch", url: `/api/staff/tickets/${t}/status`, body: {}, allowed: ["IT_STAFF"] },
      { label: "GET /api/staff/assignable-users", method: "get", url: "/api/staff/assignable-users", allowed: ["IT_STAFF"] },
      { label: "GET /api/admin/users", method: "get", url: "/api/admin/users", allowed: ["ADMINISTRATOR"] },
      { label: "POST /api/admin/users", method: "post", url: "/api/admin/users", body: {}, allowed: ["ADMINISTRATOR"] },
      { label: "PATCH /api/admin/users/:id", method: "patch", url: "/api/admin/users/999999", body: {}, allowed: ["ADMINISTRATOR"] },
      { label: "POST /api/admin/users/:id/reset-password", method: "post", url: "/api/admin/users/999999/reset-password", body: {}, allowed: ["ADMINISTRATOR"] },
      { label: "GET /api/categories", method: "get", url: "/api/categories", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
      { label: "GET /api/related-systems", method: "get", url: "/api/related-systems", allowed: ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] },
    ];
  }

  function call(agent: request.Agent, route: { method: Method; url: string; body?: object }, origin: string | null = CLIENT_ORIGIN) {
    let req = agent[route.method](route.url);
    if (origin !== null && route.method !== "get") req = req.set("Origin", origin);
    return route.body !== undefined ? req.send(route.body) : req;
  }

  // SEC-01 / SEC-02 (AC-27, AC-28a/b), generalized from /api/admin/* and
  // /api/staff/* to the whole API.
  it("every protected route gives a role outside its allowed set 403, and no session 401 (SEC-01, SEC-02)", async () => {
    const wrongAnswers: string[] = [];
    for (const route of routes()) {
      const anonymous = await call(request.agent(app), route);
      if (anonymous.status !== 401) wrongAnswers.push(`${route.label} with no session: ${anonymous.status}, expected 401`);

      for (const role of ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as Role[]) {
        const response = await call(agents[role], route);
        if (route.allowed.includes(role)) {
          if (response.status === 401 || response.status === 403) {
            wrongAnswers.push(`${route.label} as ${role}: ${response.status}, should have passed the role gate`);
          }
        } else if (response.status !== 403) {
          wrongAnswers.push(`${route.label} as ${role}: ${response.status}, expected 403`);
        }
      }
    }
    expect(wrongAnswers).toEqual([]);
  });

  // SEC-03 / AC-03 / BR-03
  describe("a client-supplied requesterId never decides ownership (SEC-03)", () => {
    it("POST /api/tickets creates the ticket under the session's identity, ignoring a spoofed requesterId", async () => {
      const prisma = getPrisma();
      const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
      const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

      const response = await call(agents.REQUESTER, {
        method: "post",
        url: "/api/tickets",
        body: {
          requesterId: requesterBId,
          categoryId: category.id,
          relatedSystemId: relatedSystem.id,
          summary: `Spoof attempt ${Date.now()}`,
          description: "Claims to be requester B.",
          requestedPriority: "LOW",
        },
      });
      expect(response.status).toBe(201);
      createdTicketIds.push(response.body.id);
      expect(response.body.requesterId).toBe(requesterAId);
    });

    it("GET /api/tickets ignores a requesterId query param and returns only the caller's tickets", async () => {
      const response = await agents.REQUESTER.get("/api/tickets").query({ requesterId: requesterBId }).expect(200);
      expect(response.body.tickets.length).toBeGreaterThan(0);
      for (const ticket of response.body.tickets) {
        expect(ticket.requesterId).toBe(requesterAId);
      }
    });
  });

  // SEC-04 / AC-11 / BR-14
  it("a Requester reaching for another Requester's ticket gets 404 on every ticket-scoped route, never 403 or data (SEC-04)", async () => {
    const wrongAnswers: string[] = [];
    const theirs = ticketBId;
    const attempts: Array<{ label: string; method: Method; url: string; body?: object }> = [
      { label: "detail", method: "get", url: `/api/tickets/${theirs}` },
      { label: "attachments list", method: "get", url: `/api/tickets/${theirs}/attachments` },
      { label: "attachment download", method: "get", url: `/api/tickets/${theirs}/attachments/1` },
      { label: "attachment removal", method: "delete", url: `/api/tickets/${theirs}/attachments/1`, body: {} },
      { label: "comments list", method: "get", url: `/api/tickets/${theirs}/comments` },
      { label: "comment post", method: "post", url: `/api/tickets/${theirs}/comments`, body: { body: "hello" } },
      { label: "mark resolved", method: "post", url: `/api/tickets/${theirs}/mark-resolved` },
    ];
    for (const attempt of attempts) {
      const response = await call(agents.REQUESTER, attempt);
      if (response.status !== 404) wrongAnswers.push(`${attempt.label}: ${response.status}, expected 404`);
      if (JSON.stringify(response.body).includes("Authorization sweep ticket B")) {
        wrongAnswers.push(`${attempt.label}: leaked the other Requester's ticket data`);
      }
    }
    expect(wrongAnswers).toEqual([]);
  });

  // SEC-05 / AC-04 / AC-21
  it("a Requester can never read or write Internal Notes, even on their own ticket, and no note content leaks (SEC-05)", async () => {
    const prisma = getPrisma();
    const secret = `internal-only-${Date.now()}`;
    await prisma.internalNote.create({ data: { ticketId: ticketAId, authorId: staffId, body: secret } });

    const read = await agents.REQUESTER.get(`/api/tickets/${ticketAId}/notes`);
    expect(read.status).toBe(403);
    expect(JSON.stringify(read.body)).not.toContain(secret);

    const write = await call(agents.REQUESTER, { method: "post", url: `/api/tickets/${ticketAId}/notes`, body: { body: "x" } });
    expect(write.status).toBe(403);

    // And the secret doesn't surface through anything else a Requester can fetch.
    const comments = await agents.REQUESTER.get(`/api/tickets/${ticketAId}/comments`).expect(200);
    const detail = await agents.REQUESTER.get(`/api/tickets/${ticketAId}`).expect(200);
    expect(JSON.stringify(comments.body)).not.toContain(secret);
    expect(JSON.stringify(detail.body)).not.toContain(secret);
  });

  // SEC-01/02 for the download route specifically, with a real attachment so
  // the owner's answer is a real 200 (the matrix only proves "not 401/403").
  describe("GET /api/tickets/:id/attachments/:attachmentId (SEC-01, SEC-02, SEC-04)", () => {
    const download = () => `/api/tickets/${ticketAId}/attachments/${attachmentAId}`;

    it("no session -> 401", async () => {
      await request.agent(app).get(download()).expect(401);
    });

    it("the owning Requester gets the file (passes authentication and the role gate)", async () => {
      const response = await agents.REQUESTER.get(download()).expect(200);
      expect(response.headers["content-type"]).toMatch(/text\/plain/);
      expect(response.text).toBe(ATTACHMENT_BODY);
    });

    it("IT Staff -> 403 and Administrator -> 403, with no file content in the body", async () => {
      for (const role of ["IT_STAFF", "ADMINISTRATOR"] as Role[]) {
        const response = await agents[role].get(download()).expect(403);
        expect(JSON.stringify(response.body)).not.toContain(ATTACHMENT_BODY);
        expect(response.text).not.toContain(ATTACHMENT_BODY);
      }
    });

    it("another Requester -> 404, never the file (BR-14)", async () => {
      const response = await requesterBAgent.get(download()).expect(404);
      expect(response.text).not.toContain(ATTACHMENT_BODY);
    });
  });

  // SEC-06 / BR-16
  it("a session whose user is deactivated mid-session is rejected 401 on the very next request (SEC-06)", async () => {
    const { user } = await createFixtureUser(E.midSession, { role: "REQUESTER" });
    const agent = await loginAgent(E.midSession);
    await agent.get("/api/auth/me").expect(200);
    await agent.get("/api/tickets").expect(200);

    await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });

    await agent.get("/api/auth/me").expect(401);
    await agent.get("/api/tickets").expect(401);
  });

  // SEC-07 / api-spec.md "Authentication" CSRF note — the every-route sweep
  // auth.api.test.ts's SEC-07 block says belongs to the end of the sprint.
  describe("the Origin gate covers every mutating route (SEC-07)", () => {
    const FORGED = ["https://evil.example", `${CLIENT_ORIGIN}.evil.example`, "null"];

    it("rejects every POST/PATCH/DELETE with no Origin header, even for a fully authorized caller", async () => {
      const wrongAnswers: string[] = [];
      for (const route of routes().filter((r) => r.method !== "get")) {
        const role = route.allowed[0];
        const response = await call(agents[role], route, null);
        if (response.status !== 403) wrongAnswers.push(`${route.label} (as ${role}, no Origin): ${response.status}, expected 403`);
      }
      expect(wrongAnswers).toEqual([]);
    });

    it("rejects every POST/PATCH/DELETE with a forged Origin — including with no session at all (403, not 401)", async () => {
      const wrongAnswers: string[] = [];
      for (const route of routes().filter((r) => r.method !== "get")) {
        for (const origin of FORGED) {
          const authorized = await call(agents[route.allowed[0]], route, origin);
          if (authorized.status !== 403) wrongAnswers.push(`${route.label} authorized, Origin ${origin}: ${authorized.status}`);
          const anonymous = await call(request.agent(app), route, origin);
          if (anonymous.status !== 403) wrongAnswers.push(`${route.label} anonymous, Origin ${origin}: ${anonymous.status}`);
        }
      }
      expect(wrongAnswers).toEqual([]);
    });

    it("a forged-Origin request changes nothing: a claim with a forged Origin leaves the ticket unassigned", async () => {
      const prisma = getPrisma();
      await prisma.ticket.update({ where: { id: ticketAId }, data: { ownerId: null } });
      await agents.IT_STAFF.post(`/api/staff/tickets/${ticketAId}/claim`).set("Origin", "https://evil.example").expect(403);
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketAId } });
      expect(row.ownerId).toBeNull();
    });

    it("never gates safe methods on Origin (a GET with no Origin header still works)", async () => {
      await agents.REQUESTER.get("/api/tickets").expect(200);
    });
  });

  // SEC-08 / BR-13: the fixed status-code ladder, proved by requests that
  // fail at *two* rungs at once — the earlier rung must win.
  describe("the status-code ladder holds when a request fails at two rungs at once (SEC-08)", () => {
    it("401 beats 400: unauthenticated + invalid body", async () => {
      await call(request.agent(app), { method: "post", url: "/api/tickets", body: { summary: "" } }).expect(401);
      await call(request.agent(app), { method: "post", url: "/api/admin/users", body: { role: "NOPE" } }).expect(401);
    });

    it("403 beats 400: wrong role + invalid body", async () => {
      await call(agents.REQUESTER, { method: "post", url: "/api/admin/users", body: { role: "NOPE" } }).expect(403);
      await call(agents.IT_STAFF, { method: "post", url: "/api/tickets", body: { summary: "" } }).expect(403);
    });

    it("403 beats 404: wrong role + a resource that doesn't exist", async () => {
      await call(agents.REQUESTER, { method: "patch", url: "/api/staff/tickets/999999/priority", body: { itPriority: "HIGH" } }).expect(403);
    });

    it("400 beats 404: right role, invalid body, and a ticket that doesn't exist", async () => {
      const response = await call(agents.IT_STAFF, {
        method: "post",
        url: "/api/staff/tickets/999999/assign",
        body: { ownerId: "not-a-number" },
      });
      expect(response.status).toBe(400);
    });

    it("404 beats 409: right role, valid body, ticket doesn't exist", async () => {
      await call(agents.IT_STAFF, { method: "patch", url: "/api/staff/tickets/999999/status", body: { currentStatus: "OPEN" } }).expect(404);
    });
  });
});
