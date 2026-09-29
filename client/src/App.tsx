import { useEffect, useState } from "react";
import { AuthUser, Category, checkSystem, getCurrentUser, logout } from "./api.js";
import ChangePassword from "./ChangePassword.js";
import CreateTicketForm from "./CreateTicketForm.js";
import Login from "./Login.js";
import MyTickets from "./MyTickets.js";
import StaffTicketQueue from "./StaffTicketQueue.js";

type CheckState = "idle" | "loading" | "success" | "error";
type TicketView = "none" | "createTicket" | "myTickets";

// Lab 3 (ui-spec.md §3): the App Shell replaces the Lab 2
// RequesterBanner/DevRequesterPicker flow entirely — identity now comes
// only from the session (GET /api/auth/me on mount), with role-scoped
// navigation and a forced Change Password gate.
type ShellState = "loading" | "loggedOut" | "mustChangePassword" | "ready";

export default function App() {
  const [shellState, setShellState] = useState<ShellState>("loading");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [ticketView, setTicketView] = useState<TicketView>("none");

  // Lab 1's "Check System" demo — kept as a small utility inside the
  // authenticated shell (its own API calls now require a session too).
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [checkErrorMessage, setCheckErrorMessage] = useState("");

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
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    setShellState("loggedOut");
    setTicketView("none");
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

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <div className="zg-app-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h1 className="h3 mb-0">
          TokTickIT <span className="text-success">IT Service Desk</span>
        </h1>
        <div className="d-flex align-items-center gap-2">
          <span className="small">
            {currentUser.name} <span className="badge text-bg-success">{currentUser.role}</span>
          </span>
          <button type="button" className="btn btn-outline-success btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
      <div className="zg-surface">
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

        {/* Role-scoped navigation (ui-spec.md §3) — a destination not in the
            caller's list is never rendered, and the server enforces the same
            role check independently (FR-07) regardless of what's shown here. */}
        {currentUser.role === "REQUESTER" && ticketView === "none" && (
          <div className="btn-group" role="group">
            <button className="btn btn-outline-success" onClick={() => setTicketView("createTicket")}>
              New Ticket
            </button>
            <button className="btn btn-outline-success" onClick={() => setTicketView("myTickets")}>
              My Tickets
            </button>
          </div>
        )}

        {currentUser.role === "REQUESTER" && ticketView !== "none" && (
          <div>
            <div className="btn-group btn-group-sm mb-3" role="group">
              <button
                className={`btn ${ticketView === "createTicket" ? "btn-success" : "btn-outline-success"}`}
                onClick={() => setTicketView("createTicket")}
              >
                New Ticket
              </button>
              <button
                className={`btn ${ticketView === "myTickets" ? "btn-success" : "btn-outline-success"}`}
                onClick={() => setTicketView("myTickets")}
              >
                My Tickets
              </button>
            </div>

            {ticketView === "createTicket" && <CreateTicketForm />}
            {ticketView === "myTickets" && <MyTickets />}
          </div>
        )}

        {currentUser.role === "IT_STAFF" && <StaffTicketQueue />}

        {currentUser.role === "ADMINISTRATOR" && (
          <div className="mt-4">
            <h2 className="h5">User Management</h2>
            <p className="text-muted">Coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
