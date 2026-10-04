import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
// The voluntary Change Password spec (E2E-08) really changes this account's
// password, so it gets its own account, restored to the known password here
// before every run.
export const E2E_PWCHANGE_EMAIL = "e2e-pwchange@toktickit.test";
// A real attachment (row + file on disk) on the staff-flow ticket, so the IT
// Staff detail screen has one to open (E2E-07) and its screenshots show one.
export const E2E_ATTACHMENT_FILENAME = "e2e-evidence.txt";
export const E2E_ATTACHMENT_BODY = "e2e attachment fixture: opened by IT Staff";
// A short, realistic thread on the Requester-resolve ticket so the Requester
// Ticket Detail screenshots show Public Comments from both roles — and an
// Internal Note that the Requester must never see (asserted in the spec).
export const E2E_THREAD_STAFF_COMMENT = "Thanks for reporting this. Which laptop does it happen on?";
export const E2E_THREAD_REQUESTER_COMMENT = "It is the one in room B204, started on Monday.";
export const E2E_THREAD_INTERNAL_NOTE = "Possible driver issue, check the B204 imaging batch first.";
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
  { email: E2E_PWCHANGE_EMAIL, name: "E2E Password Change", role: "REQUESTER", password: E2E_REQUESTER_PASSWORD, isActive: true, mustChangePassword: false },
  { email: E2E_INACTIVE_EMAIL, name: "E2E Inactive User", role: "REQUESTER", password: E2E_REQUESTER_PASSWORD, isActive: false, mustChangePassword: false },
];

// Every ticket any e2e spec creates or this script seeds uses ONE managed
// prefix, so cleanup is a single rule: summary starts with "[e2e]". Two older
// prefixes predate that rule — Lab 2's graded flow spec used
// "E2E flow check <timestamp>" and its one-off evidence generator used
// "PDF evidence — …" — and their leftovers had piled up in the dev database
// (11 + 4 at the time this was fixed, visible as stale rows in the committed
// Staff Queue screenshot). They're swept too, once and for good: the flow spec
// now uses the managed prefix, and nothing creates the old ones any more.
const MANAGED_SUMMARY_PREFIX = "[e2e]";
const LEGACY_E2E_SUMMARY_PREFIXES = ["E2E flow check ", "PDF evidence — "];
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");

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

  // Fresh e2e tickets every run: remove every previous run's (and anything
  // hanging off them — comments, notes, attachment rows AND their files on
  // disk), then recreate the two seeded ones in a known state.
  const staleTickets = await prisma.ticket.findMany({
    where: {
      OR: [MANAGED_SUMMARY_PREFIX, ...LEGACY_E2E_SUMMARY_PREFIXES].map((prefix) => ({
        summary: { startsWith: prefix },
      })),
    },
    select: { id: true },
  });
  const staleIds = staleTickets.map((t) => t.id);
  if (staleIds.length > 0) {
    const attachments = await prisma.attachment.findMany({
      where: { ticketId: { in: staleIds } },
      select: { storedFilename: true },
    });
    await prisma.internalNote.deleteMany({ where: { ticketId: { in: staleIds } } });
    await prisma.publicComment.deleteMany({ where: { ticketId: { in: staleIds } } });
    await prisma.attachment.deleteMany({ where: { ticketId: { in: staleIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: staleIds } } });
    // Best-effort: a soft-removed attachment's file is already gone.
    await Promise.all(
      attachments.map((a) => unlink(path.join(UPLOAD_DIR, a.storedFilename)).catch(() => undefined))
    );
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

  const staff = await prisma.user.findUniqueOrThrow({ where: { email: E2E_STAFF_EMAIL } });
  const resolveTicket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-E2E-000002" } });
  await prisma.publicComment.create({
    data: { ticketId: resolveTicket.id, authorId: staff.id, body: E2E_THREAD_STAFF_COMMENT, createdAt: new Date(Date.now() - 2 * 60_000) },
  });
  await prisma.publicComment.create({
    data: { ticketId: resolveTicket.id, authorId: requester.id, body: E2E_THREAD_REQUESTER_COMMENT, createdAt: new Date(Date.now() - 60_000) },
  });
  await prisma.internalNote.create({
    data: { ticketId: resolveTicket.id, authorId: staff.id, body: E2E_THREAD_INTERNAL_NOTE },
  });

  const staffFlowTicket = await prisma.ticket.findUniqueOrThrow({ where: { ticketNumber: "TKT-E2E-000001" } });
  const storedFilename = `e2e-fixture-${Date.now()}.txt`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storedFilename), E2E_ATTACHMENT_BODY);
  await prisma.attachment.create({
    data: {
      ticketId: staffFlowTicket.id,
      originalFilename: E2E_ATTACHMENT_FILENAME,
      storedFilename,
      mimeType: "text/plain",
      sizeBytes: E2E_ATTACHMENT_BODY.length,
    },
  });

  console.log(`e2e fixtures ready (accounts: ${FIXTURE_ACCOUNTS.length}, tickets: 2, attachments: 1, comments: 2, notes: 1)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
