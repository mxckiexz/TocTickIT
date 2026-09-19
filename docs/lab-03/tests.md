# Lab 3 — Test Plan and Traceability

Extends `docs/lab-02/tests.md`. This document is written before implementation (Test DD),
per the handout's requirement that the test plan not be reconstructed after the fact. It
covers unit, API/integration, UI component, UI style, responsive, security/authorization,
migration/regression, and end-to-end coverage, per handout §10.

**Status of this document**: written on branch `feature/34-lab3-engineering-contract`
(issue #34), which is **specification only — no Lab 3 implementation code exists yet**.
Every row's **Final** column below is therefore `Planned`, not `Pass` — marking anything
`Pass` before the code and test file exist would be a false record. Each subsequent branch
(#35–#40) is responsible for turning its rows to `Pass` as it lands, and Release Integration
(#41) re-verifies the whole table and Lab 2's existing suite together before merging
`lab3-staging` → `main`. §9 below documents what *has* been actually run on this branch: a
regression check that Lab 2's own suite is untouched.

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
| UNIT-01 | BR-06 | Password hashing helper produces a bcrypt hash, never the plaintext | Hash verifies against the original password; hash ≠ plaintext | `server/tests/lab-03/auth.api.test.ts` (helper import) | Planned |
| UNIT-02 | BR-08 | New-password validator | Rejects < 8 chars; rejects value equal to current password; accepts a valid distinct password | `server/tests/lab-03/auth.api.test.ts` | Planned |
| UNIT-03 | BR-22, §7.3 matrix | Status transition lookup, given (from, to) | Returns allowed for every ✅ cell, rejected for every other cell, including self-transitions | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| UNIT-04 | BR-34 | Email-uniqueness comparison | Two emails differing only by case are treated as equal | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| UNIT-05 | BR-25, BR-26 | Comment/note body validator | Rejects empty/whitespace-only; rejects > 2000 chars; accepts a valid body | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |

## 2. API / integration tests

### 2.1 Authentication (`server/tests/lab-03/auth.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-01 | AC-01 | `POST /api/auth/login` with valid credentials | `200`, session cookie set, body has `id`/`name`/`email`/`role`/`mustChangePassword` | Planned |
| API-02 | AC-05, BR-01, BR-07 | Login with unknown email, wrong password, and inactive-but-correct-password account | All three return identical `401` + identical body | Planned |
| API-03 | — | Login with missing email/password | `400` with per-field errors | Planned |
| API-04 | AC-06, BR-10 | Logout, then replay old cookie on a protected route | Logout `200`; replayed request `401` | Planned |
| API-05 | AC-07 | `GET /api/auth/me` with no cookie | `401`, no user data | Planned |
| API-06 | BR-12 | `GET /api/auth/me` with a valid session | `200` with current identity, never an empty/guest body | Planned |
| API-07 | AC-08 | `POST /api/auth/change-password` with wrong current password | `401`; `mustChangePassword` unchanged | Planned |
| API-08 | AC-09, BR-09 | Successful password change | `200`, `mustChangePassword: false`; next request no longer blocked | Planned |
| API-09 | BR-08 | Change password to a value equal to current, and to a 7-char value | Both `400` | Planned |
| API-10 | — | Any authenticated route called with `mustChangePassword: true` (other than change-password itself) | `403` with `code: "PASSWORD_CHANGE_REQUIRED"` | Planned |
| API-11 | BR-11 | Session older than 8 hours (test clock manipulation) | Treated as `401`, not a distinct "expired" error | Planned |

### 2.2 Authorization / cross-role (`server/tests/lab-03/authorization.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| SEC-01 | AC-27 | Every `/api/admin/*` route called by Requester and IT Staff sessions | All `403` | Planned |
| SEC-02 | AC-28 | Every `/api/staff/*` route called by a Requester session | All `403` | Planned |
| SEC-03 | AC-03, BR-03 | `POST /api/tickets` / `GET /api/tickets` with a spoofed `requesterId` in body/query | Session identity used; spoofed value has no effect | Planned |
| SEC-04 | AC-11, BR-14 | Requester A requests Requester B's ticket id (detail, attachments, comments) | `404` on every route, never `403` or the data | Planned |
| SEC-05 | AC-04, AC-21 | Requester calls `GET`/`POST /api/tickets/:id/notes` on their own ticket | `403`, no note content in the response body | Planned |
| SEC-06 | BR-16 | A session for a user deactivated mid-session makes a request | `401` on the very next request after deactivation | Planned |
| SEC-07 | — | Missing/mismatched `Origin` header on a `POST`/`PATCH`/`DELETE` | `403` before any other check runs | Planned |

### 2.3 Requester ticket/attachment regression (`server/tests/lab-02/*` re-run) + carryover shape

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-12 | AC-10 | Full Lab 2 suite (`create-ticket`, `my-tickets`, `ticket-detail`, `attachments`, `inspect-attachments`, `remove-attachment` API tests) re-run unmodified against session auth | All existing Lab 2 assertions still pass | Planned (see §9 for current, pre-Lab-3-code baseline) |
| API-13 | FR-08 | `POST /api/tickets` with a `requesterId` field present in the body | Value ignored; ticket created under the session's own identity | Planned |
| API-14 | §7.2 | `POST /api/tickets` response shape | Includes `ownerId: null`, `itPriority` equal to `requestedPriority`, `currentStatus: "NEW"` | Planned |

### 2.4 Comments, notes, mark-resolved (`server/tests/lab-03/comments-notes.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-15 | AC-12, BR-27 | Requester posts a Public Comment on their own ticket | `201`, `authorId`/`createdAt` server-set, comment visible via staff detail too | Planned |
| API-16 | BR-25 | Post comment/note with empty/whitespace body | `400` | Planned |
| API-17 | BR-26 | Post comment/note with a 2001-character body | `400` | Planned |
| API-18 | BR-28 | No edit/delete route exists for comments or notes | Route returns `404`/method not allowed (there is no handler) | Planned |
| API-19 | AC-13, BR-05, BR-24 | Requester calls `POST /api/tickets/:id/mark-resolved` | `200`; `requesterMarkedResolvedAt/ById` set; `currentStatus` unchanged | Planned |
| API-20 | BR-24 | Call `mark-resolved` twice | Second call `200`, overwrites timestamp (idempotent, not an error) | Planned |
| API-21 | AC-04, BR-29 | Requester posts/reads `/notes` on their own ticket | `403` both directions | Planned |

### 2.5 IT Staff Ticket Queue (`server/tests/lab-03/staff-queue.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-22 | AC-14 | `GET /api/staff/tickets` with no filters, as IT Staff | `200`, tickets from multiple Requesters returned | Planned |
| API-23 | AC-14 | Search, category/relatedSystem/itPriority/status/owner filters, each independently | Each filters correctly; combining two narrows further | Planned |
| API-24 | — | `ownerId=0` filter | Returns only unassigned tickets | Planned |
| API-25 | — | Sort by each of `createdAt`/`updatedAt`/`itPriority`/`currentStatus`, both directions | Order matches; ties broken by `id desc` (same pattern as Lab 2) | Planned |
| API-26 | — | Pagination: `page`/`pageSize`, `pageSize` over max (50) | `400` for over-max; correct slicing otherwise | Planned |
| API-27 | — | Invalid `currentStatus`/`itPriority` query value | `400`, not silently ignored | Planned |

### 2.6 IT Staff Ticket Detail / ownership / priority / status (`server/tests/lab-03/staff-ticket-detail.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-28 | AC-15, BR-18 | `POST /api/staff/tickets/:id/claim` on an unassigned ticket | `200`, `ownerId` = caller | Planned |
| API-29 | — | `claim` on an already-assigned ticket | `409` | Planned |
| API-30 | AC-16, BR-18 | `POST .../assign` by a staff member who is not the current owner | `200` — succeeds; not restricted to the current owner | Planned |
| API-31 | AC-17 | `assign` to a Requester-role id, an inactive user id, and a nonexistent id | All `400` | Planned |
| API-32 | AC-18, BR-20 | `PATCH .../priority` | `200`; `itPriority` changes; `requestedPriority` unchanged | Planned |
| API-33 | — | `PATCH .../priority` with an invalid value | `400` | Planned |
| API-34 | AC-20 | Every ✅ transition in the §7.3 matrix, called as IT Staff | All `200`, `currentStatus` updated | Planned |
| API-35 | AC-19, BR-22 | Every non-✅ cell in the matrix (sampled: same-state, and at least one illegal jump per row) | All `409`, `currentStatus` unchanged | Planned |
| API-36 | AC-20 | A legal-per-matrix transition, called as Requester | `403` | Planned |
| API-37 | — | `GET /api/staff/tickets/:id` response shape | Includes `ticket`, `attachments`, `comments`, `notes` in one payload | Planned |
| API-38 | — | `GET /api/staff/tickets/:id` for a nonexistent id | `404` | Planned |

### 2.7 Administrator User Management (`server/tests/lab-03/users-admin.api.test.ts`)

| Test ID | AC/BR | What it tests | Expected result | Final |
|---|---|---|---|---|
| API-39 | — | `GET /api/admin/users` with `search` and `role` filters | Correct filtering; `passwordHash` never present in any row | Planned |
| API-40 | AC-22, BR-32 | Create user with 0 roles, 2 roles, and an invalid role string | All `400` | Planned |
| API-41 | — | Create user, valid input | `201`, `mustChangePassword: true` regardless of `isActive` given | Planned |
| API-42 | AC-23, BR-34 | Create/edit with an email already in use, differing only by case | Both `409` | Planned |
| API-43 | AC-24, BR-36 | Administrator sets `isActive: false` on their own id | `409`, account remains active | Planned |
| API-44 | AC-25, BR-37 | Deactivate, and separately role-change away from Administrator, the last active Administrator | Both `409`; at least one active Administrator always remains | Planned |
| API-45 | — | Deactivate/role-change an Administrator when ≥ 2 active Administrators exist | `200`, succeeds | Planned |
| API-46 | AC-26, BR-35 | `POST .../reset-password` | `200`, `mustChangePassword: true`; user's next login is forced to Change Password (cross-checked with API-10) | Planned |
| API-47 | — | `PATCH /api/admin/users/:id` attempting to include a password field | Field ignored (no route accepts it) — password only changes via reset-password | Planned |
| API-48 | — | `PATCH`/`reset-password` on a nonexistent `:id` | `404` | Planned |

## 3. UI component tests

| Test ID | Screen | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| UI-01 | Login | Empty-field validation, loading state, `401` message rendering | Matches `ui-spec.md` §2's states table | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-02 | Login | Successful login redirects onward | Navigates to app shell or Change Password per `mustChangePassword` | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-03 | Change Password | Validation (short, mismatch, same-as-current), wrong-current-password message | Matches `ui-spec.md` §4 | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-04 | App Shell | Nav renders only the current role's destinations (3 cases: each role) | Matches `ui-spec.md` §3 table | `client/tests/App.test.tsx` (extends Lab 1/2's existing App test file) | Planned |
| UI-05 | Requester Ticket Detail | Public Comments: empty/loaded/posting/validation/error states | Matches `ui-spec.md` §5.1 | `client/tests/lab-03/TicketDetail.test.tsx` | Planned |
| UI-06 | Requester Ticket Detail | "Problem Appears Resolved": available/confirming/saving/success | Matches `ui-spec.md` §5.2; status badge unaffected | `client/tests/lab-03/TicketDetail.test.tsx` | Planned |
| UI-07 | Staff Ticket Queue | Loading/empty/no-results/forbidden/error states; search+filter+sort inputs fire the right query params | Matches `ui-spec.md` §6 | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-08 | Staff Ticket Detail | Claim/reassign control, IT Priority selector next to read-only Requested Priority, status `<select>` limited to legal next states | Matches `ui-spec.md` §7 | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-09 | Staff Ticket Detail | Internal Notes panel visually distinct from Public Comments (asserts distinct class/label, not just presence) | Matches `ui-spec.md` §7's "Internal — IT Staff only" label | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-10 | User Management | List loading/empty/no-results; search + role filter | Matches `ui-spec.md` §8 | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-11 | User Management | Create form validation, including duplicate-email `409` surfaced under Email field | Matches `ui-spec.md` §8 states table | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-12 | User Management | Edit form: self-suspend guard message, last-admin guard message, both rendered at the correct control | Matches `ui-spec.md` §8 states table | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-13 | User Management | Reset-password action success message | Matches `ui-spec.md` §8 | `client/tests/lab-03/UserManagement.test.tsx` | Planned |

## 4. UI style conformance

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| STY-01 | Role/priority/status badges use only the tokens/classes in `ui-spec.md` §1 | No inline hex colors outside `theme.css`; badge classes match the mapping table | Planned |
| STY-02 | Editable vs. read-only field styling on Staff Ticket Detail (IT Priority vs. Requested Priority) | Read-only field carries `--zg-readonly-bg` styling, editable does not | Planned |

## 5. Responsive tests

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| RSP-01 | Staff Ticket Queue at 1280px/768px/375px | Full table → reduced-column table → stacked cards, per `ui-spec.md` §6; no horizontal overflow | Planned |
| RSP-02 | User Management at the same three widths | Table → card layout per `ui-spec.md` §8; Create/Edit forms remain usable single-column throughout | Planned |

## 6. Accessibility tests

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| A11Y-01 | Login, Change Password, and every Forbidden panel are operable by keyboard alone (tab order reaches every control; submit works via Enter) | Passes; matches `ui-spec.md` §9 | Planned |
| A11Y-02 | Focus-visible ring present on every new interactive control (badges excluded, they're not interactive) at default browser zoom | Matches the existing secondary-green focus token, never removed | Planned |

## 7. Migration tests

Run against a copy of the Lab 2 database seeded with Lab 2's fixtures, not the live dev DB.

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| MIG-01 | Row counts before/after migration | `Ticket`, `Attachment`, `Category`, `RelatedSystem` counts identical (§7.4 step 5) | Planned |
| MIG-02 | Every `Requester` row has a matching `User` row | Same `id`, `name`, `email`, `isActive`; `role: REQUESTER`; `mustChangePassword: true` | Planned |
| MIG-03 | Every pre-migration `Ticket.requesterId` still resolves to the same person post-migration | FK now points at `User`, value unchanged, no ticket re-owned | Planned |
| MIG-04 | Every pre-migration `Ticket.currentStatus` (`"New"`) becomes `TicketStatus.NEW`; `itPriority` equals `requestedPriority` for every migrated row | Backfill correct for 100% of existing rows | Planned |

## 8. Regression tests

| Test ID | What it tests | Expected result | Final |
|---|---|---|---|
| REG-01 | Full Lab 1 + Lab 2 automated suite (`server/tests/lab-01`, `lab-02`; `client/tests/lab-01`, `lab-02`) | 100% still passing after Lab 3's schema/route changes | See §9 — baseline confirmed on this branch; re-confirmed after each Lab 3 branch merges |

## 9. E2E tests

| Test ID | AC | What it tests | Expected result | File | Final |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-05 | Valid login → app shell; invalid login → error message; inactive account → same error message | Matches `auth.api.test.ts` behavior end-to-end | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-02 | AC-02 | Log in with a default/forced password → Change Password screen → save new password → normal app shell appears | Matches the handout's own example row (§9.1) | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-03 | AC-06 | Logout → attempt to navigate back to an authenticated page directly | Redirected to Login, not the cached page | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-04 | AC-14–AC-20 | IT Staff: search the queue → open a ticket → claim it → set IT Priority → transition status → post a Public Comment → add an Internal Note | Each step's UI state matches `ui-spec.md` §6/§7; Internal Note never shown to a Requester session opened in a second browser context | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-05 | AC-12, AC-13 | Requester: open own ticket → post Public Comment → mark "Problem Appears Resolved" | Comment appears; status badge unchanged; confirmation note shown | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-06 | AC-22–AC-26 | Administrator: create user → search/filter finds them → edit role/status → reset password → attempt self-suspend (blocked) → attempt to demote the last Administrator (blocked) | Each step's message matches `ui-spec.md` §8 | `e2e/lab-03/user-administration.spec.ts` | Planned |

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
| AC-20 | API-34, API-36 |
| AC-21 | SEC-05 |
| AC-22 | API-40 |
| AC-23 | API-42 |
| AC-24 | API-43, E2E-06 |
| AC-25 | API-44, E2E-06 |
| AC-26 | API-46 |
| AC-27 | SEC-01 |
| AC-28 | SEC-02 |

## 11. Business Rule → Test traceability (selected — full BR list in `specification.md` §5)

| BR | Covered by |
|---|---|
| BR-01, BR-07 | API-02 |
| BR-03 | SEC-03 |
| BR-06 | UNIT-01 |
| BR-08 | UNIT-02, API-09 |
| BR-09 | API-08 |
| BR-10 | API-04 |
| BR-11 | API-11 |
| BR-14 | SEC-04 |
| BR-16 | SEC-06 |
| BR-18 | API-28, API-29, API-30 |
| BR-20 | API-32 |
| BR-22 | UNIT-03, API-35 |
| BR-24 | API-19, API-20 |
| BR-25, BR-26 | UNIT-05, API-16, API-17 |
| BR-28 | API-18 |
| BR-29 | SEC-05, API-21 |
| BR-32 | API-40 |
| BR-34 | UNIT-04, API-42 |
| BR-35 | API-46 |
| BR-36 | API-43 |
| BR-37 | API-44 |

## 12. What has actually been run on this branch (#34)

This branch adds documentation only — no application code changed. The evidence below is
what was actually executed, not projected:

- Lab 2's existing automated test suites (`server` and `client`) were re-run unmodified on
  this branch to confirm the documentation-only change caused zero regressions. Output is
  captured in the branch's evidence log (`artifacts/lab-03/logs/`), not fabricated here.
- A traceability self-check confirmed every `AC-xx` in `specification.md` §9 has at least
  one row in §10 above, and every file path in this document matches the minimum required
  structure in the handout's §12.
- No `UNIT/API/UI/STY/RSP/A11Y/SEC/MIG/E2E` test file listed above exists in the repository
  yet — they are created, and turned `Pass`, by branches #35–#41 as each feature lands.

## 13. Known gaps to close before Release Integration (#41)

- BR-19 (Requested Priority immutability after creation) and BR-30/BR-31 (migration
  non-impact on Category/RelatedSystem) have no dedicated test ID yet above; add one when
  #35 (Authentication Foundation, which owns the migration) lands.
- `SEC-04`'s exact list of "every route" to sweep should be finalized as a literal list once
  the route file exists, so the test can assert exhaustively rather than by sampling.
