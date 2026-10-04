# Lab 3 — Test Plan and Traceability

Extends `docs/lab-02/tests.md`. This document is written before implementation (Test DD),
per the handout's requirement that the test plan not be reconstructed after the fact. It
covers unit, API/integration, UI component, UI style, responsive, security/authorization,
migration/regression, and end-to-end coverage, per handout §10.

**Status of this document**: written first, on `feature/1-lab3-engineering-contract` (issue
#34; see `specification.md` §10.1 for the branch/issue mapping) before any implementation,
as the handout requires of a Test DD. Every row started as `Planned`; each feature branch
(issues #35–#40) made its rows real, and Release Integration (issue #41) re-verified the
whole table and brought the **Final** column up to date in one pass. A `Pass` below means a
named test exists in the repository and passed in the release run recorded in §12. Rows that
are only partly covered say `Partial` or `N/A` and state exactly what is missing — they are
not rounded up. §2.9 lists the Lab 2 test changes Lab 3 required (not "unmodified" — see AC-10).

**Test ID scheme** (new for Lab 3 — Lab 2 used `B#`/`F#`/`E2E-##`; Lab 3 splits by the
handout's required coverage categories for clearer traceability at this larger scope):

| Prefix | Category | Tooling |
|---|---|---|
| `UNIT-xx` | Pure-function unit tests | Vitest |
| `API-xx` | Backend API/integration tests | Vitest + Supertest |
| `UI-xx` | Frontend component tests | Vitest + React Testing Library |
| `STY-xx` | UI style/token conformance | RTL (computed class/style assertions) |
| `RSP-xx` | Responsive layout | Playwright, viewport-driven |
| `A11Y-xx` | Accessibility | RTL + `jest-axe`-style assertions |
| `SEC-xx` | Security/authorization (cross-role, cross-ownership) | Vitest + Supertest |
| `MIG-xx` | Migration correctness | Vitest, run against a migrated DB copy |
| `REG-xx` | Regression (Lab 1/2 suite still green) | Existing tooling, re-run |
| `E2E-xx` | End-to-end flows | Playwright |

**File-name note**: the handout's own example row (§9.1) cites `notes.api.test.ts` and
`first-login.spec.ts`, while its required minimum repository structure (§12) lists
`comments-notes.api.test.ts` and `authentication.spec.ts` with no separate first-login
file. This document follows §12 (the structure explicitly marked "minimum required") as
authoritative; the example IDs (API-08, E2E-02) are kept but point at the §12 file names.
Client test file names are normalized without spaces (`ChangePassword.test.tsx`,
`UserManagement.test.tsx`) — file systems and imports don't tolerate spaces reliably; the
handout's structure block is treated as illustrative naming, not a literal path.

## 1. Unit tests

| Test ID | Requirement | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| UNIT-01 | BR-06 | Password hashing helper produces a bcrypt hash, never the plaintext | Hash verifies against the original password; hash ≠ plaintext | `server/tests/lab-03/auth.api.test.ts` (helper import) | Pass |
| UNIT-02 | BR-08 | New-password validator | Rejects < 8 chars; rejects value equal to current password; accepts a valid distinct password | `server/tests/lab-03/auth.api.test.ts` | Pass |
| UNIT-03 | BR-22, §7.3 matrix | Status transition lookup, given (from, to) | Returns allowed for every ✅ cell, rejected for every other cell, including self-transitions | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass (Feature 5, issue #38) — as `isLegalStatusTransition()` in `server/src/ticketStatus.ts`, imported directly by the test (no HTTP), same pattern as `auth.ts`'s `hashPassword`/`validateNewPassword` |
| UNIT-04 | BR-34 | Email-uniqueness comparison | Two emails differing only by case are treated as equal | `server/tests/lab-03/users-admin.api.test.ts` (API-42 and the email race tests) | N/A as a standalone unit — there is no email-comparison helper. Case-insensitive uniqueness is enforced by the `User_email_lower_key` expression index on `LOWER(email)` (migration `20261002080000_lab3_admin_email_case_insensitive_unique`), so the comparison happens in the database, not in code. It is exercised through the real index by API-42 and by the concurrent create/edit race tests in `users-admin.api.test.ts` |
| UNIT-05 | BR-25, BR-26 | Comment/note body validator | Rejects empty/whitespace-only; rejects > 2000 chars; accepts a valid body | `server/tests/lab-03/comments-notes.api.test.ts` | Pass — `validateCommentBody()` is now an exported helper in `server/src/app.ts`, tested directly (empty/whitespace/non-string, 2001 rejected, 2000 accepted, trimming, length measured after trim) in addition to the inline `POST` assertions |

## 2. API / integration tests

### 2.1 Authentication (`server/tests/lab-03/auth.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-01 | AC-01 | `POST /api/auth/login` with valid credentials | `200`, session cookie set, body has `id`/`name`/`email`/`role`/`mustChangePassword` | Pass |
| API-02 | AC-05, BR-01, BR-07 | Login with unknown email, wrong password, and inactive-but-correct-password account | All three return identical `401` + identical body | Pass |
| API-03 | — | Login with missing email/password | `400` with per-field errors | Pass |
| API-04 | AC-06, BR-10 | Logout, then replay old cookie on a protected route | Logout `200`; replayed request `401` | Pass |
| API-05 | AC-07 | `GET /api/auth/me` with no cookie | `401`, no user data | Pass |
| API-06 | BR-12 | `GET /api/auth/me` with a valid session | `200` with current identity, never an empty/guest body | Pass |
| API-07 | AC-08 | `POST /api/auth/change-password` with wrong current password | `401`; `mustChangePassword` unchanged | Pass |
| API-08 | AC-09, BR-09 | Successful password change | `200`, `mustChangePassword: false`; next request no longer blocked | Pass |
| API-09 | BR-08 | Change password to a value equal to current, and to a 7-char value | Both `400` | Pass |
| API-10 | — | Any authenticated route called with `mustChangePassword: true` (other than change-password itself) | `403` with `code: "PASSWORD_CHANGE_REQUIRED"` | Pass |
| API-11 | BR-11 | Session older than 8 hours (test clock manipulation) | Treated as `401`, not a distinct "expired" error | Pass |

### 2.2 Authorization / cross-role (`server/tests/lab-03/authorization.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| SEC-01 | AC-27 | Every `/api/admin/*` route called by Requester and IT Staff sessions | All `403` | Pass — `authorization.api.test.ts` sweeps every `/api/admin/*` route as Requester and IT Staff |
| SEC-02 | AC-28a, AC-28b | Every `/api/staff/*` route called by a Requester session | All `403` (Administrator's split read/write behavior on this same route set is covered separately by API-54/API-55, since it isn't a flat "all 403") | Pass — `authorization.api.test.ts` sweeps all `/api/staff/*` routes (queue, detail, claim, assign, priority, status, assignable-users) as Requester; the 25-route role × route matrix is generated from one table |
| SEC-03 | AC-03, BR-03 | `POST /api/tickets` / `GET /api/tickets` with a spoofed `requesterId` in body/query | Session identity used; spoofed value has no effect | Pass — `authorization.api.test.ts` (spoofed `requesterId`, body and query) plus the Lab 2 tests `create-ticket.api.test.ts` ("ignores a requesterId in the body") and `my-tickets.api.test.ts` |
| SEC-04 | AC-11, BR-14 | Requester A requests Requester B's ticket id (detail, attachments, comments) | `404` on every route, never `403` or the data | Pass — `authorization.api.test.ts` (cross-requester `404` across detail/attachments/comments) plus one "returns 404 (not 403)" test per route in the Lab 2 files and `comments-notes.api.test.ts` |
| SEC-05 | AC-04, AC-21 | Requester calls `GET`/`POST /api/tickets/:id/notes` on their own ticket | `403`, no note content in the response body | Pass — `authorization.api.test.ts` and `comments-notes.api.test.ts` (API-21): `403`, and the response body is checked to contain no note text |
| SEC-06 | BR-16 | A session for a user deactivated mid-session makes a request | `401` on the very next request after deactivation | Pass — `authorization.api.test.ts`: a session is created, the user is deactivated through the database, and the very next request on a Lab 2 route is `401` |
| SEC-07 | — | Missing/mismatched `Origin` header on a `POST`/`PATCH`/`DELETE`, including one that would otherwise be unauthenticated too | `403` from the Origin gate, before the request ever reaches BR-13's ladder (so this is `403`, not `401`, even with no session at all) | Pass — `authorization.api.test.ts` sweeps every state-changing route with no Origin and forged origins (including anonymous callers → `403`, and a forged claim leaves the ticket unassigned); GET is unaffected. `auth.api.test.ts` and `users-admin.api.test.ts` cover the same gate on their routes |

### 2.3 Requester ticket/attachment regression (`server/tests/lab-02/*` re-run) + carryover shape

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-12 | AC-10 | Full Lab 2 suite (`create-ticket`, `my-tickets`, `ticket-detail`, `attachments`, `inspect-attachments`, `remove-attachment` API tests), with §2.9's documented updates applied, re-run against session auth | All existing Lab 2 assertions still pass (as updated) | Pass (see §12) |
| API-13 | FR-08 | `POST /api/tickets` with a `requesterId` field present in the body | Value ignored; ticket created under the session's own identity | Pass |
| API-14 | §7.2 | `POST /api/tickets` response shape | Includes `ownerId: null`, `itPriority` equal to `requestedPriority`, `currentStatus: "NEW"` | Pass |

### 2.4 Comments, notes, mark-resolved (`server/tests/lab-03/comments-notes.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-15 | AC-12, BR-27 | Requester posts a Public Comment on their own ticket | `201`, `authorId`/`createdAt` server-set, comment visible via staff detail too | Pass (staff-detail visibility confirmed via `GET .../comments` as an IT Staff session, since the combined staff ticket-detail screen itself is a later feature) |
| API-16 | BR-25 | Post comment/note with empty/whitespace body | `400` | Pass |
| API-17 | BR-26 | Post comment/note with a 2001-character body | `400` | Pass |
| API-18 | BR-28 | No edit/delete route exists for comments or notes | Route returns `404`/method not allowed (there is no handler) | Pass |
| API-19 | AC-13, BR-05, BR-24 | Requester calls `POST /api/tickets/:id/mark-resolved` | `200`; `requesterMarkedResolvedAt/ById` set; `currentStatus` unchanged | Pass |
| API-20 | BR-24 | Call `mark-resolved` twice | Second call `200`, overwrites timestamp (idempotent, not an error) | Pass |
| API-21 | AC-04, BR-29 | Requester posts/reads `/notes` on their own ticket | `403` both directions | Pass |

### 2.5 IT Staff Ticket Queue (`server/tests/lab-03/staff-queue.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-22 | AC-14 | `GET /api/staff/tickets` with no filters, as IT Staff | `200`, tickets from multiple Requesters returned | Pass (Feature 4, issue #37) |
| API-23 | AC-14 | Search, category/relatedSystem/itPriority/status/owner filters, each independently | Each filters correctly; combining two narrows further | Pass |
| API-24 | — | `ownerId=0` filter | Returns only unassigned tickets | Pass |
| API-25 | — | Sort by each of `createdAt`/`updatedAt`/`itPriority`/`currentStatus`, both directions | Order matches; ties broken by `id desc` (same pattern as Lab 2) | Pass |
| API-26 | — | Pagination: `page`/`pageSize`, `pageSize` over max (50) | `400` for over-max; correct slicing otherwise | Pass |
| API-27 | — | Invalid `currentStatus`/`itPriority` query value | `400`, not silently ignored | Pass |

### 2.6 IT Staff Ticket Detail / ownership / priority / status (`server/tests/lab-03/staff-ticket-detail.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-28 | AC-15, BR-18 | `POST /api/staff/tickets/:id/claim` on an unassigned ticket | `200`, `ownerId` = caller | Pass (Feature 5, issue #38) |
| API-29 | — | `claim` on an already-assigned ticket | `409` | Pass |
| API-30 | AC-16, BR-18 | `POST .../assign` by a staff member who is not the current owner | `200` — succeeds; not restricted to the current owner | Pass |
| API-31 | AC-17 | `assign` to a Requester-role id, an inactive user id, and a nonexistent id | All `400` | Pass — also covers an Administrator-role id, sampled in addition to the three listed here |
| API-32 | AC-18, BR-20 | `PATCH .../priority` | `200`; `itPriority` changes; `requestedPriority` unchanged | Pass |
| API-33 | — | `PATCH .../priority` with an invalid value | `400` | Pass |
| API-34 | AC-20a | Every ✅ transition in the §7.3 matrix, called as IT Staff, with `confirm: true` sent on every call (so this row isolates matrix legality from BR-42) | All `200`, `currentStatus` updated | Pass — generated from `STATUS_TRANSITIONS` itself (every ✅ cell, 21 cases), not hand-enumerated |
| API-35 | AC-19, BR-22 | Every non-✅ cell in the matrix (sampled: same-state, and at least one illegal jump per row), each with `confirm: true` already sent | All `409`, `currentStatus` unchanged | Pass |
| API-36 | AC-20a | A legal-per-matrix transition, called as Requester | `403` | Pass |
| API-37 | — | `GET /api/staff/tickets/:id` response shape | Includes `ticket`, `attachments`, `comments`, `notes` in one payload | Pass |
| API-57 | AC-31, BR-42 | A legal transition to each of `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`, called with `confirm` omitted, and again with `confirm: false` | Both `400`, `{ "errors": { "confirm": "..." } }`, `currentStatus` unchanged in every case | Pass |
| API-58 | AC-31, BR-42 | The same four legal transitions as API-57, called with `confirm: true` | All `200`, `currentStatus` updated | Pass |
| API-59 | BR-42 | A legal transition to a target **not** in the confirmation list (e.g. `NEW` → `IN_PROGRESS`), called with `confirm` omitted | `200` — confirmation is only required for the four listed targets | Pass |
| API-60 | BR-13, BR-42 | A transition that is both illegal per the matrix **and** missing required confirmation (e.g. `NEW` → `CLOSED`, no `confirm`) | `400`, not `409` — the confirmation check runs before the legality check | Pass |
| API-38 | — | `GET /api/staff/tickets/:id` for a nonexistent id | `404` | Pass |

### 2.7 Administrator User Management (`server/tests/lab-03/users-admin.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-39 | — | `GET /api/admin/users` with `search` and `role` filters | Correct filtering; `passwordHash` never present in any row | Pass |
| API-40 | AC-22, BR-32 | Create user with 0 roles, 2 roles, and an invalid role string | All `400` | Pass |
| API-41 | — | Create user, valid input | `201`, `mustChangePassword: true` regardless of `isActive` given | Pass |
| API-42 | AC-23, BR-34 | Create/edit with an email already in use, differing only by case | Both `409` | Pass |
| API-43 | AC-24, BR-36 | Administrator sets `isActive: false` on their own id | `409`, account remains active | Pass |
| API-44 | AC-25, BR-37 | Deactivate, and separately role-change away from Administrator, the last active Administrator | Both `409`; at least one active Administrator always remains | Pass |
| API-45 | — | Deactivate/role-change an Administrator when ≥ 2 active Administrators exist | `200`, succeeds | Pass |
| API-46 | AC-26, BR-35 | `POST .../reset-password` | `200`, `mustChangePassword: true`; user's next login is forced to Change Password (cross-checked with API-10) | Pass |
| API-47 | — | `PATCH /api/admin/users/:id` attempting to include a password field | Field ignored (no route accepts it) — password only changes via reset-password | Pass |
| API-48 | — | `PATCH`/`reset-password` on a nonexistent `:id` | `404` | Pass |
| API-51 | BR-38 | `DELETE /api/admin/users/:id` | No such route exists (`404`/`405` from Express's own routing, not an app-level check) — confirms there really is no delete-user endpoint, not just that the UI hides one | Pass |

### 2.8 Cross-cutting checks (added during review)

Rules that don't belong to one feature area's table above: ticket-field immutability,
ownership-independence, the Administrator read/write split, request-ordering, and seed
idempotency.

| Test ID | AC/BR | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| API-49 | BR-19 | Attempt to submit a `requestedPriority` field on any route other than `POST /api/tickets` (e.g. as part of `PATCH .../priority`, or a second `POST /api/tickets/:id`-style call — no such update route exists) | No route accepts a `requestedPriority` change after creation; the field is immutable by construction, not by a runtime check | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass (Feature 5, issue #38) — `PATCH .../priority` sent with a stray `requestedPriority` field ignores it |
| API-50 | BR-23 | An IT Staff caller who is **not** the ticket's current owner performs a status transition | `200` — succeeds, transition rights aren't owner-restricted (distinct from API-34, which doesn't specifically vary the caller's owner-vs-not relationship) | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass |
| API-52 | AC-29, BR-40 | `POST /api/tickets/:id/mark-resolved` on a ticket whose `currentStatus` is each of `RESOLVED`, `CLOSED`, `CANCELLED` | All `409`; `requesterMarkedResolvedAt` unchanged from before the call | `server/tests/lab-03/comments-notes.api.test.ts` | Pass (sampled with `CLOSED`; `RESOLVED`/`CANCELLED` share the same `RESOLVE_BLOCKED_STATUSES` check in `app.ts`, not a separate code path per status) |
| API-53 | AC-30, BR-41, FR-28 | `GET /api/staff/assignable-users` as IT Staff, as Requester, as Administrator | IT Staff: `200`, active `IT_STAFF` users only (no Administrator, no Requester, no inactive); Requester and Administrator: `403` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass — in `staff-ticket-detail.api.test.ts`, alongside the claim/assign control it populates |
| API-54 | AC-28a, BR-39 | `GET /api/staff/tickets` and `GET /api/staff/tickets/:id` as Administrator | Both `200` — read-only access works | `server/tests/lab-03/staff-queue.api.test.ts`, `staff-ticket-detail.api.test.ts` | Pass — `GET /api/staff/tickets` in `staff-queue.api.test.ts`, `GET /api/staff/tickets/:id` in `staff-ticket-detail.api.test.ts`; the role × route sweep in `authorization.api.test.ts` also asserts the Administrator is allowed (not `401`/`403`) on both |
| API-55 | AC-28b, BR-39 | `POST .../claim`, `POST .../assign`, `PATCH .../priority`, `PATCH .../status` as Administrator | All `403` — read-only means no writes | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pass — `staff-ticket-detail.api.test.ts`, one test per route, plus the `authorization.api.test.ts` sweep (Administrator `403` on every write) |
| API-56 | BR-39 | `POST /api/tickets/:id/comments` and `POST /api/tickets/:id/notes` as Administrator | Both `403` (Administrator never posts, even though it can read both) | `server/tests/lab-03/comments-notes.api.test.ts` (not a separate `authorization.api.test.ts` — see §12) | Pass |
| SEC-08 | BR-13 | A request that fails at two rungs of the ladder at once, using protected routes (login is deliberately public, so a malformed login is a plain `400` and says nothing about the ladder): no session + invalid body on `POST /api/tickets` and `POST /api/admin/users`; wrong role + invalid body; wrong role + nonexistent resource; right role + invalid body + nonexistent ticket; right role + valid status change + nonexistent ticket (which would otherwise be judged for a transition conflict) | The earlier rung always wins: `401` over `400`, `403` over `400`, `403` over `404`, `400` over `404`, `404` over `409` — proves the ladder's stated order rather than assuming it | `server/tests/lab-03/authorization.api.test.ts` | Pass |
| SEED-01 | §7.5 | Run `npm run prisma:seed` twice in a row | Second run makes no changes (same row counts, no unique-constraint errors) — confirms the seed script's `upsert` pattern is actually idempotent, not just documented as such | `server/tests/lab-03/seed.api.test.ts` | Pass — `seed.api.test.ts` runs `npx tsx prisma/seed.ts` twice and compares User/Ticket/Comment/Note/Category/RelatedSystem counts (identical); it also checks the documented account mix and the demo-ticket coverage (all 8 statuses, 3 priorities, assigned + unassigned, ≥ 4 requesters) |

### 2.9 Required Lab 2 test updates (not "unmodified" — see AC-10)

Two categories of existing Lab 2 test files need real changes once the branches that touch
their behavior land. Listed here up front, before any implementation, so the change is
planned rather than discovered:

1. **Ownership-rejection status code (Feature 3, issue #36)** — Lab 2's server tests assert
   `403` when one Requester requests another's ticket/attachment. BR-14 tightens this to
   `404`. Files affected: `server/tests/lab-02/ticket-detail.api.test.ts`,
   `attachments.api.test.ts`, `inspect-attachments.api.test.ts`,
   `remove-attachment.api.test.ts` — each has at least one "rejects a request from a
   different Requester" style assertion that must change its expected status from `403` to
   `404` (and, where it checks the error body's message, to the `404` message).
2. **`DevRequesterPicker` removal (Feature 3, issue #36)** — Lab 2's client component tests
   (`client/tests/lab-02/create-ticket-form.test.tsx`, `my-tickets.test.tsx`,
   `ticket-detail.test.tsx`) and e2e specs (`e2e/lab-02/*.spec.ts`) currently drive every
   scenario through selecting a Development Requester first. Once that component is removed,
   these must instead authenticate through a test helper that logs in as a seeded Requester
   (e.g. a shared `loginAsRequester()` fixture) before exercising the same assertions. The
   assertions themselves (what a valid/invalid ticket submission looks like, what My Tickets
   shows, etc.) are unchanged — only how the test gets to an authenticated state changes.
3. **Fixture-only rename (already done, evidence in Feature 2's branch)** — the six
   `server/tests/lab-02/*.api.test.ts` files' `beforeAll`/`afterAll` setup called
   `prisma.requester.*` directly (not through any API) to create test fixtures. That model
   no longer exists post-migration, so every occurrence was renamed to `prisma.user.*` with
   `role: "REQUESTER"` added to each `where` clause (so a fixture lookup can't accidentally
   match a seeded IT Staff/Administrator row). No assertion or expected value changed — this
   is a mechanical rename, already carried out and passing on
   `feature/2-authentication-foundation`.

None of this is optional cleanup — until (1) and (2) land, Lab 2's suite is testing Lab 2's
`403`/dev-picker behavior, not Lab 3's actual `404`/session-based behavior, even though it
still passes.

**Status: (1) and (2) landed on `feature/3-authorization-requester-regression` (issue #36)
— see §12.** Every Lab 2 server test file now authenticates through the shared
`server/tests/helpers/auth-fixtures.ts` (`createFixtureUser`/`loginAgent`) instead of a bare
`requesterId`, every cross-Requester rejection asserts `404`, and every client test/e2e spec
authenticates through a mocked/real login instead of `DevRequesterPicker` (removed, along
with `RequesterBanner.tsx`).

## 3. UI component tests

| Test ID | Screen | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| UI-01 | Login | Empty-field validation, loading state, `401` message rendering | Matches `ui-spec.md` §2's states table | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-02 | Login | Successful login redirects onward | Navigates to app shell or Change Password per `mustChangePassword` | `client/tests/lab-03/Login.test.tsx` | Pass |
| UI-03 | Change Password | Validation (short, mismatch, same-as-current), wrong-current-password message | Matches `ui-spec.md` §4 | `client/tests/lab-03/ChangePassword.test.tsx` | Pass |
| UI-04 | App Shell | Nav renders only the current role's destinations (3 cases: each role) | Matches `ui-spec.md` §3 table | `client/tests/lab-03/AppShell.test.tsx` (new — kept out of `client/tests/lab-01/App.test.tsx` so Lab 1's own test file doesn't grow Lab 3 concerns) | Pass — `AppShell.test.tsx` (9 tests): loading, logged-out → Login, `mustChangePassword` gate, navigation for each of the three roles, name + role in the header, logout, and the Requester (640px) vs staff/admin (1140px) shell widths |
| UI-05 | Requester Ticket Detail | Public Comments: empty/loaded/posting/validation/error states | Matches `ui-spec.md` §5.1 | `client/tests/lab-02/ticket-detail.test.tsx` | Pass — as a `describe("Comments", ...)` block inside `ticket-detail.test.tsx` (extended rather than a separate Lab 3 file, since it is the same component/screen) |
| UI-06 | Requester Ticket Detail | "Problem Appears Resolved": available/confirming/saving/success | Matches `ui-spec.md` §5.2; status badge unaffected | `client/tests/lab-02/ticket-detail.test.tsx` | Pass — as a `describe("Problem Appears Resolved", ...)` block in the same file as UI-05 |
| UI-07 | Staff Ticket Queue | Loading/empty/no-results/forbidden/error states; search+filter+sort inputs fire the right query params | Matches `ui-spec.md` §6 | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pass (Feature 4, issue #37) — the Owner filter is "All owners"/"Unassigned only" only (no per-staff-member picker yet; that needs Feature 5's assignable-users endpoint) |
| UI-08 | Staff Ticket Detail | Claim/reassign control, IT Priority selector next to read-only Requested Priority, status `<select>` limited to legal next states | Matches `ui-spec.md` §7 | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass (Feature 5, issue #38) |
| UI-09 | Staff Ticket Detail | Internal Notes panel visually distinct from Public Comments (asserts distinct class/label, not just presence) | Matches `ui-spec.md` §7's "Internal — IT Staff only" label | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass |
| UI-10 | User Management | List loading/empty/no-results; search + role filter | Matches `ui-spec.md` §8 | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-11 | User Management | Create form validation, including duplicate-email `409` surfaced under Email field | Matches `ui-spec.md` §8 states table | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-12 | User Management | Edit form: self-suspend guard message, last-admin guard message, both rendered at the correct control | Matches `ui-spec.md` §8 states table | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-13 | User Management | Reset-password action success message | Matches `ui-spec.md` §8 | `client/tests/lab-03/UserManagement.test.tsx` | Pass |
| UI-14 | Staff Ticket Detail | Selecting `Resolved`/`Closed`/`Reopened`/`Cancelled` opens the confirm/cancel step and sends `confirm: true` only on confirm; selecting any other target sends the request immediately, no confirm step shown; cancelling reverts the `<select>` and sends nothing | Matches `ui-spec.md` §7's status-control bullet (BR-42) | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pass (Feature 5, issue #38) |

## 4. UI style conformance

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| STY-01 | Role/priority/status badges use only the tokens/classes in `ui-spec.md` §1 | No inline hex colors outside `theme.css`; badge classes match the mapping table | Partial — `styleConformance.test.tsx` proves what is built: every badge uses an allowed semantic class (`text-bg-success|warning|danger|secondary|info`) with a text label, priority maps HIGH → danger / MEDIUM → warning / LOW → secondary, and no inline hex/rgb in any Lab 3 screen (the single colour literal is a `var(--zg-pale-green, #eef7ee)` fallback). The spec's per-role badge colour mapping was **not** built; role/status badges use plain Bootstrap semantic classes |
| STY-02 | Editable vs. read-only field styling on Staff Ticket Detail (IT Priority vs. Requested Priority) | Read-only field carries `--zg-readonly-bg` styling, editable does not | Pass — component half in `styleConformance.test.tsx` (IT Priority is an enabled `<select>`, Requested Priority a read-only badge); stylesheet half in `e2e/lab-03/style.spec.ts` against the real loaded CSS (a disabled field computes to the gray-green token, an active one to the normal surface). The stylesheet half is Playwright because Vitest stubs CSS |

## 5. Responsive tests

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| RSP-01 | Staff Ticket Queue at 1280px/768px/375px | Full table → reduced-column table → stacked cards, per `ui-spec.md` §6; no horizontal overflow | Pass |
| RSP-02 | User Management at the same three widths | Table → card layout per `ui-spec.md` §8; Create/Edit forms remain usable single-column throughout | Pass |

## 6. Accessibility tests

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| A11Y-01 | Login, Change Password, and every Forbidden panel are operable by keyboard alone (tab order reaches every control; submit works via Enter) | Passes; matches `ui-spec.md` §9 | Partial — `accessibility.spec.ts` covers Login only (Tab order Email → Password → Log in, Enter on the button and Enter in the password field both submit). Change Password and the Forbidden panels have no keyboard-only test |
| A11Y-02 | Focus-visible ring present on every new interactive control (badges excluded, they're not interactive) at default browser zoom | Matches the existing secondary-green focus token, never removed | Partial — `accessibility.spec.ts` asserts a visible focus ring (outline or box-shadow) on the three Login controls only; the other Lab 3 controls are not covered |

## 7. Migration tests

Run against a copy of the Lab 2 database seeded with Lab 2's fixtures, not the live dev DB.

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| MIG-01 | Row counts before/after migration | `Ticket`, `Attachment`, `Category`, `RelatedSystem` counts identical (§7.4 step 5) | Pass |
| MIG-02 | Every `Requester` row has a matching `User` row | Same `id`, `name`, `email`, `isActive`; `role: REQUESTER`; `mustChangePassword: true` | Pass |
| MIG-03 | Every pre-migration `Ticket.requesterId` still resolves to the same person post-migration | FK now points at `User`, value unchanged, no ticket re-owned | Pass |
| MIG-04 | Every pre-migration `Ticket.currentStatus` (`"New"`) becomes `TicketStatus.NEW`; `itPriority` equals `requestedPriority` for every migrated row | Backfill correct for 100% of existing rows | Pass (Feature 3, issue #36) — `server/tests/lab-03/migration.api.test.ts`'s "Feature 2 -> Feature 3 migration" block replays every migration through `20260927120000_lab3_authorization_requester_regression`, exactly like MIG-01–03 do for the auth migration; also confirms existing Ticket/Attachment rows are preserved without drift and the new `ownerId`/`requesterMarkedResolvedAt(ById)` columns stay `null` for pre-existing tickets |

## 8. Regression tests

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| REG-01 | Full Lab 1 + Lab 2 automated suite — `server/tests/lab-01`, `lab-02`; `client/tests/lab-01`, `lab-02`; **and** `e2e/lab-02` (Lab 1 has no e2e specs) — with §2.9's documented updates applied | 100% still passing after Lab 3's schema/route changes | Pass — release run in §12: the Lab 1/2 server and client files pass inside the full suites (server 370/370, client 117/117) and `e2e/lab-02/requester-ticket-flow.spec.ts` (the graded scenario, updated for real login) passes in the 26-test Playwright run. The two Lab 2 evidence-only scripts (`pdf-evidence.spec.ts`, `responsive-screenshots.spec.ts`) are excluded from the Playwright config (`testIgnore`) as stale — they are not part of the graded suite and their evidence was captured for Lab 2's own submission |

## 9. E2E tests

| Test ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-05 | Valid login → app shell; invalid login → error message; inactive account → same error message | Matches `auth.api.test.ts` behavior end-to-end | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-02 | AC-02 | Log in with a default/forced password → Change Password screen → save new password → normal app shell appears | Matches the handout's own example row (§9.1) | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-03 | AC-06 | Logout → attempt to navigate back to an authenticated page directly | Redirected to Login, not the cached page | `e2e/lab-03/authentication.spec.ts` | Pass |
| E2E-04 | AC-14–AC-20 | IT Staff: search the queue → open a ticket → claim it → set IT Priority → transition status → post a Public Comment → add an Internal Note | Each step's UI state matches `ui-spec.md` §6/§7; Internal Note never shown to a Requester session opened in a second browser context | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-05 | AC-12, AC-13 | Requester: open own ticket → post Public Comment → mark "Problem Appears Resolved" | Comment appears; status badge unchanged; confirmation note shown | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pass |
| E2E-06 | AC-22–AC-26 | Administrator: create user → search/filter finds them → edit role/status → reset password → attempt self-suspend (blocked) → attempt to demote the last Administrator (blocked) | Each step's message matches `ui-spec.md` §8 | `e2e/lab-03/user-administration.spec.ts` | Pass |

## 10. Acceptance Criteria → Test traceability matrix

| AC | Covered by |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-08, API-10, E2E-02 |
| AC-03 | SEC-03 |
| AC-04 | SEC-05, API-21 |
| AC-05 | API-02, E2E-01 |
| AC-06 | API-04, E2E-03 |
| AC-07 | API-05 |
| AC-08 | API-07 |
| AC-09 | API-08 |
| AC-10 | API-12 (Lab 2 suite re-run) |
| AC-11 | SEC-04 |
| AC-12 | API-15, E2E-05 |
| AC-13 | API-19, E2E-05 |
| AC-14 | API-22, API-23 |
| AC-15 | API-28 |
| AC-16 | API-30 |
| AC-17 | API-31 |
| AC-18 | API-32 |
| AC-19 | API-35 |
| AC-20a | API-34, API-36, API-50 |
| AC-20b | API-55 |
| AC-21 | SEC-05 |
| AC-22 | API-40 |
| AC-23 | API-42 |
| AC-24 | API-43, E2E-06 |
| AC-25 | API-44, E2E-06 |
| AC-26 | API-46 |
| AC-27 | SEC-01 |
| AC-28a | SEC-02, API-54 |
| AC-28b | SEC-02, API-55 |
| AC-29 | API-52 |
| AC-30 | API-53 |
| AC-31 | API-57, API-58, API-59, API-60, UI-14 |

## 11. Business Rule → Test traceability

Every BR-01–BR-41 from `specification.md` §5 maps to at least one row below.

| BR | Covered by |
|---|---|
| BR-01, BR-07 | API-02 |
| BR-02 | API-10 |
| BR-03 | SEC-03 |
| BR-04 | API-54, API-55, API-56, SEC-05 |
| BR-05 | API-19, API-20 (see also BR-24) |
| BR-06 | UNIT-01 |
| BR-08 | UNIT-02, API-09 |
| BR-09 | API-08 |
| BR-10 | API-04 |
| BR-11 | API-11 |
| BR-12 | API-06 |
| BR-13 | SEC-08 |
| BR-14 | SEC-04 |
| BR-15 | API-40 |
| BR-16 | SEC-06 |
| BR-17 | API-31 (assign rejects a non-`IT_STAFF` owner) |
| BR-18 | API-28, API-29, API-30 |
| BR-19 | API-49 |
| BR-20 | API-32 |
| BR-21 | API-14 |
| BR-22 | UNIT-03, API-35 |
| BR-23 | API-34, API-50 |
| BR-24 | API-19, API-20 |
| BR-25, BR-26 | UNIT-05, API-16, API-17 |
| BR-27 | API-15 |
| BR-28 | API-18 |
| BR-29 | SEC-05, API-21 |
| BR-30, BR-31 | MIG-02, MIG-01 |
| BR-32 | API-40 |
| BR-33 | API-47 |
| BR-34 | UNIT-04, API-42 |
| BR-35 | API-46 |
| BR-36 | API-43 |
| BR-37 | API-44 |
| BR-38 | API-51 |
| BR-39 | API-54, API-55, API-56 |
| BR-40 | API-52 |
| BR-41 | API-53 |
| BR-42 | API-57, API-58, API-59, API-60, UI-14 |

## 12. What has actually been run

**On this branch** (`feature/1-lab3-engineering-contract`, issue #34) — documentation only,
no application code changed:

- Lab 2's existing automated test suites (`server` and `client`) were re-run unmodified on
  this branch to confirm the documentation-only change caused zero regressions. Output is
  captured in the branch's evidence log (`artifacts/lab-03/logs/`), not fabricated here.
- A traceability self-check confirmed every `AC-xx` in `specification.md` §9 has at least
  one row in §10 above, and every file path in this document matches the minimum required
  structure in the handout's §12.
- No `UNIT/API/UI/STY/RSP/A11Y/SEC/MIG/E2E` test file listed above existed in the repository
  yet at that point — they are created, and turned `Pass`, by the branches for issues
  #35–#41 as each feature lands.

**On `feature/2-authentication-foundation`** (issue #35, landed after this branch was
opened for review) — for context, since it's the first branch to actually implement
anything this document describes: `UNIT-01`, `UNIT-02`, `API-01`–`API-09`, `API-11`,
`MIG-01`–`MIG-04` are genuinely `Pass` there (111/111 server + 51/51 client tests, including
the full Lab 1/2 regression suite). This document's own **Final** column is not updated
row-by-row from other branches — each branch's PR is the source of truth for what it
actually made pass; this file is updated in bulk at Release Integration (issue #41).

**On `feature/3-authorization-requester-regression`** (issue #36) — Authorization &
Requester Regression:

- Schema/migration: `Ticket.ownerId`/`itPriority`/`requesterMarkedResolvedAt(ById)`, the
  `TicketStatus` enum (replacing free-text `currentStatus`), and the `PublicComment`/
  `InternalNote` models — applied via `server/prisma/migrations/20260927120000_lab3_authorization_requester_regression/`,
  `npx prisma migrate status` confirms no drift.
- `requireRole` middleware added to `server/src/auth.ts`; every existing Lab 2 route
  (ticket create/list/detail, attachment upload/list/download/remove) now sits behind
  `requireAuth, requireRole("REQUESTER"), requirePasswordUpToDate` and reads identity from
  `req.user!.id`, never a client-supplied `requesterId` (SEC-03/API-13); the cross-Requester
  rejection is `404` everywhere (SEC-04, BR-14). The Origin/CSRF gate is now mounted
  globally, not just on `/api/auth` (SEC-07). `GET /api/categories` and
  `GET /api/related-systems` also gained `requirePasswordUpToDate` (review fix — they had
  `requireAuth` only, so a session with `mustChangePassword: true` could reach both lookup
  endpoints directly), with a `403`/`PASSWORD_CHANGE_REQUIRED` regression test on each.
- New routes: `GET/POST /api/tickets/:id/comments`, `GET/POST /api/tickets/:id/notes`,
  `POST /api/tickets/:id/mark-resolved`, with the role/ownership rules in `api-spec.md`
  ("Comments, Notes, and 'mark resolved'").
- Client: `DevRequesterPicker.tsx`/`RequesterBanner.tsx` removed; the App Shell now gates on
  a real session (`GET /api/auth/me`) with a forced Change Password screen and role-scoped
  nav; `CreateTicketForm`/`MyTickets`/`TicketDetail` no longer take a `requester` prop or
  send `requesterId` anywhere; `TicketDetail` gained the Public Comments thread and "Problem
  Appears Resolved" button (ui-spec.md §5).
- MIG-04 (review fix): `server/tests/lab-03/migration.api.test.ts` gained a "Feature 2 ->
  Feature 3 migration" block, replaying every migration through
  `20260927120000_lab3_authorization_requester_regression` the same way the existing block
  replays through the auth migration — confirms `currentStatus: "New"` backfills to
  `TicketStatus.NEW`, `itPriority` is copied exactly from `requestedPriority`, existing
  Ticket/Attachment rows are otherwise unchanged, and the new nullable ownership/resolution
  columns stay `null` for pre-existing tickets.
- Test run on this branch: **server 179/179** (`npx vitest run`, 12 files, includes
  `comments-notes.api.test.ts` and the new migration block), **client 59/59**
  (`npx vitest run`, 7 files), both `npx tsc --noEmit` and `npm run build` clean on both
  packages, and the e2e regression scenario (`e2e/lab-02/requester-ticket-flow.spec.ts`,
  updated for real login via a dedicated `e2e-requester@toktickit.test` fixture account that
  `e2e/global-setup.ts` restores before every run) passing against the real dev servers. The
  full flow (login → create ticket → My Tickets → ticket detail → post a comment → Problem
  Appears Resolved) was also manually verified in a live browser session against the running
  app.
- Not built on this branch (tracked as later features, per `api-spec.md`'s own section
  breaks): `GET/POST /api/staff/*` (IT Staff Ticket Queue/Detail), `GET/POST/PATCH
  /api/admin/*` (Administrator User Management) — the App Shell renders a placeholder panel
  for `IT_STAFF`/`ADMINISTRATOR` sessions rather than a real screen for either.

**On `feature/4-it-staff-ticket-queue`** (issue #37) — IT Staff Ticket Queue. Branched from
`feature/3-authorization-requester-regression` rather than `lab3-staging` directly: Feature
3's PR (#45) was merged into `lab3-staging` and then reverted (its merge landed before
review was complete), so `lab3-staging` doesn't currently have the session/role
infrastructure this feature depends on, even though the feature branch itself does. This
branch's diff against `lab3-staging` will include Feature 3's changes until #45 is
re-merged; that's expected, not a mistake in this branch.

- Server: `GET /api/staff/tickets` (`server/src/app.ts`) — `requireAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"), requirePasswordUpToDate`; search/category/
  relatedSystem/itPriority/currentStatus/ownerId filters, sort by
  `createdAt`/`updatedAt`/`itPriority`/`currentStatus` (`id desc` tiebreak), pagination
  (default page size 20, max 50). Response flattens `requesterName`/`ownerName` onto each
  ticket rather than nesting the joined `User` rows.
- Client: `StaffTicketQueue.tsx` (ui-spec.md §6) — search box, filter dropdowns, sortable
  column headers, desktop table (full columns) → tablet table (Category/Last Updated
  dropped at the `lg` breakpoint) → mobile stacked cards with a collapsible "Filters"
  disclosure, wired into the App Shell as the `IT_STAFF` nav destination. The Owner filter
  is "All owners"/"Unassigned only" only — a per-staff-member picker needs
  `GET /api/staff/assignable-users`, which is Feature 5's job.
- Test run: **server 204/204** (`npx vitest run`, 13 files, includes the new
  `staff-queue.api.test.ts`), **client 70/70** (`npx vitest run`, 8 files, includes the new
  `StaffTicketQueue.test.tsx`), both `npx tsc --noEmit` and `npm run build` clean on both
  packages. Manually verified in a live browser session against a real IT Staff account:
  the queue loads real (accumulated dev-DB) ticket data, filters/search/sort/pagination all
  fire the expected request, and the responsive layout was checked at desktop (1024px),
  tablet (768px), and mobile (375px) — including the mobile Filters disclosure toggling
  open/closed.
- A large amount of leftover ticket data from many past e2e/manual test runs was found to
  have accumulated, un-scoped, in the shared dev database (this route is the first one with
  no per-Requester scoping, so it's the first to surface it); this made several exact-match
  test assertions flaky until they were rewritten to scope on a `search` term unique to this
  file's own fixture tickets. Not fixed here (out of scope for this feature) — worth a
  dedicated cleanup pass before Release Integration (issue #41) if it keeps growing.

**On `feature/5-it-staff-ticket-detail-workflow`** (issue #38) — IT Staff Ticket Detail &
Workflow. Branched directly off `lab3-staging` (Features 3 and 4 were both already merged
in by this point) — a clean base, unlike Features 3/4's forced sibling-branch workaround.

- Server: `server/src/ticketStatus.ts` (new) — the §7.3 status transition matrix and its
  confirmation-required set as pure, directly-unit-testable data/functions (`UNIT-03`), the
  same pattern `auth.ts` already established for `hashPassword`/`validateNewPassword`.
  `server/src/app.ts` gains `GET /api/staff/tickets/:id` (ticket + attachments + comments +
  notes in one response, IT_STAFF/ADMINISTRATOR read), `POST .../claim`, `POST .../assign`,
  `PATCH .../priority`, `PATCH .../status` (BR-42's 400-before-409 confirmation order), and
  `GET /api/staff/assignable-users` — the last five IT_STAFF only (ADMINISTRATOR gets `403`,
  same as a Requester, BR-39/AC-20b).
- Client: `StaffTicketDetail.tsx` (new, ui-spec.md §7) — ownership control (claim/reassign,
  the latter backed by `GET /api/staff/assignable-users`), an IT Priority `<select>` beside
  the read-only Requested Priority badge, a status `<select>` populated only with the
  current status's legal next states (mirroring `ticketStatus.ts`'s matrix client-side) plus
  the current value (disabled), the same confirm/cancel step as the Requester's "Problem
  Appears Resolved" for the four confirmation-required targets, Public Comments (staff can
  post), a visually distinct Internal Notes panel ("Internal — IT Staff only" label,
  bordered/tinted), and the requester-marked-resolved note. `StaffTicketQueue.tsx`'s ticket
  rows are now clickable (desktop button, mobile card with keyboard support) and open this
  screen.
- Test run: **server 294/294** (`npx vitest run`, 15 files, includes the new
  `staff-ticket-detail.api.test.ts` — 88 tests, generated in part from `STATUS_TRANSITIONS`
  itself rather than hand-enumerated), **client 92/92** (`npx vitest run`, 10 files, includes
  the new `StaffTicketDetail.test.tsx` and the Queue's new navigation test), both
  `npx tsc --noEmit` and `npm run build` clean on both packages. Manually verified end to end
  in a live browser session as a real IT Staff account: claim, the exact legal-next-states
  list on the status `<select>` (confirmed it updates correctly after each transition),
  the confirm-required flow for both Cancel and Confirm, a non-confirm-required transition
  applying immediately, and posting an Internal Note (visually distinct panel, correct
  author/role/timestamp) all worked against the real API.
- Not built on this branch: the Administrator User Management screen (Feature 6, issue #39)
  — the App Shell still shows its placeholder for `ADMINISTRATOR` sessions.

**On `feature/6-admin-user-management` and `feature/7-e2e-visual-responsive-evidence`**
(issues #39, #40) — Administrator User Management and the end-to-end/visual evidence.
Feature 6 added `/api/admin/users` (list, create, edit, reset password), the self-suspend
and last-Administrator guards, a case-insensitive unique email index
(`20261002080000_lab3_admin_email_case_insensitive_unique`, raw-SQL index on `LOWER(email)`,
`P2002` → `409`), and a transaction-scoped advisory lock around the BR-37 check-then-update.
Review rounds on PR #50 found three real gaps, each now covered by a test that was first
confirmed to fail with the fix removed: an Origin/CSRF sweep (SEC-07), two concurrent
requests creating the same email (API-42), and two Administrators racing to remove the last
one — including the mutual-deactivation shape (API-44). Server test files now run serially
(`fileParallelism: false`) because BR-37 is a global invariant and parallel files interfered
with each other. Feature 7 added the Playwright specs (E2E-01–06, A11Y, RSP, screenshots),
a repeatable fixture (`server/scripts/e2e-fixture.ts`: one managed `[e2e]` ticket prefix, full
cleanup including attachment files) and an Administrator-isolation helper for the last-admin
scenario. Two UI defects (clipped table columns; truncated filter labels) were found only by
opening the screenshots, not by assertions, and are now guarded by tests.

**Release run on `feature/8-release-integration`** (issue #41) — recorded 2026-10-03 against
the local development database, everything run sequentially (never two suites at once, since
the server suites and Playwright share one database):

| Check | Result |
|---|---|
| Server `npx vitest run` | **370/370** passed, 17 files (~70 s) — re-run after the PR #52 review added the attachment-download route to the authorization matrix (was 366/366) |
| Client `npx vitest run` | **117/117** passed, 12 files — 7 clean runs after the one flaky run; see the flake note below |
| Playwright `npx playwright test` | **26/26** passed (~60 s), fixtures reset per run |
| `npx tsc --noEmit` + build | clean on `server` and `client` |
| `npx prisma migrate status` | 8 migrations, "Database schema is up to date" |
| Seed idempotency (SEED-01) | counts identical after two runs; 12 demo tickets, 8 comments, 3 notes |
| Screenshots | Staff Queue, Staff Ticket Detail and User Management (tablet) regenerated with the seed data present and opened one by one — all 8 statuses and 3 priorities render, no clipped columns or truncated labels |

Added during this release pass to close gaps an audit against the lab sheet found:
`authorization.api.test.ts` (SEC-01–08; a role × route matrix of 25 routes), `seed.api.test.ts`
(SEED-01), `AppShell.test.tsx` (UI-04), `styleConformance.test.tsx` and `style.spec.ts`
(STY-01/02), an exported `validateCommentBody()` with direct tests (UNIT-05), and demo tickets
in `prisma/seed.ts`. A mutation check (temporarily breaking the code to confirm the tests fail) was run on the
authorization matrix.

**Flake disclosed.** The first client run after the 70 s server suite failed 4 tests, all
`findBy*` lookups hitting Testing Library's 1 s default while the machine was under heavy load
(load average ~17). The same suite then passed 7 times in a row. `client/tests/setup.ts` now
sets `asyncUtilTimeout: 4000`; this only gives a genuinely missing element longer to appear
and does not weaken any assertion. A separate pre-existing Lab 2 server test
(`remove-attachment`) has been seen to fail intermittently because the route unlinks the file
fire-and-forget; it did not fail in the release run. It is not hidden or skipped.

## 13. Known gaps (disclosed, not fixed)

- **STY-01** — the specification's per-role badge colour mapping was not built; role and
  status badges use plain Bootstrap semantic classes. Priority colours and "no hard-coded
  colours" are tested.
- **A11Y-01 / A11Y-02** — keyboard and focus-ring tests cover the Login screen only. Change
  Password, the Forbidden panels and the staff/admin controls are not covered by an automated
  accessibility test.
- **UNIT-04** — no standalone helper exists; the case-insensitive comparison is a database
  index, tested through the API (see the row).
- The two stale Lab 2 evidence-only Playwright scripts are excluded rather than reworked.
- The intermittent Lab 2 `remove-attachment` test described in §12 is a pre-existing
  fire-and-forget file unlink, not a Lab 3 defect, and is still open.
- The e2e suite and the local seed both write to the developer's own Postgres database; there
  is no separate test database, which is why the suites must run one at a time.
