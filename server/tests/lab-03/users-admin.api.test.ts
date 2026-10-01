import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN } from "../../src/auth.js";
import { createFixtureUser, deleteFixtureUser, loginAgent, withOrigin } from "../helpers/auth-fixtures.js";

// Lab 3 (docs/lab-03/tests.md §2.7, API-39..48, §2.8's API-51): Administrator
// User Management (Issue #39).
describe("Administrator User Management", () => {
  const requesterEmail = "usersadmin-requester-fixture@toktickit.test";
  const staffEmail = "usersadmin-staff-fixture@toktickit.test";
  const adminEmail = "usersadmin-admin-fixture@toktickit.test";

  let requesterAgent: request.Agent;
  let staffAgent: request.Agent;
  let adminAgent: request.Agent;
  let adminId: number;

  // Emails created by individual tests (via the API itself, not the fixture
  // helper) — cleaned up per-test so one test's user can't collide with
  // another's search/filter/uniqueness assertions.
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const { user: admin } = await createFixtureUser(adminEmail, { role: "ADMINISTRATOR" });
    await createFixtureUser(requesterEmail, { role: "REQUESTER" });
    await createFixtureUser(staffEmail, { role: "IT_STAFF" });

    adminId = admin.id;

    requesterAgent = await loginAgent(requesterEmail);
    staffAgent = await loginAgent(staffEmail);
    adminAgent = await loginAgent(adminEmail);
  });

  afterEach(async () => {
    if (createdEmails.length === 0) return;
    const prisma = getPrisma();
    await prisma.session.deleteMany({ where: { user: { email: { in: createdEmails } } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    createdEmails.length = 0;
  });

  afterAll(async () => {
    await deleteFixtureUser(requesterEmail);
    await deleteFixtureUser(staffEmail);
    await deleteFixtureUser(adminEmail);
  });

  async function createUser(agent: request.Agent, overrides: Record<string, unknown> = {}) {
    const email = (overrides.email as string) ?? `usersadmin-created-${Date.now()}-${Math.random()}@toktickit.test`;
    const response = await withOrigin(agent.post("/api/admin/users")).send({
      name: "Created Fixture",
      role: "IT_STAFF",
      password: "Fixture-Pass1",
      ...overrides,
      email,
    });
    if (response.status === 201) createdEmails.push(email);
    return response;
  }

  describe("AC-27: role gate on every route in this section", () => {
    const calls: Array<[string, (agent: request.Agent) => request.Test]> = [
      ["GET /api/admin/users", (agent) => agent.get("/api/admin/users")],
      [
        "POST /api/admin/users",
        (agent) =>
          withOrigin(agent.post("/api/admin/users")).send({
            name: "x",
            email: "ac27-noop@toktickit.test",
            role: "IT_STAFF",
            password: "Fixture-Pass1",
          }),
      ],
      ["PATCH /api/admin/users/:id", (agent) => withOrigin(agent.patch("/api/admin/users/999999")).send({ name: "x" })],
      [
        "POST /api/admin/users/:id/reset-password",
        (agent) => withOrigin(agent.post("/api/admin/users/999999/reset-password")).send({ password: "Fixture-Pass1" }),
      ],
    ];

    for (const [label, call] of calls) {
      it(`rejects a Requester session on ${label}`, async () => {
        const response = await call(requesterAgent);
        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });

      it(`rejects an IT Staff session on ${label}`, async () => {
        const response = await call(staffAgent);
        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });

      it(`rejects an unauthenticated request on ${label}`, async () => {
        const response = await call(request.agent(app));
        expect(response.status).toBe(401);
      });
    }
  });

  describe("GET /api/admin/users (API-39)", () => {
    it("never includes passwordHash in any row", async () => {
      const response = await adminAgent.get("/api/admin/users").expect(200);
      expect(response.body.length).toBeGreaterThan(0);
      for (const row of response.body) {
        expect(row).not.toHaveProperty("passwordHash");
      }
    });

    it("filters by search (name or email, case-insensitive contains)", async () => {
      await createUser(adminAgent, { name: "Searchable Zyx", email: `searchable-zyx-${Date.now()}@toktickit.test` });

      const response = await adminAgent.get("/api/admin/users").query({ search: "searchable-zyx" }).expect(200);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      for (const row of response.body) {
        expect(row.email.toLowerCase()).toContain("searchable-zyx");
      }
    });

    it("filters by role", async () => {
      const response = await adminAgent.get("/api/admin/users").query({ role: "ADMINISTRATOR" }).expect(200);
      expect(response.body.length).toBeGreaterThan(0);
      for (const row of response.body) {
        expect(row.role).toBe("ADMINISTRATOR");
      }
    });

    it("rejects an invalid role filter value", async () => {
      const response = await adminAgent.get("/api/admin/users").query({ role: "BOGUS" }).expect(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe("POST /api/admin/users (API-40, API-41)", () => {
    it("rejects a missing role", async () => {
      const response = await createUser(adminAgent, { role: undefined });
      expect(response.status).toBe(400);
      expect(response.body.errors.role).toBeDefined();
    });

    it("rejects an array of roles", async () => {
      const response = await createUser(adminAgent, { role: ["IT_STAFF", "ADMINISTRATOR"] });
      expect(response.status).toBe(400);
      expect(response.body.errors.role).toBeDefined();
    });

    it("rejects an unrecognized role string", async () => {
      const response = await createUser(adminAgent, { role: "SUPERUSER" });
      expect(response.status).toBe(400);
      expect(response.body.errors.role).toBeDefined();
    });

    it("rejects missing name/email/password", async () => {
      const response = await withOrigin(adminAgent.post("/api/admin/users")).send({ role: "IT_STAFF" });
      expect(response.status).toBe(400);
      expect(response.body.errors.name).toBeDefined();
      expect(response.body.errors.email).toBeDefined();
      expect(response.body.errors.password).toBeDefined();
    });

    it("creates a user with mustChangePassword: true regardless of isActive given", async () => {
      const activeResponse = await createUser(adminAgent, { isActive: true });
      expect(activeResponse.status).toBe(201);
      expect(activeResponse.body.mustChangePassword).toBe(true);
      expect(activeResponse.body.isActive).toBe(true);
      expect(activeResponse.body).not.toHaveProperty("passwordHash");

      const inactiveResponse = await createUser(adminAgent, { isActive: false });
      expect(inactiveResponse.status).toBe(201);
      expect(inactiveResponse.body.mustChangePassword).toBe(true);
      expect(inactiveResponse.body.isActive).toBe(false);
    });
  });

  describe("Duplicate email on create and edit (API-42)", () => {
    it("rejects creating a user with an email already in use, differing only by case", async () => {
      const email = `dupe-fixture-${Date.now()}@toktickit.test`;
      const first = await createUser(adminAgent, { email });
      expect(first.status).toBe(201);

      const response = await createUser(adminAgent, { email: email.toUpperCase() });
      expect(response.status).toBe(409);
      expect(response.body.errors.email).toBeDefined();
    });

    it("rejects editing a user's email to one already in use, differing only by case", async () => {
      const emailA = `dupe-edit-a-${Date.now()}@toktickit.test`;
      const emailB = `dupe-edit-b-${Date.now()}@toktickit.test`;
      const a = await createUser(adminAgent, { email: emailA });
      const b = await createUser(adminAgent, { email: emailB });

      const response = await withOrigin(adminAgent.patch(`/api/admin/users/${b.body.id}`)).send({
        email: emailA.toUpperCase(),
      });
      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();

      // Unaffected — b's email is still its own.
      const row = await getPrisma().user.findUniqueOrThrow({ where: { id: b.body.id } });
      expect(row.email).toBe(emailB);
      void a;
    });
  });

  // Design note: BR-37's guard only has to fire for an Administrator acting
  // on *themself* — cross-admin actions (A deactivates/demotes B) can never
  // actually drop the active-Administrator count to zero through this API,
  // because the caller (A) must themselves be an active Administrator to
  // pass requireRole("ADMINISTRATOR") in the first place, so A always
  // remains as "the other active Administrator" once B's request completes.
  // And self *deactivation* is already blocked unconditionally by the
  // self-suspend guard (API-43/BR-36), checked first. So the one scenario
  // that exercises BR-37 specifically (not BR-36) is: a sole active
  // Administrator changes their *own role* away from ADMINISTRATOR.
  describe("Self-suspend and last-admin guards (API-43, API-44, API-45)", () => {
    it("rejects an Administrator deactivating their own account", async () => {
      const response = await withOrigin(adminAgent.patch(`/api/admin/users/${adminId}`)).send({ isActive: false });
      expect(response.status).toBe(409);
      expect(response.body.error).toBeDefined();

      const row = await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } });
      expect(row.isActive).toBe(true);
    });

    it("rejects a role change away from ADMINISTRATOR on the sole active Administrator", async () => {
      const prisma = getPrisma();

      // Make `solo` the only active Administrator in the whole system for
      // this assertion, by deactivating every other one directly via
      // Prisma (bypassing the API's own guards — that's fine here, this is
      // fixture setup, not the thing under test). Always restored in
      // `finally`, even if the assertion itself throws.
      const solo = await createUser(adminAgent, { role: "ADMINISTRATOR", name: "Solo Admin" });
      expect(solo.status).toBe(201);
      // Admin-created accounts always start mustChangePassword: true —
      // clear it so this test's call isn't blocked by requirePasswordUpToDate
      // before it ever reaches the guard under test.
      await prisma.user.update({ where: { id: solo.body.id }, data: { mustChangePassword: false } });
      const soloAgent = await loginAgent(solo.body.email, "Fixture-Pass1");

      const otherActiveAdmins = await prisma.user.findMany({
        where: { role: "ADMINISTRATOR", isActive: true, NOT: { id: solo.body.id } },
        select: { id: true },
      });

      try {
        await prisma.user.updateMany({
          where: { id: { in: otherActiveAdmins.map((a) => a.id) } },
          data: { isActive: false },
        });

        const response = await withOrigin(soloAgent.patch(`/api/admin/users/${solo.body.id}`)).send({
          role: "IT_STAFF",
        });
        expect(response.status).toBe(409);
        expect(response.body.error).toBeDefined();

        const row = await prisma.user.findUniqueOrThrow({ where: { id: solo.body.id } });
        expect(row.role).toBe("ADMINISTRATOR");
      } finally {
        await prisma.user.updateMany({
          where: { id: { in: otherActiveAdmins.map((a) => a.id) } },
          data: { isActive: true },
        });
      }
    });

    it("allows deactivating/role-changing an Administrator when another active Administrator remains", async () => {
      const third = await createUser(adminAgent, { role: "ADMINISTRATOR", name: "Spare Admin" });
      expect(third.status).toBe(201);

      // adminAgent (role ADMINISTRATOR, active) remains active throughout,
      // so deactivating `third` never threatens the "at least one active
      // Administrator" invariant — this is the ordinary, unguarded path.
      const response = await withOrigin(adminAgent.patch(`/api/admin/users/${third.body.id}`)).send({
        isActive: false,
      });
      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
    });
  });

  describe("POST /api/admin/users/:id/reset-password (API-46)", () => {
    it("sets mustChangePassword: true, and the user is forced to change it at next login", async () => {
      const created = await createUser(adminAgent, { role: "REQUESTER" });
      expect(created.status).toBe(201);

      // Clear mustChangePassword first (simulating a user who already
      // completed their first login) so the reset's effect is observable.
      await getPrisma().user.update({ where: { id: created.body.id }, data: { mustChangePassword: false } });

      const response = await withOrigin(adminAgent.post(`/api/admin/users/${created.body.id}/reset-password`)).send({
        password: "New-Fixture-Pass1",
      });
      expect(response.status).toBe(200);
      expect(response.body.mustChangePassword).toBe(true);

      const freshAgent = await loginAgent(created.body.email, "New-Fixture-Pass1");
      const blocked = await freshAgent.get("/api/categories");
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    });

    it("rejects a password under 8 characters", async () => {
      const created = await createUser(adminAgent, { role: "REQUESTER" });
      const response = await withOrigin(adminAgent.post(`/api/admin/users/${created.body.id}/reset-password`)).send({
        password: "short1",
      });
      expect(response.status).toBe(400);
      expect(response.body.errors.password).toBeDefined();
    });

    it("carries no self/last-admin restriction (an Administrator may reset their own password)", async () => {
      const response = await withOrigin(adminAgent.post(`/api/admin/users/${adminId}/reset-password`)).send({
        password: "Self-Reset-Pass1",
      });
      expect(response.status).toBe(200);
      // Restore the fixture's usual password for any later test/describe
      // block in this file that logs in as adminEmail again.
      await getPrisma().user.update({
        where: { id: adminId },
        data: { mustChangePassword: false },
      });
      adminAgent = await loginAgent(adminEmail, "Self-Reset-Pass1");
    });
  });

  describe("PATCH never changes the password (API-47)", () => {
    it("ignores a password field included in the edit body", async () => {
      const created = await createUser(adminAgent, { role: "REQUESTER" });
      const before = await getPrisma().user.findUniqueOrThrow({ where: { id: created.body.id } });

      await withOrigin(adminAgent.patch(`/api/admin/users/${created.body.id}`)).send({
        name: "Renamed",
        password: "Whatever-New-Pass1",
      });

      const after = await getPrisma().user.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.name).toBe("Renamed");
    });
  });

  describe("Nonexistent :id (API-48)", () => {
    it("PATCH on a nonexistent id returns 404", async () => {
      const response = await withOrigin(adminAgent.patch("/api/admin/users/999999")).send({ name: "x" });
      expect(response.status).toBe(404);
    });

    it("reset-password on a nonexistent id returns 404", async () => {
      const response = await withOrigin(adminAgent.post("/api/admin/users/999999/reset-password")).send({
        password: "Fixture-Pass1",
      });
      expect(response.status).toBe(404);
    });
  });

  // API-51 / BR-38
  describe("No delete-user endpoint exists (API-51, BR-38)", () => {
    it("DELETE /api/admin/users/:id is not a route", async () => {
      const response = await withOrigin(adminAgent.delete(`/api/admin/users/${adminId}`));
      expect([404, 405]).toContain(response.status);

      const row = await getPrisma().user.findUniqueOrThrow({ where: { id: adminId } });
      expect(row).toBeDefined();
    });
  });
});
