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
`Origin` is rejected `403` as CSRF defense-in-depth alongside `SameSite=Lax`. This check runs
as **middleware, before the session cookie is parsed** — i.e. before the point where
`specification.md`'s BR-13 ladder (401 → 403 role/ownership → 400 → 404 → 409) begins. It is
not the "403" BR-13 refers to and doesn't reorder that ladder for a request that passes it;
it is a separate, earlier gate that a forged cross-origin request never gets past.

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

Requires an authenticated session. A user with `mustChangePassword: true` may always call
this route, plus `GET /api/auth/me` and `POST /api/auth/logout` (see the "Forced password
change" note below for why those two specifically stay open) — every *other* authenticated
route returns `403` with a dedicated body until the password is changed.

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

**Forced password change**: every authenticated endpoint *other than* `POST /api/auth/login`
(no session yet to gate), `GET /api/auth/me`, `POST /api/auth/logout`, and
`POST /api/auth/change-password` itself, when called by a user with
`mustChangePassword: true`, returns `403` with
`{ "error": "Password change required.", "code": "PASSWORD_CHANGE_REQUIRED" }` — the
`code` field lets the client route straight to the Change Password screen instead of a
generic forbidden page. `/me` and `/logout` are exempt deliberately: the client calls `/me`
on load specifically to *learn* whether `mustChangePassword` is set (it can't know to show
the Change Password screen otherwise), and `/logout` has to work from that screen too, so
gating either of them would leave the client with no way out.

---

## Requester ticket and attachment endpoints (Lab 2 carryover)

All seven endpoints below keep their Lab 2 request/response shape **except**: `requesterId`
is no longer accepted as a client-supplied field/query-param/form-field on any of them — the
authenticated session's user id is used instead (FR-08, BR-03). Sending a `requesterId`
value is silently ignored (not an error), so an old client wouldn't crash, but it has no
effect. Role required: `REQUESTER` for the create/detail/attachment routes below, or
`IT_STAFF`/`ADMINISTRATOR` reading through the staff-prefixed equivalents further down —
see BR-14 for the `404`-not-`403` ownership rule.

**`GET /api/requesters` is removed.** It was Lab 2's dev-selector lookup ("which Requester
am I acting as") and has no purpose once identity comes from the session; it's removed in
the same change that removes the client's `DevRequesterPicker` component.

### Lookup endpoints (`GET /api/categories`, `GET /api/related-systems`)

Carried over from Lab 2 with the same response shape (`{ id, name }[]`, active rows only).
The only change: they now require an authenticated session (any role) instead of being
open — Lab 3's default is "authenticated unless stated otherwise," and `/api/health` plus
`POST /api/auth/login` are the only routes that stay reachable with no session at all.
`401 Unauthorized` (standard shape) for no session; no role restriction beyond that.

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

**Read** (`GET`) is reachable by a Requester only for a ticket they own, or by IT
Staff/Administrator for any ticket (Administrator's access is read-only per §3.4's
authorization matrix — BR-39). **Write** (`POST`) is reachable by a Requester (their own
ticket, comments only) or IT Staff (any ticket, comments and notes) — **never**
Administrator, on any of the four write/read-write routes below except the `GET`s. The same
handler enforces both directions, since the visible content differs by role rather than the
route.

## `GET /api/tickets/:id/comments`

Public Comments only (never Internal Notes — that's a separate endpoint below).

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket is visible to the caller (owned, if Requester; any, if IT Staff/Administrator — BR-39) | `PublicComment[]`, each `{ id, ticketId, authorId, authorName, authorRole, body, createdAt }`, ordered `createdAt asc, id asc` |
| `401 Unauthorized` | No session | Standard shape |
| `404 Not Found` | Ticket doesn't exist, or (Requester caller) isn't theirs | `{ "error": "Ticket not found." }` |

## `POST /api/tickets/:id/comments`

Requester (own ticket) or IT Staff (any ticket) only — **not** Administrator (BR-39: read-
only).

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
| `403 Forbidden` | Caller role is `ADMINISTRATOR` (BR-39) | Standard shape |
| `404 Not Found` | Ticket doesn't exist, or (Requester caller) isn't theirs | `{ "error": "Ticket not found." }` |

## `GET /api/tickets/:id/notes`

Internal Notes — IT Staff and Administrator (BR-04, BR-29, AC-04/AC-21); Administrator's
access here is read-only, same as `GET .../comments`.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Caller is IT Staff/Administrator; ticket exists | `InternalNote[]`, same shape as comments |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Caller role is `REQUESTER` — rejected **without revealing whether any notes exist** (AC-04: same `403` body whether the ticket has notes or not, and regardless of whether the ticket is the caller's own) | Standard shape |
| `404 Not Found` | Caller is IT Staff/Administrator but the ticket doesn't exist | `{ "error": "Ticket not found." }` |

## `POST /api/tickets/:id/notes`

IT Staff only — **not** Requester (can never see or write notes, BR-29) and **not**
Administrator (read-only, BR-39). Same request/validation shape as `POST .../comments`
(`body`, same length rule).

### Responses

| Status | When | Body |
|---|---|---|
| `201 Created` | Caller is `IT_STAFF`, ticket exists, body valid | The created `InternalNote` |
| `400 Bad Request` | `body` empty/whitespace-only or over 2000 chars | `{ "errors": { "body": "<message>" } }` |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Caller role is `REQUESTER` or `ADMINISTRATOR` | Standard shape |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |

## `POST /api/tickets/:id/mark-resolved`

Requester only, on their own ticket (FR-14, BR-05, BR-24). No request body.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket is the caller's, and `currentStatus` is not `RESOLVED`/`CLOSED`/`CANCELLED` | The updated `Ticket`, with `requesterMarkedResolvedAt`/`requesterMarkedResolvedById` set; `currentStatus` is **unchanged** |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Caller role is not `REQUESTER` | Standard shape |
| `404 Not Found` | Ticket doesn't exist or isn't the caller's | `{ "error": "Ticket not found." }` |
| `409 Conflict` | `currentStatus` is already `RESOLVED`, `CLOSED`, or `CANCELLED` (BR-40) | `{ "error": "This ticket is already <status> and can't be marked resolved." }` |

Calling this again on an already-marked ticket that is **not yet** in a terminal status is
not an error — it simply overwrites the timestamp/author (`200`, idempotent, BR-24). Once
the ticket reaches a terminal status, further calls are `409` (BR-40) — this is the one case
that isn't idempotent, since the UI also hides the button at that point (ui-spec.md §5.2)
and the server enforces the same rule independently.

---

## IT Staff endpoints (new)

A `REQUESTER` caller gets `403` on every route in this section (AC-28a/b). Beyond that, this
section splits in two per §3.4's authorization matrix / BR-39:

- **Read** — `GET /api/staff/tickets` and `GET /api/staff/tickets/:id` — reachable by
  `IT_STAFF` **or** `ADMINISTRATOR` (Administrator's access is read-only).
- **Write** — `POST .../claim`, `POST .../assign`, `PATCH .../priority`,
  `PATCH .../status`, and `GET .../assignable-users` — `IT_STAFF` **only**; an
  `ADMINISTRATOR` caller gets `403` on all five, the same as a `REQUESTER` would (AC-28b).

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
| ownerId | integer | yes | must reference an active `IT_STAFF` user (not `ADMINISTRATOR` — BR-17, AC-17) |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket and target user both valid | The updated `Ticket` |
| `400 Bad Request` | `ownerId` missing/not an integer, **or** references a Requester, an Administrator, an inactive user, or a nonexistent user (AC-17) | `{ "errors": { "ownerId": "<message>" } }` |
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
{ "currentStatus": "RESOLVED", "confirm": true }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| currentStatus | string | yes | one of the 8 `TicketStatus` values, **and** a legal next state from the ticket's current status per the matrix in `specification.md` §7.3 (BR-22) |
| confirm | boolean | conditional | required and must be `true` when `currentStatus` is `RESOLVED`, `CLOSED`, `REOPENED`, or `CANCELLED` (specification.md §7.3's confirmation table, BR-42); ignored for every other target value — omitting it there is fine |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Ticket exists, transition is legal, and `confirm` satisfies BR-42 if required | The updated `Ticket` |
| `400 Bad Request` | `currentStatus` missing or not a recognized enum value, **or** the target requires confirmation and `confirm` is missing/`false` (BR-42) | `{ "errors": { "currentStatus": "<message>" } }` or `{ "errors": { "confirm": "Confirmation is required to set this status." } }` |
| `401 / 403` | As above | Standard shapes |
| `404 Not Found` | Ticket doesn't exist | `{ "error": "Ticket not found." }` |
| `409 Conflict` | `currentStatus` is a valid status and confirmation (if required) was given, but it's not a legal transition from the ticket's current status (BR-22) | `{ "error": "Cannot transition from <current> to <requested>." }` — `currentStatus` is left unchanged |

Check order: shape (`currentStatus` is a recognized enum value) → confirmation, if the
target requires it (BR-42, `400`) → legality per the §7.3 matrix (BR-22, `409`). A request
targeting a confirmation-required status with `confirm` missing is `400` even if that
transition would also have been illegal — the confirmation check runs first, per BR-13's
400-before-409 order.

## `GET /api/staff/assignable-users`

`IT_STAFF` only (BR-41, FR-28) — populates the claim/assign control's dropdown (ui-spec.md
§7). Deliberately not `GET /api/admin/users`: that route is Administrator-only and returns
every role, which is both the wrong permission and more data than a reassignment needs.

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Caller is `IT_STAFF` | `{ id, name }[]` — active `IT_STAFF` users only (not `ADMINISTRATOR`, since Administrator cannot own a ticket — BR-17), ordered by `name asc` |
| `401 Unauthorized` | No session | Standard shape |
| `403 Forbidden` | Caller role is `REQUESTER` or `ADMINISTRATOR` | Standard shape |

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
