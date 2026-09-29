import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { CLIENT_ORIGIN, hashPassword } from "../../src/auth.js";
import type { Role } from "@prisma/client";

// Shared by every Lab 2 test file once Feature 3 puts their routes behind
// sessions (docs/lab-03/tests.md §2.9, category 2 — extended here to server
// API tests too, not just client/e2e: a raw requesterId in the request no
// longer authenticates anything, so these tests need a real logged-in
// session the same way a browser would get one).
const DEFAULT_PASSWORD = "Fixture-Pass1";

export async function createFixtureUser(
  email: string,
  overrides: {
    role?: Role;
    isActive?: boolean;
    name?: string;
    password?: string;
    mustChangePassword?: boolean;
  } = {}
) {
  const prisma = getPrisma();
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(password);
  const mustChangePassword = overrides.mustChangePassword ?? false;
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: overrides.role ?? "REQUESTER",
      isActive: overrides.isActive ?? true,
      mustChangePassword,
    },
    create: {
      name: overrides.name ?? email,
      email,
      role: overrides.role ?? "REQUESTER",
      passwordHash,
      isActive: overrides.isActive ?? true,
      mustChangePassword,
    },
  });
  return { user, password };
}

// Origin is required on every state-changing request app-wide now
// (requireSameOrigin) — a real browser sends it automatically, supertest
// doesn't, so this wraps login itself.
export async function loginAgent(email: string, password: string = DEFAULT_PASSWORD) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").set("Origin", CLIENT_ORIGIN).send({ email, password }).expect(200);
  return agent;
}

// Session rows FK-reference User with ON DELETE RESTRICT, so a fixture user
// who ever logged in (i.e. via loginAgent/loginAndGetCookie) can't be deleted
// until their session(s) are gone too.
export async function deleteFixtureUser(email: string) {
  const prisma = getPrisma();
  await prisma.session.deleteMany({ where: { user: { email } } });
  await prisma.user.deleteMany({ where: { email } });
}

// For a single one-off authenticated request without keeping an agent
// around (e.g. a test that only ever makes one call as this user).
export async function loginAndGetCookie(email: string, password: string = DEFAULT_PASSWORD): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", CLIENT_ORIGIN)
    .send({ email, password })
    .expect(200);
  const cookie = response.headers["set-cookie"];
  if (!cookie) throw new Error("Login did not set a session cookie.");
  return Array.isArray(cookie) ? cookie[0] : cookie;
}

// Attach the required Origin header to a state-changing supertest call —
// short alias used throughout these files' POST/PATCH/DELETE calls.
export function withOrigin<T extends request.Test>(req: T): T {
  return req.set("Origin", CLIENT_ORIGIN) as T;
}
