-- Lab 3 — Authorization & Requester Regression (Issue #36 /
-- feature/3-authorization-requester-regression)
--
-- Expand -> backfill -> contract, per specification.md §7.2/§7.4: adds
-- Ticket Owner, IT Priority, a proper TicketStatus enum (replacing the free-
-- text currentStatus column), the Requester "marked resolved" signal, and
-- the PublicComment/InternalNote models. Every existing Ticket/Attachment
-- row's requesterId/ownership relationship is untouched (BR-30/BR-31).

-- ---------------------------------------------------------------------------
-- 1. Expand — new enum, new nullable columns, new tables
-- ---------------------------------------------------------------------------
CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED');

ALTER TABLE "Ticket" ADD COLUMN "ownerId" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "Priority";
ALTER TABLE "Ticket" ADD COLUMN "requesterMarkedResolvedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN "requesterMarkedResolvedById" INTEGER;
-- Built alongside the old column so every existing row can be backfilled
-- before the switch — see step 3.
ALTER TABLE "Ticket" ADD COLUMN "currentStatus_new" "TicketStatus";

CREATE TABLE "PublicComment" (
    "id"        SERIAL NOT NULL,
    "ticketId"  INTEGER NOT NULL,
    "authorId"  INTEGER NOT NULL,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalNote" (
    "id"        SERIAL NOT NULL,
    "ticketId"  INTEGER NOT NULL,
    "authorId"  INTEGER NOT NULL,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 2. Backfill — every existing Ticket gets itPriority = requestedPriority
--    (BR-20's "copied at creation", applied retroactively for pre-existing
--    rows) and currentStatus_new = NEW (the only value any Lab 2 row ever
--    had — verified via a fresh `SELECT DISTINCT "currentStatus"` before
--    writing this migration; the ELSE branch is defensive, not reachable
--    against today's data).
-- ---------------------------------------------------------------------------
UPDATE "Ticket" SET "itPriority" = "requestedPriority";

UPDATE "Ticket" SET "currentStatus_new" = CASE "currentStatus"
    WHEN 'New' THEN 'NEW'::"TicketStatus"
    ELSE 'NEW'::"TicketStatus"
END;

-- ---------------------------------------------------------------------------
-- 3. Contract — enforce NOT NULL now that every row has a value, drop the
--    old free-text column, and rename the new one into its place.
-- ---------------------------------------------------------------------------
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "currentStatus_new" SET NOT NULL;

ALTER TABLE "Ticket" DROP COLUMN "currentStatus";
ALTER TABLE "Ticket" RENAME COLUMN "currentStatus_new" TO "currentStatus";
ALTER TABLE "Ticket" ALTER COLUMN "currentStatus" SET DEFAULT 'NEW';

-- ---------------------------------------------------------------------------
-- 4. Foreign keys + indexes for the new columns/tables
-- ---------------------------------------------------------------------------
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterMarkedResolvedById_fkey"
    FOREIGN KEY ("requesterMarkedResolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");
CREATE INDEX "Ticket_currentStatus_idx" ON "Ticket"("currentStatus");

ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PublicComment_ticketId_idx" ON "PublicComment"("ticketId");

ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InternalNote_ticketId_idx" ON "InternalNote"("ticketId");
