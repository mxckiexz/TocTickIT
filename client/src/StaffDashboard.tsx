import { ReactNode } from "react";
import { Priority, StaffDashboardData, TicketStatus, fetchStaffDashboard } from "./api.js";
import { DashboardStatus, DrillLink, MetricCard, plural, useDashboard } from "./dashboardShared.js";
import { ActionStatusBadge, PriorityBadge, STATUS_OPTIONS, StatusBadge } from "./ticketBadges.js";
import { routeHref } from "./routes.js";

const PRIORITY_LABELS: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const PRIORITY_ORDER: Priority[] = ["HIGH", "MEDIUM", "LOW"];

// Lab 4 F8 — the IT Staff / Administrator dashboard (ui-spec.md §2, api-spec.md "GET /api/dashboard/staff").
// Both roles get the same page; the Administrator also gets the user counts, because the server sends them only to
// that role (FR-16), so there is no role prop to get wrong.
export default function StaffDashboard() {
  const { state, reload } = useDashboard(fetchStaffDashboard);

  return (
    <div>
      <h2 className="h4 mb-3">Dashboard</h2>
      {state.kind !== "ready" ? <DashboardStatus state={state} reload={reload} /> : <Loaded data={state.data} />}
    </div>
  );
}

function Loaded({ data }: { data: StaffDashboardData }) {
  const totalTickets = Object.values(data.byStatus).reduce((sum, n) => sum + n, 0);

  return (
    <>
      {totalTickets === 0 && <p className="text-muted">There are no tickets yet.</p>}

      <div className="row g-3 mb-4">
        <Col>
          <MetricCard title="Unassigned" value={data.unassigned}>
            <DrillLink
              route={{ view: "queue", filters: { ownerId: "unassigned", open: true } }}
              label={`View ${data.unassigned} unassigned ${plural(data.unassigned, "ticket", "tickets")}`}
            />
          </MetricCard>
        </Col>
        <Col>
          <MetricCard title="Assigned to me" value={data.assignedToMe}>
            <DrillLink
              route={{ view: "queue", filters: { ownerId: "me", open: true } }}
              label={`View ${data.assignedToMe} ${plural(data.assignedToMe, "ticket", "tickets")} assigned to me`}
            />
          </MetricCard>
        </Col>
        <Col>
          <MetricCard title="Open actions assigned to me" value={data.ticketsWithMyOpenActions}>
            <DrillLink
              route={{ view: "queue", filters: { actionAssigneeId: "me" } }}
              label={`View ${data.ticketsWithMyOpenActions} ${plural(data.ticketsWithMyOpenActions, "ticket", "tickets")} with my open actions`}
            />
          </MetricCard>
        </Col>

        <Col wide>
          <MetricCard title="By status">
            <ul className="list-unstyled mb-0">
              {STATUS_OPTIONS.map(({ value: status, label }) => (
                <li key={status} className="d-flex justify-content-between align-items-center gap-2 mb-1">
                  <span>
                    <StatusBadge status={status as TicketStatus} /> <strong>{data.byStatus[status]}</strong>
                  </span>
                  <DrillLink
                    route={{ view: "queue", filters: { currentStatus: status } }}
                    label={`View ${data.byStatus[status]} ${label} ${plural(data.byStatus[status], "ticket", "tickets")}`}
                  />
                </li>
              ))}
            </ul>
          </MetricCard>
        </Col>
        <Col wide>
          <MetricCard title="By IT priority">
            <p className="text-muted small">Open tickets only.</p>
            <ul className="list-unstyled mb-0">
              {PRIORITY_ORDER.map((priority) => (
                <li key={priority} className="d-flex justify-content-between align-items-center gap-2 mb-1">
                  <span>
                    <PriorityBadge priority={priority} /> <strong>{data.byItPriority[priority]}</strong>
                  </span>
                  <DrillLink
                    route={{ view: "queue", filters: { itPriority: priority, open: true } }}
                    label={`View ${data.byItPriority[priority]} ${PRIORITY_LABELS[priority]} priority open ${plural(data.byItPriority[priority], "ticket", "tickets")}`}
                  />
                </li>
              ))}
            </ul>
          </MetricCard>
        </Col>
      </div>

      <div className="row g-4">
        <section className="col-12 col-lg-6" aria-labelledby="recent-tickets-heading">
          <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
            <h3 className="h6 mb-0" id="recent-tickets-heading">
              Recently updated
            </h3>
            <DrillLink
              route={{ view: "queue", filters: { recent: true, sortBy: "updatedAt" } }}
              label="View all recently updated tickets"
            >
              View all
            </DrillLink>
          </div>
          {data.recentlyUpdated.length === 0 ? (
            <p className="text-muted">No recent tickets</p>
          ) : (
            <ul className="list-unstyled">
              {data.recentlyUpdated.map((ticket) => (
                <li key={ticket.id} className="mb-2 pb-2 border-bottom">
                  <a href={routeHref({ view: "queue", filters: {}, ticketId: ticket.id })}>{ticket.ticketNumber}</a>{" "}
                  <StatusBadge status={ticket.currentStatus} /> <PriorityBadge priority={ticket.itPriority} />
                  <div>{ticket.summary}</div>
                  <div className="text-muted small">{new Date(ticket.updatedAt).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col-12 col-lg-6" aria-labelledby="my-actions-heading">
          <h3 className="h6 mb-2" id="my-actions-heading">
            My recent actions
          </h3>
          {data.myRecentActions.length === 0 ? (
            <p className="text-muted">You have not recorded any actions yet.</p>
          ) : (
            <ul className="list-unstyled">
              {data.myRecentActions.map((action) => (
                <li key={action.id} className="mb-2 pb-2 border-bottom">
                  <a
                    href={routeHref({ view: "queue", filters: {}, ticketId: action.ticketId, section: "actions-taken" })}
                    className="d-block text-decoration-none text-body"
                  >
                    <span className="text-decoration-underline">{action.ticketNumber}</span>{" "}
                    <ActionStatusBadge status={action.status} />
                    <span className="d-block">{action.description}</span>
                    <span className="d-block text-muted small">{new Date(action.actionAt).toLocaleString()}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mt-4">
        <a className="btn btn-success" href={routeHref({ view: "queue", filters: {} })}>
          Open Ticket Queue
        </a>
        {data.userCounts && (
          <>
            <a className="btn btn-outline-success" href={routeHref({ view: "users" })}>
              Manage users
            </a>
            <span>
              Users: {data.userCounts.total} total, {data.userCounts.active} active
            </span>
          </>
        )}
      </div>
    </>
  );
}

function Col({ children, wide }: { children: ReactNode; wide?: boolean }) {
  // 4 cards across on desktop, 2 on tablet, 1 on mobile (ui-spec.md §7).
  return <div className={wide ? "col-12 col-md-6 col-lg-6" : "col-12 col-md-6 col-lg-4"}>{children}</div>;
}
