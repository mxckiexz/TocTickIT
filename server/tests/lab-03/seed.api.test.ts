import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrisma } from "../../src/prisma.js";

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function snapshot() {
  const prisma = getPrisma();
  const seeded = { ticketNumber: { startsWith: "TKT-SEED-" } };
  return {
    categories: await prisma.category.count(),
    relatedSystems: await prisma.relatedSystem.count(),
    users: await prisma.user.count(),
    seededTickets: await prisma.ticket.count({ where: seeded }),
    seededComments: await prisma.publicComment.count({ where: { ticket: seeded } }),
    seededNotes: await prisma.internalNote.count({ where: { ticket: seeded } }),
  };
}

// docs/lab-03/tests.md SEED-01 / handout §5.3: "idempotent seed behavior that
// is safe to run repeatedly". Runs the real seed script (a separate process,
// exactly as `npm run prisma:seed` would) twice and compares row counts.
describe("seed idempotency (SEED-01)", () => {
  it("running the seed twice in a row changes nothing and doesn't error", async () => {
    execSync("npx tsx prisma/seed.ts", { cwd: SERVER_DIR, stdio: "pipe" });
    const afterFirst = await snapshot();

    execSync("npx tsx prisma/seed.ts", { cwd: SERVER_DIR, stdio: "pipe" });
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
    // And what it seeds matches the documented mix (specification.md §7.5).
    expect(afterSecond.seededTickets).toBe(12);
    expect(afterSecond.seededComments).toBe(8);
    expect(afterSecond.seededNotes).toBe(3);
  }, 60_000);

  it("seeds the documented account mix: 4+1 Requesters, 3+1 IT Staff, 1 Administrator", async () => {
    const prisma = getPrisma();
    const seededEmails = [
      "jennifer.anderson", "michael.brown", "sarah.johnson", "david.lee", "emily.carter",
      "priya.nair", "marcus.chen", "olivia.martinez", "daniel.kim", "grace.thompson",
    ].map((n) => `${n}@toktickit.test`);
    const users = await prisma.user.findMany({ where: { email: { in: seededEmails } } });
    const tally = (role: string, active: boolean) => users.filter((u) => u.role === role && u.isActive === active).length;
    expect(tally("REQUESTER", true)).toBe(4);
    expect(tally("REQUESTER", false)).toBe(1);
    expect(tally("IT_STAFF", true)).toBe(3);
    expect(tally("IT_STAFF", false)).toBe(1);
    expect(tally("ADMINISTRATOR", true)).toBe(1);
  });

  it("seeded tickets cover all eight statuses, all priorities, and both assigned and unassigned owners", async () => {
    const tickets = await getPrisma().ticket.findMany({ where: { ticketNumber: { startsWith: "TKT-SEED-" } } });
    expect(new Set(tickets.map((t) => t.currentStatus)).size).toBe(8);
    expect(new Set(tickets.map((t) => t.itPriority))).toEqual(new Set(["LOW", "MEDIUM", "HIGH"]));
    expect(tickets.some((t) => t.ownerId === null)).toBe(true);
    expect(tickets.some((t) => t.ownerId !== null)).toBe(true);
    expect(new Set(tickets.map((t) => t.requesterId)).size).toBeGreaterThanOrEqual(4);
  });
});
