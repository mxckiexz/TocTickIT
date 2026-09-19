# Lab 3 — API Spec

Extends `docs/lab-02/api-spec.md`. Every endpoint below (including Lab 2's carried-over
Requester endpoints) requires an authenticated session unless stated otherwise. See
`specification.md` §8 for the endpoint summary table and §9 for the BR-13 status-code
ordering rule that applies to every route in this document.

## Authentication

A successful `POST /api/auth/login` sets a `toktickit_session` cookie: `HttpOnly`,
`SameSite=Lax`, `Secure` in production, `Path=/`, expiring 8 hours after issuance
(BR-11). The client never reads or stores this cookie's value — it is sent automatically by
the browser on same-site requests (`fetch(..., { credentials: "include" })` on the client
side; the server's CORS config sets `credentials: true` with an explicit origin allow-list,
replacing Lab 2's open `cors()`).

Every state-changing request (`POST`/`PATCH`/`DELETE`) additionally requires its `Origin`
header to match the configured client origin — a request with a missing or mismatched
`Origin` is rejected `403` before any other check, as CSRF defense-in-depth alongside
`SameSite=Lax`.

**Standard auth failure shapes**, used by every protected endpoint unless a route overrides
one:

| Status | When |
|---|---|
| `401 Unauthorized` | No session cookie, an unknown/expired session, or a session whose user is no longer active (BR-16). Body: `{ "error": "Authentication required." }` |
| `403 Forbidden` | Valid session, but the role (or, for a Requester, ownership) doesn't permit the action. Body: `{ "error": "You do not have permission to perform this action." }`, unless a route documents a more specific message below. |

## `POST /api/auth/login`

No session required (this is how one is obtained).

### Request body

```json
{ "email": "jennifer.anderson@toktickit.test", "password": "••••••••" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| email | string | yes | trimmed non-empty |
| password | string | yes | non-empty |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Email matches an **active** user and the password verifies (BR-01) | `{ "id", "name", "email", "role", "mustChangePassword" }`; sets the session cookie |
| `401 Unauthorized` | Email doesn't match any user, password is wrong, **or** the matched user is inactive (BR-07 — identical body for all three, so login can't be used to probe which account exists or is disabled) | `{ "error": "Invalid email or password." }` |
| `400 Bad Request` | `email`/`password` missing or not a non-empty string | `{ "errors": { "email": "...", "password": "..." } }` |
| `500 Internal Server Error` | Unexpected server/DB failure | `{ "error": "Login failed" }` |

Check order: body shape → user lookup by email (case-insensitive) → active check → password
verify. All three of "no such user" / "wrong password" / "inactive user" return the exact
same `401` body and status — the difference is never observable from the response.

## `POST /api/auth/logout`

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Valid session (or none at all — logout is idempotent) | `{ "ok": true }`; the `Session` row is deleted server-side (BR-10) and the cookie is cleared |
| `500 Internal Server Error` | Unexpected server/DB failure | `{ "error": "Logout failed" }` |

Logout never returns `401` — calling it with no active session simply has nothing to clear
and still returns `200`.

## `GET /api/auth/me`

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Valid, non-expired session for an active user (BR-12 — always `200`, never an "empty" success shape) | `{ "id", "name", "email", "role", "mustChangePassword" }` |
| `401 Unauthorized` | No/invalid/expired session, or user no longer active | `{ "error": "Authentication required." }` |

## `POST /api/auth/change-password`

Requires an authenticated session. This is the **only** authenticated route a user with
`mustChangePassword: true` may call before that flag is cleared (every other authenticated
route returns `403` with a dedicated body until the password is changed — see the
"Forced password change" note below).

### Request body

```json
{ "currentPassword": "••••••••", "newPassword": "••••••••", "confirmPassword": "••••••••" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| currentPassword | string | yes | must verify against the account's stored hash |
| newPassword | string | yes | ≥ 8 characters; must differ from `currentPassword` (BR-08) |
| confirmPassword | string | yes | must exactly equal `newPassword` |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | `currentPassword` verifies and `newPassword` passes validation | `{ "id", "name", "email", "role", "mustChangePassword": false }`; clears `mustChangePassword` (BR-09) |
| `400 Bad Request` | Missing fields, `newPassword` too short, `newPassword === currentPassword`, or `confirmPassword !== newPassword` | `{ "errors": { "<field>": "<message>" } }` |
| `401 Unauthorized` | `currentPassword` does not verify | `{ "error": "Current password is incorrect." }` — deliberately `401` rather than `400`, since this is a credential check, not a shape check |

**Forced password change**: every other authenticated endpoint, when called by a user with
`mustChangePassword: true`, returns `403` with
`{ "error": "Password change required.", "code": "PASSWORD_CHANGE_REQUIRED" }` — the
`code` field lets the client route straight to the Change Password screen instead of a
generic forbidden page.

---

## Requester ticket and attachment endpoints (Lab 2 carryover)

All seven endpoints below keep their Lab 2 request/response shape **except**: `requesterId`
is no longer accepted as a client-supplied field/query-param/form-field on any of them — the
authenticated session's user id is used instead (FR-08, BR-03). Sending a `requesterId`
value is silently ignored (not an error), so an old client wouldn't crash, but it has no
effect. Role required: `REQUESTER` for the create/detail/attachment routes below, or
`IT_STAFF`/`ADMINISTRATOR` reading through the staff-prefixed equivalents further down —
see BR-14 for the `404`-not-`403` ownership rule.

## `POST /api/tickets`

Unchanged from Lab 2 except `requesterId` is taken from the session, not the body.

### Request body

```json
{
  "categoryId": 1,
  "relatedSystemId": 1,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drains much faster than usual, even when idle.",
  "requestedPriority": "MEDIUM"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| categoryId | integer | yes | must reference an active Category |
| relatedSystemId | integer | yes | must reference an active RelatedSystem |
| summary | string | yes | trimmed non-empty, ≤ 150 chars |
| description | string | yes | trimmed non-empty, ≤ 2000 chars |
| requestedPriority | string | yes | one of `LOW`, `MEDIUM`, `HIGH` |

### Responses

| Status | When | Body |
|---|---|---|
| `201 Created` | Valid submission, no recent duplicate | The created `Ticket`, now including `ownerId: null`, `itPriority` (copied from `requestedPriority`), `currentStatus: "NEW"` |
| `200 OK` | Duplicate resubmission within 10s (Lab 2 BR-02, unchanged) | The existing `Ticket` |
| `400 Bad Request` | Field validation, as Lab 2 | `{ "errors": { "<field>": "<message>" } }` |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Session role is not `REQUESTER` | Standard shape |
| `500 Internal Server Error` | Unexpected failure | `{ "error": "Failed to create ticket" }` |

## `GET /api/tickets`

Unchanged from Lab 2 (`search`, `categoryId`, `relatedSystemId`, `requestedPriority`,
`currentStatus`, `sortBy`, `sortDir`, `page`, `pageSize`) except: scoped to the session's
own `requesterId`, `currentStatus` now validates against the `TicketStatus` enum instead of
accepting any string, and the response's tickets now include `ownerId`, `itPriority`.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | — | `{ tickets: Ticket[], pagination }`, same shape as Lab 2 |
| `400 Bad Request` | Invalid `currentStatus`/`sortBy`/`sortDir`/`page`/`pageSize`, as Lab 2 | `{ "error": "<message>" }` |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Session role is not `REQUESTER` | Standard shape |

## `GET /api/tickets/:id`

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket exists and is owned by the session's user | The `Ticket` |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Session role is not `REQUESTER` | Standard shape |
| `404 Not Found` | Ticket doesn't exist, **or** exists but belongs to a different Requester (BR-14 — tightened from Lab 2's `403`) | `{ "error": "Ticket not found." }` |

## `POST /api/tickets/:id/attachments`

Same multipart shape as Lab 2 (`file` field, same size/type/count limits); `requesterId` is
no longer a form field.

### Responses

| Status | When | Body |
|---|---|---|
| `201 Created` | Valid upload on an owned ticket | The created `Attachment`, as Lab 2 |
| `400 / 413 / 415` | Validation, size, or type failures, as Lab 2 | As Lab 2 |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Session role is not `REQUESTER` | Standard shape |
| `404 Not Found` | Ticket doesn't exist or isn't the caller's (BR-14) | `{ "error": "Ticket not found." }` |
| `409 Conflict` | Active-attachment cap reached, as Lab 2 | As Lab 2 |

## `GET /api/tickets/:id/attachments`

Same response shape as Lab 2 (`AttachmentSummary[]`). `401`/`403`/`404` as above.

## `GET /api/tickets/:id/attachments/:attachmentId`

Same file-serving behavior as Lab 2. `401`/`403`/`404` as above (a removed or
different-ticket attachment id still `404`s, as Lab 2).

## `DELETE /api/tickets/:id/attachments/:attachmentId`

Same soft-removal behavior and `reason` body as Lab 2. `401`/`403`/`404` as above.

---

## Comments, Notes, and "mark resolved" (new; shared route, role-gated per call)

Reachable by a Requester only for a ticket they own, or by IT Staff/Administrator for any
ticket — the same handler enforces both, since the visible content differs by role rather
than the route.

## `GET /api/tickets/:id/comments`

Public Comments only (never Internal Notes — that's a separate endpoint below).

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket is visible to the caller (owned, if Requester; any, if IT Staff/Administrator) | `PublicComment[]`, each `{ id, ticketId, authorId, authorName, authorRole, body, createdAt }`, ordered `createdAt asc, id asc` |
| `401 Unauthorized` | No session | Standard shape |
| `404 Not Found` | Ticket doesn't exist, or (Requester caller) isn't theirs | `{ "error": "Ticket not found." }` |

## `POST /api/tickets/:id/comments`

### Request body

```json
{ "body": "I tried restarting the laptop and the issue is still there." }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| body | string | yes | trimmed non-empty (BR-25), ≤ 2000 chars (BR-26) |

### Responses

| Status | When | Body |
|---|---|---|
| `201 Created` | Ticket visible to caller, body valid | The created `PublicComment` |
| `400 Bad Request` | `body` empty/whitespace-only or over 2000 chars | `{ "errors": { "body": "<message>" } }` |
| `401 Unauthorized` | No session | Standard shape |
| `404 Not Found` | Ticket doesn't exist, or (Requester caller) isn't theirs | `{ "error": "Ticket not found." }` |

## `GET /api/tickets/:id/notes`

Internal Notes — IT Staff/Administrator only (BR-04, BR-29, AC-04/AC-21).

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Caller is IT Staff/Administrator; ticket exists | `InternalNote[]`, same shape as comments |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Caller role is `REQUESTER` — rejected **without revealing whether any notes exist** (AC-04: same `403` body whether the ticket has notes or not, and regardless of whether the ticket is the caller's own) | Standard shape |
| `404 Not Found` | Caller is IT Staff/Administrator but the ticket doesn't exist | `{ "error": "Ticket not found." }` |

## `POST /api/tickets/:id/notes`

Same request/validation shape as `POST .../comments` (`body`, same length rule). `403` for
a Requester caller, same as the `GET` above. `201` returns the created `InternalNote`.

## `POST /api/tickets/:id/mark-resolved`

Requester only, on their own ticket (FR-14, BR-05, BR-24). No request body.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket is the caller's | The updated `Ticket`, with `requesterMarkedResolvedAt`/`requesterMarkedResolvedById` set; `currentStatus` is **unchanged** |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Caller role is not `REQUESTER` | Standard shape |
| `404 Not Found` | Ticket doesn't exist or isn't the caller's | `{ "error": "Ticket not found." }` |

Calling this again on an already-marked ticket is not an error — it simply overwrites the
timestamp/author (`200`, idempotent).

---

## IT Staff endpoints (new)

All require an active session with role `IT_STAFF` or `ADMINISTRATOR`; a `REQUESTER`
caller gets `403` (AC-28) on every route in this section.

## `GET /api/staff/tickets`

The Ticket Queue (FR-15).

### Query parameters

| Query param | Type | Required | Rule |
|---|---|---|---|
| search | string | no | matches `summary`, `description`, or `ticketNumber` (case-insensitive `contains`, as Lab 2's Requester search) |
| categoryId | integer | no | must reference an existing Category |
| relatedSystemId | integer | no | must reference an existing RelatedSystem |
| itPriority | string | no | one of `LOW`, `MEDIUM`, `HIGH` |
| currentStatus | string | no | one of the 8 `TicketStatus` values |
| ownerId | integer | no | filter to a specific owner; `0` means "unassigned only" |
| sortBy | string | no | one of `createdAt`, `updatedAt`, `itPriority`, `currentStatus`; default `createdAt` |
| sortDir | string | no | `asc`/`desc`; default `desc` |
| page | integer | no | default `1` |
| pageSize | integer | no | default `20`, max `50` |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | — | `{ tickets: StaffTicketSummary[], pagination }` — each ticket includes `requesterName`, `ownerName` (nullable), alongside the fields Lab 2's list already returns |
| `400 Bad Request` | Any query param fails its rule | `{ "error": "<message>" }`, same pattern as Lab 2's `GET /api/tickets` |
| `401 / 403` | As above | Standard shapes |

An invalid query parameter value is a `400`, never silently ignored — same convention Lab 2
established for `GET /api/tickets`.

## `GET /api/staff/tickets/:id`

Returns any ticket (no ownership restriction, since every IT Staff/Administrator may see
every ticket) with its full detail: ticket fields, requester's name/email, owner's
name/email (nullable), attachment list, Public Comments, and Internal Notes all in one
response, to back the Ticket Detail screen in one call.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket exists | `{ ticket, attachments, comments, notes }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |

## `POST /api/staff/tickets/:id/claim`

Sets the caller as the ticket's owner (BR-18). No request body.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket exists, `ownerId` is currently `null` | The updated `Ticket` (`ownerId` = caller) |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |
| `409 Conflict` | Ticket already has an owner (use `.../assign` to reassign) | `{ "error": "Ticket is already assigned. Use assign to change its owner." }` |

## `POST /api/staff/tickets/:id/assign`

Sets (or replaces) the ticket's owner to a specific user (BR-18) — usable whether the
ticket is currently unassigned or already owned by someone else.

### Request body

```json
{ "ownerId": 7 }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| ownerId | integer | yes | must reference an active `IT_STAFF` or `ADMINISTRATOR` user (AC-17) |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket and target user both valid | The updated `Ticket` |
| `400 Bad Request` | `ownerId` missing/not an integer, **or** references a Requester, inactive user, or nonexistent user (AC-17) | `{ "errors": { "ownerId": "<message>" } }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |

## `PATCH /api/staff/tickets/:id/priority`

### Request body

```json
{ "itPriority": "HIGH" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| itPriority | string | yes | one of `LOW`, `MEDIUM`, `HIGH` |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket exists, value valid | The updated `Ticket` (`requestedPriority` unchanged, BR-20) |
| `400 Bad Request` | Invalid/missing `itPriority` | `{ "errors": { "itPriority": "<message>" } }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |

## `PATCH /api/staff/tickets/:id/status`

### Request body

```json
{ "currentStatus": "IN_PROGRESS" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| currentStatus | string | yes | one of the 8 `TicketStatus` values, **and** a legal next state from the ticket's current status per the matrix in `specification.md` §7.3 (BR-22) |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket exists, transition is legal | The updated `Ticket` |
| `400 Bad Request` | `currentStatus` missing or not a recognized enum value | `{ "errors": { "currentStatus": "<message>" } }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |
| `409 Conflict` | Value is a valid status but not a legal transition from the ticket's current status (BR-22) | `{ "error": "Cannot transition from <current> to <requested>." }` — `currentStatus` is left unchanged |

---

## Administrator endpoints (new)

All require an active session with role `ADMINISTRATOR`; any other role gets `403`
(AC-27) on every route in this section.

## `GET /api/admin/users`

### Query parameters

| Query param | Type | Required | Rule |
|---|---|---|---|
| search | string | no | matches `name` or `email` (case-insensitive `contains`) |
| role | string | no | one of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` |

No pagination (§8.5's explicit exclusion) — the full matching list is returned.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | — | `User[]`, each `{ id, name, email, role, isActive, mustChangePassword, createdAt }` — never `passwordHash` |
| `400 Bad Request` | Invalid `role` value | `{ "error": "role must be one of: REQUESTER, IT_STAFF, ADMINISTRATOR." }` |
| `401 / 403` | As above | Standard shapes |

## `POST /api/admin/users`

### Request body

```json
{
  "name": "Alex Rivera",
  "email": "alex.rivera@toktickit.test",
  "role": "IT_STAFF",
  "isActive": true,
  "password": "ChangeMe123!"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| name | string | yes | trimmed non-empty |
| email | string | yes | trimmed, valid email shape, unique case-insensitive (BR-34) |
| role | string | yes | exactly one of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` (BR-32) |
| isActive | boolean | no | default `true` |
| password | string | yes | ≥ 8 characters — the account's default password |

### Responses

| Status | When | Body |
|---|---|---|
| `201 Created` | Valid, email not already in use | The created `User` (`mustChangePassword: true` always, regardless of the `isActive` value given) |
| `400 Bad Request` | Missing/invalid `name`/`email`/`role`/`password` | `{ "errors": { "<field>": "<message>" } }` |
| `401 / 403` | As above | Standard shapes |
| `409 Conflict` | `email` already in use (case-insensitive, BR-34) | `{ "errors": { "email": "This email is already in use." } }` |

## `PATCH /api/admin/users/:id`

Never changes the password (use reset-password below).

### Request body

```json
{ "name": "Alex T. Rivera", "email": "alex.rivera@toktickit.test", "role": "IT_STAFF", "isActive": false }
```

All fields optional; only fields present are updated.

| Field | Type | Rule |
|---|---|---|
| name | string | trimmed non-empty, if present |
| email | string | valid shape, unique case-insensitive, if present |
| role | string | one of the 3 values, if present |
| isActive | boolean | subject to the self-suspend and last-admin guards below, if present and `false` |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Valid update | The updated `User` |
| `400 Bad Request` | An included field fails its rule | `{ "errors": { "<field>": "<message>" } }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | `:id` doesn't reference an existing user | `{ "error": "User not found." }` |
| `409 Conflict` | `email` already in use by another user (BR-34); **or** `isActive: false` on the caller's own account (BR-36/FR-26); **or** `isActive: false` or `role` change away from `ADMINISTRATOR` on the last active Administrator (BR-37/FR-27) | `{ "error": "<specific message>" }` — three distinct messages, one per case, so the UI can show the right explanation |

Check order for the two guard cases: shape/validation → email uniqueness → self-suspend
check → last-active-admin check → apply update.

## `POST /api/admin/users/:id/reset-password`

### Request body

```json
{ "password": "ChangeMe123!" }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| password | string | yes | ≥ 8 characters |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | `:id` exists, password valid | The updated `User`, with `mustChangePassword: true` (BR-35/FR-25) |
| `400 Bad Request` | `password` missing or under 8 characters | `{ "errors": { "password": "<message>" } }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | `:id` doesn't reference an existing user | `{ "error": "User not found." }` |

Resetting an Administrator's own password is allowed (only *deactivating* self is blocked);
this endpoint carries no self/last-admin restriction.
