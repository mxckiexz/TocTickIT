# Lab 3 — Authentication, Roles, IT Staff Workflow, and Administrator User Management — Specification

> Source of truth for Sprint 3. Extends `docs/lab-02/specification.md` — Lab 2's Requester
> features (create ticket, My Tickets, Ticket Detail, attachments) are preserved, not
> rebuilt. This document does not restate the handout; it records the decisions made to
> implement it. See [api-spec.md](api-spec.md) for the exact request/response contract,
> [ui-spec.md](ui-spec.md) for screen-level detail, and [tests.md](tests.md) for how every
> rule below is covered by a test.

## 1. Sprint Goal

Replace Lab 2's Development Requester selector with real, server-verified authentication,
and ship the two roles Lab 2 never had: IT Staff, who work a shared ticket queue instead of
each seeing only their own tickets, and Administrator, who manage the user accounts that
authentication now depends on. All three roles — Requester, IT Staff, Administrator —
authenticate the same way; what differs is which screens and API actions their role
authorizes, and that authorization is enforced on the server, not by hiding buttons in the
client.

## 2. Stakeholder Request (in our own words)

The client no longer wants a dropdown standing in for login. Real users, real passwords,
and a forced password change for anyone still on a default one. IT Staff want one shared
queue instead of a folder of dev-requester tickets — they need to search it, claim work out
of it, set their own priority on top of whatever the Requester asked for, and leave two
kinds of notes: ones the Requester can read (Public Comments) and ones they can't (Internal
Notes). A Requester can say "this looks fixed to me," but only IT Staff can actually close
the ticket. Administrators don't work tickets — claiming, reassigning, setting priority,
changing status, and posting comments/notes stay IT Staff actions only — but per the
handout's own rule that Internal Notes are visible to Administrator too, an Administrator
can look at any ticket read-only. Mostly, though, they run one simple screen for creating
accounts, fixing a typo in someone's name or email, turning an account on or off, assigning
its one role, and resetting a forgotten password. Every one of these rules has to hold at
the API, not just in what the screen shows, because the API is what a curious or malicious
client will hit directly.

## 3. Scope

### 3.1 In scope

- Password-based authentication: login, logout, current-user, forced password change on
  first login for a seeded/reset default password.
- Server-side role and ownership authorization on every protected route (Requester, IT
  Staff, Administrator).
- Migration of Lab 2's `Requester` dev-selector rows into real `User` rows with the
  `REQUESTER` role; removal of the Development Requester selector and its client-side
  state.
- Continued operation of every Lab 2 Requester feature (create ticket, My Tickets, Ticket
  Detail, attachment upload/inspect/soft-remove) under the authenticated identity.
- New Requester actions: Public Comments, "Problem Appears Resolved."
- IT Staff Ticket Queue (search/filter/sort/paginate) and Ticket Detail (claim/assign
  ownership, IT Priority, status transitions, Public Comments, Internal Notes).
- Administrator User Management: list/search/filter users, create a user with one role,
  edit name/email/role/active status, reset a default password.
- Data model and REST API changes needed for the above.
- Zen Green UI extensions reusing Lab 2's tokens and components.

### 3.2 Explicitly out of scope (per the handout, §4.2)

Email invitations/reset emails, MFA, social login, SSO, self-registration, Actions Taken,
formal SLA/escalation, KPI dashboards beyond a simple queue count, multi-tenant/department
structures, production deployment, multiple roles per user, user deletion, bulk user
operations, user import/export, account history screens, department/org/profile-picture
management, account lockout/unlock flows, admin approval workflows, and advanced list
features (forced pagination, multi-column sort, multi-filter) on User Management.

### 3.3 Deliberately excluded, with reasoning

- **Login lockout after N failed attempts** — rejected. It requires an unlock flow, which
  §4.2 explicitly excludes ("การปลดล็อกบัญชี"). We log/observe failed attempts instead of
  blocking them; brute-force mitigation via lockout is deferred past Lab 3.
- **A delete-user button** — rejected. §4.4's admin rules require "suspension in place of
  deletion" (`isActive=false`); the User Management screen never offers hard delete.
- **Administrator *write* access to tickets** — rejected (resolves handout §4.3's open
  point: "ผู้ดูแลระบบไม่จำเป็นต้องดำเนินการกับ Ticket ของเจ้าหน้าที่ IT โดยอัตโนมัติ...เว้นแต่
  แมทริกซ์การตรวจสอบสิทธิ์ที่ได้รับอนุมัติจะอนุญาตไว้อย่างชัดเจน"). Table 4.3's minimum
  permitted behavior for Administrator lists only user-management actions, and keeping the
  two roles' write responsibilities separate (IT Staff runs tickets, Administrator runs
  accounts) avoids scope creep into "admin override" behavior the handout never asks for —
  so no claim/assign, priority, status, or comment/note *write* route exists for
  `ADMINISTRATOR`. **Read** access is a different question: the handout's own given rule
  BR-04 states Internal Notes are visible to Administrator, which is only possible if an
  Administrator can view a ticket's detail at all. So Administrator gets **read-only** access
  to the Ticket Queue, Ticket Detail, Public Comments, and Internal Notes (BR-39, §3.4) —
  this is the one piece of "the approved authorization matrix explicitly permits it" the
  handout's caveat allows for, and it is the only ticket capability Administrator has.

### 3.4 Authorization Matrix

The full role × action matrix, resolving every place §3.1–§3.3 could otherwise read as
ambiguous (this is the artifact handout §4.3 asks for):

| Action | Requester | IT Staff | Administrator |
|---|---|---|---|
| Login / logout / current-user / change own password | ✅ (self) | ✅ (self) | ✅ (self) |
| Create a ticket | ✅ (becomes owner-Requester) | ❌ | ❌ |
| View/search/filter own tickets (My Tickets) | ✅ (own only) | ❌ | ❌ |
| View a Ticket Detail | ✅ (own only, else `404`) | ✅ (any) | ✅ (any, **read-only**) |
| Add / soft-remove an attachment | ✅ (own ticket only) | ❌ | ❌ |
| Post a Public Comment | ✅ (own ticket only) | ✅ (any ticket) | ❌ |
| Read Public Comments | ✅ (own ticket only) | ✅ (any ticket) | ✅ (any ticket, read-only) |
| Create an Internal Note | ❌ | ✅ (any ticket) | ❌ |
| Read Internal Notes | ❌ | ✅ (any ticket) | ✅ (any ticket, read-only — BR-04) |
| Mark "Problem Appears Resolved" | ✅ (own ticket only) | ❌ | ❌ |
| View the Ticket Queue | ❌ | ✅ | ✅ (read-only) |
| Claim / reassign a Ticket Owner | ❌ | ✅ (any ticket, not owner-restricted — BR-18) | ❌ |
| Set IT Priority | ❌ | ✅ (any ticket) | ❌ |
| Change ticket status | ❌ | ✅ (any ticket) | ❌ |
| List assignable (IT Staff) users for the claim/assign control | ❌ | ✅ | ❌ (not needed — Administrator doesn't assign) |
| List / search / filter users | ❌ | ❌ | ✅ |
| Create a user | ❌ | ❌ | ✅ |
| Edit a user (name/email/role/active) | ❌ | ❌ | ✅ |
| Reset a user's password | ❌ | ❌ | ✅ |

"Read-only" in this table means the corresponding `GET` route is reachable, but every
`POST`/`PATCH`/`DELETE` under the same feature area returns `403` for an Administrator
caller exactly as it would for a Requester (AC-20b, AC-28b).

## 4. Functional Requirements

**Authentication**

- **FR-01** — An active user with a valid email/password may authenticate via
  `POST /api/auth/login` and receive a session.
- **FR-02** — An authenticated user may end their session via `POST /api/auth/logout`.
- **FR-03** — An authenticated user may retrieve their own identity, role, and
  `mustChangePassword` flag via `GET /api/auth/me`.
- **FR-04** — A user flagged `mustChangePassword` is blocked from every other authenticated
  route until they successfully save a new password.
- **FR-05** — An authenticated user may change their own password via
  `POST /api/auth/change-password`, given their current password.

**Authorization**

- **FR-06** — The app shell shows only the navigation destinations the authenticated user's
  role is permitted to reach.
- **FR-07** — Every protected endpoint independently re-checks role and ownership on the
  server; no endpoint trusts a client-hidden control as its only protection.
- **FR-08** — Every Requester-scoped action resolves "who is asking" from the authenticated
  session, never from a client-supplied `requesterId` (replaces Lab 2's query-param
  identity).

**Requester (Lab 2 continuity + new)**

- **FR-09** — An authenticated Requester creates a ticket under their own identity (Lab 2
  Feature 1, unchanged behavior).
- **FR-10** — An authenticated Requester views, searches, filters, sorts, and pages through
  only their own tickets (Lab 2 Features 4/5, unchanged behavior).
- **FR-11** — An authenticated Requester opens a Ticket Detail screen, including
  attachments, only for tickets they own (Lab 2 Features 6/7, unchanged behavior).
- **FR-12** — An authenticated Requester adds and soft-removes attachments only on tickets
  they own (Lab 2 Features 8/9, unchanged behavior).
- **FR-13** — An authenticated Requester posts a Public Comment on a ticket they own.
- **FR-14** — An authenticated Requester marks a ticket "Problem Appears Resolved" without
  that action setting the ticket's status to Resolved or Closed.

**IT Staff**

- **FR-15** — An IT Staff user retrieves the shared Ticket Queue with search, filter, sort,
  and pagination across all tickets. An Administrator may retrieve the same queue read-only
  (§3.4's authorization matrix; BR-39).
- **FR-16** — An IT Staff user opens the Ticket Detail screen for any ticket. An
  Administrator may open the same screen read-only (BR-39).
- **FR-17** — An IT Staff user claims an unassigned ticket, or reassigns an assigned
  ticket's owner to another active IT Staff user.
- **FR-18** — An IT Staff user sets or changes a ticket's IT Priority, independently of the
  Requester's original Requested Priority.
- **FR-19** — An IT Staff user transitions a ticket's status according to the approved
  status transition matrix (§4.5 of the handout; see §7.3 below).
- **FR-20** — An IT Staff user posts a Public Comment on any ticket.
- **FR-21** — An IT Staff user creates an Internal Note on any ticket, visible only to IT
  Staff and Administrator accounts.
- **FR-28** — An IT Staff user retrieves the list of active IT Staff users eligible to own a
  ticket, to populate the claim/assign control (`GET /api/staff/assignable-users`) — this is
  the answer to "how does IT Staff find who to assign a ticket to," since
  `GET /api/admin/users` is Administrator-only and returns a broader list than a ticket
  reassignment needs.

**Administrator (User Management)**

- **FR-22** — An Administrator lists users, with search by name or email and an optional
  role filter.
- **FR-23** — An Administrator creates a user with exactly one permitted role, an initial
  active/inactive status, and a default password.
- **FR-24** — An Administrator updates a user's name, email, role, and active status.
- **FR-25** — An Administrator sets a new default password for a user; the account is
  flagged to require a password change at the user's next login.
- **FR-26** — The system blocks an Administrator from suspending (deactivating) their own
  account.
- **FR-27** — The system blocks suspending, or changing the role away from
  `ADMINISTRATOR` of, the last remaining active Administrator account.

## 5. Business Rules

**Given by the handout, §4.4:**

- **BR-01** — Only active users with valid credentials may authenticate. An inactive
  account's login attempt fails the same way as a wrong password would (§9's safe-error
  requirement — see BR-13).
- **BR-02** — A user flagged `mustChangePassword` cannot reach the normal application until
  a valid new password is saved.
- **BR-03** — The authenticated session's identity, not a client-supplied `requesterId`,
  determines ownership for every Requester action.
- **BR-04** — Public Comments are visible to Requester, IT Staff, and Administrator.
  Internal Notes are visible only to IT Staff and Administrator.
- **BR-05** — A Requester may mark a problem as appearing resolved, but cannot set a
  ticket's status to Resolved or Closed directly; only IT Staff can (Administrator's ticket
  access is read-only — BR-39).

**Authentication and password management**

- **BR-06** — Passwords are hashed with bcrypt (cost factor 12) before storage; the
  plaintext password is never persisted or logged.
- **BR-07** — A login attempt with an unknown email, a wrong password, or an inactive
  account all return the identical `401` body (§9's requirement not to leak which one it
  was). See §8's Auth error table.
- **BR-08** — A new password (at forced-change or self-service change) must be at least 8
  characters and must differ from the account's current password.
- **BR-09** — Changing a password clears the account's `mustChangePassword` flag.
- **BR-10** — Logging out invalidates the session server-side immediately — the same
  session token cannot authenticate a request after logout, even before its expiry.
- **BR-11** — A session expires 8 hours after issuance (fixed, not sliding); an expired
  session is treated as unauthenticated (`401`), not shown as a distinct error.
- **BR-12** — `GET /api/auth/me` on a valid, non-expired session always returns `200` with
  the current `{ id, name, email, role, mustChangePassword }`; there is no "empty" success
  state for this endpoint — absence of a valid session is `401`.

**Ownership, roles, and access**

- **BR-13** — A protected endpoint returns `401` for no/invalid/expired session, `403` for
  a valid session whose role or ownership doesn't permit the action, `404` when the target
  resource doesn't exist (or, for a Requester, exists but isn't theirs — see BR-14),
  `400` for invalid input, `409` for a state conflict, `500` for unexpected failures. This
  order is fixed: authentication is checked before authorization, before validation, before
  the resource lookup that could reveal a 404 vs. 403 distinction. This ladder governs
  request handling *once a request reaches route logic*; the Origin allow-list check
  (api-spec.md's CSRF note) is a separate, earlier gate at the middleware level, run before
  cookies are even parsed into a session — a mismatched `Origin` is rejected `403` before
  this ladder starts, so it is not the same `403` this rule is describing and doesn't change
  the ladder's order for requests that pass it.
- **BR-14** — For Requester-owned resources (tickets, attachments), a Requester requesting
  another Requester's resource gets `404`, not `403` — this matches Lab 2's existing
  `403` behavior being tightened to avoid confirming the resource exists at all for someone
  who could never legitimately reach it. (IT Staff/Administrator, who are allowed to see any
  ticket, get the resource or a plain `404` if it truly doesn't exist — never a `403` for
  a ticket that exists.)
- **BR-15** — Exactly one role is stored per user (`REQUESTER`, `IT_STAFF`, or
  `ADMINISTRATOR`); Lab 3 has no multi-role assignment.
- **BR-16** — A user whose account is inactive (`isActive=false`) cannot authenticate, and
  an existing session for a user who is deactivated mid-session is rejected on their very
  next request (the session lookup joins to the user's current `isActive` value, not a
  cached one).

**Ticket ownership, priority, and status**

- **BR-17** — A ticket may have at most one primary Ticket Owner, who must be an active
  `IT_STAFF` user (not `ADMINISTRATOR` — see BR-39); a ticket may be unassigned
  (`ownerId: null`).
- **BR-18** — Claiming an unassigned ticket sets the caller as its owner. Reassigning an
  already-assigned ticket to a different active IT Staff user is allowed by any IT Staff
  user, not only the current owner (the queue is shared, per the handout's "ใช้ Ticket Queue
  ร่วมกัน").
- **BR-19** — `requestedPriority` is set once, by the Requester, at ticket creation, and is
  never edited afterward (Lab 2 behavior, unchanged).
- **BR-20** — `itPriority` is copied from `requestedPriority` at ticket creation, then is
  editable only by IT Staff (not Administrator — read-only, BR-39), independently of
  `requestedPriority`.
- **BR-21** — `currentStatus` starts at `NEW` for every newly created ticket.
- **BR-22** — Only the transitions listed in the status matrix (§7.3) are accepted; any
  other requested transition is rejected with `409 Conflict`, and the current status is
  never changed by a rejected request.
- **BR-23** — Any active IT Staff user may transition a ticket's status — transition rights
  are not restricted to the ticket's current owner, and Administrator cannot transition
  status at all (read-only — BR-39).
- **BR-24** — A Requester marking "Problem Appears Resolved" is recorded as
  `requesterMarkedResolvedAt`/`requesterMarkedResolvedById` on the ticket and does not
  change `currentStatus`; it is visible to IT Staff/Administrator as a signal, not an
  automatic transition.

**Comments and notes**

- **BR-25** — A Public Comment or Internal Note's content is rejected as `400` if empty or
  whitespace-only after trimming.
- **BR-26** — A Public Comment or Internal Note is capped at 2,000 characters; content
  beyond that is rejected as `400`, not truncated.
- **BR-27** — Every comment/note record captures its author (from the session) and
  `createdAt` (from the server clock) — never client-supplied.
- **BR-28** — Comments and notes are append-only in Lab 3: no edit or delete endpoint
  exists for either.
- **BR-29** — A Requester may only post a Public Comment on a ticket they own; a Requester
  can never create or read an Internal Note (enforced at the API, independent of what the
  UI shows — BR-04).

**Migration and regression**

- **BR-30** — Every Lab 2 `Requester` row is migrated into a `User` row with role
  `REQUESTER`, the same `id`, `name`, `email`, and `isActive`, and a seeded default password
  requiring change at first login (§6.2). No Lab 2 `Ticket` or `Attachment` row's
  `requesterId`/ownership relationship changes as a result of the migration.
- **BR-31** — Lab 2's Category and RelatedSystem tables, and their active/inactive
  semantics, are unchanged by Lab 3.

**Administrator (§4.4's admin rules, given by the handout)**

- **BR-32** — Creating a user requires exactly one of the three permitted roles; a request
  with zero, two, or an unrecognized role value is rejected as `400`.
- **BR-33** — Editing a user may change name, email, role, and `isActive`, but never the
  user's stored password (password changes go only through reset-default-password, FR-25).
- **BR-34** — Email addresses are unique across all users (case-insensitive comparison); a
  duplicate on create or edit is rejected as `409`.
- **BR-35** — Resetting a user's password sets a new default password and sets
  `mustChangePassword=true`, forcing a change at that user's next login (FR-25).
- **BR-36** — An Administrator cannot deactivate their own account (`isActive: false` on
  self is rejected as `409`, FR-26).
- **BR-37** — The system blocks any edit that would leave zero active Administrator
  accounts — deactivating or changing the role of the last active Administrator is rejected
  as `409` (FR-27).
- **BR-38** — There is no delete-user endpoint; suspension (`isActive=false`) is the only
  way to remove a user's access, per the handout's explicit requirement.

**Added during review (§3.4's authorization matrix and its consequences)**

- **BR-39** — An Administrator has read-only access to the Ticket Queue, Ticket Detail,
  Public Comments, and Internal Notes (§3.4) — satisfying BR-04's requirement that
  Administrator can see Internal Notes, without granting any ticket *write* action. An
  Administrator calling a ticket write route (claim, assign, set priority, change status,
  post a comment/note) gets `403`, the same as a Requester would.
- **BR-40** — `POST /api/tickets/:id/mark-resolved` is rejected `409` if the ticket's
  `currentStatus` is already `RESOLVED`, `CLOSED`, or `CANCELLED` — the UI hides the button
  in that state (ui-spec.md §5.2), and the server enforces it independently rather than
  relying on the UI to hide it (FR-07's principle applied to this action specifically).
  Calling it again while the ticket is in any *other* status remains idempotent (BR-24) —
  this rule only blocks the terminal-status case.
- **BR-41** — `GET /api/staff/assignable-users` (FR-28) returns active `IT_STAFF` users only
  — not `ADMINISTRATOR` users, since Administrator cannot own a ticket (BR-17) — and is
  reachable by `IT_STAFF` only; a `REQUESTER` or `ADMINISTRATOR` caller gets `403`.

## 6. UI Specification Summary

Full detail, states, and screenshots are in [ui-spec.md](ui-spec.md). Summary:

- **Login** — email/password form; validation and a safe "invalid email or password, or
  this account is inactive" style message that doesn't reveal which; loading state on
  submit.
- **Change Password (forced)** — shown instead of the app shell whenever
  `mustChangePassword` is true; current password, new password, confirm; blocks navigation
  away until saved.
- **App Shell** — replaces `RequesterBanner`/`DevRequesterPicker`; shows the authenticated
  user's name and role, a Logout action, and role-scoped navigation.
- **Requester screens** — Lab 2's `CreateTicketForm`, `MyTickets`, `TicketDetail` continue
  as-is, minus the dev-requester gate; `TicketDetail` gains a Public Comments thread and a
  "Problem Appears Resolved" button.
- **IT Staff Ticket Queue** — a new screen: searchable/filterable/sortable/paginated table
  (desktop) collapsing to stacked cards (mobile), with owner and status badges and a row
  action to open Ticket Detail.
- **IT Staff Ticket Detail** — extends the Requester's Ticket Detail layout with an
  ownership/claim control, an IT Priority selector, a status-transition control limited to
  the matrix's legal next states, and an Internal Notes panel visually distinct from Public
  Comments.
- **Administrator User Management** — one screen: searchable/filterable user table, a
  create-user form, and an edit-user panel (role, active status, reset password) — no
  pagination, no bulk actions, no delete, per §8.5's explicit exclusions. Administrator's
  read-only ticket access (§3.4, BR-39) is an API-level capability only — Lab 3 has no
  dedicated ticket-viewing UI screen for Administrator, matching §8.5's "keep it simple"
  instruction and the handout's exclusion of admin dashboards beyond user management.

All screens reuse Lab 2's Zen Green tokens (`--zg-primary-green`, `--zg-secondary-green`,
`--zg-pale-green`, `--zg-page-bg`, `--zg-text`, `--zg-readonly-bg`, `--zg-error`) and the
`.zg-app-header`/`.zg-surface` shell classes — no second visual system.

## 7. Data Changes

### 7.1 New models

| Model | Fields | Notes |
|---|---|---|
| `User` | id, name, email (unique), passwordHash, role (`Role` enum), isActive, mustChangePassword, createdAt, updatedAt | Replaces `Requester` as the identity behind every role. |
| `Session` | id (token), userId, expiresAt, createdAt | Server-side session store backing the auth cookie; a row is deleted on logout, not just expired. |
| `PublicComment` | id, ticketId, authorId (`User`), body, createdAt | Append-only; visible to all three roles (BR-04). |
| `InternalNote` | id, ticketId, authorId (`User`), body, createdAt | Append-only; visible to IT Staff/Administrator only (BR-04). |

`enum Role { REQUESTER IT_STAFF ADMINISTRATOR }`

### 7.2 Changed model: `Ticket`

| Field | Change | Notes |
|---|---|---|
| `requesterId` | FK retargeted from `Requester` to `User` | Same column name and semantics; the referenced table changes. |
| `ownerId` | **new**, nullable FK to `User` | The Ticket Owner (BR-17); null = unassigned. |
| `itPriority` | **new**, `Priority` enum (reuses Lab 2's `LOW`/`MEDIUM`/`HIGH`), not null | Copied from `requestedPriority` at creation (BR-20), then independently editable. |
| `currentStatus` | changed from free `String` to `TicketStatus` enum | `enum TicketStatus { NEW OPEN IN_PROGRESS WAITING_FOR_REQUESTER RESOLVED CLOSED REOPENED CANCELLED }` — the handout's 8 required statuses (§4.5). |
| `requesterMarkedResolvedAt` | **new**, nullable `DateTime` | Set by FR-14/BR-24; never cleared once set (a later Reopened ticket keeps the historical timestamp). |
| `requesterMarkedResolvedById` | **new**, nullable FK to `User` | Who marked it — always the ticket's own Requester when set. |

`Category`, `RelatedSystem`, and `Attachment` are otherwise unchanged (BR-31). `Requester`
is **not** unchanged — it is dropped entirely once the migration's contract step runs
(§7.4 step 4); every reference to it anywhere in the app moves to `User` with
`role: REQUESTER`.

### 7.3 Ticket status transition matrix

| From \ To | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
|---|---|---|---|---|---|---|---|
| NEW | ✅ | ✅ | — | — | — | — | ✅ |
| OPEN | — | ✅ | ✅ | — | — | — | ✅ |
| IN_PROGRESS | — | — | ✅ | ✅ | — | — | ✅ |
| WAITING_FOR_REQUESTER | — | ✅ | — | ✅ | — | — | ✅ |
| RESOLVED | — | — | — | — | ✅ | ✅ | — |
| CLOSED | — | — | — | — | — | ✅ | — |
| REOPENED | — | ✅ | ✅ | ✅ | — | — | ✅ |
| CANCELLED | — | — | — | — | — | ✅ | — |

All transitions require the caller to be an active IT Staff user (BR-23) — Administrator's
ticket access is read-only (BR-39) and cannot transition status at all. Any cell not marked
✅ (including a status "transitioning" to itself) is rejected `409` per BR-22.

### 7.4 Migration from Lab 2 (expand → backfill → contract)

1. **Expand**: add `User`, `Session`, `PublicComment`, `InternalNote` tables; add nullable
   `ownerId`, `itPriority`, `requesterMarkedResolvedAt`, `requesterMarkedResolvedById` to
   `Ticket`; add a new nullable `currentStatusNext` column of the `TicketStatus` enum type
   (kept alongside the old `currentStatus` string column during migration).
2. **Backfill users**: for every `Requester` row, insert a `User` row with the same `id`
   (explicit id insert, so no FK remapping is needed anywhere else), `role=REQUESTER`,
   `passwordHash` of the seeded local-dev default password, `mustChangePassword=true`.
3. **Backfill tickets**: set `itPriority = requestedPriority` and
   `currentStatusNext = 'NEW'` (the only value Lab 2 ever wrote to `currentStatus`) for
   every existing `Ticket` row.
4. **Contract**: drop the old `currentStatus` string column, rename `currentStatusNext` to
   `currentStatus`, set it `NOT NULL DEFAULT 'NEW'`; set `itPriority NOT NULL`; add the FK
   from `Ticket.requesterId` to `User.id`; drop the `Requester` table.
5. **Verify**: `Ticket` row count, `Attachment` row count, and every `Ticket.requesterId`
   value are identical before and after the migration (checked by a migration test — see
   `tests.md` MIG-xx rows).

### 7.5 Seed data (local development only — no real secrets)

- 4 active + 1 inactive Requester-role users (carried over from Lab 2's 4 active + 1
  inactive `Requester` seed rows, now as `User`).
- 3 active + 1 inactive IT Staff users (new).
- 1 active Administrator user (new).
- All seeded accounts share one documented local-dev default password (recorded in
  `server/README` or `.env.example`, never in this document or in a commit as if it were a
  real secret) and `mustChangePassword=true`.
- Existing Lab 2 ticket/comment fixtures are preserved; a handful of new tickets are added
  with a mix of assigned/unassigned owners, varied `currentStatus`/`itPriority`, and 1–2
  sample Public Comments and Internal Notes each, none containing sensitive data.
- Seeding is idempotent (`upsert` on unique keys), matching Lab 2's existing seed script
  pattern.

## 8. API Contract

Full request/response detail is in [api-spec.md](api-spec.md). Summary of the surface:

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` — the last three work regardless of `mustChangePassword` (see below); only the routes past this table are gated by it. |
| Requester tickets/attachments | Lab 2's existing routes, all now session-authenticated: `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/attachments`, `GET /api/tickets/:id/attachments`, `GET /api/tickets/:id/attachments/:attachmentId`, `DELETE /api/tickets/:id/attachments/:attachmentId`. `GET /api/requesters` (Lab 2's dev-selector endpoint) is **removed** in Feature 3, once the client's `DevRequesterPicker` is removed — nothing needs it once identity comes from the session. |
| Lookup lists | `GET /api/categories`, `GET /api/related-systems` — carried over from Lab 2 unchanged in shape, but now require an authenticated session (any role); Lab 3 has no route that stays open to a fully anonymous caller except `/api/health` and `/api/auth/login`. |
| Comments/Notes (shared route, role-gated per §3.4) | `GET /api/tickets/:id/comments`, `POST /api/tickets/:id/comments`, `GET /api/tickets/:id/notes`, `POST /api/tickets/:id/notes`, `POST /api/tickets/:id/mark-resolved` |
| IT Staff queue/detail | `GET /api/staff/tickets`, `GET /api/staff/tickets/:id` — IT Staff and Administrator (read-only for Administrator, BR-39); `POST /api/staff/tickets/:id/claim`, `POST /api/staff/tickets/:id/assign`, `PATCH /api/staff/tickets/:id/priority`, `PATCH /api/staff/tickets/:id/status`, `GET /api/staff/assignable-users` — IT Staff only, Administrator gets `403` on these five. |
| Administrator users | `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/reset-password` |

Auth: session cookie (`toktickit_session`), `HttpOnly`, `SameSite=Lax`, `Secure` in
production, 8-hour fixed expiry (BR-11). CSRF: `SameSite=Lax` plus an `Origin` allow-list
check on every state-changing request (POST/PATCH/DELETE) — this check runs before the
session cookie is even parsed, so it is not part of BR-13's 401→403→400→404→409 ladder (see
BR-13's note); it applies since the client and API are different ports on the same site in
local dev and different origins in any real deployment. Forced password change: every route
except `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, and
`POST /api/auth/change-password` itself returns `403`/`PASSWORD_CHANGE_REQUIRED` for a
caller with `mustChangePassword: true` — `/me` and `/logout` must keep working regardless,
since the client needs `/me` to *learn* that flag before it can route to Change Password,
and needs `/logout` to work from that screen too. Every protected endpoint returns
`401`/`403`/`400`/`404`/`409`/`500` per BR-13.

## 9. Acceptance Criteria

**Given by the handout, §9.1:**

- **AC-01** — Given an active user with valid credentials, when they log in, the backend
  creates an authenticated session and returns the user's identity and permitted role.
- **AC-02** — Given a user who must change their default password, when they log in
  successfully, the normal application screens stay unavailable until a valid new password
  is saved.
- **AC-03** — Given an authenticated Requester, when the client supplies a different
  `requesterId`, the backend still uses the authenticated identity and never returns another
  Requester's data.
- **AC-04** — Given a Requester account, when it requests an Internal Note endpoint, the
  action is rejected without revealing the note's content.

**Added for Lab 3's full scope:**

- **AC-05** — An inactive account's login attempt returns the same `401` body as a wrong
  password (BR-01, BR-07).
- **AC-06** — Logging out invalidates the session; a request replaying the old session
  cookie afterward gets `401` (BR-10).
- **AC-07** — `GET /api/auth/me` with no session cookie returns `401`, never a "guest" body.
- **AC-08** — A password change with an incorrect current password is rejected `401`
  (a credential check, not a shape check — matches api-spec.md's
  `POST /api/auth/change-password`) and does not clear `mustChangePassword`.
- **AC-09** — A successful password change clears `mustChangePassword` and the user can
  reach the normal application on their next request.
- **AC-10** — Every Lab 2 Requester flow (create ticket, My Tickets search/filter/sort/
  page, Ticket Detail, attachment upload/inspect/soft-remove) keeps its Lab 2 *behavior*
  once identity comes from the session instead of a client-supplied `requesterId` — this is
  **not** the same as the test files staying byte-for-byte unmodified. Two categories of
  test change are required and expected, listed in full in `tests.md`'s "Required Lab 2 test
  updates" section: (1) server-side ownership-rejection assertions that currently expect
  `403` for another Requester's ticket must be updated to expect `404` (BR-14 tightens this);
  (2) client and e2e tests that currently drive the flow through `DevRequesterPicker` must
  be updated to authenticate via a logged-in session fixture instead, once Feature 3 removes
  that component. "Zero regressions" means every Lab 2 rule this covers still holds and is
  still tested — not that no test file's source changes.
- **AC-11** — A Requester viewing another Requester's ticket ID gets `404` (BR-14), not
  `403` and not the ticket's data.
- **AC-12** — A Requester can post a Public Comment on their own ticket; it appears
  immediately in both the Requester's and IT Staff's view of that ticket.
- **AC-13** — A Requester marking "Problem Appears Resolved" does not change
  `currentStatus`, and the flag is visible on the IT Staff Ticket Detail screen.
- **AC-14** — An IT Staff user's Ticket Queue request returns tickets across all
  Requesters, correctly filtered/sorted/paginated per the query parameters given.
- **AC-15** — Claiming an unassigned ticket sets `ownerId` to the caller and is reflected
  immediately in the queue's owner column.
- **AC-16** — Reassigning an already-owned ticket to another active IT Staff user succeeds
  for any IT Staff caller, not only the current owner (BR-18); an Administrator caller gets
  `403` (BR-39).
- **AC-17** — Assigning ownership to an inactive user, or to a Requester-role user, is
  rejected `400`.
- **AC-18** — Setting IT Priority updates `itPriority` without changing
  `requestedPriority`.
- **AC-19** — A status transition not present in the matrix (§7.3) is rejected `409` and
  leaves `currentStatus` unchanged.
- **AC-20a** — Every accepted status transition in the matrix succeeds for an active IT
  Staff caller and is rejected `403` for a Requester caller.
- **AC-20b** — Every status-transition attempt by an Administrator caller is rejected `403`
  — read-only means read-only (BR-39), even though Administrator can reach the ticket's
  `GET` detail.
- **AC-21** — An Internal Note created by IT Staff never appears in the Requester's view of
  the ticket, at the API level (not just hidden in the UI).
- **AC-22** — Creating a user with two roles, zero roles, or an invalid role value is
  rejected `400`.
- **AC-23** — Creating or editing a user with an email already in use (case-insensitive) is
  rejected `409`.
- **AC-24** — An Administrator attempting to deactivate their own account is rejected `409`
  and their account remains active.
- **AC-25** — Deactivating or role-changing the last active Administrator is rejected `409`;
  the system always has at least one active Administrator after any accepted request.
- **AC-26** — Resetting a user's password sets `mustChangePassword=true`; that user's next
  login is forced through the Change Password screen before reaching the app.
- **AC-27** — A non-Administrator calling any `/api/admin/*` route gets `403`.
- **AC-28a** — A Requester calling `GET /api/staff/tickets` or `GET /api/staff/tickets/:id`
  gets `403`; an Administrator calling the same two routes gets `200` (read-only, BR-39).
- **AC-28b** — A Requester *or* Administrator calling any `/api/staff/*` write route (claim,
  assign, priority, status) or `GET /api/staff/assignable-users` gets `403` — only IT Staff
  succeeds.
- **AC-29** — `POST /api/tickets/:id/mark-resolved` on a ticket whose `currentStatus` is
  `RESOLVED`, `CLOSED`, or `CANCELLED` is rejected `409` (BR-40); calling it on a ticket in
  any other status remains idempotent `200` (BR-24).
- **AC-30** — `GET /api/staff/assignable-users` returns only active `IT_STAFF` users (no
  `ADMINISTRATOR`, no `REQUESTER`), and a `REQUESTER` or `ADMINISTRATOR` caller gets `403`
  (BR-41).

## 10. Definition of Done

- [ ] `docs/lab-03/specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` merged to
      `lab3-staging` before any other Lab 3 branch's code merges (this branch — GitHub
      issue #34, branch `feature/1-lab3-engineering-contract` after the 1–8 renumbering, see
      the branch/issue mapping table below — is that gate).
- [ ] Every FR/BR/AC above is implemented and covered by at least one automated test listed
      in `tests.md`'s traceability matrix.
- [ ] `server/tests/lab-03/*` and `client/.../lab-03/*` all pass on `lab3-staging`.
- [ ] Lab 2's full existing test suite (`server/tests/lab-01`, `lab-02`;
      `client/tests/lab-01`, `lab-02`; `e2e/lab-01`, `lab-02`) still passes, **with the
      specific test-file updates documented in `tests.md`'s "Required Lab 2 test updates"
      section applied** — zero *behavior* regressions, not zero test-file diffs (see AC-10).
- [ ] Migration verified: `Ticket`/`Attachment`/`Category`/`RelatedSystem` row counts and
      every `Ticket.requesterId` match before/after, on a copy of the Lab 2 database.
- [ ] `e2e/lab-03/*` passes against a seeded local environment.
- [ ] Screenshots captured at desktop/tablet/mobile for every Lab 3 screen, stored under
      `artifacts/lab-03/screenshots/`.
- [ ] No plaintext password or real secret committed anywhere in the repository.
- [ ] `docs/lab-03/reviewer.md` and `docs/lab-03/ai-use.md` reflect the actual PRs and
      prompts used, finalized in the Release Integration issue (issue #41, branch
      `feature/8-release-integration`).
- [ ] `lab3-staging` merged to `main` only after every item above is checked.

### 10.1 Branch / issue numbering

GitHub issue numbers (assigned when the issues were filed, continuing the repo's existing
sequence) and branch names (renumbered 1–8 for readability shortly after) refer to the same
eight pieces of work:

| Issue | Branch |
|---|---|
| #34 | `feature/1-lab3-engineering-contract` (this branch) |
| #35 | `feature/2-authentication-foundation` |
| #36 | `feature/3-authorization-requester-regression` |
| #37 | `feature/4-staff-ticket-queue` |
| #38 | `feature/5-staff-ticket-detail-workflow` |
| #39 | `feature/6-admin-user-management` |
| #40 | `feature/7-e2e-visual-responsive-evidence` |
| #41 | `feature/8-release-integration` |

Earlier drafts of this document and the per-branch work-log PDFs under
`artifacts/lab-03/logs/` were written before the branch rename and still say `feature/34-*`
or `#35`–`#41` as a branch name — this table is the authoritative mapping; those artifacts
are left as-is (historical record) rather than rewritten.

## 11. Assumptions and Decisions

- **Session over JWT**: a server-side `Session` table with an opaque cookie token, not a
  JWT, so logout and account suspension take effect immediately rather than waiting out a
  token's expiry (there is no revocation list to maintain otherwise).
- **8-hour fixed session expiry**: simple to reason about and test; sliding expiration was
  considered and rejected as unnecessary complexity for a lab-scope app.
- **bcrypt, cost 12**: widely available, no native build issues in this environment,
  sufficient for a local-lab threat model; argon2id was considered but adds a dependency
  with no meaningful benefit at this scope.
- **`404` over `403` for a Requester's out-of-scope ticket** (BR-14): tightens Lab 2's
  existing `403`-based ownership check so a Requester can't even confirm another
  Requester's ticket ID exists. IT Staff/Administrator, who are allowed to see any ticket,
  keep a plain `404` for truly missing tickets — they never see a `403` for a ticket that
  exists, since nothing is out of their scope.
- **Administrator has read-only ticket access in Lab 3, not zero access** (see §3.3, §3.4):
  an earlier draft of this document said Administrator has *no* ticket access at all, which
  directly contradicted the handout's own given rule BR-04 ("Internal Notes visible to IT
  Staff and Administrator") — fixed during review. The chosen resolution is the minimal one
  that satisfies BR-04: `GET`-only on the queue, ticket detail, comments, and notes; every
  write action stays IT Staff-only, and keeping the two roles' *write* responsibilities
  separate (IT Staff runs tickets, Administrator runs accounts) still avoids the "admin
  override" scope creep the handout never asks for.
- **Any IT Staff may transition or reassign any ticket** (not just the current owner, and
  not Administrator at all): matches the handout's "shared queue" framing for IT Staff;
  restricting transitions to the owner alone would block coverage when someone is out, which
  nothing in the handout asks for. Administrator was considered for write access too (the
  handout's "unless the approved matrix explicitly permits" caveat) but rejected in favor of
  read-only, since nothing in the handout asks for an admin override of IT Staff's queue.
- **A dedicated `GET /api/staff/assignable-users` endpoint, not `GET /api/admin/users`**:
  IT Staff needs a list of who it can assign a ticket to, but reusing the Administrator-only
  user-management endpoint would mean either exposing it to a second role (scope creep on an
  endpoint meant for account management) or IT Staff fetching Requester accounts it has no
  use for. A narrow, purpose-built endpoint (active `IT_STAFF` users only) is simpler to
  reason about and matches the "IT Staff runs tickets, Administrator runs accounts"
  separation above.
- **`GET /api/categories` and `GET /api/related-systems` require a session (any role),
  Lab 2 left them open**: Lab 3's model is "authenticated by default," so these two lookup
  lists move behind `requireAuth` alongside everything else rather than being a special
  carve-out; they carry no ownership or role restriction beyond that, since their content
  (category/system names) isn't sensitive or role-specific.
- **The Origin allow-list check runs before BR-13's ladder, not as its first rung**: an
  earlier draft's api-spec.md wording ("403 before any other check") read as contradicting
  BR-13's stated 401-before-403 order. They don't actually conflict — CSRF/Origin validation
  happens at the transport/middleware level, before a session cookie is even looked up, so a
  request that fails it never reaches the point where "is there a session" (401) would be
  evaluated. BR-13 and api-spec.md's Authentication section were both reworded to state this
  relationship explicitly instead of leaving it implicit.
- **Reopened ticket keeps its `requesterMarkedResolvedAt` timestamp**: it's a historical
  fact ("the Requester once said this looked fixed"), not a live flag to clear — IT Staff
  can see it and judge the reopen in context.
- **Explicit numbering restart**: FR/BR/AC IDs in this document start at 01, scoped to Lab 3
  (matching Lab 2's own specification.md, which also started its own BR/AC numbering at 01
  rather than continuing from Lab 1).
