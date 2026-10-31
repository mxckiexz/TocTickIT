import type { Express, Response } from "express";
import { Prisma, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { AuthedRequest, requireAuth, requirePasswordUpToDate, requireRole } from "./auth.js";

// Lab 4 F5: dashboards (docs/lab-04/specification.md FR-14..FR-18, BR-18..BR-23, BR-27;
// api-spec.md "Dashboards"). Numbers come from the database at request time; each response
// holds summary numbers and at most 5 recent rows, never a full ticket list.

export const DASHBOARD_TIMEZONE = "Asia/Bangkok";
// BR-18: "open" means one of these five statuses.
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const ALL_TICKET_STATUSES = Object.values(TicketStatus);
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const RECENT_LIMIT = 5;
const ACTION_DESCRIPTION_LIMIT = 120;

// Test seam: a fixed clock for the window-boundary tests (AC-30).
export const dashboardClock: { now: () => Date } = { now: () => new Date() };

// BR-20: "recently" is the last 7 days counted from the start of the day 6 days ago in
// Asia/Bangkok. The result is a UTC instant. Computed from the zone's own calendar date and
// offset at `now`, so the server's timezone never matters; the zone has no daylight saving.
export function recentWindowStart(now: Date, timeZone: string = DASHBOARD_TIMEZONE): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  const wholeSecond = Math.floor(now.getTime() / 1000) * 1000;
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMs = localAsUtc - wholeSecond;
  const localMidnightSixDaysAgo = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 6);
  return new Date(localMidnightSixDaysAgo - offsetMs);
}

// BR-27: the first 120 characters (not UTF-16 units) followed by an ellipsis when cut.
export function briefDescription(text: string): string {
  const chars = Array.from(text);
  return chars.length > ACTION_DESCRIPTION_LIMIT ? `${chars.slice(0, ACTION_DESCRIPTION_LIMIT).join("")}…` : text;
}

// BR-23: every key is present, with 0 where there are no rows.
export function countsByKey<K extends string>(keys: readonly K[], rows: Array<{ key: string; n: number }>): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const key of keys) result[key] = rows.find((r) => r.key === key)?.n ?? 0;
  return result;
}

const ticketBrief = { id: true, ticketNumber: true, summary: true, currentStatus: true, itPriority: true, updatedAt: true } as const;
const recentOrder: Prisma.TicketOrderByWithRelationInput[] = [{ updatedAt: "desc" }, { id: "desc" }];

export function registerDashboardRoutes(app: Express): void {
  // FR-14, BR-19: only ever the caller's own tickets.
  app.get("/api/dashboard/requester", requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    try {
      const prisma = getPrisma();
      const now = dashboardClock.now();
      const since = recentWindowStart(now);
      const own = { requesterId: req.user!.id };
      const [openTickets, waitingForRequester, recentlyUpdated, recentlyResolved] = await Promise.all([
        prisma.ticket.count({ where: { ...own, currentStatus: { in: OPEN_TICKET_STATUSES } } }),
        prisma.ticket.count({ where: { ...own, currentStatus: "WAITING_FOR_REQUESTER" } }),
        prisma.ticket.findMany({ where: { ...own, updatedAt: { gte: since } }, orderBy: recentOrder, take: RECENT_LIMIT, select: ticketBrief }),
        // BR-21: tickets currently RESOLVED, by updatedAt (no resolved timestamp is stored), in the same window.
        prisma.ticket.findMany({ where: { ...own, currentStatus: "RESOLVED", updatedAt: { gte: since } }, orderBy: recentOrder, take: RECENT_LIMIT, select: ticketBrief }),
      ]);
      res.status(200).json({ generatedAt: now.toISOString(), timezone: DASHBOARD_TIMEZONE, openTickets, waitingForRequester, recentlyUpdated, recentlyResolved });
    } catch (error) {
      console.error("Failed to load the Requester dashboard:", error);
      res.status(500).json({ error: "Failed to load the dashboard" });
    }
  });

  // FR-15, FR-16: the same data and rules for IT Staff and Administrator; user counts for the Administrator only.
  app.get("/api/dashboard/staff", requireAuth, requireRole("IT_STAFF", "ADMINISTRATOR"), requirePasswordUpToDate, async (req: AuthedRequest, res: Response) => {
    try {
      const prisma = getPrisma();
      const me = req.user!.id;
      const now = dashboardClock.now();
      const since = recentWindowStart(now);
      const open = { currentStatus: { in: OPEN_TICKET_STATUSES } };

      const [unassigned, assignedToMe, byStatusRows, byPriorityRows, recentlyUpdated, openActionTickets, recentActions] = await Promise.all([
        prisma.ticket.count({ where: { ...open, ownerId: null } }),
        prisma.ticket.count({ where: { ...open, ownerId: me } }),
        prisma.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true } }),
        prisma.ticket.groupBy({ by: ["itPriority"], where: open, _count: { _all: true } }),
        prisma.ticket.findMany({ where: { updatedAt: { gte: since } }, orderBy: recentOrder, take: RECENT_LIMIT, select: ticketBrief }),
        // BR-27: distinct open tickets that hold an open action assigned to the caller.
        prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
          SELECT count(DISTINCT a."ticketId") AS n
            FROM "ActionTaken" a JOIN "Ticket" t ON t.id = a."ticketId"
           WHERE a."assigneeId" = ${me}
             AND a."status" IN ('PLANNED', 'IN_PROGRESS')
             AND t."currentStatus" IN ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED')`),
        // BR-27: the caller's own recorded actions, newest first, on any ticket.
        prisma.actionTaken.findMany({
          where: { performedById: me },
          orderBy: [{ actionAt: "desc" }, { id: "desc" }],
          take: RECENT_LIMIT,
          select: { id: true, ticketId: true, status: true, actionAt: true, description: true, ticket: { select: { ticketNumber: true } } },
        }),
      ]);

      const body: Record<string, unknown> = {
        generatedAt: now.toISOString(),
        timezone: DASHBOARD_TIMEZONE,
        unassigned,
        assignedToMe,
        ticketsWithMyOpenActions: Number(openActionTickets[0]?.n ?? 0),
        myRecentActions: recentActions.map((a) => ({
          id: a.id,
          ticketId: a.ticketId,
          ticketNumber: a.ticket.ticketNumber,
          status: a.status,
          actionAt: a.actionAt,
          description: briefDescription(a.description),
        })),
        byStatus: countsByKey(ALL_TICKET_STATUSES, byStatusRows.map((r) => ({ key: r.currentStatus, n: r._count._all }))),
        byItPriority: countsByKey(PRIORITIES, byPriorityRows.map((r) => ({ key: r.itPriority, n: r._count._all }))),
        recentlyUpdated,
      };

      if (req.user!.role === "ADMINISTRATOR") {
        const [total, active, roleRows] = await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { isActive: true } }),
          prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
        ]);
        body.userCounts = { total, active, byRole: countsByKey(["REQUESTER", "IT_STAFF", "ADMINISTRATOR"] as const, roleRows.map((r) => ({ key: r.role, n: r._count._all }))) };
      }
      res.status(200).json(body);
    } catch (error) {
      console.error("Failed to load the staff dashboard:", error);
      res.status(500).json({ error: "Failed to load the dashboard" });
    }
  });
}
