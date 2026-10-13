import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";

// Lab 3 -> Lab 4 migration tests (docs/lab-04/tests.md §4: MIG-01, MIG-02, plus
// the rollback and the new constraints). Same technique as the Lab 3 migration
// test: replay the REAL migration files inside a throwaway Postgres schema,
// load a Lab 3 fixture, snapshot, run the Lab 4 migration, snapshot again,
// assert exact before/after invariants, then roll everything back so the live
// dev tables are never touched.

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prisma",
  "migrations"
);
const LAB4_MIGRATION = "20261012090000_lab4_actions_taken";
const ROLLBACK_SQL = [
  `DROP TABLE "ActionTakenRevision"`,
  `DROP TABLE "ActionTaken"`,
  `DROP TYPE "ActionStatus"`,
  `ALTER TABLE "Ticket" DROP COLUMN "version"`,
];

type Row = Record<string, any>;

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

const lab3MigrationDirs = readdirSync(MIGRATIONS_DIR)
  .filter((dir) => /^\d{14}_/.test(dir) && dir < LAB4_MIGRATION)
  .sort();

const ts = "2026-10-01 09:00:00.000";
const FIXTURE = [
  `INSERT INTO "Category" ("id","name","isActive","createdAt") VALUES (1,'Hardware',true,'${ts}'),(2,'Software',true,'${ts}')`,
  `INSERT INTO "RelatedSystem" ("id","name","isActive","createdAt") VALUES (1,'VPN',true,'${ts}'),(2,'Printer',true,'${ts}')`,
  `INSERT INTO "User" ("id","name","email","passwordHash","role","isActive","mustChangePassword","createdAt","updatedAt") VALUES
     (1,'Req One','req1@toktickit.test','x','REQUESTER',true,true,'${ts}','${ts}'),
     (2,'Staff Two','staff2@toktickit.test','x','IT_STAFF',true,false,'${ts}','${ts}'),
     (3,'Admin Three','admin3@toktickit.test','x','ADMINISTRATOR',true,false,'${ts}','${ts}')`,
  `INSERT INTO "Ticket" ("id","ticketNumber","requesterId","categoryId","relatedSystemId","summary","description","requestedPriority","itPriority","currentStatus","ownerId","createdAt","updatedAt") VALUES
     (101,'TKT-MIG4-000101',1,1,1,'Laptop','Line one' || chr(10) || 'Line two','HIGH','HIGH','NEW',NULL,'${ts}','${ts}'),
     (102,'TKT-MIG4-000102',1,2,2,'Printer','Floor 3','LOW','MEDIUM','IN_PROGRESS',2,'${ts}','${ts}'),
     (103,'TKT-MIG4-000103',1,2,1,'Resolved one','Done','MEDIUM','MEDIUM','RESOLVED',2,'${ts}','${ts}')`,
  `INSERT INTO "PublicComment" ("ticketId","authorId","body","createdAt") VALUES (102,2,'Working on it','${ts}')`,
  `INSERT INTO "InternalNote" ("ticketId","authorId","body","createdAt") VALUES (102,2,'Check the tray sensor','${ts}')`,
];

const LAB3_TABLES = ["Category", "RelatedSystem", "User", "Session", "Ticket", "PublicComment", "InternalNote", "Attachment"];

const dump = async (tx: Prisma.TransactionClient, table: string): Promise<Row[]> =>
  (await tx.$queryRawUnsafe<{ r: Row }[]>(`SELECT row_to_json(t) AS r FROM "${table}" t ORDER BY t."id"`)).map((x) => x.r);

const columns = async (tx: Prisma.TransactionClient): Promise<Row[]> =>
  tx.$queryRawUnsafe<Row[]>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = current_schema()
       ORDER BY table_name, column_name`
  );
const constraints = async (tx: Prisma.TransactionClient): Promise<string[]> =>
  (await tx.$queryRawUnsafe<{ v: string }[]>(
    `SELECT conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) AS v
       FROM pg_constraint WHERE connamespace = current_schema()::regnamespace ORDER BY 1`
  )).map((x) => x.v);
const indexes = async (tx: Prisma.TransactionClient): Promise<string[]> =>
  (await tx.$queryRawUnsafe<{ v: string }[]>(
    `SELECT indexdef AS v FROM pg_indexes WHERE schemaname = current_schema() ORDER BY 1`
  )).map((x) => x.v);
const tables = async (tx: Prisma.TransactionClient): Promise<string[]> =>
  (await tx.$queryRawUnsafe<{ v: string }[]>(
    `SELECT table_name AS v FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY 1`
  )).map((x) => x.v);

async function snapshot(tx: Prisma.TransactionClient) {
  const data: Record<string, Row[]> = {};
  for (const table of LAB3_TABLES) data[table] = await dump(tx, table);
  return {
    data,
    columns: await columns(tx),
    constraints: await constraints(tx),
    indexes: await indexes(tx),
    tables: await tables(tx),
  };
}

// Runs one statement that is EXPECTED to fail and returns the Postgres SQLSTATE
// (23505 unique violation, 23503 foreign key violation, 22P02 bad enum value); a savepoint keeps the surrounding transaction usable afterwards.
async function expectFailure(tx: Prisma.TransactionClient, sql: string): Promise<string> {
  await tx.$executeRawUnsafe(`SAVEPOINT expected_failure`);
  try {
    await tx.$executeRawUnsafe(sql);
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT expected_failure`);
    // Prisma wraps the driver error; the Postgres SQLSTATE is in "Code: `xxxxx`".
    return /Code: `(\w+)`/.exec(String((error as Error).message))?.[1] ?? String(error);
  }
  await tx.$executeRawUnsafe(`RELEASE SAVEPOINT expected_failure`);
  return "";
}

class Rollback<T> extends Error {
  constructor(readonly value: T) {
    super("intentional rollback: migration test scratch schema is never committed");
  }
}

async function runScenario() {
  const prisma = getPrisma();
  const schema = `mig4_test_${process.pid}_${Date.now()}`;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        for (const dir of lab3MigrationDirs) {
          for (const statement of statementsOf(dir)) await tx.$executeRawUnsafe(statement);
        }
        for (const statement of FIXTURE) await tx.$executeRawUnsafe(statement);

        const before = await snapshot(tx);
        for (const statement of statementsOf(LAB4_MIGRATION)) await tx.$executeRawUnsafe(statement);
        const after = await snapshot(tx);

        const probe: Record<string, any> = {};
        // Defaults of a minimal action insert.
        await tx.$executeRawUnsafe(
          `INSERT INTO "ActionTaken" ("ticketId","performedById","description","updatedAt")
           VALUES (102,2,'Reseated the tray sensor','${ts}')`
        );
        probe.minimalAction = (await dump(tx, "ActionTaken"))[0];
        const actionId = probe.minimalAction.id;
        // Revision uniqueness, enum check, foreign keys, restrict on delete.
        await tx.$executeRawUnsafe(
          `INSERT INTO "ActionTakenRevision" ("actionTakenId","revision","editedById","status","actionAt","description","result","followUpRequired","followUpNote","attachmentNotes")
           VALUES (${actionId},1,2,'PLANNED','${ts}','Reseated the tray sensor','',false,'','')`
        );
        probe.duplicateRevision = await expectFailure(
          tx,
          `INSERT INTO "ActionTakenRevision" ("actionTakenId","revision","editedById","status","actionAt","description","result","followUpRequired","followUpNote","attachmentNotes")
           VALUES (${actionId},1,2,'PLANNED','${ts}','again','',false,'','')`
        );
        probe.badStatus = await expectFailure(
          tx,
          `INSERT INTO "ActionTaken" ("ticketId","performedById","status","description","updatedAt") VALUES (102,2,'DONE','x','${ts}')`
        );
        probe.missingTicket = await expectFailure(
          tx,
          `INSERT INTO "ActionTaken" ("ticketId","performedById","description","updatedAt") VALUES (99999,2,'x','${ts}')`
        );
        probe.missingPerformer = await expectFailure(
          tx,
          `INSERT INTO "ActionTaken" ("ticketId","performedById","description","updatedAt") VALUES (102,99999,'x','${ts}')`
        );
        probe.deleteTicketWithAction = await expectFailure(tx, `DELETE FROM "Ticket" WHERE "id" = 102`);
        probe.deleteActionWithRevision = await expectFailure(tx, `DELETE FROM "ActionTaken" WHERE "id" = ${actionId}`);
        probe.ticketVersionAfterProbe = (await dump(tx, "Ticket")).map((t) => t.version);
        probe.indexes = await indexes(tx);

        // Documented rollback, applied to the migrated scratch schema (with the
        // probe rows removed first, as the README says it is only safe before
        // Action Taken data exists).
        await tx.$executeRawUnsafe(`DELETE FROM "ActionTakenRevision"`);
        await tx.$executeRawUnsafe(`DELETE FROM "ActionTaken"`);
        for (const statement of ROLLBACK_SQL) await tx.$executeRawUnsafe(statement);
        const rolledBack = await snapshot(tx);

        throw new Rollback({ before, after, probe, rolledBack });
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
  } catch (error) {
    if (error instanceof Rollback) return error.value as { before: any; after: any; probe: any; rolledBack: any };
    throw error;
  }
  throw new Error("unreachable: the scenario always ends in an intentional rollback");
}

describe("Lab 3 -> Lab 4 migration (real migration SQL, exact before/after, rolled back)", () => {
  let before: any;
  let after: any;
  let probe: any;
  let rolledBack: any;

  beforeAll(async () => {
    ({ before, after, probe, rolledBack } = await runScenario());
  }, 180_000);

  it("replays the real Lab 1 to 3 migrations and loads the fixture (guards every equality below against being vacuous)", () => {
    expect(lab3MigrationDirs.length).toBeGreaterThanOrEqual(8);
    expect(before.data.User).toHaveLength(3);
    expect(before.data.Ticket).toHaveLength(3);
    expect(before.data.PublicComment).toHaveLength(1);
    expect(before.data.InternalNote).toHaveLength(1);
    expect(before.tables).not.toContain("ActionTaken");
    expect(before.columns.some((c: Row) => c.table_name === "Ticket" && c.column_name === "version")).toBe(false);
  });

  it("MIG-01: every Lab 3 table keeps every row; Ticket only gains version = 1 on each row", () => {
    const withoutVersion = (rows: Row[]) => rows.map(({ version, ...rest }) => rest);
    for (const table of LAB3_TABLES.filter((t) => t !== "Ticket")) {
      expect(after.data[table]).toEqual(before.data[table]);
    }
    expect(withoutVersion(after.data.Ticket)).toEqual(before.data.Ticket);
    expect(after.data.Ticket.map((t: Row) => t.version)).toEqual([1, 1, 1]);
  });

  it("MIG-02: only additions: every earlier table, column, constraint and index is unchanged", () => {
    expect(after.tables).toEqual(expect.arrayContaining(before.tables));
    expect(after.tables.filter((t: string) => !before.tables.includes(t)).sort()).toEqual([
      "ActionTaken",
      "ActionTakenRevision",
    ]);
    // Every earlier column still exists, with the same type, nullability and default.
    for (const column of before.columns) {
      expect(after.columns).toContainEqual(column);
    }
    const addedColumns = after.columns.filter(
      (c: Row) => !before.columns.some((b: Row) => b.table_name === c.table_name && b.column_name === c.column_name)
    );
    expect(addedColumns.filter((c: Row) => c.table_name === "Ticket")).toEqual([
      expect.objectContaining({ column_name: "version", is_nullable: "NO", column_default: "1" }),
    ]);
    expect(after.constraints).toEqual(expect.arrayContaining(before.constraints));
    expect(after.indexes).toEqual(expect.arrayContaining(before.indexes));
  });

  it("creates the two indexes the specification names, and the unique (actionTakenId, revision)", () => {
    const joined = probe.indexes.join("\n");
    expect(joined).toMatch(/ON .*"ActionTaken" USING btree \("ticketId", "actionAt", id\)/);
    expect(joined).toMatch(/ON .*"ActionTaken" USING btree \("assigneeId", status\)/);
    expect(joined).toMatch(/UNIQUE INDEX .*ON .*"ActionTakenRevision" USING btree \("actionTakenId", revision\)/);
  });

  it("an action inserted with only the required columns gets PLANNED, version 1, empty text and no assignee", () => {
    expect(probe.minimalAction).toMatchObject({
      ticketId: 102,
      performedById: 2,
      assigneeId: null,
      status: "PLANNED",
      result: "",
      followUpRequired: false,
      followUpNote: "",
      attachmentNotes: "",
      version: 1,
    });
    expect(probe.minimalAction.createdAt).toBeTruthy();
    expect(probe.minimalAction.actionAt).toBeTruthy();
  });

  it("the database itself rejects a duplicate revision, an unknown status, and missing ticket or performer", () => {
    expect(probe.duplicateRevision).toBe("23505");
    expect(probe.badStatus).toBe("22P02");
    expect(probe.missingTicket).toBe("23503");
    expect(probe.missingPerformer).toBe("23503");
  });

  it("a ticket that has an action cannot be deleted, and an action that has a revision cannot be deleted (restrict)", () => {
    expect(probe.deleteTicketWithAction).toBe("23503");
    expect(probe.deleteActionWithRevision).toBe("23503");
  });

  it("the documented rollback returns the schema to exactly the Lab 3 shape", () => {
    expect(rolledBack.tables).toEqual(before.tables);
    expect(rolledBack.columns).toEqual(before.columns);
    expect(rolledBack.constraints).toEqual(before.constraints);
    expect(rolledBack.indexes).toEqual(before.indexes);
    expect(rolledBack.data).toEqual(before.data);
  });
});
