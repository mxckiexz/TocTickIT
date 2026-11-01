import { RequesterDashboardData, TicketBrief, fetchRequesterDashboard } from "./api.js";
import { DashboardStatus, DrillLink, MetricCard, plural, useDashboard } from "./dashboardShared.js";
import { routeHref } from "./routes.js";
import { StatusBadge } from "./ticketBadges.js";

// Lab 4 F8 — the Requester dashboard (ui-spec.md §3, api-spec.md "GET /api/dashboard/requester"). It answers
// "what needs me": two numbers and two short lists, deliberately not a second copy of My Tickets.
export default function RequesterDashboard() {
  const { state, reload } = useDashboard(fetchRequesterDashboard);

  return (
    <div>
      <h2 className="h4 mb-3">Dashboard</h2>
      {state.kind !== "ready" ? <DashboardStatus state={state} reload={reload} /> : <Loaded data={state.data} />}
    </div>
  );
}

function Loaded({ data }: { data: RequesterDashboardData }) {
  // The API has no "total tickets" number, so "no tickets yet" means nothing open, nothing waiting and nothing recent.
  const nothing =
    data.openTickets === 0 && data.waitingForRequester === 0 && data.recentlyUpdated.length === 0 && data.recentlyResolved.length === 0;

  return (
    <>
      {nothing && (
        <div className="mb-4">
          <p className="text-muted">You have no tickets yet.</p>
          <a className="btn btn-success" href={routeHref({ view: "newTicket" })}>
            New Ticket
          </a>
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6">
          <MetricCard title="Open tickets" value={data.openTickets}>
            <DrillLink
              route={{ view: "myTickets", filters: { open: true } }}
              label={`View ${data.openTickets} open ${plural(data.openTickets, "ticket", "tickets")}`}
            />
          </MetricCard>
        </div>
        <div className="col-12 col-sm-6">
          <MetricCard title="Waiting for you" value={data.waitingForRequester}>
            <DrillLink
              route={{ view: "myTickets", filters: { currentStatus: "WAITING_FOR_REQUESTER" } }}
              label={`View ${data.waitingForRequester} ${plural(data.waitingForRequester, "ticket", "tickets")} waiting for you`}
            />
          </MetricCard>
        </div>
      </div>

      <TicketList
        title="Recently updated"
        tickets={data.recentlyUpdated}
        empty="No recent tickets"
        allLabel="View all recently updated tickets"
        allRoute={{ view: "myTickets", filters: { recent: true, sortBy: "updatedAt" } }}
      />
      <TicketList
        title="Recently resolved"
        tickets={data.recentlyResolved}
        empty="No recently resolved tickets"
        allLabel="View all recently resolved tickets"
        allRoute={{ view: "myTickets", filters: { currentStatus: "RESOLVED", recent: true } }}
      />
    </>
  );
}

function TicketList({ title, tickets, empty, allLabel, allRoute }: {
  title: string;
  tickets: TicketBrief[];
  empty: string;
  allLabel: string;
  allRoute: Parameters<typeof DrillLink>[0]["route"];
}) {
  const headingId = `${title.replace(/\s+/g, "-").toLowerCase()}-heading`;
  return (
    <section className="mb-4" aria-labelledby={headingId}>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
        <h3 className="h6 mb-0" id={headingId}>
          {title}
        </h3>
        <DrillLink route={allRoute} label={allLabel}>
          View all
        </DrillLink>
      </div>
      {tickets.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="list-unstyled">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="mb-2 pb-2 border-bottom">
              <a href={routeHref({ view: "myTickets", filters: {}, ticketId: ticket.id })}>{ticket.ticketNumber}</a>{" "}
              <StatusBadge status={ticket.currentStatus} />
              <div>{ticket.summary}</div>
              <div className="text-muted small">{new Date(ticket.updatedAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
