import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma } from "../../src/prisma.js";

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const seeded = { ticket: { ticketNumber: { startsWith: "TKT-SEED-" } } };
const OPEN_ACTION = ["PLANNED", "IN_PROGRESS"];

async function snapshot() {
  const prisma = getPrisma();
  return {
    actions: await prisma.actionTaken.count({ where: seeded }),
    revisions: await prisma.actionTakenRevision.count({ where: { actionTaken: seeded } }),
    tickets: await prisma.ticket.count({ where: { ticketNumber: { startsWith: "TKT-SEED-" } } }),
  };
}

// docs/lab-04/tests.md §4 (seed) and specification.md §7.5: an idempotent seed
// that covers tickets with 0, 1 and several Actions Taken, a PLANNED action that
// blocks the resolution gate and a ticket that passes it, and dashboard numbers
// that are zero for one person and non-zero for another.
describe("Lab 4 seed (Actions Taken)", () => {
  it("running the seed twice in a row changes nothing and doesn't error (idempotent)", async () => {
    execSync("npx tsx prisma/seed.ts", { cwd: SERVER_DIR, stdio: "pipe" });
    const afterFirst = await snapshot();
    execSync("npx tsx prisma/seed.ts", { cwd: SERVER_DIR, stdio: "pipe" });
    const afterSecond = await snapshot();
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.actions).toBeGreaterThanOrEqual(10);
    expect(afterSecond.revisions).toBe(afterSecond.actions);
    expect(afterSecond.tickets).toBe(12);
  }, 60_000);

  it("seeded tickets hold 0, 1 and several actions", async () => {
    const tickets = await getPrisma().ticket.findMany({
      where: { ticketNumber: { startsWith: "TKT-SEED-" } },
      include: { actionsTaken: true },
    });
    const sizes = tickets.map((t) => t.actionsTaken.length);
    expect(sizes).toContain(0);
    expect(sizes).toContain(1);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(3);
  });

  it("covers every action status, and has one ticket the gate blocks and one it lets through", async () => {
    const tickets = await getPrisma().ticket.findMany({
      where: { ticketNumber: { startsWith: "TKT-SEED-" } },
      include: { actionsTaken: true },
    });
    const all = tickets.flatMap((t) => t.actionsTaken);
    expect(new Set(all.map((a) => a.status))).toEqual(new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]));
    const gate = (t: (typeof tickets)[number]) => ({
      owner: t.ownerId !== null,
      completed: t.actionsTaken.some((a) => a.status === "COMPLETED"),
      open: t.actionsTaken.some((a) => OPEN_ACTION.includes(a.status)),
    });
    const blocked = tickets.filter((t) => ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(t.currentStatus) && gate(t).open);
    const passing = tickets.filter((t) => ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(t.currentStatus) && gate(t).owner && gate(t).completed && !gate(t).open);
    expect(blocked.some((t) => t.actionsTaken.some((a) => a.status === "PLANNED"))).toBe(true);
    expect(passing.length).toBeGreaterThanOrEqual(1);
  });

  it("never seeds an open action on a RESOLVED or CLOSED ticket, and every RESOLVED/CLOSED one passes the gate (BR-10, BR-12)", async () => {
    const tickets = await getPrisma().ticket.findMany({
      where: { ticketNumber: { startsWith: "TKT-SEED-" }, currentStatus: { in: ["RESOLVED", "CLOSED"] } },
      include: { actionsTaken: true },
    });
    expect(tickets.length).toBeGreaterThanOrEqual(2);
    for (const t of tickets) {
      expect(t.ownerId).not.toBeNull();
      expect(t.actionsTaken.some((a) => OPEN_ACTION.includes(a.status))).toBe(false);
      expect(t.actionsTaken.some((a) => a.status === "COMPLETED")).toBe(true);
    }
  });

  it("every action obeys the field rules: performer and assignee are active staff or admin, COMPLETED has a result, follow-up note when required", async () => {
    const actions = await getPrisma().actionTaken.findMany({
      where: seeded,
      include: { performedBy: true, assignee: true },
    });
    for (const a of actions) {
      expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(a.performedBy.role);
      expect(a.performedBy.isActive).toBe(true);
      if (a.assignee) {
        expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(a.assignee.role);
        expect(a.assignee.isActive).toBe(true);
      }
      if (a.status === "COMPLETED") expect(a.result.trim()).not.toBe("");
      if (a.followUpRequired) expect(a.followUpNote.trim()).not.toBe("");
      expect(a.description.trim().length).toBeGreaterThan(0);
      expect(a.version).toBe(1);
    }
  });

  it("every seeded action has exactly one revision, number 1, equal to the action's values", async () => {
    const actions = await getPrisma().actionTaken.findMany({ where: seeded, include: { revisions: true } });
    for (const a of actions) {
      expect(a.revisions).toHaveLength(1);
      expect(a.revisions[0]).toMatchObject({
        revision: 1,
        editedById: a.performedById,
        status: a.status,
        assigneeId: a.assigneeId,
        description: a.description,
        result: a.result,
        followUpRequired: a.followUpRequired,
        followUpNote: a.followUpNote,
        attachmentNotes: a.attachmentNotes,
      });
      expect(a.revisions[0].actionAt.getTime()).toBe(a.actionAt.getTime());
    }
  });

  it("dashboard numbers are non-zero for some staff and zero for others (open actions assigned to me)", async () => {
    const prisma = getPrisma();
    const staff = await prisma.user.findMany({
      where: { email: { in: ["priya.nair", "marcus.chen", "olivia.martinez", "grace.thompson"].map((n) => `${n}@toktickit.test`) } },
    });
    const counts: number[] = [];
    for (const u of staff) {
      const tickets = await prisma.actionTaken.findMany({
        where: { assigneeId: u.id, status: { in: ["PLANNED", "IN_PROGRESS"] }, ticket: { currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] } } },
        select: { ticketId: true },
        distinct: ["ticketId"],
      });
      counts.push(tickets.length);
    }
    expect(counts.some((c) => c > 0)).toBe(true);
    expect(counts.some((c) => c === 0)).toBe(true);
    const performedByGrace = await prisma.actionTaken.count({ where: { performedBy: { email: "grace.thompson@toktickit.test" }, ...seeded } });
    expect(performedByGrace).toBe(0);
  });

  it("at least two seeded actions share one actionAt, so the id tie-break is exercised (BR-09)", async () => {
    const actions = await getPrisma().actionTaken.findMany({ where: seeded });
    const seen = new Map<string, number>();
    for (const a of actions) {
      const key = `${a.ticketId}:${a.actionAt.toISOString()}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect([...seen.values()].some((n) => n >= 2)).toBe(true);
  });
});
