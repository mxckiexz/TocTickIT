import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";

// Issue 3 — seed supported IT request categories.
// Safe to run multiple times without duplicates.
//
// Lab 3 — local-dev-only default password for every seeded User (Requester,
// IT Staff, and Administrator alike): documented here and in
// server/.env.example, never a real secret. Every seeded account has
// mustChangePassword: true, so this value only ever gets someone past the
// forced Change Password screen once (docs/lab-03/specification.md §7.5).
const SEED_DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe123!";

async function main() {
  const prisma = getPrisma();

  const categories = [
    { name: "Account and Access", isActive: true },
    { name: "Hardware", isActive: true },
    { name: "Software", isActive: true },
    { name: "Network", isActive: true },
    { name: "Archived Category (test fixture)", isActive: false },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { isActive: category.isActive },
      create: category,
    });
  }

  const relatedSystems = [
    { name: "Email", isActive: true },
    { name: "Campus Wi-Fi", isActive: true },
    { name: "VPN", isActive: true },
    { name: "LEB2 App", isActive: true },
    { name: "Grade Submission App", isActive: true },
    { name: "Printer", isActive: true },
    { name: "Corporate Laptop", isActive: true },
    { name: "Archived System (test fixture)", isActive: false },
  ];

  for (const relatedSystem of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name: relatedSystem.name },
      update: { isActive: relatedSystem.isActive },
      create: relatedSystem,
    });
  }

  // Lab 3 — docs/lab-03/specification.md §7.5's required seed mix: 4 active +
  // 1 inactive Requester (the Lab 2 Requester rows, now migrated to User —
  // this upsert only matters for a from-scratch database), 3 active + 1
  // inactive IT Staff, 1 active Administrator.
  const passwordHash = await hashPassword(SEED_DEFAULT_PASSWORD);

  const users = [
    { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "Michael Brown", email: "michael.brown@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "Sarah Johnson", email: "sarah.johnson@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "David Lee", email: "david.lee@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "Emily Carter", email: "emily.carter@toktickit.test", role: "REQUESTER" as const, isActive: false },
    { name: "Priya Nair", email: "priya.nair@toktickit.test", role: "IT_STAFF" as const, isActive: true },
    { name: "Marcus Chen", email: "marcus.chen@toktickit.test", role: "IT_STAFF" as const, isActive: true },
    { name: "Olivia Martinez", email: "olivia.martinez@toktickit.test", role: "IT_STAFF" as const, isActive: true },
    { name: "Daniel Kim", email: "daniel.kim@toktickit.test", role: "IT_STAFF" as const, isActive: false },
    { name: "Grace Thompson", email: "grace.thompson@toktickit.test", role: "ADMINISTRATOR" as const, isActive: true },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, isActive: user.isActive },
      create: { ...user, passwordHash, mustChangePassword: true },
    });
  }

  // Lab 3 — docs/lab-03/specification.md §7.5 / handout §5.3: realistic demo
  // tickets spread across Requesters, all eight statuses, all priorities, and
  // assigned/unassigned owners, with sample Public Comments and Internal
  // Notes (none containing anything sensitive). Idempotent like everything
  // above: tickets upsert on their fixed ticketNumber (update: {} — a re-run
  // never overwrites what someone did to a seeded ticket since), and a
  // comment/note is only created if that exact one isn't already there.
  const [categories_, systems_, people] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true } }),
    prisma.relatedSystem.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, email: true } }),
  ]);
  const categoryId = (name: string) => categories_.find((c) => c.name === name)!.id;
  const systemId = (name: string) => systems_.find((r) => r.name === name)!.id;
  const personId = (email: string) => people.find((u) => u.email === email)!.id;

  const T = "@toktickit.test";
  const demoTickets: Array<{
    n: string; requester: string; category: string; system: string; summary: string; description: string;
    requested: "LOW" | "MEDIUM" | "HIGH"; it: "LOW" | "MEDIUM" | "HIGH";
    status: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
    owner: string | null; resolvedMark?: boolean;
    comments?: Array<{ by: string; body: string }>; notes?: Array<{ by: string; body: string }>;
  }> = [
    { n: "001", requester: "jennifer.anderson", category: "Network", system: "Campus Wi-Fi", summary: "Wi-Fi drops in the library every hour", description: "Connection resets roughly hourly on the 2nd floor; other floors are fine.", requested: "HIGH", it: "HIGH", status: "NEW", owner: null },
    { n: "002", requester: "jennifer.anderson", category: "Software", system: "Email", summary: "Cannot attach files larger than 5 MB", description: "Mail client rejects attachments over 5 MB with a generic error.", requested: "MEDIUM", it: "MEDIUM", status: "OPEN", owner: "priya.nair" },
    { n: "003", requester: "michael.brown", category: "Hardware", system: "Printer", summary: "Printer on floor 3 shows paper jam, no jam present", description: "Panel reports a jam in tray 2; tray is empty and clear.", requested: "LOW", it: "MEDIUM", status: "IN_PROGRESS", owner: "marcus.chen",
      comments: [{ by: "marcus.chen", body: "Reseated the tray sensor; testing with a few pages now." }],
      notes: [{ by: "marcus.chen", body: "Same model had a sensor recall last spring — check the batch before replacing parts." }] },
    { n: "004", requester: "michael.brown", category: "Account and Access", system: "VPN", summary: "VPN rejects my credentials since Monday", description: "Works on the web portal, fails only on the VPN client.", requested: "HIGH", it: "HIGH", status: "WAITING_FOR_REQUESTER", owner: "olivia.martinez",
      comments: [{ by: "olivia.martinez", body: "Could you confirm which client version you have? Help > About shows it." }, { by: "michael.brown", body: "It says version 4.2." }] },
    { n: "005", requester: "sarah.johnson", category: "Software", system: "LEB2 App", summary: "LEB2 App crashes when exporting a report", description: "Crashes on export to PDF only; CSV export works.", requested: "MEDIUM", it: "MEDIUM", status: "RESOLVED", owner: "priya.nair", resolvedMark: true,
      comments: [{ by: "priya.nair", body: "Fixed in the latest patch — please try the export again." }, { by: "sarah.johnson", body: "Works now, thank you." }],
      notes: [{ by: "priya.nair", body: "Root cause: font subset missing on the report server. Patched; no data affected." }] },
    { n: "006", requester: "sarah.johnson", category: "Hardware", system: "Corporate Laptop", summary: "Laptop battery drains within an hour", description: "Battery health shows 62%; fully charged lasts under an hour.", requested: "LOW", it: "LOW", status: "CLOSED", owner: "marcus.chen",
      comments: [{ by: "marcus.chen", body: "Battery replaced under warranty; closing this out." }] },
    { n: "007", requester: "david.lee", category: "Account and Access", system: "Grade Submission App", summary: "No access to the Grade Submission App for my section", description: "Section 2 does not appear in my course list.", requested: "HIGH", it: "MEDIUM", status: "REOPENED", owner: "olivia.martinez",
      comments: [{ by: "david.lee", body: "The section disappeared again after the semester rollover." }],
      notes: [{ by: "olivia.martinez", body: "Second occurrence — suspect the rollover job; raise with the platform team." }] },
    { n: "008", requester: "david.lee", category: "Network", system: "Campus Wi-Fi", summary: "Guest Wi-Fi portal never loads", description: "Captive portal page times out on every device I tried.", requested: "LOW", it: "LOW", status: "CANCELLED", owner: "priya.nair",
      comments: [{ by: "david.lee", body: "Please cancel — it started working after a restart." }] },
    { n: "009", requester: "jennifer.anderson", category: "Hardware", system: "Printer", summary: "Request a second monitor for my desk", description: "Working with two documents side by side would help a lot.", requested: "LOW", it: "LOW", status: "NEW", owner: null },
    { n: "010", requester: "michael.brown", category: "Software", system: "Email", summary: "Calendar invites show the wrong time zone", description: "Invites from other regions are shifted by an hour.", requested: "MEDIUM", it: "HIGH", status: "OPEN", owner: null },
    { n: "011", requester: "sarah.johnson", category: "Account and Access", system: "Email", summary: "Need a shared mailbox for the lab team", description: "Five of us need to read and send from one address.", requested: "MEDIUM", it: "MEDIUM", status: "IN_PROGRESS", owner: "olivia.martinez" },
    { n: "012", requester: "david.lee", category: "Network", system: "VPN", summary: "VPN is slow when downloading datasets", description: "Throughput is under 1 MB/s; on-campus it is 50+.", requested: "HIGH", it: "HIGH", status: "NEW", owner: null },
  ];

  for (const t of demoTickets) {
    const ticketNumber = `TKT-SEED-${t.n}`;
    const requesterId = personId(`${t.requester}${T}`);
    const ticket = await prisma.ticket.upsert({
      where: { ticketNumber },
      update: {},
      create: {
        ticketNumber,
        requesterId,
        categoryId: categoryId(t.category),
        relatedSystemId: systemId(t.system),
        summary: t.summary,
        description: t.description,
        requestedPriority: t.requested,
        itPriority: t.it,
        currentStatus: t.status,
        ownerId: t.owner ? personId(`${t.owner}${T}`) : null,
        requesterMarkedResolvedAt: t.resolvedMark ? new Date("2026-09-20T09:00:00Z") : null,
        requesterMarkedResolvedById: t.resolvedMark ? requesterId : null,
      },
    });
    for (const c of t.comments ?? []) {
      const authorId = personId(`${c.by}${T}`);
      const exists = await prisma.publicComment.findFirst({ where: { ticketId: ticket.id, authorId, body: c.body } });
      if (!exists) await prisma.publicComment.create({ data: { ticketId: ticket.id, authorId, body: c.body } });
    }
    for (const note of t.notes ?? []) {
      const authorId = personId(`${note.by}${T}`);
      const exists = await prisma.internalNote.findFirst({ where: { ticketId: ticket.id, authorId, body: note.body } });
      if (!exists) await prisma.internalNote.create({ data: { ticketId: ticket.id, authorId, body: note.body } });
    }
  }

  console.log("Category, RelatedSystem, User, and demo Ticket/Comment/Note seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });