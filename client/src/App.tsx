import { useEffect, useState } from "react";
import { AuthUser, Category, checkSystem, getCurrentUser, logout } from "./api.js";
import ChangePassword from "./ChangePassword.js";
import CreateTicketForm from "./CreateTicketForm.js";
import Login from "./Login.js";
import MyTickets from "./MyTickets.js";
import RequesterDashboard from "./RequesterDashboard.js";
import { Route, View, allowedViews, parseRoute, routeHref } from "./routes.js";
import StaffDashboard from "./StaffDashboard.js";
import StaffTicketQueue from "./StaffTicketQueue.js";
import UserManagement from "./UserManagement.js";

type CheckState = "idle" | "loading" | "success" | "error";

// Lab 4 F8 (ui-spec.md §1): one navigation row per role, in this order.
const VIEW_LABELS: Record<View, string> = {
  dashboard: "Dashboard",
  newTicket: "New Ticket",
  myTickets: "My Tickets",
  queue: "Ticket Queue",
  users: "User Management",
};
const HOME: Route = { view: "dashboard" };

// Lab 3 (ui-spec.md §3): the App Shell replaces the Lab 2
// RequesterBanner/DevRequesterPicker flow entirely — identity now comes
// only from the session (GET /api/auth/me on mount), with role-scoped
// navigation and a forced Change Password gate.
type ShellState = "loading" | "loggedOut" | "mustChangePassword" | "ready";

export default function App() {
  const [shellState, setShellState] = useState<ShellState>("loading");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  // Lab 4 F8: the page is the URL hash (src/routes.ts), so dashboard cards, counts and rows are real links. `navTick`
  // lets a click on the page you are already on start that page over (back from an open ticket to its list).
  const [hash, setHash] = useState(() => window.location.hash);
  const [navTick, setNavTick] = useState(0);
  // Voluntary Change Password (ui-spec.md §4.1): opened from the shell header,
  // as opposed to the forced first-login gate, which is its own ShellState.
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");

  // Lab 1's "Check System" demo — kept as a small utility inside the
  // authenticated shell (its own API calls now require a session too).
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [checkErrorMessage, setCheckErrorMessage] = useState("");

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(route: Route) {
    const next = routeHref(route);
    if (window.location.hash === next) {
      setNavTick((tick) => tick + 1);
    } else {
      window.location.hash = next;
      setHash(next);
    }
  }

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        setShellState(user ? (user.mustChangePassword ? "mustChangePassword" : "ready") : "loggedOut");
      })
      .catch((error) => {
        console.error("Failed to load the current session:", error);
        if (!cancelled) setShellState("loggedOut");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleLoginSuccess(user: AuthUser) {
    setCurrentUser(user);
    setShellState(user.mustChangePassword ? "mustChangePassword" : "ready");
  }

  function handlePasswordChanged(user: AuthUser) {
    setCurrentUser(user);
    setShellState("ready");
    // Only the voluntary flow gets a confirmation; the forced one simply
    // continues into the app.
    if (changingPassword) setPasswordNotice("Password changed.");
    setChangingPassword(false);
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    setShellState("loggedOut");
    // The next person to log in must not land on this one's page.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setHash("");
    setChangingPassword(false);
    setPasswordNotice("");
    setCheckState("idle");
    setCategories([]);
  }

  async function handleCheck() {
    setCheckState("loading");
    setCheckErrorMessage("");

    try {
      const result = await checkSystem();

      setCategories(result.categories);
      setCheckState("success");
    } catch (error) {
      console.error("System check failed:", error);

      setCategories([]);
      setCheckErrorMessage(
        "Unable to connect to the TokTickIT API. Please make sure the backend server is running."
      );
      setCheckState("error");
    }
  }

  if (shellState === "loading") {
    return (
      <div className="container py-5" style={{ maxWidth: 640 }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (shellState === "loggedOut" || !currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (shellState === "mustChangePassword") {
    return <ChangePassword onChanged={handlePasswordChanged} />;
  }

  if (changingPassword) {
    return (
      <ChangePassword
        onChanged={handlePasswordChanged}
        onCancel={() => setChangingPassword(false)}
      />
    );
  }

  // The Requester screens are narrow forms/lists and read best at 640px; the
  // IT Staff Ticket Queue (9 columns) and Administrator User Management
  // tables don't fit there — at 640px the Status/Owner columns were clipped
  // off the right edge of the table at desktop width (caught by inspecting
  // the Feature 7 screenshots, not by an assertion).
  const shellMaxWidth = currentUser.role === "REQUESTER" ? 640 : 1140;

  const parsedRoute = parseRoute(hash);
  const route: Route = allowedViews(currentUser.role).includes(parsedRoute.view) ? parsedRoute : HOME;
  const pageKey = `${hash}|${navTick}`;

  return (
    <div className="container py-5" style={{ maxWidth: shellMaxWidth }}>
      <div className="zg-app-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h1 className="h3 mb-0">
          TokTickIT <span className="text-success">IT Service Desk</span>
        </h1>
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="small">
            {currentUser.name} <span className="badge text-bg-success">{currentUser.role}</span>
          </span>
          {/* Light outline: these sit on the green header, where the old
              outline-success (green on green) was invisible — STY-03. */}
          <button
            type="button"
            className="btn btn-outline-light btn-sm text-nowrap"
            onClick={() => {
              setPasswordNotice("");
              setChangingPassword(true);
            }}
          >
            Change password
          </button>
          <button type="button" className="btn btn-outline-light btn-sm text-nowrap" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
      <div className="zg-surface">
        {passwordNotice && (
          <div className="alert alert-success" role="status">
            {passwordNotice}
          </div>
        )}
        <button
          className="btn btn-success"
          onClick={handleCheck}
          disabled={checkState === "loading"}
        >
          {checkState === "loading" ? "Loading…" : "Check System"}
        </button>

        {checkState === "loading" && (
          <p className="mt-4">Loading categories...</p>
        )}

        {checkState === "success" && (
          <div className="mt-4">
            <p className="text-success">Online</p>

            <h2 className="h5">IT Request Categories</h2>

            <ul>
              {categories.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          </div>
        )}

        {checkState === "error" && (
          <div className="alert alert-danger mt-4" role="alert">
            Offline — {checkErrorMessage}
          </div>
        )}

        <hr className="my-5" />

        {/* Role-scoped navigation (ui-spec.md §1) — a destination not in the caller's list is never rendered, and
            a page the role cannot use is not opened from its address either; the server enforces the same role
            check independently (FR-07) regardless of what is shown here. */}
        <nav aria-label="Main" className="mb-3">
          <div className="d-flex flex-wrap gap-2">
            {allowedViews(currentUser.role).map((item) => (
              <button
                key={item}
                type="button"
                className={`btn btn-sm ${item === route.view ? "btn-success" : "btn-outline-success"}`}
                aria-current={item === route.view ? "page" : undefined}
                onClick={() => navigate(item === "queue" ? { view: "queue", filters: {} } : item === "myTickets" ? { view: "myTickets", filters: {} } : ({ view: item } as Route))}
              >
                {VIEW_LABELS[item]}
              </button>
            ))}
          </div>
        </nav>

        {route.view === "dashboard" &&
          (currentUser.role === "REQUESTER" ? <RequesterDashboard /> : <StaffDashboard />)}
        {route.view === "newTicket" && <CreateTicketForm />}
        {route.view === "myTickets" && (
          <MyTickets key={pageKey} initialFilters={route.filters} initialTicketId={route.ticketId} />
        )}
        {route.view === "queue" && (
          <StaffTicketQueue
            key={pageKey}
            initialFilters={route.filters}
            initialTicketId={route.ticketId}
            scrollToActions={route.section === "actions-taken"}
          />
        )}
        {route.view === "users" && <UserManagement />}
      </div>
    </div>
  );
}
