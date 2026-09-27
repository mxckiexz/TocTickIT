import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { getPrisma } from "./prisma.js";

// docs/lab-03/specification.md §11 / api-spec.md "Authentication": bcrypt
// cost 12 (BR-06), 8-hour fixed session expiry (BR-11), HttpOnly/SameSite=Lax
// cookie holding an opaque server-side session id (not a JWT), so logout and
// account suspension take effect immediately (BR-10, BR-16).
export const SESSION_COOKIE_NAME = "toktickit_session";
const BCRYPT_COST = 12;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

// BR-08 (UNIT-02): a new password must be at least MIN_PASSWORD_LENGTH
// characters and must differ from the account's current password. Pulled
// out as a pure function so it's testable without an HTTP round trip.
export function validateNewPassword(newPassword: string, currentPassword: string): string | null {
  if (!newPassword) return "New password is required.";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (newPassword === currentPassword) {
    return "New password must be different from your current password.";
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// BR-07's "identical 401" is about the response *body*, but an unknown email
// used to skip bcrypt.compare entirely (just `user ? verify(...) : false`),
// so a known email took one bcrypt compare's worth of time longer than an
// unknown one — observable in response timing even though the body and
// status matched. Login now runs verifyPassword() against this fixed,
// unrelated hash whenever there's no real user/hash to compare against, so
// every login attempt does exactly one bcrypt compare at the same cost,
// regardless of whether the email exists. Not a real account's hash — see
// verifyPassword's call site in app.ts.
export const DUMMY_PASSWORD_HASH = "$2b$12$jQ7GdgpV1/pmC2b3.imBnu.ROg2P26bKYmLRMFevHxvIhp4jW5n3S";

export async function createSession(userId: number) {
  const prisma = getPrisma();
  return prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
}

// deleteMany, not delete: logging out with an already-gone/unknown session id
// is not an error (BR-10's "logout is idempotent").
export async function deleteSession(sessionId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}

// BR-11 (expiry) and BR-16 (deactivated-mid-session) both collapse to "no
// session" here — the caller (requireAuth) turns that into a plain 401,
// never a distinct "expired"/"deactivated" error (BR-07's spirit applied to
// every authenticated route, not just login).
export async function getSessionUser(sessionId: string | undefined): Promise<AuthenticatedUser | null> {
  if (!sessionId) return null;

  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.isActive) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
}

// Attaches req.user or responds 401 — used by the auth routes themselves
// (logout/me/change-password) in this branch. Wiring this onto Lab 2's
// ticket/attachment/staff/admin routes, plus role/ownership checks on top of
// it, is Feature 3's job (docs/lab-03/specification.md §3.1) — that's a
// deliberate scope boundary, not an oversight: Lab 2's routes keep working
// exactly as before until Feature 3 switches their identity source.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  const user = await getSessionUser(sessionId);

  if (!user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  req.user = user;
  next();
}

// api-spec.md's "Forced password change" note: every authenticated route
// other than change-password itself should reject a caller who still has
// mustChangePassword set. Composed as requireAuth + this, in that order.
// Not yet mounted on any route in this branch — there is no *other*
// protected route yet (Feature 3 adds the ones this would actually guard).
export function requirePasswordUpToDate(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      error: "Password change required.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }
  next();
}

// api-spec.md's CSRF note: SameSite=Lax plus an Origin allow-list on every
// state-changing request. Mounted in app.ts on /api/auth/* (login, logout,
// change-password), *before* the cookie parser, so a forged cross-origin
// request is rejected before any session is looked up — a missing/mismatched
// Origin is 403 even with no session at all, not 401 (specification.md BR-13's
// note). Lab 2's ticket/attachment routes are deliberately not covered yet:
// Feature 3 extends this to every protected route once it switches them to
// session identity and the client is guaranteed to send a matching Origin
// (a browser always does; Lab 2's tests, which build the Express app
// directly with no browser, don't).
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const stateChanging = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
  if (stateChanging && req.get("origin") !== CLIENT_ORIGIN) {
    return res.status(403).json({ error: "Request origin not allowed." });
  }
  next();
}
