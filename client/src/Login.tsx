import { useState, FormEvent } from "react";
import { ApiError, AuthUser, login } from "./api.js";

type SubmitState = "idle" | "submitting";

interface LoginProps {
  onLoginSuccess: (user: AuthUser) => void;
}

// ui-spec.md §2 — Login. A safe, identical message for "unknown email",
// "wrong password", and "inactive account" (BR-07): none of those are ever
// distinguished in what the user sees.
export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");

  const canSubmit = email.trim() !== "" && password !== "" && submitState === "idle";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Email is required.";
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitState("submitting");
    setSubmitError("");

    try {
      const user = await login(email.trim(), password);
      onLoginSuccess(user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSubmitError("Invalid email or password.");
      } else {
        console.error("Login failed:", error);
        setSubmitError("Unable to log in. Please try again.");
      }
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 400 }}>
      <div className="zg-app-header">
        <h1 className="h4 mb-0">TokTickIT</h1>
      </div>
      <div className="zg-surface">
        <h2 className="h5">Log in</h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="loginEmail" className="form-label">
              Email
            </label>
            <input
              id="loginEmail"
              type="email"
              className={`form-control ${fieldErrors.email ? "is-invalid" : ""}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitState === "submitting"}
              autoComplete="username"
            />
            {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
          </div>

          <div className="mb-3">
            <label htmlFor="loginPassword" className="form-label">
              Password
            </label>
            <input
              id="loginPassword"
              type="password"
              className={`form-control ${fieldErrors.password ? "is-invalid" : ""}`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitState === "submitting"}
              autoComplete="current-password"
            />
            {fieldErrors.password && <div className="invalid-feedback">{fieldErrors.password}</div>}
          </div>

          {submitError && (
            <div className="alert alert-danger" role="alert">
              {submitError}
            </div>
          )}

          <button type="submit" className="btn btn-success w-100" disabled={!canSubmit}>
            {submitState === "submitting" ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
