import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheck() {
    // TODO(Issue 4): set loading, call checkSystem(), then either
    //   - success: store categories and show Online + the list, or
    //   - error: show Offline + a useful message.
    setState("loading");
    setErrorMessage("");

    try {
      const result = await checkSystem();

      setCategories(result.categories);
      setState("success");
    } catch (error) {
      console.error("System check failed:", error);

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

      {/* TODO(Issue 4): render loading / success (Online + categories) / error (Offline) states. */}

      {state === "success" && (
        <div className="mt-4">
          <p className="text-success">Online</p>

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
    </div>
  );
}