import { useState } from "react";
import { checkSystem, Category, Requester } from "./api.js";
import CreateTicketForm from "./CreateTicketForm.js";
import DevRequesterPicker from "./DevRequesterPicker.js";
import MyTickets from "./MyTickets.js";

type UiState = "idle" | "loading" | "success" | "error";
type TicketView = "none" | "createTicket" | "myTickets";

// Lab 2 stand-in for real auth (arrives in Lab 3) — remember the chosen
// Requester across reloads so it "stays active" rather than resetting every
// time the ticket flow is reopened.
const ACTIVE_REQUESTER_STORAGE_KEY = "toktickit.activeRequester";

function loadStoredRequester(): Requester | null {
  try {
    const raw = localStorage.getItem(ACTIVE_REQUESTER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Requester) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [ticketView, setTicketView] = useState<TicketView>("none");
  const [activeRequester, setActiveRequester] = useState<Requester | null>(loadStoredRequester);

  function handleSelectRequester(requester: Requester) {
    setActiveRequester(requester);
    try {
      localStorage.setItem(ACTIVE_REQUESTER_STORAGE_KEY, JSON.stringify(requester));
    } catch {
      // Non-fatal — the choice just won't survive a reload this time.
    }
  }

  function handleSwitchRequester() {
    setActiveRequester(null);
    try {
      localStorage.removeItem(ACTIVE_REQUESTER_STORAGE_KEY);
    } catch {
      // Non-fatal.
    }
  }

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");

    try {
      const result = await checkSystem();

      setCategories(result.categories);
      setState("success");
    } catch (error) {
      console.error("System check failed:", error);

      setCategories([]);
      setErrorMessage(
        "Unable to connect to the TokTickIT API. Please make sure the backend server is running."
      );
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button
        className="btn btn-success"
        onClick={handleCheck}
        disabled={state === "loading"}
      >
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "loading" && (
        <p className="mt-4">Loading categories...</p>
      )}

      {state === "success" && (
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

      {state === "error" && (
        <div className="alert alert-danger mt-4" role="alert">
          Offline — {errorMessage}
        </div>
      )}

      <hr className="my-5" />

      {ticketView === "none" && (
        <div className="btn-group" role="group">
          <button
            className="btn btn-outline-success"
            onClick={() => setTicketView("createTicket")}
          >
            New Ticket
          </button>
          <button
            className="btn btn-outline-success"
            onClick={() => setTicketView("myTickets")}
          >
            My Tickets
          </button>
        </div>
      )}

      {ticketView !== "none" && !activeRequester && (
        <DevRequesterPicker onSelect={handleSelectRequester} />
      )}

      {ticketView !== "none" && activeRequester && (
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

          {ticketView === "createTicket" && (
            <CreateTicketForm requester={activeRequester} onSwitchRequester={handleSwitchRequester} />
          )}
          {ticketView === "myTickets" && (
            <MyTickets requester={activeRequester} onSwitchRequester={handleSwitchRequester} />
          )}
        </div>
      )}
    </div>
  );
}