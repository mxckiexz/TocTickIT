import type { ActionStatus, Priority, TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";

// Shared by the Lab 4 dashboard tests: creates tickets (and actions) with an explicit status,
// owner, priority and updatedAt, and remembers what it made so the test can clean up.
export class DashboardFixtures {
  readonly ticketIds: number[] = [];
  private categoryId = 0;
  private relatedSystemId = 0;

  async init() {
    const prisma = getPrisma();
    this.categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
    this.relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  }

  async ticket(o: {
    requesterId: number;
    status?: TicketStatus;
    ownerId?: number | null;
    itPriority?: Priority;
    updatedAt?: Date;
    summary?: string;
  }) {
    const ticket = await getPrisma().ticket.create({
      data: {
        ticketNumber: `TEST-DASH-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
        requesterId: o.requesterId,
        categoryId: this.categoryId,
        relatedSystemId: this.relatedSystemId,
        summary: o.summary ?? "Dashboard fixture ticket",
        description: "Fixture.",
        requestedPriority: "LOW",
        itPriority: o.itPriority ?? "LOW",
        currentStatus: o.status ?? "NEW",
        ownerId: o.ownerId ?? null,
        ...(o.updatedAt ? { updatedAt: o.updatedAt, createdAt: o.updatedAt } : {}),
      },
    });
    this.ticketIds.push(ticket.id);
    return ticket;
  }

  async action(o: {
    ticketId: number;
    performedById: number;
    assigneeId?: number | null;
    status?: ActionStatus;
    actionAt?: Date;
    description?: string;
    result?: string;
    followUpNote?: string;
  }) {
    return getPrisma().actionTaken.create({
      data: {
        ticketId: o.ticketId,
        performedById: o.performedById,
        assigneeId: o.assigneeId ?? null,
        status: o.status ?? "PLANNED",
        actionAt: o.actionAt ?? new Date(),
        description: o.description ?? "Fixture action",
        result: o.result ?? (o.status === "COMPLETED" ? "done" : ""),
        followUpRequired: o.followUpNote !== undefined,
        followUpNote: o.followUpNote ?? "",
      },
    });
  }

  async cleanup() {
    const prisma = getPrisma();
    await prisma.actionTakenRevision.deleteMany({ where: { actionTaken: { ticketId: { in: this.ticketIds } } } });
    await prisma.actionTaken.deleteMany({ where: { ticketId: { in: this.ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: this.ticketIds } } });
  }
}
