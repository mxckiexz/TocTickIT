import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword, validateNewPassword } from "../../src/auth.js";
import * as auth from "../../src/auth.js";

const FIXTURE_PASSWORD = "Fixture-Pass1";
const FIXTURE_EMAIL = "auth-fixture@toktickit.test";
const INACTIVE_FIXTURE_EMAIL = "auth-fixture-inactive@toktickit.test";

// api-spec.md "Authentication": every POST/PATCH/PUT/DELETE under /api/auth
// must carry the configured client Origin. A browser attaches it
// automatically; supertest doesn't, so these helpers add it. The dedicated
// "Origin gate" describe block at the bottom exercises the missing and
// mismatched cases directly.
const post = (url: string) => request(app).post(url).set("Origin", CLIENT_ORIGIN);
const agentWithOrigin = () => request.agent(app).set("Origin", CLIENT_ORIGIN);

// bcrypt at the mandated cost 12 (BR-06) is deliberately slow — bcryptjs is
// pure JS — and vitest runs test files in parallel workers that share the
// CPU. Observed: UNIT-01 below (one hash + two verifies) takes ~1.4s alone
// but hit 5148ms under CPU pressure and tripped vitest's 5s default. The
// cost stays at 12 (tests must not weaken BR-06); the time allowance is what
// gives.
vi.setConfig({ testTimeout: 30_000 });

// UNIT-01, UNIT-02 — pure-function coverage for the password helpers, no
// HTTP round trip.
describe("password helpers (UNIT-01, UNIT-02)", () => {
  it("hashes a password so it verifies against the original but never stores it in the clear", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    // BR-06: bcrypt (any $2a/$2b/$2y variant) at cost factor 12.
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
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
    const response = await post("/api/auth/login")
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
    const unknown = await post("/api/auth/login")
      .send({ email: "nobody@toktickit.test", password: FIXTURE_PASSWORD })
      .expect(401);
    const wrongPassword = await post("/api/auth/login")
      .send({ email: FIXTURE_EMAIL, password: "not the password" })
      .expect(401);
    const inactive = await post("/api/auth/login")
      .send({ email: INACTIVE_FIXTURE_EMAIL, password: FIXTURE_PASSWORD })
      .expect(401);

    expect(unknown.body).toEqual({ error: "Invalid email or password." });
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(inactive.body).toEqual(unknown.body);
  });

  // BR-07's "identical" isn't just the response body: an unknown email must
  // not skip the bcrypt compare a known email pays for, or the two are
  // distinguishable by timing even with the same status/body. Asserted at
  // the call-site level (verifyPassword always runs, against the documented
  // dummy hash for a nonexistent user) rather than by measuring wall-clock
  // time, which is too noisy to assert on reliably (see the file-level
  // testTimeout comment above).
  it("runs the same bcrypt comparison for an unknown email as for a known one (no early return before it)", async () => {
    const spy = vi.spyOn(auth, "verifyPassword");

    await post("/api/auth/login").send({ email: "nobody@toktickit.test", password: FIXTURE_PASSWORD }).expect(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(FIXTURE_PASSWORD, DUMMY_PASSWORD_HASH);

    spy.mockClear();
    await post("/api/auth/login").send({ email: FIXTURE_EMAIL, password: "not the password" }).expect(401);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("not the password", expect.stringMatching(/^\$2[aby]\$12\$/));

    spy.mockRestore();
  });

  // API-03
  it("rejects a login with missing email/password as a 400 with field errors", async () => {
    const response = await post("/api/auth/login").send({}).expect(400);
    expect(response.body.errors).toMatchObject({
      email: expect.any(String),
      password: expect.any(String),
    });
  });
});

describe("GET /api/auth/me", () => {
  const agent = agentWithOrigin();
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

    const agent = agentWithOrigin();
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

    const agent = agentWithOrigin();
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
    const agent = agentWithOrigin();
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
    const agent = agentWithOrigin();
    await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD }).expect(200);

    const response = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: FIXTURE_PASSWORD, newPassword: "BrandNewPass1", confirmPassword: "BrandNewPass1" })
      .expect(200);
    expect(response.body.mustChangePassword).toBe(false);

    await agent.post("/api/auth/logout");
    await post("/api/auth/login").send({ email: user.email, password: "BrandNewPass1" }).expect(200);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // API-09 / BR-08
  it("rejects a new password equal to the current one, and one under 8 characters", async () => {
    const prisma = getPrisma();
    const user = await makeUser();
    const agent = agentWithOrigin();
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
    const agent = agentWithOrigin();
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
    await post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "BrandNewPass1", confirmPassword: "BrandNewPass1" })
      .expect(401);
  });
});

// SEC-07, scoped to /api/auth/* (api-spec.md "Authentication" CSRF note). The
// full every-route sweep belongs to Feature 3, once Lab 2's routes sit behind
// sessions; this covers the state-changing routes this branch introduces.
describe("Origin gate on state-changing /api/auth routes (SEC-07)", () => {
  const EMAIL = "origin-gate-fixture@toktickit.test";
  const FORGED_ORIGINS = ["https://evil.example", `${CLIENT_ORIGIN}.evil.example`, "null"];
  const STATE_CHANGING = ["/api/auth/login", "/api/auth/logout", "/api/auth/change-password"];
  let userId: number;

  beforeAll(async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: EMAIL },
      update: { passwordHash, isActive: true, mustChangePassword: false },
      create: {
        name: "Origin Gate Fixture",
        email: EMAIL,
        role: "REQUESTER",
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
    await prisma.user.deleteMany({ where: { email: EMAIL } });
  });

  it.each(STATE_CHANGING)("POST %s with no Origin header is rejected 403", async (url) => {
    const response = await request(app)
      .post(url)
      .send({ email: EMAIL, password: FIXTURE_PASSWORD })
      .expect(403);
    expect(response.body.error).toBeDefined();
  });

  it.each(STATE_CHANGING.flatMap((url) => FORGED_ORIGINS.map((origin) => [url, origin] as const)))(
    "POST %s with mismatched Origin %s is rejected 403",
    async (url, origin) => {
      await request(app)
        .post(url)
        .set("Origin", origin)
        .send({ email: EMAIL, password: FIXTURE_PASSWORD })
        .expect(403);
    }
  );

  it("is 403, not 401, even with no session at all — the gate runs before authentication", async () => {
    const body = { currentPassword: FIXTURE_PASSWORD, newPassword: "BrandNewPass1", confirmPassword: "BrandNewPass1" };

    await request(app).post("/api/auth/change-password").set("Origin", "https://evil.example").send(body).expect(403);
    // Contrast: the same request with the right Origin gets past the gate and
    // is then rejected for having no session.
    await post("/api/auth/change-password").send(body).expect(401);
  });

  it("a forged logout leaves the victim's session intact", async () => {
    const agent = agentWithOrigin();
    await agent.post("/api/auth/login").send({ email: EMAIL, password: FIXTURE_PASSWORD }).expect(200);

    // The victim's browser would attach their cookie to a cross-site POST;
    // the attacker's page can't control the Origin the browser sends.
    await agent.post("/api/auth/logout").set("Origin", "https://evil.example").expect(403);

    await agent.get("/api/auth/me").expect(200);
  });

  it("a matching Origin passes the gate and reaches the route's own validation", async () => {
    // Empty body -> the login route's own 400, proving 403 was the gate's doing.
    await post("/api/auth/login").send({}).expect(400);
  });

  it("does not block the browser's CORS preflight (OPTIONS is not state-changing)", async () => {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", CLIENT_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe(CLIENT_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});
