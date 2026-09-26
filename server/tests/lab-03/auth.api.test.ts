import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword, verifyPassword, validateNewPassword } from "../../src/auth.js";

const FIXTURE_PASSWORD = "Fixture-Pass1";
const FIXTURE_EMAIL = "auth-fixture@toktickit.test";
const INACTIVE_FIXTURE_EMAIL = "auth-fixture-inactive@toktickit.test";

// UNIT-01, UNIT-02 — pure-function coverage for the password helpers, no
// HTTP round trip.
describe("password helpers (UNIT-01, UNIT-02)", () => {
  it("hashes a password so it verifies against the original but never stores it in the clear", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("validateNewPassword rejects short and same-as-current passwords, accepts a valid one (BR-08)", () => {
    expect(validateNewPassword("short1", "CurrentPass1")).toMatch(/at least 8 characters/);
    expect(validateNewPassword("CurrentPass1", "CurrentPass1")).toMatch(/different from your current password/);
    expect(validateNewPassword("", "CurrentPass1")).toMatch(/required/);
    expect(validateNewPassword("BrandNewPass1", "CurrentPass1")).toBeNull();
  });
});

describe("POST /api/auth/login", () => {
  let activeUserId: number;

  beforeAll(async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);

    const active = await prisma.user.upsert({
      where: { email: FIXTURE_EMAIL },
      update: { passwordHash, isActive: true, mustChangePassword: true },
      create: {
        name: "Auth Fixture Active",
        email: FIXTURE_EMAIL,
        role: "REQUESTER",
        passwordHash,
        isActive: true,
        mustChangePassword: true,
      },
    });
    activeUserId = active.id;

    await prisma.user.upsert({
      where: { email: INACTIVE_FIXTURE_EMAIL },
      update: { passwordHash, isActive: false },
      create: {
        name: "Auth Fixture Inactive",
        email: INACTIVE_FIXTURE_EMAIL,
        role: "REQUESTER",
        passwordHash,
        isActive: false,
        mustChangePassword: true,
      },
    });
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.session.deleteMany({ where: { userId: activeUserId } });
    await prisma.user.deleteMany({ where: { email: { in: [FIXTURE_EMAIL, INACTIVE_FIXTURE_EMAIL] } } });
  });

  // API-01 / AC-01
  it("logs in with valid credentials, sets the session cookie, and returns the user's identity", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD })
      .expect(200);

    expect(response.body).toMatchObject({
      id: activeUserId,
      name: "Auth Fixture Active",
      email: FIXTURE_EMAIL,
      role: "REQUESTER",
      mustChangePassword: true,
    });
    expect(response.body.passwordHash).toBeUndefined();

    const setCookie: string[] = Array.isArray(response.headers["set-cookie"])
      ? (response.headers["set-cookie"] as string[])
      : [response.headers["set-cookie"] as unknown as string];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith("toktickit_session="))).toBe(true);
    expect(setCookie.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  // API-02 / AC-05 / BR-01 / BR-07 — identical 401 for all three cases.
  it("rejects an unknown email, a wrong password, and an inactive account with the identical response", async () => {
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@toktickit.test", password: FIXTURE_PASSWORD })
      .expect(401);
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: FIXTURE_EMAIL, password: "not the password" })
      .expect(401);
    const inactive = await request(app)
      .post("/api/auth/login")
      .send({ email: INACTIVE_FIXTURE_EMAIL, password: FIXTURE_PASSWORD })
      .expect(401);

    expect(unknown.body).toEqual({ error: "Invalid email or password." });
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(inactive.body).toEqual(unknown.body);
  });

  // API-03
  it("rejects a login with missing email/password as a 400 with field errors", async () => {
    const response = await request(app).post("/api/auth/login").send({}).expect(400);
    expect(response.body.errors).toMatchObject({
      email: expect.any(String),
      password: expect.any(String),
    });
  });
});

describe("GET /api/auth/me", () => {
  const agent = request.agent(app);
  let userId: number;

  beforeAll(async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: "me-fixture@toktickit.test" },
      update: { passwordHash, isActive: true },
      create: {
        name: "Me Fixture",
        email: "me-fixture@toktickit.test",
        role: "IT_STAFF",
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  // API-05 / AC-07
  it("returns 401 with no session cookie", async () => {
    const response = await request(app).get("/api/auth/me").expect(401);
    expect(response.body).toEqual({ error: "Authentication required." });
  });

  // API-06 / BR-12
  it("returns 200 with the current identity for a valid session", async () => {
    await agent.post("/api/auth/login").send({ email: "me-fixture@toktickit.test", password: FIXTURE_PASSWORD }).expect(200);

    const response = await agent.get("/api/auth/me").expect(200);
    expect(response.body).toMatchObject({
      id: userId,
      name: "Me Fixture",
      role: "IT_STAFF",
      mustChangePassword: false,
    });
  });
});

describe("POST /api/auth/logout", () => {
  // API-04 / AC-06 / BR-10
  it("invalidates the session so a replayed cookie is rejected afterward", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const user = await prisma.user.create({
      data: {
        name: "Logout Fixture",
        email: "logout-fixture@toktickit.test",
        role: "REQUESTER",
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);
    await agent.get("/api/auth/me").expect(200);

    await agent.post("/api/auth/logout").expect(200, { ok: true });
    await agent.get("/api/auth/me").expect(401);

    // Logout is idempotent — calling it again with no session left is still 200.
    await agent.post("/api/auth/logout").expect(200, { ok: true });

    await prisma.user.delete({ where: { id: user.id } });
  });

  // API-11 / BR-11 — an expired session behaves exactly like no session.
  it("treats an expired session as unauthenticated", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const user = await prisma.user.create({
      data: {
        name: "Expiry Fixture",
        email: "expiry-fixture@toktickit.test",
        role: "REQUESTER",
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      },
    });

    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);
    await agent.get("/api/auth/me").expect(200);

    // Force the session row's expiresAt into the past (BR-11: 8h fixed expiry).
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await agent.get("/api/auth/me").expect(401);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("POST /api/auth/change-password", () => {
  async function makeUser(overrides: Partial<{ mustChangePassword: boolean }> = {}) {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    return prisma.user.create({
      data: {
        name: "Change Password Fixture",
        email: `change-password-fixture-${Date.now()}-${Math.random()}@toktickit.test`,
        role: "REQUESTER",
        passwordHash,
        isActive: true,
        mustChangePassword: overrides.mustChangePassword ?? true,
      },
    });
  }

  // API-07 / AC-08
  it("rejects a wrong current password and leaves mustChangePassword untouched", async () => {
    const prisma = getPrisma();
    const user = await makeUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);

    const response = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "wrong", newPassword: "BrandNewPass1", confirmPassword: "BrandNewPass1" })
      .expect(401);
    expect(response.body).toEqual({ error: "Current password is incorrect." });

    const stillMustChange = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stillMustChange.mustChangePassword).toBe(true);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // API-08 / AC-09 / BR-09
  it("changes the password, clears mustChangePassword, and the new password logs in next time", async () => {
    const prisma = getPrisma();
    const user = await makeUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);

    const response = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: FIXTURE_PASSWORD, newPassword: "BrandNewPass1", confirmPassword: "BrandNewPass1" })
      .expect(200);
    expect(response.body.mustChangePassword).toBe(false);

    await agent.post("/api/auth/logout");
    await request(app).post("/api/auth/login").send({ email: user.email, password: "BrandNewPass1" }).expect(200);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // API-09 / BR-08
  it("rejects a new password equal to the current one, and one under 8 characters", async () => {
    const prisma = getPrisma();
    const user = await makeUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);

    const same = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: FIXTURE_PASSWORD, newPassword: FIXTURE_PASSWORD, confirmPassword: FIXTURE_PASSWORD })
      .expect(400);
    expect(same.body.errors.newPassword).toMatch(/different from your current password/);

    const tooShort = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: FIXTURE_PASSWORD, newPassword: "short1", confirmPassword: "short1" })
      .expect(400);
    expect(tooShort.body.errors.newPassword).toMatch(/at least 8 characters/);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("rejects a mismatched confirmation", async () => {
    const prisma = getPrisma();
    const user = await makeUser();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);

    const response = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: FIXTURE_PASSWORD, newPassword: "BrandNewPass1", confirmPassword: "SomethingElse1" })
      .expect(400);
    expect(response.body.errors.confirmPassword).toMatch(/do not match/);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("requires an authenticated session", async () => {
    await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "BrandNewPass1", confirmPassword: "BrandNewPass1" })
      .expect(401);
  });
});
