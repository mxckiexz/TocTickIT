# Lab 4 — Test Plan and Traceability

Written before any implementation (Test DD). Every acceptance criterion in
[specification.md](specification.md) §9 maps to at least one test below (§8). Every row's
**Final** column is `Planned`: nothing is marked `Pass` until the test file exists and has
run; each feature PR turns its own rows to `Pass`, and the release PR re-verifies the table.

## 1. Strategy

Pyramid, with the weight where the risk is (authorization, the resolution gate, concurrency,
numbers that must equal the database):

| Layer | Tool | What it proves | Where |
|---|---|---|---|
| Unit (pure functions) | Vitest | action-status moves, gate evaluator, validators, Bangkok window | `server/tests/lab-04/*.unit` inside the API files |
| API / integration | Vitest + Supertest, real Postgres | rules, status codes, authorization, concurrency, dashboard numbers vs raw SQL | `server/tests/lab-04/*.api.test.ts` |
| Migration | Vitest on a scratch schema | additive, nothing lost, rollback works | `server/tests/lab-04/migration.api.test.ts` |
| UI component | Vitest + Testing Library | states, errors, conflict banner, role view | `client/tests/lab-04/*.test.tsx` |
| E2E | Playwright (1 worker, fixtures reset per run) | the three flows end to end, a11y, responsive | `e2e/lab-04/*.spec.ts` |
| Regression | existing suites | Lab 1 to 3 still pass | all |

Coverage targets: 100% of rules BR-01 to BR-28, requirements FR-01 to FR-25 and criteria AC-01
to AC-47 have a test; every new
route appears in the authorization sweep (role × route, including no session and forged
Origin); every error status in `api-spec.md` is provoked at least once.

Method rules (from Lab 3, kept): write the test first and watch it fail; prove a new test can
fail by breaking the code once; concurrency rules get a test that fires two requests at once
(`Promise.all`), because a sequential test passes on racy code; server test files run serially
(shared database); fixture rows use a unique prefix and are removed afterwards; dashboard tests
compare the endpoint with raw SQL run in the same test, never with a hard-coded number (the
development database accumulates rows); to test time windows, `updatedAt` is set with raw SQL.

## 2. Unit tests

| ID | Rule | What | Expected | File | Final |
|---|---|---|---|---|---|
| UNIT-01 | BR-06 | action status move lookup | on edit: PLANNED → IN_PROGRESS / COMPLETED / CANCELLED, IN_PROGRESS → COMPLETED / CANCELLED allowed, unchanged status allowed, everything else and anything from a final status rejected; on create: PLANNED / IN_PROGRESS / COMPLETED allowed, CANCELLED rejected | `actions-taken.api.test.ts` | Planned |
| UNIT-02 | BR-12 | resolution gate evaluator `(owner, actions[]) → unmet[]` | `NO_OWNER`, `NO_COMPLETED_ACTION`, `OPEN_ACTIONS` exactly when true; empty when all pass; cancelled actions ignored | `ticket-workflow.api.test.ts` | Planned |
| UNIT-03 | BR-03, BR-04, BR-05, BR-06 | action validator | trims; 1 to 2000; follow-up rule; `actionAt` window (5 min ahead); `result` required when the status is COMPLETED | `actions-taken.api.test.ts` | Planned |
| UNIT-04 | BR-20 | start of the 7-day window in Asia/Bangkok | midnight boundary; not shifted by the server timezone | `staff-dashboard.api.test.ts` | Planned |
| UNIT-05 | BR-27 | description cut for `ActionBrief` | 120 characters then an ellipsis; shorter text unchanged; no result or follow-up text | `staff-dashboard.api.test.ts` | Planned |

## 3. API / integration tests

### 3.1 Actions Taken (`server/tests/lab-04/actions-taken.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-01 | AC-01 | IT Staff POST valid action | `201`, `performedBy` = caller, `version` 1, status PLANNED | Planned |
| API-02 | AC-02, BR-01 | Requester POST on own ticket | `403`, no row stored | Planned |
| API-03 | AC-03, BR-03 | empty, whitespace, 2001-char description | `400` with message at `description` | Planned |
| API-04 | AC-04, BR-04 | `followUpRequired` without note; with note; false with a note | `400` at `followUpNote`; `201`; note stored empty | Planned |
| API-05 | AC-05, BR-02 | body contains `performedById` | ignored, session user stored | Planned |
| API-06 | AC-06, BR-07 | `assigneeId`: inactive, Requester, missing, active staff, active admin | `400` ×3 at `assigneeId`; `201` ×2 | Planned |
| API-07 | AC-07, BR-09 | several actions with equal `actionAt`, list 5 times | identical order every time | Planned |
| API-08 | AC-08, BR-24 | Requester lists own / another's; staff; admin | `200` read-only; `404`; `200`; `200` | Planned |
| API-09 | AC-09 | PATCH with current version | `200`, fields changed, `version` +1 | Planned |
| API-10 | AC-09, BR-16 | PATCH with a stale version | `409 STALE_VERSION`, `currentVersion`, row unchanged | Planned |
| API-11 | AC-09, BR-16 | two PATCH with the same version at once | exactly one `200`, one `409` | Planned |
| API-12 | AC-10, BR-06 | edit a COMPLETED and a CANCELLED action | `409 ACTION_FINAL` | Planned |
| API-13 | BR-06, AC-41 | every action status pair on edit, generated from the move table, plus an unchanged status | allowed pairs `200`, every other `400`, unchanged `200` | Planned |
| API-14 | FR-04, AC-41 | edit to COMPLETED without `result`; with it | `400` at `result`; `200` | Planned |
| API-15 | AC-11, BR-08 | DELETE an action | no route (`404` / `405`) | Planned |
| API-16 | AC-12, BR-10 | POST on a CLOSED and on a CANCELLED ticket | `409 TICKET_CLOSED` | Planned |
| API-17 | BR-05 | `actionAt` past / default / 6 minutes ahead / not a date | `201` / now / `400` / `400` | Planned |
| API-18 | BR-14 order | no session, bad ids, missing ticket, invalid body + missing ticket | `401`, `400`, `404`, ladder holds | Planned |
| API-19 | Lab 3 SEC-07 | forged and missing Origin on POST and PATCH | `403` | Planned |
| API-46 | AC-40, BR-06, FR-05 | create with `status` omitted, PLANNED, IN_PROGRESS, COMPLETED with result, COMPLETED without result, CANCELLED, unknown value | PLANNED stored; `201` ×3; `400` at `result`; `400` at `status` ×2 | Planned |
| API-47 | AC-42, D-5 | Requester lists the actions of their own ticket | every field present and equal to what staff receive (including `followUpNote`, `attachmentNotes`, performer, assignee) | Planned |
| API-48 | BR-08 | edit an action, read it again | `ticketId`, `performedBy`, `createdAt` unchanged; `version` and `updatedAt` changed; one new revision row | Planned |
| API-60 | AC-48, BR-08 | create an action, edit it twice, list revisions | 3 revisions numbered 1 to 3 equal to `ActionTaken.version` at each step; revision 1 holds the created values, including those the edits overwrote; editor and time set | Planned |
| API-61 | AC-48 | stale edit, edit of a final action, invalid edit | each rejected; revision count unchanged | Planned |
| API-62 | AC-48, AC-11 | `POST`, `PATCH`, `DELETE` on a revision URL; Requester GET | `404` / `405`; Requester `403` | Planned |
| API-63 | AC-49, BR-08 | force a failure after the update inside the edit transaction | projection and revisions both unchanged | Planned |
| API-64 | BR-13 | two edits of different actions of one ticket, and one edit while a status change runs, 20 rounds | no deadlock, no `500`; every request is `200` or a documented `409` | Planned |
| API-49 | BR-28 | action created by staff B on a ticket owned by staff A | `201`; performer is B; owner is still A | Planned |

### 3.2 Ticket workflow (`server/tests/lab-04/ticket-workflow.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-20 | AC-13, BR-11 | every allowed matrix cell, generated from `STATUS_TRANSITIONS`, gate satisfied for RESOLVED | `200` | Planned |
| API-21 | AC-13, BR-11 | every other cell including self-transitions | `409 ILLEGAL_TRANSITION` | Planned |
| API-22 | AC-14, BR-26 | Requester calls the status route; Administrator makes a legal change | Requester `403`, status unchanged; Administrator `200`, same body shape as IT Staff | Planned |
| API-23 | AC-15, BR-12 | RESOLVED with no owner | `409 RESOLUTION_GATE`, `NO_OWNER` | Planned |
| API-24 | AC-16, BR-12 | owner, no COMPLETED action | `409`, `NO_COMPLETED_ACTION` | Planned |
| API-25 | AC-17, BR-12 | PLANNED / IN_PROGRESS action present; then completed or cancelled | `409 OPEN_ACTIONS`; then `200` | Planned |
| API-26 | AC-18, BR-13 | RESOLVED fired together with (a) "add a PLANNED action" and (b) "edit an action to IN_PROGRESS" (a PLANNED one), 20 rounds each; after every round query the database | outcome equals one of the two serial orders; no round ends with a RESOLVED ticket that holds a PLANNED or IN_PROGRESS action; the lock is proven by also running the add with the ticket lock held by the test (the add waits until the test releases it) | Planned |
| API-27 | AC-19, BR-15 | Requester marks "appears resolved" | status unchanged, gate unchanged, signal recorded | Planned |
| API-28 | AC-20, BR-17 | status with stale `version`; with none; with a non-integer | `409 STALE_VERSION`; `400` at `errors.version`; `400`; ticket unchanged each time | Planned |
| API-29 | AC-21 | successful status change | response has new status, `version`, `allowedTransitions`, `resolutionGate` | Planned |
| API-30 | AC-22, BR-17 | claim, assign, priority, mark-resolved, each with the current, a stale, and no `version` | `version` +1; `409 STALE_VERSION`; `400` at `errors.version`; nothing written in the last two |
| API-65 | BR-17, D-4 | two callers claim, assign or change priority from the same loaded `version` at once | exactly one succeeds; the other gets `409`; the first caller's value is the stored one (no lost update) |
| API-66 | D-4 | `POST` comment and note without `version` | `201`, ticket `version` unchanged | Planned |
| API-31 | FR-12, BR-26 | staff detail GET as IT Staff and Administrator | `version`, transitions, gate present; both roles receive identical `allowedTransitions` | Planned |
| API-32 | BR-14 | RESOLVED without `confirm` on a ticket that also fails the gate | `400` first, then after confirm `409` | Planned |
| API-33 | api-spec | queue with `ownerId=me`, `ownerId=unassigned`, and a bad value | only the caller's tickets; only unowned tickets; `400` | Planned |
| API-50 | AC-43, BR-26, FR-25 | Administrator claims, assigns, sets priority, changes status, posts a comment and a note, creates and edits an action | every call succeeds with the IT Staff response shape | Planned |
| API-51 | AC-43, BR-26 | the same calls as a Requester | `403` on each (comment on own ticket stays `201`) | Planned |
| API-52 | AC-44, BR-26 | assign `ownerId` of an active Administrator, an active IT Staff, an inactive staff, a Requester, a missing id | `200`, `200`, `400`, `400`, `400` | Planned |
| API-53 | AC-44 | assignable users as IT Staff, Administrator, Requester, no session | lists active IT Staff and Administrators, ordered by name, for both staff roles; `403`; `401` | Planned |
| API-54 | AC-44, BR-26 | an Administrator who claimed a ticket is its owner and passes the gate's owner rule | `NO_OWNER` absent in the gate result | Planned |

### 3.3 Dashboards

`requester-dashboard.api.test.ts`:

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-34 | AC-23, BR-19 | Requester A with tickets of A and B in the database | every number equals raw SQL over A's tickets only | Planned |
| API-35 | AC-24, BR-23 | Requester with no tickets | zeros and empty lists, no `null` | Planned |
| API-36 | AC-27, BR-22 | many recent tickets | lists hold at most 5, only brief fields, no full list | Planned |
| API-37 | AC-28 | staff, admin, no session | `403`, `403`, `401` | Planned |
| API-38 | BR-21 | recently resolved | RESOLVED tickets ordered by `updatedAt` | Planned |

`staff-dashboard.api.test.ts`:

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-39 | AC-25, BR-18 | unassigned, assigned to me, by status, by IT priority, recent | equal raw SQL over the same rows | Planned |
| API-40 | AC-26 | Administrator vs IT Staff | admin: `userCounts` equal raw SQL; staff: absent | Planned |
| API-41 | AC-27 | many tickets | recent list at most 5 | Planned |
| API-42 | BR-23 | status with no tickets | all 8 keys present, zeros kept | Planned |
| API-43 | AC-28 | Requester, no session | `403`, `401` | Planned |
| API-44 | AC-30, BR-20 | tickets updated 1 second either side of Bangkok midnight, 7 days ago | each on the correct side of the window | Planned |
| API-45 | AC-29 | each metric's drill-down query | returns exactly the counted set | Planned |
| API-55 | AC-45, BR-27 | caller has open assigned actions on open and on resolved tickets, plus actions assigned to someone else | `ticketsWithMyOpenActions` equals raw SQL (distinct open tickets only); the other user's actions are not counted | Planned |
| API-56 | AC-45, BR-27 | caller performed 7 actions, some with equal `actionAt` | `myRecentActions` has 5, newest first by `actionAt` then `id`, equal to raw SQL; only brief fields; description cut to 120 | Planned |
| API-57 | AC-46, BR-23 | caller with no assigned and no performed actions | `0` and `[]`, never `null` or missing | Planned |
| API-58 | AC-45, AC-26 | IT Staff and Administrator each | both receive `ticketsWithMyOpenActions` and `myRecentActions` computed for themselves; `userCounts` only for Administrator | Planned |
| API-59 | AC-47, FR-17 | queue with `actionAssigneeId=me`, and with a bad value | exactly the tickets counted by `ticketsWithMyOpenActions`, each once; `400` | Planned |

### 3.4 Cross-cutting security (`server/tests/lab-04/authorization.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| SEC-01 | AC-02, AC-14, AC-28, AC-43 | role × route sweep including all new routes and the Lab 3 staff routes whose role set changed (BR-26), no session, forged Origin | each role gets 403 outside its set (Administrator now inside the IT Staff set), 401 with no session, 403 on forged Origin | Planned |
| SEC-02 | AC-08, BR-24 | Requester A reaches for B's ticket's actions | `404`, never `403` or data | Planned |
| SEC-03 | BR-14 | two failures at once on the new routes | the earlier rung of the ladder wins | Planned |

## 4. Migration and seed (`server/tests/lab-04/migration.api.test.ts`, `seed.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| MIG-01 | AC-39, BR-25 | replay migrations on a scratch schema with Lab 3 data, apply the Lab 4 migration | every Lab 3 table's rows unchanged; `Ticket.version` = 1 everywhere | Planned |
| MIG-02 | BR-25 | compare `information_schema` before and after | only additions | Planned |
| MIG-03 | AC-39 | rollback on the scratch copy (documented procedure) | schema and rows equal the "before" snapshot | Planned |
| SEED-01 | DoD | run the seed twice | identical row counts, no unique violation | Planned |
| SEED-02 | spec §7.5 | seeded data | every status and priority, owner and none, 0 / 1 / many actions, a gate-passing and a gate-blocked ticket, zero and non-zero metrics | Planned |

## 5. UI component tests (`client/tests/lab-04/`)

| ID | AC / BR | What | File | Final |
|---|---|---|---|---|
| UI-01 | FR-01, AC-35 | list renders in the order given; empty, loading, error with Retry | `ActionsTaken.test.tsx` | Planned |
| UI-02 | AC-04, AC-34, AC-40 | create: required fields, follow-up note required when checked, Result required when Completed is chosen, errors under fields, values kept after an error | `ActionsTaken.test.tsx` | Planned |
| UI-03 | AC-09, AC-32 | edit sends `version`; `409` shows the conflict banner and keeps input | `ActionsTaken.test.tsx` | Planned |
| UI-23 | AC-48 | staff "History" button expands the revisions oldest first; a Requester sees no History button | `ActionsTaken.test.tsx` | Planned |
| UI-24 | AC-20, AC-22 | claim, assign, priority, status and mark-resolved calls each send the loaded `version` | `TicketWorkflow.test.tsx`, `RequesterTicketDetail.test.tsx` | Planned |
| UI-04 | AC-08 | Requester sees the list read-only, no buttons | `ActionsTaken.test.tsx` | Planned |
| UI-05 | AC-10, BR-06 | final actions have no Edit button | `ActionsTaken.test.tsx` | Planned |
| UI-06 | AC-33 | Save disabled in flight; double click sends one request | `ActionsTaken.test.tsx` | Planned |
| UI-07 | AC-13 | only `allowedTransitions` rendered as buttons | `TicketWorkflow.test.tsx` | Planned |
| UI-08 | AC-15 to AC-17 | gate unmet: Resolved disabled with each reason in text | `TicketWorkflow.test.tsx` | Planned |
| UI-09 | BR-14 | confirm step for Resolved, Closed, Reopened, Cancelled; cancel sends nothing | `TicketWorkflow.test.tsx` | Planned |
| UI-10 | AC-21, AC-32 | `409` shows the banner; success refreshes version, buttons, gate | `TicketWorkflow.test.tsx` | Planned |
| UI-11 | AC-19 | "appears resolved" button; status badge unchanged | `TicketWorkflow.test.tsx` | Planned |
| UI-12 | AC-29, FR-17 | metric cards: numbers, drill-down links with accessible names and params | `StaffDashboard.test.tsx` | Planned |
| UI-13 | AC-35 | staff dashboard zero, loading, error with Retry, forbidden | `StaffDashboard.test.tsx` | Planned |
| UI-14 | AC-26 | Administrator sees user counts, IT Staff does not | `StaffDashboard.test.tsx` | Planned |
| UI-15 | AC-24, AC-35 | Requester dashboard numbers, lists, empty state with New Ticket | `RequesterDashboard.test.tsx` | Planned |
| UI-16 | AC-31 | navigation per role (Administrator: Dashboard, Ticket Queue, User Management), `aria-current` on the active item | `AppShell.test.tsx` (Lab 3 file, extended) | Planned |
| UI-17 | AC-45, AC-47 | staff dashboard "Open actions assigned to me" card and "My recent actions" list: numbers, rows, link names and targets (`actionAssigneeId=me`, ticket detail at Actions Taken) | `StaffDashboard.test.tsx` | Planned |
| UI-18 | AC-46 | my-actions zero state: `0` with "Nothing here", "You have not recorded any actions yet."; loading and error states cover the new card | `StaffDashboard.test.tsx` | Planned |
| UI-19 | AC-43, FR-25 | Administrator ticket detail shows the same enabled controls as IT Staff (claim or reassign, priority, status buttons, comment and note forms, Actions Taken create and edit); Requester sees none | `TicketWorkflow.test.tsx`, `ActionsTaken.test.tsx` | Planned |
| UI-20 | AC-40, BR-06 | create Status select offers exactly Planned (default), In progress, Completed; choosing Completed marks Result required and blocks Save with the message | `ActionsTaken.test.tsx` | Planned |
| UI-21 | AC-41, BR-06 | edit Status select offers only the current status and the moves allowed from it; no Delete button anywhere | `ActionsTaken.test.tsx` | Planned |
| UI-22 | AC-42, D-5 | Requester view shows every field of an entry (performer, assignee, result, follow-up note, attachment notes) read-only | `ActionsTaken.test.tsx` | Planned |

## 6. Accessibility, responsive, style (Playwright, `e2e/lab-04/`)

| ID | AC | What | Expected | Final |
|---|---|---|---|---|
| A11Y-01 | AC-36 | keyboard only: add an action, change a status | completes without a mouse | Planned |
| A11Y-02 | AC-36 | focus ring on every new control | visible ring (outline or shadow) | Planned |
| A11Y-03 | AC-36, FR-22 | contrast of badges, buttons, banners on new screens, measured in the browser | at least 4.5:1 | Planned |
| A11Y-04 | AC-36 | status, priority and follow-up have text, not colour only | text present in the DOM | Planned |
| RSP-01 | AC-37 | dashboards at 375, 768, 1280 | no horizontal overflow, no overlap, select labels not truncated | Planned |
| RSP-02 | AC-37 | Ticket Detail with Actions Taken and status buttons at the three widths | same | Planned |

## 7. End-to-end (`e2e/lab-04/`)

| ID | AC | What | File | Final |
|---|---|---|---|---|
| E2E-01 | AC-01 to AC-08, AC-40 to AC-42 | staff adds actions to one ticket (one Planned, one logged as Completed with a result), edits one, sees validation messages incl. inactive assignee; Requester sees every field read-only | `actions-taken-flow.spec.ts` | Planned |
| E2E-02 | AC-15 to AC-20, AC-32 | gate blocks Resolved; finish the actions; resolve; Requester advisory leaves the status; two sessions edit, second sees the conflict banner | `ticket-resolution.spec.ts` | Planned |
| E2E-03 | AC-23 to AC-31, AC-45 to AC-47 | each role's dashboard numbers match the database, including my open actions and my recent actions; drill-down lists match; navigation per role; Requester isolation | `dashboards.spec.ts` | Planned |
| E2E-04 | AC-33, AC-34 | double click sends one request; failed submit keeps values; no console error during E2E-01 to 03 | `actions-taken-flow.spec.ts` | Planned |
| E2E-05 | AC-43, AC-44 | an Administrator claims a ticket, adds and completes an action, resolves the ticket and closes it, posts a comment and a note, all through the UI | `ticket-resolution.spec.ts` | Planned |

## 8. Regression

| ID | AC | What | Expected | Final |
|---|---|---|---|---|
| REG-01 | AC-38 | full Lab 1 to 3 server, client and Playwright suites on `lab4-staging` and again on `main` | all pass | Planned |
| REG-02 | AC-38 | the Lab 3 tests listed in §9, updated in the PR that forces the change | pass, each change recorded | Planned |

## 9. Lab 3 tests expected to change (not "unmodified")

Two things change behaviour that Lab 3 tests relied on. **The resolution gate and the status
buttons** (fixed in the PR that causes them: F4 for the API, F7 for the UI), and **the
Administrator becoming IT Staff on tickets** (BR-26, D-2, fixed in the workflow PR F4 for the API
and F7 for the UI). The reason for each is written here:

| Lab 3 test | Why it changes | Planned change |
|---|---|---|
| `staff-ticket-detail.api.test.ts` API-34, API-57 to API-60 | they reach RESOLVED on a ticket with no owner and no actions | create an owner and a COMPLETED action first (helper) |
| `staff-ticket-detail.api.test.ts` UNIT-03 generated cases | same | same helper |
| `staff-ticket-detail.api.test.ts` "rejects an Administrator session" for claim, assign, priority, status, and for `assignable-users` | Administrator is allowed now (BR-26) | assert Administrator `200` with the IT Staff response; the Requester `403` case stays |
| `staff-ticket-detail.api.test.ts` "rejects an ownerId that references an Administrator" | an active Administrator is a valid owner (BR-26) | the case moves to the "accepted" side; Requester, inactive and missing stay `400` |
| `comments-notes.api.test.ts` "rejects a caller with role ADMINISTRATOR" (comment) and "rejects an Administrator" (note) | Administrator may post both | assert `201`; Requester note stays `403` |
| `authorization.api.test.ts` role sweep rows for claim, assign, priority, status, comment POST, note POST and `assignable-users` | the `allowed` lists gain ADMINISTRATOR | update the lists, keep the sweep logic |
| every Lab 3 API test that calls claim, assign, priority, status or mark-resolved (`staff-ticket-detail.api.test.ts`, `requester-ticket-detail.api.test.ts`, `authorization.api.test.ts` role sweep, seed helpers) | `version` is now required (BR-17, D-4), so a call without it is `400` | send the ticket's current `version` through the shared helper; the role and validation assertions stay |
| `client/tests/lab-03/StaffTicketDetail.test.tsx`, `RequesterTicketDetail.test.tsx` request bodies | the client must send `version` on those writes | assert the body carries the loaded `version` |
| `e2e/lab-03/staff-ticket-flow.spec.ts`, `e2e/lab-03/requester-ticket-flow.spec.ts` | they go through the UI, which now sends `version` | no assertion change expected; rerun to confirm |
| `client/tests/lab-03/AppShell.test.tsx` "Administrator: User Management, never the queue" | Administrator navigation gains Dashboard and Ticket Queue (D-6) | assert the new navigation |
| `client/tests/lab-03/StaffTicketDetail.test.tsx` UI-08, UI-14 | status `<select>` becomes buttons | assertions move to the buttons |
| `e2e/lab-03/staff-ticket-flow.spec.ts` E2E-04 | resolves a claimed ticket with no actions; uses the status `<select>` | add a completed action; use the status buttons |
| `e2e/lab-03/user-administration.spec.ts`, `e2e/lab-03/accessibility.spec.ts` | assume the Administrator shell has one navigation item | adjust to the new navigation, keep every user-management assertion |
| `e2e/lab-03/responsive-screenshots.spec.ts` | screenshots of the changed Ticket Detail and navigation | regenerate and re-inspect |

Everything else in Lab 1 to 3 stays unmodified, and the full suites run on `lab4-staging` and
again on `main` (REG-01).

## 10. Gaps this plan closes or leaves

- Lab 3 had accessibility checks on Login only; A11Y-01 to A11Y-04 cover every new screen.
- Lab 3 had no time-window test; API-44 and UNIT-04 add one (fixed instants, raw SQL).
- Not covered: load and performance (out of scope); visual regression by pixel comparison
  (screenshots are inspected by eye, as in Lab 3).

## 11. Traceability: acceptance criteria → tests

| AC | Tests |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-02, SEC-01 |
| AC-03 | API-03, UNIT-03 |
| AC-04 | API-04, UNIT-03, UI-02 |
| AC-05 | API-05 |
| AC-06 | API-06 |
| AC-07 | API-07 |
| AC-08 | API-08, SEC-02, UI-04, E2E-01 |
| AC-09 | API-09, API-10, API-11, UI-03 |
| AC-10 | API-12, UI-05, UNIT-01 |
| AC-11 | API-15 |
| AC-12 | API-16 |
| AC-13 | API-20, API-21, UI-07, API-22 |
| AC-14 | API-22, SEC-01, UI-19 |
| AC-15 | API-23, UI-08, UNIT-02, E2E-02 |
| AC-16 | API-24, UNIT-02 |
| AC-17 | API-25, UNIT-02, E2E-02 |
| AC-18 | API-26, API-64 |
| AC-19 | API-27, UI-11, E2E-02 |
| AC-20 | API-28, API-65, UI-24, E2E-02 |
| AC-21 | API-29, UI-10 |
| AC-22 | API-30, API-65, API-66, UI-24 |
| AC-23 | API-34, E2E-03 |
| AC-24 | API-35, UI-15 |
| AC-25 | API-39 |
| AC-26 | API-40, API-58, UI-14 |
| AC-27 | API-36, API-41 |
| AC-28 | API-37, API-43, SEC-01 |
| AC-29 | API-45, UI-12, E2E-03 |
| AC-30 | API-44, UNIT-04 |
| AC-31 | UI-16, E2E-03 |
| AC-32 | UI-03, UI-10, E2E-02 |
| AC-33 | UI-06, E2E-04 |
| AC-34 | UI-02, E2E-04 |
| AC-35 | UI-01, UI-13, UI-15 |
| AC-36 | A11Y-01, A11Y-02, A11Y-03, A11Y-04 |
| AC-37 | RSP-01, RSP-02 |
| AC-38 | REG-01, REG-02 |
| AC-39 | MIG-01, MIG-02, MIG-03 |
| AC-40 | API-46, UI-02, UI-20, E2E-01 |
| AC-41 | API-13, API-14, UI-21, UNIT-01 |
| AC-42 | API-47, UI-22, E2E-01 |
| AC-43 | API-50, API-51, SEC-01, UI-19, E2E-05 |
| AC-44 | API-52, API-53, API-54, E2E-05 |
| AC-45 | API-55, API-56, API-58, UI-17, E2E-03 |
| AC-46 | API-57, UI-18, E2E-03 |
| AC-47 | API-59, UI-17, E2E-03 |
| AC-48 | API-48, API-60, API-61, API-62, UI-23 |
| AC-49 | API-63 |

## 12. Traceability: business rules → tests

| BR | Tests | BR | Tests |
|---|---|---|---|
| BR-01 | API-02 | BR-14 | API-32, UI-09 |
| BR-02 | API-05 | BR-15 | API-27 |
| BR-03 | API-03, UNIT-03 | BR-16 | API-10, API-11 |
| BR-04 | API-04 | BR-17 | API-28, API-30, API-65, API-66 |
| BR-05 | API-17, UNIT-03 | BR-18 | API-39, API-42 |
| BR-06 | API-13, API-46, UNIT-01 | BR-19 | API-34 |
| BR-07 | API-06 | BR-20 | API-44, UNIT-04 |
| BR-08 | API-15, API-48, API-60, API-61, API-62, API-63 | BR-21 | API-38 |
| BR-09 | API-07 | BR-22 | API-36, API-41 |
| BR-10 | API-16 | BR-23 | API-35, API-42 |
| BR-11 | API-20, API-21 | BR-24 | API-08, SEC-02 |
| BR-12 | API-23, API-24, API-25, UNIT-02 | BR-25 | MIG-01, MIG-02 |
| BR-13 | API-26, API-64 | BR-26 | API-50, API-51, API-52, SEC-01 |
| | | BR-27 | API-55, API-56, API-57, API-58, UNIT-05 |
| | | BR-28 | API-49 |

## 12b. Traceability: functional requirements → tests

| FR | Tests | FR | Tests |
|---|---|---|---|
| FR-01 | API-08, UI-01, UI-04 | FR-13 | API-27, UI-11 |
| FR-02 | API-01, API-05 | FR-14 | API-34, API-35, UI-15 |
| FR-03 | API-09, API-10 | FR-15 | API-39, API-55, API-56, UI-12, UI-17 |
| FR-04 | API-04, API-14, API-46, UNIT-03 | FR-16 | API-40, UI-14 |
| FR-05 | API-06, API-13, API-46, UNIT-01 | FR-17 | API-45, API-59, UI-12, UI-17 |
| FR-06 | API-15, API-60 | FR-18 | API-36, API-41 |
| FR-07 | API-07 | FR-19 | UI-16, E2E-03 |
| FR-08 | API-16 | FR-20 | UI-01, UI-13, UI-15 |
| FR-09 | API-20, API-21, API-22 | FR-21 | UI-02, UI-06, E2E-04 |
| FR-10 | API-23, API-24, API-25 | FR-22 | A11Y-01 to A11Y-04 |
| FR-11 | API-10, API-28 | FR-23 | RSP-01, RSP-02 |
| FR-12 | API-29, API-31 | FR-24 | REG-01, REG-02 | FR-25 | API-50, API-51, UI-19, E2E-05 |
| FR-26 | API-60, API-62, UI-23 | | |

## 13. What has actually been run

Nothing yet. This section is filled in by each feature PR and finally by the release PR with the
output of the full suites run on `main`.
