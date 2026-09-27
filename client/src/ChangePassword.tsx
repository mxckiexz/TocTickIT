import { useState, FormEvent } from "react";
import { ApiError, AuthUser, changePassword } from "./api.js";

type SubmitState = "idle" | "submitting";

interface ChangePasswordProps {
  onChanged: (user: AuthUser) => void;
}

// ui-spec.md §4 — the forced Change Password screen. Rendered in place of
// the app shell whenever the current user's mustChangePassword is true; no
// navigation surrounds it (AC-02).
export default function ChangePassword({ onChanged }: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");

  const canSubmit =
    currentPassword !== "" && newPassword !== "" && confirmPassword !== "" && submitState === "idle";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    setFieldErrors({});
    setSubmitError("");
    setSubmitState("submitting");

    try {
      const user = await changePassword(currentPassword, newPassword, confirmPassword);
      onChanged(user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError && error.status === 401) {
        setSubmitError("Current password is incorrect.");
      } else {
        console.error("Password change failed:", error);
        setSubmitError("Unable to change your password. Please try again.");
      }
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <div className="zg-app-header">
        <h1 className="h4 mb-0">TokTickIT</h1>
      </div>
      <div className="zg-surface">
        <h2 className="h5">Change your password</h2>
        <p className="text-muted small">
          Your account still has a default password. Choose a new one before continuing.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="currentPassword" className="form-label">
              Current password
            </label>
            <input
              id="currentPassword"
              type="password"
              className={`form-control ${fieldErrors.currentPassword ? "is-invalid" : ""}`}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={submitState === "submitting"}
              autoComplete="current-password"
            />
            {fieldErrors.currentPassword && (
              <div className="invalid-feedback">{fieldErrors.currentPassword}</div>
            )}
          </div>

          <div className="mb-3">
            <label htmlFor="newPassword" className="form-label">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              className={`form-control ${fieldErrors.newPassword ? "is-invalid" : ""}`}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={submitState === "submitting"}
              autoComplete="new-password"
            />
            {fieldErrors.newPassword && <div className="invalid-feedback">{fieldErrors.newPassword}</div>}
          </div>

          <div className="mb-3">
            <label htmlFor="confirmPassword" className="form-label">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className={`form-control ${fieldErrors.confirmPassword ? "is-invalid" : ""}`}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitState === "submitting"}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && (
              <div className="invalid-feedback">{fieldErrors.confirmPassword}</div>
            )}
          </div>

          {submitError && (
            <div className="alert alert-danger" role="alert">
              {submitError}
            </div>
          )}

          <button type="submit" className="btn btn-success w-100" disabled={!canSubmit}>
            {submitState === "submitting" ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
