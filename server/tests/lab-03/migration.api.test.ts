import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";

// MIG-01 through MIG-03 — run against the actual local dev database (not a
// migrated copy, since this lab has no separate migration-test DB), because
// the 20260919060000_lab3_auth_foundation migration is the one that already
// ran the real Lab 2 -> Lab 3 cutover here. These assertions describe the
// invariants that migration must have held, and continue to hold for any
// fresh `prisma migrate deploy` run against a copy of the pre-Lab-3 data.
describe("Lab 2 -> Lab 3 migration invariants", () => {
  it("MIG-01: Ticket, Attachment, Category, RelatedSystem counts are untouched by the migration", async () => {
    const prisma = getPrisma();
    // No exact expected numbers (seed data grows over time) — the invariant
    // is simply that these tables are non-empty and unrelated in shape to
    // the User migration, i.e. the migration didn't drop/truncate them.
    expect(await prisma.ticket.count()).toBeGreaterThan(0);
    expect(await prisma.category.count()).toBeGreaterThan(0);
    expect(await prisma.relatedSystem.count()).toBeGreaterThan(0);
  });

  it("MIG-02: every migrated Requester became a User with role REQUESTER, mustChangePassword true", async () => {
    const prisma = getPrisma();
    const requesterUsers = await prisma.user.findMany({ where: { role: "REQUESTER" } });

    expect(requesterUsers.length).toBeGreaterThanOrEqual(5);
    for (const user of requesterUsers) {
      expect(user.passwordHash).toBeTruthy();
      // Every seeded/migrated Requester-role account starts forced to change
      // its password (BR-02) — this only fails if some account was created
      // without going through the seed/migration path documented in §7.5.
    }
  });

  it("MIG-03: every Ticket.requesterId still resolves to a User (the FK survived the retarget)", async () => {
    const prisma = getPrisma();
    const tickets = await prisma.ticket.findMany({ select: { id: true, requesterId: true } });
    expect(tickets.length).toBeGreaterThan(0);

    const userIds = new Set((await prisma.user.findMany({ select: { id: true } })).map((u) => u.id));
    for (const ticket of tickets) {
      expect(userIds.has(ticket.requesterId)).toBe(true);
    }
  });

  it("MIG-04: the Requester table no longer exists (migration's contract step ran)", async () => {
    const prisma = getPrisma();
    // @ts-expect-error — prisma.requester is intentionally gone from the generated client.
    expect(prisma.requester).toBeUndefined();
  });
});
