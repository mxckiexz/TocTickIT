import { getPrisma } from "../src/prisma.js";

// Lab 4 F9 (docs/lab-04/tests.md E2E-03): what each dashboard SHOULD say, worked out straight from the database for
// one account, so the end-to-end test can compare it with what the screen shows. It deliberately does not import
// server/src/dashboard.ts: a bug there would otherwise appear in both the screen and its own check.
//
//   npx tsx scripts/e2e-dashboard-truth.ts e2e-staff@toktickit.test   -> one JSON object on the last line
const OPEN = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const;
const STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: e2e-dashboard-truth.ts <email>");
  const prisma = getPrisma();
  const me = await prisma.user.findUniqueOrThrow({ where: { email } });

  // BR-20: seven days counted from Asia/Bangkok midnight six days back, worked out by the database itself.
  const [{ start }] = await prisma.$queryRaw<Array<{ start: Date }>>`
    SELECT ((date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') - interval '6 days') AT TIME ZONE 'Asia/Bangkok') AS start`;
  const recent = { updatedAt: { gte: start } };
  const newestFirst = [{ updatedAt: "desc" as const }, { id: "desc" as const }];
  const numbers = (tickets: Array<{ ticketNumber: string }>) => tickets.map((t) => t.ticketNumber);

  const result: Record<string, unknown> = { role: me.role };

  if (me.role === "REQUESTER") {
    const own = { requesterId: me.id };
    result.openTickets = await prisma.ticket.count({ where: { ...own, currentStatus: { in: [...OPEN] } } });
    result.waitingForRequester = await prisma.ticket.count({ where: { ...own, currentStatus: "WAITING_FOR_REQUESTER" } });
    result.recentlyUpdated = numbers(await prisma.ticket.findMany({ where: { ...own, ...recent }, orderBy: newestFirst, take: 5, select: { ticketNumber: true } }));
    result.recentlyResolved = numbers(
      await prisma.ticket.findMany({ where: { ...own, currentStatus: "RESOLVED", ...recent }, orderBy: newestFirst, take: 5, select: { ticketNumber: true } })
    );
  } else {
    const open = { currentStatus: { in: [...OPEN] } };
    result.unassigned = await prisma.ticket.count({ where: { ownerId: null, ...open } });
    result.assignedToMe = await prisma.ticket.count({ where: { ownerId: me.id, ...open } });
    const [{ n }] = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(DISTINCT a."ticketId") AS n
        FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
       WHERE a."assigneeId" = ${me.id} AND a.status IN ('PLANNED', 'IN_PROGRESS')
         AND t."currentStatus" IN ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED')`;
    result.ticketsWithMyOpenActions = Number(n);

    const byStatus: Record<string, number> = {};
    for (const status of STATUSES) byStatus[status] = await prisma.ticket.count({ where: { currentStatus: status } });
    result.byStatus = byStatus;
    const byItPriority: Record<string, number> = {};
    for (const priority of PRIORITIES) byItPriority[priority] = await prisma.ticket.count({ where: { itPriority: priority, ...open } });
    result.byItPriority = byItPriority;

    result.recentlyUpdated = numbers(await prisma.ticket.findMany({ where: recent, orderBy: newestFirst, take: 5, select: { ticketNumber: true } }));
    const actions = await prisma.actionTaken.findMany({
      where: { performedById: me.id },
      orderBy: [{ actionAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { status: true, ticket: { select: { ticketNumber: true } } },
    });
    result.myRecentActions = actions.map((a) => ({ ticketNumber: a.ticket.ticketNumber, status: a.status }));

    if (me.role === "ADMINISTRATOR") {
      result.userCounts = {
        total: await prisma.user.count(),
        active: await prisma.user.count({ where: { isActive: true } }),
      };
    }
  }

  console.log(JSON.stringify(result));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
