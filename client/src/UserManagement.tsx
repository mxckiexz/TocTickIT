import { FormEvent, useEffect, useState } from "react";
import {
  AdminUser,
  ApiError,
  Role,
  createUser,
  fetchAdminUsers,
  resetUserPassword,
  updateUser,
} from "./api.js";

const SEARCH_DEBOUNCE_MS = 300;
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "REQUESTER", label: "Requester" },
  { value: "IT_STAFF", label: "IT Staff" },
  { value: "ADMINISTRATOR", label: "Administrator" },
];

type ListState = "loading" | "ready" | "error" | "forbidden";
type SubmitState = "idle" | "submitting";

function roleLabel(role: Role) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

// Lab 3 (Issue #39) — the Administrator User Management screen (ui-spec.md
// §8). One screen: list/search/filter, a Create form, and an Edit panel
// (with its own Reset password action) — no pagination, no multi-column
// sort, no multi-filter, no delete, per §8.5's explicit exclusions.
export default function UserManagement() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");

  const [listState, setListState] = useState<ListState>("loading");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [successMessage, setSuccessMessage] = useState("");

  const [creating, setCreating] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Shared by the mount/filter-change effect below and by the Create/Edit
  // panels' on-success callbacks (which call this directly, not via a
  // dependency change, so the filters in effect right now still apply).
  async function reload() {
    try {
      const result = await fetchAdminUsers({ search: search || undefined, role: roleFilter || undefined });
      setUsers(result);
      setListState("ready");
    } catch (error) {
      console.error("Failed to load users:", error);
      setListState(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }

  useEffect(() => {
    let cancelled = false;
    setListState((current) => (current === "forbidden" ? current : "loading"));

    fetchAdminUsers({ search: search || undefined, role: roleFilter || undefined })
      .then((result) => {
        if (cancelled) return;
        setUsers(result);
        setListState("ready");
      })
      .catch((error) => {
        console.error("Failed to load users:", error);
        if (!cancelled) setListState(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  function openCreate() {
    setEditingUserId(null);
    setCreating(true);
    setSuccessMessage("");
  }

  function openEdit(userId: number) {
    setCreating(false);
    setEditingUserId(userId);
    setSuccessMessage("");
  }

  function closePanels() {
    setCreating(false);
    setEditingUserId(null);
  }

  if (listState === "loading") {
    return <p className="mt-4">Loading users…</p>;
  }

  if (listState === "forbidden") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        You do not have permission to view this page.
      </div>
    );
  }

  if (listState === "error") {
    return (
      <div className="alert alert-danger mt-4" role="alert">
        Unable to load users. Please make sure the backend server is running.
      </div>
    );
  }

  const editingUser = editingUserId !== null ? users.find((u) => u.id === editingUserId) ?? null : null;

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h2 className="h5 mb-0">User Management</h2>
        <button type="button" className="btn btn-success btn-sm" onClick={openCreate}>
          Create user
        </button>
      </div>

      {successMessage && (
        <div className="alert alert-success" role="status">
          {successMessage}
        </div>
      )}

      {creating && (
        <CreateUserPanel
          onCancel={closePanels}
          onCreated={async () => {
            closePanels();
            setSuccessMessage("User created.");
            await reload();
          }}
        />
      )}

      {editingUser && (
        <EditUserPanel
          user={editingUser}
          onCancel={closePanels}
          onSaved={async (message) => {
            closePanels();
            setSuccessMessage(message);
            await reload();
          }}
        />
      )}

      <div className="row g-2 mb-3">
        <div className="col-12 col-lg-8">
          <input
            type="search"
            className="form-control"
            placeholder="Search by name or email…"
            aria-label="Search users"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="col-12 col-lg-4">
          <select
            className="form-select"
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as Role | "")}
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {users.length === 0 && <p className="text-muted">No users match your search.</p>}

      {users.length > 0 && (
        <>
          {/* Desktop/tablet: table. */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className="badge text-bg-success">{roleLabel(user.role)}</span>
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                        {user.isActive ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        onClick={() => openEdit(user.id)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards (same pattern as the Staff Ticket Queue). */}
          <div className="d-md-none">
            {users.map((user) => (
              <div key={user.id} className="border rounded p-2 mb-2">
                <div className="d-flex justify-content-between align-items-center">
                  <strong>{user.name}</strong>
                  <span className={`badge ${user.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                    {user.isActive ? "Active" : "Suspended"}
                  </span>
                </div>
                <div className="text-muted small">{user.email}</div>
                <div className="d-flex justify-content-between align-items-center mt-1">
                  <span className="badge text-bg-success">{roleLabel(user.role)}</span>
                  <button
                    type="button"
                    className="btn btn-outline-success btn-sm"
                    onClick={() => openEdit(user.id)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface CreateUserPanelProps {
  onCancel: () => void;
  onCreated: () => void;
}

function CreateUserPanel({ onCancel, onCreated }: CreateUserPanelProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("REQUESTER");
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setSubmitError("");
    setSubmitState("submitting");

    try {
      await createUser({ name, email, role, isActive, password });
      onCreated();
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
      } else {
        console.error("Failed to create user:", error);
        setSubmitError("Unable to create the user. Please try again.");
      }
    } finally {
      setSubmitState("idle");
    }
  }

  return (
    <div className="border rounded p-3 mb-3">
      <h3 className="h6">Create user</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-2">
          <label htmlFor="createUserName" className="form-label">
            Name
          </label>
          <input
            id="createUserName"
            className={`form-control ${fieldErrors.name ? "is-invalid" : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitState === "submitting"}
          />
          {fieldErrors.name && <div className="invalid-feedback">{fieldErrors.name}</div>}
        </div>

        <div className="mb-2">
          <label htmlFor="createUserEmail" className="form-label">
            Email
          </label>
          <input
            id="createUserEmail"
            type="email"
            className={`form-control ${fieldErrors.email ? "is-invalid" : ""}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitState === "submitting"}
          />
          {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
        </div>

        <div className="mb-2">
          <label htmlFor="createUserRole" className="form-label">
            Role
          </label>
          <select
            id="createUserRole"
            className={`form-select ${fieldErrors.role ? "is-invalid" : ""}`}
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={submitState === "submitting"}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.role && <div className="invalid-feedback">{fieldErrors.role}</div>}
        </div>

        <div className="mb-2 form-check">
          <input
            id="createUserActive"
            type="checkbox"
            className="form-check-input"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={submitState === "submitting"}
          />
          <label htmlFor="createUserActive" className="form-check-label">
            Active
          </label>
        </div>

        <div className="mb-3">
          <label htmlFor="createUserPassword" className="form-label">
            Default password
          </label>
          <input
            id="createUserPassword"
            type="text"
            className={`form-control ${fieldErrors.password ? "is-invalid" : ""}`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitState === "submitting"}
          />
          {fieldErrors.password && <div className="invalid-feedback">{fieldErrors.password}</div>}
          <div className="form-text">The user must change this at their next login.</div>
        </div>

        {submitError && (
          <div className="alert alert-danger" role="alert">
            {submitError}
          </div>
        )}

        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-success" disabled={submitState === "submitting"}>
            {submitState === "submitting" ? "Creating…" : "Create user"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

interface EditUserPanelProps {
  user: AdminUser;
  onCancel: () => void;
  onSaved: (message: string) => void;
}

function EditUserPanel({ user, onCancel, onSaved }: EditUserPanelProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeFieldError, setActiveFieldError] = useState("");
  const [roleFieldError, setRoleFieldError] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const [resetPassword, setResetPassword] = useState("");
  const [resetState, setResetState] = useState<SubmitState>("idle");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setActiveFieldError("");
    setRoleFieldError("");
    setSubmitState("submitting");

    try {
      await updateUser(user.id, { name, email, role, isActive });
      onSaved("User updated.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError && error.status === 409) {
        // ui-spec.md §8: self-suspend shown at Active, last-admin shown at
        // Role/Active — distinguished by the server's own message text.
        if (error.message.toLowerCase().includes("own account")) {
          setActiveFieldError(error.message);
        } else if (error.message.toLowerCase().includes("administrator is required")) {
          setRoleFieldError(error.message);
        } else {
          setFieldErrors({ email: error.message });
        }
      } else {
        console.error("Failed to update user:", error);
        setActiveFieldError("Unable to save changes. Please try again.");
      }
    } finally {
      setSubmitState("idle");
    }
  }

  async function handleResetPassword(event: FormEvent) {
    event.preventDefault();
    setResetError("");
    setResetSuccess("");
    setResetState("submitting");

    try {
      await resetUserPassword(user.id, resetPassword);
      setResetPassword("");
      setResetSuccess("Password reset. The user must set a new password at their next login.");
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.password) {
        setResetError(error.fieldErrors.password);
      } else {
        console.error("Failed to reset password:", error);
        setResetError("Unable to reset the password. Please try again.");
      }
    } finally {
      setResetState("idle");
    }
  }

  return (
    <div className="border rounded p-3 mb-3">
      <h3 className="h6">Edit user</h3>
      <form onSubmit={handleSave} noValidate>
        <div className="mb-2">
          <label htmlFor="editUserName" className="form-label">
            Name
          </label>
          <input
            id="editUserName"
            className={`form-control ${fieldErrors.name ? "is-invalid" : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitState === "submitting"}
          />
          {fieldErrors.name && <div className="invalid-feedback">{fieldErrors.name}</div>}
        </div>

        <div className="mb-2">
          <label htmlFor="editUserEmail" className="form-label">
            Email
          </label>
          <input
            id="editUserEmail"
            type="email"
            className={`form-control ${fieldErrors.email ? "is-invalid" : ""}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitState === "submitting"}
          />
          {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
        </div>

        <div className="mb-2">
          <label htmlFor="editUserRole" className="form-label">
            Role
          </label>
          <select
            id="editUserRole"
            className={`form-select ${roleFieldError ? "is-invalid" : ""}`}
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={submitState === "submitting"}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {roleFieldError && <div className="invalid-feedback d-block">{roleFieldError}</div>}
        </div>

        <div className="mb-3 form-check">
          <input
            id="editUserActive"
            type="checkbox"
            className={`form-check-input ${activeFieldError ? "is-invalid" : ""}`}
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={submitState === "submitting"}
          />
          <label htmlFor="editUserActive" className="form-check-label">
            Active
          </label>
          {activeFieldError && <div className="invalid-feedback d-block">{activeFieldError}</div>}
        </div>

        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-success" disabled={submitState === "submitting"}>
            {submitState === "submitting" ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>

      <hr />

      <h4 className="h6">Reset password</h4>
      <form onSubmit={handleResetPassword} noValidate className="row g-2 align-items-start">
        <div className="col-12 col-sm-8">
          <label htmlFor="resetPasswordInput" className="form-label visually-hidden">
            New default password
          </label>
          <input
            id="resetPasswordInput"
            type="text"
            className={`form-control ${resetError ? "is-invalid" : ""}`}
            placeholder="New default password"
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            disabled={resetState === "submitting"}
          />
          {resetError && <div className="invalid-feedback">{resetError}</div>}
        </div>
        <div className="col-12 col-sm-4">
          <button
            type="submit"
            className="btn btn-outline-success w-100"
            disabled={resetState === "submitting" || !resetPassword}
          >
            {resetState === "submitting" ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>
      {resetSuccess && (
        <div className="alert alert-success mt-2" role="status">
          {resetSuccess}
        </div>
      )}
    </div>
  );
}
