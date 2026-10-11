-- Lab 4 (docs/lab-04/specification.md §7.4, BR-25): additive only. Adds the
-- ActionStatus enum, the ActionTaken and ActionTakenRevision tables, and
-- Ticket.version (default 1, so every existing row is valid). Nothing existing
-- is altered or dropped.
--
-- Rollback (only safe before Action Taken data has been written; otherwise
-- restore the pg_dump taken before this migration), also in the README:
--   DROP TABLE "ActionTakenRevision";
--   DROP TABLE "ActionTaken";
--   DROP TYPE "ActionStatus";
--   ALTER TABLE "Ticket" DROP COLUMN "version";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261012090000_lab4_actions_taken';

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "performedById" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT '',
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT NOT NULL DEFAULT '',
    "attachmentNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTakenRevision" (
    "id" SERIAL NOT NULL,
    "actionTakenId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "editedById" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ActionStatus" NOT NULL,
    "assigneeId" INTEGER,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL,
    "followUpNote" TEXT NOT NULL,
    "attachmentNotes" TEXT NOT NULL,

CONSTRAINT "ActionTakenRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex
CREATE INDEX "ActionTaken_assigneeId_status_idx" ON "ActionTaken"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ActionTakenRevision_actionTakenId_revision_key" ON "ActionTakenRevision"("actionTakenId", "revision");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenRevision" ADD CONSTRAINT "ActionTakenRevision_actionTakenId_fkey" FOREIGN KEY ("actionTakenId") REFERENCES "ActionTaken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenRevision" ADD CONSTRAINT "ActionTakenRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
