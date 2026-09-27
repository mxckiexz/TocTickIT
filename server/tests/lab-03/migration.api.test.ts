import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { verifyPassword } from "../../src/auth.js";

// Lab 2 -> Lab 3 migration tests (docs/lab-03/tests.md §7). These replay the
// REAL migration files, in order, inside a throwaway Postgres schema:
//
//   1. replay every Lab 2 migration (everything before the auth migration),
//   2. load a known Lab 2 fixture and snapshot it   -> "before",
//   3. run 20260919060000_lab3_auth_foundation.sql   -> snapshot "after",
//   4. assert exact before/after invariants,
//   5. ROLL BACK — nothing is ever committed, so the live dev tables are
//      never touched and there is nothing to clean up, even if an assertion
//      or the SQL itself throws.
//
// This is why the assertions can be exact: the "before" is captured from the
// same run, not assumed. (Reading counts off the already-migrated dev DB
// can't distinguish "migration preserved the data" from "there happens to be
// some data".)

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prisma",
  "migrations"
);
const AUTH_MIGRATION = "20260919060000_lab3_auth_foundation";
// Documented in server/.env.example (SEED_DEFAULT_PASSWORD) and the migration's
// own header — a local-dev default, never a real secret.
const DOCUMENTED_DEFAULT_PASSWORD = "ChangeMe123!";

type Row = Record<string, any>;

// Comment-only lines are dropped first (one of the migration's header
// comments contains a ';'), then statements are split on a terminating ';'.
// Fine for these files: no DO/$$ blocks and no ';' inside string literals —
// if a future migration adds one, this splitter needs to grow with it.
function statementsOf(migrationDir: string): string[] {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, migrationDir, "migration.sql"), "utf8");
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const lab2MigrationDirs = readdirSync(MIGRATIONS_DIR)
  .filter((dir) => /^\d{14}_/.test(dir) && dir < AUTH_MIGRATION)
  .sort();

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

// Deliberately awkward on purpose: non-contiguous ids (so "the sequence was
// advanced" and "ids were preserved" are both observable), an inactive
// Requester who still owns a ticket, an apostrophe and a non-ASCII character
// in a name, a multi-line description, and a soft-removed attachment.
const REQUESTERS = [
  { id: 1, name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", isActive: true, createdAt: "2026-08-16 10:27:13.123" },
  { id: 2, name: "Michael Brown", email: "michael.brown@toktickit.test", isActive: true, createdAt: "2026-08-16 10:27:14.456" },
  { id: 7, name: "Zoë O'Neil", email: "zoe.oneil@toktickit.test", isActive: true, createdAt: "2026-09-02 08:00:00.000" },
  { id: 9, name: "Retired Requester", email: "retired.requester@toktickit.test", isActive: false, createdAt: "2026-09-03 12:34:56.789" },
];
const TICKETS = [
  { id: 101, number: "TKT-MIG-000101", requesterId: 1, summary: "Laptop won't boot", description: 'Line one\nLine two with "quotes"', priority: "HIGH" },
  { id: 102, number: "TKT-MIG-000102", requesterId: 1, summary: "VPN drops hourly", description: "Only on Wi-Fi.", priority: "MEDIUM" },
  { id: 103, number: "TKT-MIG-000103", requesterId: 7, summary: "Printer offline", description: "Floor 3.", priority: "LOW" },
  { id: 104, number: "TKT-MIG-000104", requesterId: 9, summary: "Owned by an inactive Requester", description: "Must survive the migration.", priority: "LOW" },
  { id: 105, number: "TKT-MIG-000105", requesterId: 2, summary: "Email sync", description: "Mobile only.", priority: "MEDIUM" },
];

function fixtureStatements(): string[] {
  const ts = "2026-09-04 09:00:00.000";
  return [
    `INSERT INTO "Category" ("id","name","isActive","createdAt") VALUES (1,'Hardware',true,'${ts}'),(2,'Software',true,'${ts}')`,
    `INSERT INTO "RelatedSystem" ("id","name","isActive","createdAt") VALUES (1,'VPN',true,'${ts}'),(2,'Printer',true,'${ts}')`,
    `INSERT INTO "Requester" ("id","name","email","isActive","createdAt") VALUES ${REQUESTERS.map(
      (r) => `(${r.id},${q(r.name)},${q(r.email)},${r.isActive},'${r.createdAt}')`
    ).join(",")}`,
    `INSERT INTO "Ticket" ("id","ticketNumber","requesterId","categoryId","relatedSystemId","summary","description","requestedPriority","currentStatus","createdAt","updatedAt") VALUES ${TICKETS.map(
      (t) => `(${t.id},${q(t.number)},${t.requesterId},1,1,${q(t.summary)},${q(t.description)},'${t.priority}','New','${ts}','${ts}')`
    ).join(",")}`,
    `INSERT INTO "Attachment" ("id","ticketId","originalFilename","storedFilename","mimeType","sizeBytes","createdAt","removedAt","removalReason") VALUES
       (201,101,'boot-error.png','stored-201.png','image/png',2048,'${ts}',NULL,NULL),
       (202,103,'queue.pdf','stored-202.pdf','application/pdf',4096,'${ts}',NULL,NULL),
       (203,103,'wrong.png','stored-203.png','image/png',1024,'${ts}','2026-09-05 10:00:00.000','Uploaded the wrong file')`,
  ];
}

const dump = async (tx: Prisma.TransactionClient, table: string): Promise<Row[]> =>
  (await tx.$queryRawUnsafe<{ r: Row }[]>(`SELECT row_to_json(t) AS r FROM "${table}" t ORDER BY t."id"`)).map((x) => x.r);

const scalar = async (tx: Prisma.TransactionClient, sql: string): Promise<any> =>
  (await tx.$queryRawUnsafe<{ v: any }[]>(sql))[0]?.v;

class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super("intentional rollback — migration test scratch schema is never committed");
  }
}

async function runMigrationScenario() {
  const prisma = getPrisma();
  const schema = `mig_test_${process.pid}_${Date.now()}`;

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        // LOCAL: scoped to this transaction's single connection, and gone
        // with the rollback. Every unqualified "Ticket"/"User" below now
        // resolves inside the scratch schema, never public.
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);

        for (const dir of lab2MigrationDirs) {
          for (const statement of statementsOf(dir)) await tx.$executeRawUnsafe(statement);
        }
        for (const statement of fixtureStatements()) await tx.$executeRawUnsafe(statement);

        const fkTargetSql = `SELECT confrelid::regclass::text AS v FROM pg_constraint
                              WHERE conname = 'Ticket_requesterId_fkey' AND conrelid = '"Ticket"'::regclass`;
        const requesterTableSql = `SELECT to_regclass('"Requester"')::text AS v`;

        const before = {
          requesters: await dump(tx, "Requester"),
          tickets: await dump(tx, "Ticket"),
          attachments: await dump(tx, "Attachment"),
          categories: await dump(tx, "Category"),
          relatedSystems: await dump(tx, "RelatedSystem"),
          requesterTable: await scalar(tx, requesterTableSql),
          fkTarget: await scalar(tx, fkTargetSql),
        };

        for (const statement of statementsOf(AUTH_MIGRATION)) await tx.$executeRawUnsafe(statement);

        const after = {
          users: await dump(tx, "User"),
          tickets: await dump(tx, "Ticket"),
          attachments: await dump(tx, "Attachment"),
          categories: await dump(tx, "Category"),
          relatedSystems: await dump(tx, "RelatedSystem"),
          requesterTable: await scalar(tx, requesterTableSql),
          fkTarget: await scalar(tx, fkTargetSql),
          // Taken last so this extra row can't leak into the snapshots above:
          // the id the NEXT user (e.g. an admin-created one) would get.
          nextUserId: await scalar(
            tx,
            `INSERT INTO "User" ("name","email","passwordHash","role","updatedAt")
             VALUES ('Next User','next.user@toktickit.test','x','REQUESTER',CURRENT_TIMESTAMP) RETURNING "id" AS v`
          ),
        };

        throw new Rollback({ before, after });
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
  } catch (error) {
    if (error instanceof Rollback) return error.value as { before: any; after: any };
    throw error;
  }
  throw new Error("unreachable: the scenario always ends in an intentional rollback");
}

describe("Lab 2 -> Lab 3 migration (real migration SQL, exact before/after, rolled back)", () => {
  let before: Record<string, any>;
  let after: Record<string, any>;

  beforeAll(async () => {
    ({ before, after } = await runMigrationScenario());
  }, 180_000);

  it("replays the real Lab 2 migrations and loads the fixture (guards every equality below against being vacuous)", () => {
    expect(lab2MigrationDirs.length).toBeGreaterThanOrEqual(5);
    expect(before.requesters).toHaveLength(REQUESTERS.length);
    expect(before.tickets).toHaveLength(TICKETS.length);
    expect(before.attachments).toHaveLength(3);
    expect(before.categories).toHaveLength(2);
    expect(before.relatedSystems).toHaveLength(2);
    expect(before.requesterTable).not.toBeNull();
    expect(before.fkTarget).toBe('"Requester"');
  });

  it("MIG-01: Ticket, Attachment, Category and RelatedSystem rows are byte-for-byte unchanged", () => {
    // Full-row equality (every column, incl. timestamps, the soft-removal
    // fields and multi-line text), not just counts.
    expect(after.tickets).toEqual(before.tickets);
    expect(after.attachments).toEqual(before.attachments);
    expect(after.categories).toEqual(before.categories);
    expect(after.relatedSystems).toEqual(before.relatedSystems);
  });

  it("MIG-02: every Requester became exactly one User with the same id/name/email/isActive/createdAt, role REQUESTER, mustChangePassword true", async () => {
    expect(after.users).toHaveLength(before.requesters.length);

    const sharedHash = after.users[0].passwordHash;
    for (const requester of before.requesters) {
      const user = after.users.find((u: Row) => u.id === requester.id);
      expect(user, `no User row for Requester ${requester.id}`).toBeDefined();
      expect(user).toMatchObject({
        id: requester.id,
        name: requester.name,
        email: requester.email,
        isActive: requester.isActive,
        createdAt: requester.createdAt,
        updatedAt: requester.createdAt,
        role: "REQUESTER",
        mustChangePassword: true,
        passwordHash: sharedHash,
      });
    }

    // The migration's hard-coded hash really is bcrypt of the documented
    // default — and a bcrypt hash, not the plaintext.
    expect(sharedHash).not.toBe(DOCUMENTED_DEFAULT_PASSWORD);
    expect(await verifyPassword(DOCUMENTED_DEFAULT_PASSWORD, sharedHash)).toBe(true);
  }, 30_000);

  it("MIG-03: every Ticket still points at the same id, which now resolves to the same person; nothing was re-owned", () => {
    const requesterById = new Map<number, Row>(before.requesters.map((r: Row) => [r.id, r]));
    const userById = new Map<number, Row>(after.users.map((u: Row) => [u.id, u]));

    for (const ticket of before.tickets) {
      const migrated = after.tickets.find((t: Row) => t.id === ticket.id);
      expect(migrated.requesterId).toBe(ticket.requesterId);

      const originalOwner = requesterById.get(ticket.requesterId)!;
      expect(userById.get(migrated.requesterId)).toMatchObject({
        name: originalOwner.name,
        email: originalOwner.email,
        isActive: originalOwner.isActive,
      });
    }

    // The foreign key itself moved: it targeted "Requester" before.
    expect(after.fkTarget).toBe('"User"');
  });

  it("contract step: the Requester table is gone, and the User id sequence continues after the highest migrated id", () => {
    expect(after.requesterTable).toBeNull();

    const highestMigratedId = Math.max(...before.requesters.map((r: Row) => r.id));
    expect(after.nextUserId).toBe(highestMigratedId + 1);
  });
});

describe("live development database state (a schema check, not a before/after)", () => {
  it("has the auth migration recorded as finished, no Requester table, and Ticket.requesterId targeting User", async () => {
    const prisma = getPrisma();

    const applied = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "_prisma_migrations" WHERE migration_name = '${AUTH_MIGRATION}' AND finished_at IS NOT NULL`
    );
    expect(Number(applied[0].n)).toBe(1);

    const requesterTable = await prisma.$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT to_regclass('public."Requester"')::text AS v`
    );
    expect(requesterTable[0].v).toBeNull();

    const fk = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT confrelid::regclass::text AS v FROM pg_constraint
        WHERE conname = 'Ticket_requesterId_fkey' AND conrelid = 'public."Ticket"'::regclass`
    );
    expect(fk[0].v.replace(/"/g, "").replace(/^public\./, "")).toBe("User");
  });
});
