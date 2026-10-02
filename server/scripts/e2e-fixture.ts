import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";
import type { Role } from "@prisma/client";

// Run before the e2e suite (see e2e/global-setup.ts). Lab 3's seed.ts
// deliberately never resets an existing user's password on re-run (an
// upsert shouldn't silently rotate a real account's credentials) — but that
// means the e2e suite's login step can't rely on a seeded user's default
// password staying put after the first run ever exercises the real Change
// Password flow. This script instead owns a small set of dedicated fixture
// accounts and tickets, unconditionally restored to a known state before
// every e2e run, so every spec starts deterministic regardless of what a
// previous run did to them.
export const E2E_REQUESTER_EMAIL = "e2e-requester@toktickit.test";
export const E2E_REQUESTER_PASSWORD = "E2E-Fixture-Pass1";
export const E2E_STAFF_EMAIL = "e2e-staff@toktickit.test";
export const E2E_ADMIN_EMAIL = "e2e-admin@toktickit.test";
// mustChangePassword: true on purpose — E2E-02's first-login flow.
export const E2E_FIRST_LOGIN_EMAIL = "e2e-firstlogin@toktickit.test";
export const E2E_FIRST_LOGIN_DEFAULT_PASSWORD = "E2E-Default-Pass1";
// A second default-password account that no spec ever changes the password of,
// so the responsive-screenshot spec can capture the Change Password screen
// on every run without competing with E2E-02 for the first-login account.
export const E2E_CHANGEPW_SHOTS_EMAIL = "e2e-changepw-shots@toktickit.test";
export const E2E_INACTIVE_EMAIL = "e2e-inactive@toktickit.test";
// Every user the admin spec creates through the UI uses this prefix, so they
// can be swept before the next run.
export const E2E_CREATED_EMAIL_PREFIX = "e2e-created-";

const FIXTURE_ACCOUNTS: Array<{
  email: string;
  name: string;
  role: Role;
  password: string;
  isActive: boolean;
  mustChangePassword: boolean;
}> = [
  { email: E2E_REQUESTER_EMAIL, name: "E2E Fixture Requester", role: "REQUESTER", password: E2E_REQUESTER_PASSWORD, isActive: true, mustChangePassword: false },
  { email: E2E_STAFF_EMAIL, name: "E2E Fixture Staff", role: "IT_STAFF", password: E2E_REQUESTER_PASSWORD, isActive: true, mustChangePassword: false },
  { email: E2E_ADMIN_EMAIL, name: "E2E Fixture Admin", role: "ADMINISTRATOR", password: E2E_REQUESTER_PASSWORD, isActive: true, mustChangePassword: false },
  { email: E2E_FIRST_LOGIN_EMAIL, name: "E2E First Login", role: "REQUESTER", password: E2E_FIRST_LOGIN_DEFAULT_PASSWORD, isActive: true, mustChangePassword: true },
  { email: E2E_CHANGEPW_SHOTS_EMAIL, name: "E2E Change Password Shots", role: "REQUESTER", password: E2E_FIRST_LOGIN_DEFAULT_PASSWORD, isActive: true, mustChangePassword: true },
  { email: E2E_INACTIVE_EMAIL, name: "E2E Inactive User", role: "REQUESTER", password: E2E_REQUESTER_PASSWORD, isActive: false, mustChangePassword: false },
];

export const E2E_STAFF_FLOW_TICKET = "[e2e] Staff flow ticket";
export const E2E_REQUESTER_RESOLVE_TICKET = "[e2e] Requester resolve ticket";

async function main() {
  const prisma = getPrisma();

  for (const account of FIXTURE_ACCOUNTS) {
    const passwordHash = await hashPassword(account.password);
    const fields = {
      name: account.name,
      role: account.role,
      isActive: account.isActive,
      mustChangePassword: account.mustChangePassword,
      passwordHash,
    };
    await prisma.user.upsert({
      where: { email: account.email },
      update: fields,
      create: { email: account.email, ...fields },
    });
  }

  // Sweep users a previous run's admin spec created through the UI.
  const leftovers = await prisma.user.findMany({
    where: { email: { startsWith: E2E_CREATED_EMAIL_PREFIX } },
    select: { id: true },
  });
  const leftoverIds = leftovers.map((u) => u.id);
  if (leftoverIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: leftoverIds } } });
    await prisma.user.deleteMany({ where: { id: { in: leftoverIds } } });
  }

  // Fresh e2e tickets every run: remove the previous run's (and anything
  // hanging off them), then recreate in a known state.
  const staleTickets = await prisma.ticket.findMany({
    where: { summary: { startsWith: "[e2e]" } },
    select: { id: true },
  });
  const staleIds = staleTickets.map((t) => t.id);
  if (staleIds.length > 0) {
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: staleIds } } });
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: staleIds } } });
    await prisma.attachment.deleteMany({ where: { ticketId: { in: staleIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: staleIds } } });
  }

  const requester = await prisma.user.findUniqueOrThrow({ where: { email: E2E_REQUESTER_EMAIL } });
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });

  await prisma.ticket.createMany({
    data: [
      {
        ticketNumber: "TKT-E2E-000001",
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: E2E_STAFF_FLOW_TICKET,
        description: "Fixture ticket for the IT Staff end-to-end flow (unassigned, New).",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "NEW",
      },
      {
        ticketNumber: "TKT-E2E-000002",
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: E2E_REQUESTER_RESOLVE_TICKET,
        description: "Fixture ticket for the Requester comment / Problem Appears Resolved flow.",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "IN_PROGRESS",
      },
    ],
  });

  console.log(`e2e fixtures ready (accounts: ${FIXTURE_ACCOUNTS.length}, tickets: 2)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
