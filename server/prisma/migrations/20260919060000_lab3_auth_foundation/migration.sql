-- Lab 3 — Authentication Foundation (Issue #35 / feature/2-authentication-foundation)
--
-- Expand -> backfill -> contract, per docs/lab-03/specification.md §7.4:
--   1. Expand: create "User" and "Session" (new tables; no existing data touched).
--   2. Backfill: copy every "Requester" row into "User" with the SAME id, so
--      "Ticket"."requesterId" values need no rewriting at all.
--   3. Contract: repoint the FK from "Requester" to "User", then drop "Requester".
--
-- Every "User" row created here has role REQUESTER and mustChangePassword =
-- true, with the shared local-dev default password documented in
-- server/.env.example (never a real secret — see specification.md §7.5).

-- ---------------------------------------------------------------------------
-- 1. Expand
-- ---------------------------------------------------------------------------
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

CREATE TABLE "User" (
    "id"                 SERIAL NOT NULL,
    "name"               TEXT NOT NULL,
    "email"              TEXT NOT NULL,
    "passwordHash"       TEXT NOT NULL,
    "role"               "Role" NOT NULL,
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
    "id"        TEXT NOT NULL,
    "userId"    INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Backfill — every Requester becomes a User with role REQUESTER, the same
--    id/name/email/isActive (BR-30), and the seeded local-dev default
--    password, forced to change at next login.
--    Hash below is bcrypt(cost=12) of the local-dev default password
--    "ChangeMe123!" — documented in server/.env.example, never a real secret.
-- ---------------------------------------------------------------------------
INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "createdAt", "updatedAt")
SELECT
    "id",
    "name",
    "email",
    '$2b$12$APutU5UyqjrAMrAOlhKun.NAwSoEG5YabyunTZI/JEEmJjZ56VXfy',
    'REQUESTER',
    "isActive",
    true,
    "createdAt",
    "createdAt"
FROM "Requester";

-- Keep the User id sequence ahead of every id just inserted explicitly above,
-- so the next admin-created user doesn't collide with a migrated one.
SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE((SELECT MAX("id") FROM "User"), 1));

-- ---------------------------------------------------------------------------
-- 3. Contract — repoint Ticket.requesterId at User, then drop Requester.
--    Ticket rows are never rewritten: the backfill above reused the same ids.
-- ---------------------------------------------------------------------------
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_requesterId_fkey";

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "Requester";
