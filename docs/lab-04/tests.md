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
| UNIT-01 | BR-06 | action status move lookup | on edit: PLANNED → IN_PROGRESS / COMPLETED / CANCELLED, IN_PROGRESS → COMPLETED / CANCELLED allowed, unchanged status allowed, everything else and anything from a final status rejected; on create: PLANNED / IN_PROGRESS / COMPLETED allowed, CANCELLED rejected | `actions-taken.api.test.ts` | Pass |
| UNIT-02 | BR-12 | resolution gate evaluator `(owner, actions[]) → unmet[]` | `NO_OWNER`, `NO_COMPLETED_ACTION`, `OPEN_ACTIONS` exactly when true; empty when all pass; cancelled actions ignored | `ticket-workflow.api.test.ts` | Pass |
| UNIT-03 | BR-03, BR-04, BR-05, BR-06 | action validator | trims; 1 to 2000; follow-up rule; `actionAt` window (5 min ahead); `result` required when the status is COMPLETED | `actions-taken.api.test.ts` | Pass |
| UNIT-04 | BR-20 | start of the 7-day window in Asia/Bangkok | midnight boundary; not shifted by the server timezone | `staff-dashboard.api.test.ts` | Pass |
| UNIT-05 | BR-27 | description cut for `ActionBrief` | 120 characters then an ellipsis; shorter text unchanged; no result or follow-up text | `staff-dashboard.api.test.ts` | Pass |

## 3. API / integration tests

### 3.1 Actions Taken (`server/tests/lab-04/actions-taken.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-01 | AC-01 | IT Staff POST valid action | `201`, `performedBy` = caller, `version` 1, status PLANNED | Pass |
| API-02 | AC-02, BR-01 | Requester POST on own ticket | `403`, no row stored | Pass |
| API-03 | AC-03, BR-03 | empty, whitespace, 2001-char description | `400` with message at `description` | Pass |
| API-04 | AC-04, BR-04 | `followUpRequired` without note; with note; false with a note | `400` at `followUpNote`; `201`; note stored empty | Pass |
| API-05 | AC-05, BR-02 | body contains `performedById` | ignored, session user stored | Pass |
| API-06 | AC-06, BR-07 | `assigneeId`: inactive, Requester, missing, active staff, active admin | `400` ×3 at `assigneeId`; `201` ×2 | Pass |
| API-07 | AC-07, BR-09 | several actions with equal `actionAt`, list 5 times | identical order every time | Pass |
| API-08 | AC-08, BR-24 | Requester lists own / another's; staff; admin | `200` read-only; `404`; `200`; `200` | Pass |
| API-09 | AC-09 | PATCH with current version | `200`, fields changed, `version` +1 | Pass |
| API-10 | AC-09, BR-16 | PATCH with a stale version | `409 STALE_VERSION`, `currentVersion`, row unchanged | Pass |
| API-11 | AC-09, BR-16 | two PATCH with the same version at once | exactly one `200`, one `409` | Pass |
| API-12 | AC-10, BR-06 | edit a COMPLETED and a CANCELLED action | `409 ACTION_FINAL` | Pass |
| API-13 | BR-06, AC-41 | every action status pair on edit, generated from the move table, plus an unchanged status | allowed pairs `200`, every other `400`, unchanged `200` | Pass |
| API-14 | FR-04, AC-41 | edit to COMPLETED without `result`; with it | `400` at `result`; `200` | Pass |
| API-15 | AC-11, BR-08 | DELETE an action | no route (`404` / `405`) | Pass |
| API-16 | AC-12, BR-10 | POST on a CLOSED and on a CANCELLED ticket | `409 TICKET_CLOSED` | Pass |
| API-67 | AC-50, BR-10 | no concurrency: resolve a ticket through the gate, then POST a PLANNED action, an IN_PROGRESS action, a COMPLETED action with a result, and a COMPLETED action without one | `409 TICKET_RESOLVED` ×2 with nothing stored and no revision; `201`; `400` at `result`; afterwards the database holds no open action on the RESOLVED ticket | Pass |
| API-68 | AC-50, BR-10, BR-12 | reopen the resolved ticket, POST a PLANNED action, then PATCH status to RESOLVED | `201`; `409 RESOLUTION_GATE` listing the open action; after it is COMPLETED the resolve succeeds | Pass |
| API-70 | BR-07 | the assignee is deactivated, and separately turned into a Requester, in the gap between the early check and the write, on POST and on PATCH | `400` at `assigneeId`; no action and no revision written; the edited action unchanged | Pass |
| API-71 | BR-07 | a database error during the assignee check | `500` with a safe body, never a field error or a misleading write failure; nothing written | Pass |
| API-72 | BR-07 | create with an assignee while that user is being deactivated, 5 rounds | `201` (committed before) or `400`; never an action assigned to an inactive user from a `400` | Pass |
| API-69 | AC-50, BR-10 | insert an inconsistent PLANNED action on a RESOLVED ticket directly in the database, then PATCH it four ways: `status` IN_PROGRESS; `description` only with `status` omitted; `description` with `status` PLANNED sent; `result` and `followUpNote` only | `409 TICKET_RESOLVED` each time (the rule is on the resulting status, not the incoming one); row, `version` and revisions unchanged after every attempt; a PATCH to COMPLETED or CANCELLED with a result is the only edit accepted | Pass |
| API-17 | BR-05 | `actionAt` past / default / 6 minutes ahead / not a date | `201` / now / `400` / `400` | Pass |
| API-18 | BR-14 order | no session, bad ids, missing ticket, invalid body + missing ticket | `401`, `400`, `404`, ladder holds | Pass |
| API-19 | Lab 3 SEC-07 | forged and missing Origin on POST and PATCH | `403` | Pass |
| API-46 | AC-40, BR-06, FR-05 | create with `status` omitted, PLANNED, IN_PROGRESS, COMPLETED with result, COMPLETED without result, CANCELLED, unknown value | PLANNED stored; `201` ×3; `400` at `result`; `400` at `status` ×2 | Pass |
| API-47 | AC-42, D-5 | Requester lists the actions of their own ticket | every field present and equal to what staff receive (including `followUpNote`, `attachmentNotes`, performer, assignee) | Pass |
| API-48 | BR-08 | edit an action, read it again | `ticketId`, `performedBy`, `createdAt` unchanged; `version` and `updatedAt` changed; one new revision row | Pass |
| API-60 | AC-48, BR-08 | create an action, edit it twice, list revisions | 3 revisions numbered 1 to 3 equal to `ActionTaken.version` at each step; revision 1 holds the created values, including those the edits overwrote; editor and time set | Pass |
| API-61 | AC-48 | stale edit, edit of a final action, invalid edit | each rejected; revision count unchanged | Pass |
| API-62 | AC-48, AC-11 | `POST`, `PATCH`, `DELETE` on a revision URL; Requester GET | `404` / `405`; Requester `403` | Pass |
| API-63 | AC-49, BR-08 | force a failure after the update inside the edit transaction | projection and revisions both unchanged | Pass |
| API-64 | BR-13 | two edits of different actions of one ticket, and one edit while a status change runs, 20 rounds | no deadlock, no `500`; every request is `200` or a documented `409` | Pass |
| API-49 | BR-28 | action created by staff B on a ticket owned by staff A | `201`; performer is B; owner is still A | Pass |

### 3.2 Ticket workflow (`server/tests/lab-04/ticket-workflow.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-20 | AC-13, BR-11 | every allowed matrix cell, generated from `STATUS_TRANSITIONS`, gate satisfied for RESOLVED | `200` | Pass |
| API-21 | AC-13, BR-11 | every other cell including self-transitions | `409 ILLEGAL_TRANSITION` | Pass |
| API-22 | AC-14, BR-26 | Requester calls the status route; Administrator makes a legal change | Requester `403`, status unchanged; Administrator `200`, same body shape as IT Staff | Pass |
| API-23 | AC-15, BR-12 | RESOLVED with no owner | `409 RESOLUTION_GATE`, `NO_OWNER` | Pass |
| API-24 | AC-16, BR-12 | owner, no COMPLETED action | `409`, `NO_COMPLETED_ACTION` | Pass |
| API-25 | AC-17, BR-12 | PLANNED / IN_PROGRESS action present; then completed or cancelled | `409 OPEN_ACTIONS`; then `200` | Pass |
| API-26 | AC-18, BR-13 | RESOLVED fired together with (a) "add a PLANNED action" and (b) "complete the only PLANNED action", 20 rounds each; after every round query the database. (An earlier draft raced RESOLVED against "edit an action to IN_PROGRESS"; that cannot be a race, because an action that can be edited to IN_PROGRESS is a PLANNED one and already fails the gate.) A third test holds the ticket lock in another transaction and shows that an action create, an action edit and a status change all wait until it is released | outcome equals one of the two serial orders (a: `200` then `409 TICKET_RESOLVED`, or `201` then `409 RESOLUTION_GATE`; b: `200` then `409 TICKET_RESOLVED`, or `409 RESOLUTION_GATE` then `200`); no round ends with a RESOLVED ticket that holds a PLANNED or IN_PROGRESS action; the three requests stay pending while the lock is held | Pass |
| API-27 | AC-19, BR-15 | Requester marks "appears resolved" | status unchanged, gate unchanged, signal recorded | Pass |
| API-28 | AC-20, BR-17 | status with stale `version`; with none; with a non-integer | `409 STALE_VERSION`; `400` at `errors.version`; `400`; ticket unchanged each time | Pass |
| API-29 | AC-21 | successful status change | response has new status, `version`, `allowedTransitions`, `resolutionGate` | Pass |
| API-30 | AC-22, BR-17 | claim, assign, priority, mark-resolved, each with the current, a stale, and no `version` | `version` +1; `409 STALE_VERSION`; `400` at `errors.version`; nothing written in the last two | | Pass |
| API-65 | BR-17, D-4 | two callers claim, assign or change priority from the same loaded `version` at once | exactly one succeeds; the other gets `409`; the first caller's value is the stored one (no lost update) | | Pass |
| API-73 | BR-17, D-4 | for each of claim, assign, priority, status and mark-resolved: the ticket's version is bumped inside the transaction after the version comparison and before the write (test seam), then the request is made with the version it loaded | `409 STALE_VERSION` with `currentVersion`; the row's own fields unchanged; the only change to `version` is the simulated writer's bump | Pass |
| API-66 | D-4 | `POST` comment and note without `version` | `201`, ticket `version` unchanged | Pass |
| API-31 | FR-12, BR-26 | staff detail GET as IT Staff and Administrator | `version`, transitions, gate present; both roles receive identical `allowedTransitions` | Pass |
| API-32 | BR-14 | RESOLVED without `confirm` on a ticket that also fails the gate | `400` first, then after confirm `409` | Pass |
| API-33 | api-spec | (in `dashboard-drilldown.api.test.ts`) queue with `ownerId=me`, `ownerId=unassigned`, and a bad value | only the caller's tickets; only unowned tickets; `400` | Pass |
| API-50 | AC-43, BR-26, FR-25 | Administrator claims, assigns, sets priority, changes status, posts a comment and a note, creates and edits an action | every call succeeds with the IT Staff response shape | Pass |
| API-51 | AC-43, BR-26 | the same calls as a Requester | `403` on each (comment on own ticket stays `201`) | Pass |
| API-52 | AC-44, BR-26 | assign `ownerId` of an active Administrator, an active IT Staff, an inactive staff, a Requester, a missing id | `200`, `200`, `400`, `400`, `400` | Pass |
| API-53 | AC-44 | assignable users as IT Staff, Administrator, Requester, no session | lists active IT Staff and Administrators, ordered by name, for both staff roles; `403`; `401` | Pass |
| API-54 | AC-44, BR-26 | an Administrator who claimed a ticket is its owner and passes the gate's owner rule | `NO_OWNER` absent in the gate result | Pass |

### 3.3 Dashboards

`requester-dashboard.api.test.ts`:

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-34 | AC-23, BR-19 | Requester A with tickets of A and B in the database | every number equals raw SQL over A's tickets only | Pass |
| API-35 | AC-24, BR-23 | Requester with no tickets | zeros and empty lists, no `null` | Pass |
| API-36 | AC-27, BR-22 | many recent tickets | lists hold at most 5, only brief fields, no full list | Pass |
| API-37 | AC-28 | staff, admin, no session | `403`, `403`, `401` | Pass |
| API-38 | BR-21 | recently resolved | RESOLVED tickets ordered by `updatedAt` | Pass |

`staff-dashboard.api.test.ts`:

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-39 | AC-25, BR-18 | unassigned, assigned to me, by status, by IT priority, recent | equal raw SQL over the same rows | Pass |
| API-40 | AC-26 | Administrator vs IT Staff | admin: `userCounts` equal raw SQL; staff: absent | Pass |
| API-41 | AC-27 | many tickets | recent list at most 5 | Pass |
| API-42 | BR-23 | status with no tickets | all 8 keys present, zeros kept | Pass |
| API-43 | AC-28 | Requester, no session | `403`, `401` | Pass |
| API-44 | AC-30, BR-20 | tickets updated 1 second either side of Bangkok midnight, 7 days ago | each on the correct side of the window | Pass |
| API-45 | AC-29, FR-17 | each metric's drill-down query, including `recent=1` for the recent lists, with tickets older than the 7-day window present | returns exactly the counted set; older tickets not listed | Pass |
| API-55 | AC-45, BR-27 | caller has open assigned actions on open and on resolved tickets, plus actions assigned to someone else | `ticketsWithMyOpenActions` equals raw SQL (distinct open tickets only); the other user's actions are not counted | Pass |
| API-56 | AC-45, BR-27 | caller performed 7 actions, some with equal `actionAt` | `myRecentActions` has 5, newest first by `actionAt` then `id`, equal to raw SQL; only brief fields; description cut to 120 | Pass |
| API-57 | AC-46, BR-23 | caller with no assigned and no performed actions | `0` and `[]`, never `null` or missing | Pass |
| API-58 | AC-45, AC-26 | IT Staff and Administrator each | both receive `ticketsWithMyOpenActions` and `myRecentActions` computed for themselves; `userCounts` only for Administrator | Pass |
| API-59 | AC-47, FR-17 | queue with `actionAssigneeId=me`, and with a bad value | exactly the tickets counted by `ticketsWithMyOpenActions`, each once; `400` | Pass |

### 3.4 Cross-cutting security (`server/tests/lab-04/authorization.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| SEC-01 | AC-02, AC-14, AC-28, AC-43 | role × route sweep including all new routes and the Lab 3 staff routes whose role set changed (BR-26), no session, forged Origin | each role gets 403 outside its set (Administrator now inside the IT Staff set), 401 with no session, 403 on forged Origin | Planned |
| SEC-02 | AC-08, BR-24 | Requester A reaches for B's ticket's actions | `404`, never `403` or data | Pass |
| SEC-03 | BR-14 | two failures at once on the new routes | the earlier rung of the ladder wins | Planned |

## 4. Migration and seed (`server/tests/lab-04/migration.api.test.ts`, `seed.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| MIG-01 | AC-39, BR-25 | replay migrations on a scratch schema with Lab 3 data, apply the Lab 4 migration | every Lab 3 table's rows unchanged; `Ticket.version` = 1 everywhere | Pass |
| MIG-02 | BR-25 | compare `information_schema` before and after | only additions | Pass |
| MIG-03 | AC-39 | rollback on the scratch copy (documented procedure) | schema and rows equal the "before" snapshot | Pass |
| SEED-01 | DoD | run the seed twice | identical row counts, no unique violation | Pass |
| SEED-02 | spec §7.5 | seeded data | every status and priority, owner and none, 0 / 1 / many actions, a gate-passing and a gate-blocked ticket, zero and non-zero metrics | Pass |

## 5. UI component tests (`client/tests/lab-04/`)

| ID | AC / BR | What | File | Final |
|---|---|---|---|---|
| UI-01 | FR-01, AC-35 | list renders in the order given; empty, loading, error with Retry | `ActionsTaken.test.tsx` | Pass |
| UI-02 | AC-04, AC-34, AC-40 | create: required fields, follow-up note required when checked, Result required when Completed is chosen, errors under fields, values kept after an error | `ActionsTaken.test.tsx` | Pass |
| UI-03 | AC-09, AC-32 | edit sends `version`; `409` shows the conflict banner and keeps input | `ActionsTaken.test.tsx` | Pass |
| UI-23 | AC-48 | staff "History" button expands the revisions oldest first; a Requester sees no History button | `ActionsTaken.test.tsx` | Pass |
| UI-24 | AC-20, AC-22 | claim, assign, priority, status and mark-resolved calls each send the loaded `version` | `TicketWorkflow.test.tsx`, `ticket-detail.test.tsx` (Requester) | Pass |
| UI-25 | AC-50 | on a RESOLVED ticket the Add action form offers only Completed (with the hint "Reopen the ticket to add open work"); a `409 TICKET_RESOLVED` shows the banner and keeps the input | `ActionsTaken.test.tsx` | Pass |
| UI-04 | AC-08 | Requester sees the list read-only, no buttons | `ActionsTaken.test.tsx` | Pass |
| UI-05 | AC-10, BR-06 | final actions have no Edit button | `ActionsTaken.test.tsx` | Pass |
| UI-06 | AC-33 | Save disabled in flight; double click sends one request | `ActionsTaken.test.tsx` | Pass |
| UI-07 | AC-13 | only `allowedTransitions` rendered as buttons | `TicketWorkflow.test.tsx` | Pass |
| UI-08 | AC-15 to AC-17 | gate unmet: Resolved disabled with each reason in text | `TicketWorkflow.test.tsx` | Pass |
| UI-09 | BR-14 | confirm step for Resolved, Closed, Reopened, Cancelled; cancel sends nothing | `TicketWorkflow.test.tsx` | Pass |
| UI-10 | AC-21, AC-32 | `409` shows the banner; success refreshes version, buttons, gate | `TicketWorkflow.test.tsx` | Pass |
| UI-11 | AC-19 | "appears resolved" button; status badge unchanged | `ticket-detail.test.tsx` (Lab 2 file, Problem Appears Resolved block) | Pass |
| UI-12 | AC-29, FR-17 | metric cards: numbers, drill-down links with accessible names and params | `StaffDashboard.test.tsx`, `DrillDownLists.test.tsx`, `api-dashboard.test.ts` | Pass |
| UI-13 | AC-35 | staff dashboard zero, loading, error with Retry, forbidden | `StaffDashboard.test.tsx`, `RequesterDashboard.test.tsx` (Requester states) | Pass |
| UI-14 | AC-26 | Administrator sees user counts, IT Staff does not | `StaffDashboard.test.tsx` | Pass |
| UI-15 | AC-24, AC-35 | Requester dashboard numbers, lists, empty state with New Ticket | `RequesterDashboard.test.tsx`, `DrillDownLists.test.tsx` | Pass |
| UI-16 | AC-31 | navigation per role (Administrator: Dashboard, Ticket Queue, User Management), `aria-current` on the active item | `AppShell.test.tsx` (Lab 3 file, extended), `routes.test.ts` | Pass |
| UI-17 | AC-45, AC-47 | staff dashboard "Open actions assigned to me" card and "My recent actions" list: numbers, rows, link names and targets (`actionAssigneeId=me`, ticket detail at Actions Taken) | `StaffDashboard.test.tsx` | Pass |
| UI-18 | AC-46 | my-actions zero state: `0` with "Nothing here", "You have not recorded any actions yet."; loading and error states cover the new card | `StaffDashboard.test.tsx` | Pass |
| UI-19 | AC-43, FR-25 | Administrator ticket detail shows the same enabled controls as IT Staff (claim or reassign, priority, status buttons, comment and note forms, Actions Taken create and edit); Requester sees none | `TicketWorkflow.test.tsx`, `ActionsTaken.test.tsx` | Pass |
| UI-20 | AC-40, BR-06 | create Status select offers exactly Planned (default), In progress, Completed; choosing Completed marks Result required and blocks Save with the message | `ActionsTaken.test.tsx` | Pass |
| UI-21 | AC-41, BR-06 | edit Status select offers only the current status and the moves allowed from it; no Delete button anywhere | `ActionsTaken.test.tsx` | Pass |
| UI-22 | AC-42, D-5 | Requester view shows every field of an entry (performer, assignee, result, follow-up note, attachment notes) read-only | `ActionsTaken.test.tsx` | Pass |

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
| E2E-01 | AC-01 to AC-08, AC-40 to AC-42 | staff adds actions to one ticket (one Planned, one logged as Completed with a result), edits one, sees validation messages incl. inactive assignee; Requester sees every field read-only | `actions-taken-flow.spec.ts` | Pass |
| E2E-02 | AC-15 to AC-20, AC-32 | gate blocks Resolved; finish the actions; resolve; Requester advisory leaves the status; two sessions edit, second sees the conflict banner | `ticket-resolution.spec.ts` | Pass |
| E2E-03 | AC-23 to AC-31, AC-45 to AC-47 | each role's dashboard numbers match the database, including my open actions and my recent actions; drill-down lists match; navigation per role; Requester isolation | `dashboards.spec.ts` | Pass |
| E2E-04 | AC-33, AC-34 | double click sends one request; failed submit keeps values; no console error during E2E-01 to 03 | `actions-taken-flow.spec.ts` (Actions Taken flow) and `ticket-resolution.spec.ts` (two sessions) | Pass |
| E2E-05 | AC-43, AC-44 | an Administrator claims a ticket, adds and completes an action, resolves the ticket and closes it, posts a comment and a note, all through the UI | `ticket-resolution.spec.ts` | Pass |

## 8. Regression

| ID | AC | What | Expected | Final |
|---|---|---|---|---|
| REG-01 | AC-38 | full Lab 1 to 3 server, client and Playwright suites on `lab4-staging` and again on `main` | all pass | Pass on `lab4-staging` plus F9 (server 536, client 291, Playwright 61); the run on `main` is part of the release PR (F11) |
| REG-02 | AC-38 | the Lab 3 tests listed in §9, updated in the PR that forces the change | pass, each change recorded | Pass: every changed Lab 3 test is in the section 9 tables, each in the PR that forced it (F4, F6, F7, F8) |

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
| `client/tests/lab-03/AppShell.test.tsx` "Administrator: User Management, never the queue" | Administrator navigation gains Dashboard and Ticket Queue (D-6) | assert the new navigation. **Done in F6** for Ticket Queue, and in F8 for the Dashboard (see the F8 table below). F6 text: (the Administrator could not otherwise reach Actions Taken): the test now expects a "Main" navigation with Ticket Queue and User Management, `aria-current` on the current one, and that Ticket Queue opens the queue; the landing page stays User Management until the Dashboard exists (F8) |
| `client/tests/lab-03/StaffTicketDetail.test.tsx` UI-08, UI-14 | status `<select>` becomes buttons | assertions move to the buttons. **Done in F7** (see the F7 table below) |
| `e2e/lab-03/staff-ticket-flow.spec.ts` E2E-04 | resolves a claimed ticket with no actions; uses the status `<select>` | add a completed action; use the status buttons. **Done in F7** |
| `e2e/lab-03/user-administration.spec.ts`, `e2e/lab-03/accessibility.spec.ts` | assume the Administrator shell has one navigation item | adjust to the new navigation, keep every user-management assertion |
| `e2e/lab-03/responsive-screenshots.spec.ts` | screenshots of the changed Ticket Detail and navigation | regenerate and re-inspect |

**What F4 actually changed in Lab 3 tests** (all in the F4 PR, each recorded here):

| File | Change | Reason |
|---|---|---|
| `server/tests/lab-03/staff-ticket-detail.api.test.ts` | every claim, assign, priority and status call sends the ticket's `version` (helper `sv`); status assertions read `response.body.ticket.currentStatus`; transitions to RESOLVED and the confirm tests create the ticket with an owner and a COMPLETED action (`completedAction` option) and the cleanup removes actions first | `version` is required (BR-17, D-4); the status route returns `{ ticket }`; the gate (BR-12); `ActionTaken` references the ticket |
| same file | the 6 "rejects an Administrator session" and "excludes Administrator accounts" cases now assert `200` and the IT Staff response; "rejects an ownerId that references an Administrator" now accepts it | BR-26 |
| `server/tests/lab-03/comments-notes.api.test.ts` | Administrator comment and note are `201`; mark-resolved calls send `version` | BR-26, BR-17 |
| `server/tests/lab-03/authorization.api.test.ts` | `allowed` lists for claim, assign, priority, status, comment POST, note POST and assignable users gain ADMINISTRATOR; mark-resolved and status probes send `version` | BR-26, BR-17 |
| `client/src/api.ts` and its callers | the five ticket write calls take and send `version`; the status call unwraps `{ ticket }`; `Ticket` gains `version`, `StaffTicket` gains `allowedTransitions` and `resolutionGate` | without it the existing screens would get `400` from the new required `version` |
| `client/tests/lab-02/*`, `client/tests/lab-03/*` | fixtures carry `version` (and the gate fields on staff tickets); call assertions include the version argument | same |
| `e2e/lab-03/staff-ticket-flow.spec.ts` (E2E-04) | records a COMPLETED action through the API before the Resolved step; `server/scripts/e2e-fixture.ts` removes actions and revisions before deleting stale tickets | the gate, and the foreign keys; the `<select>` to buttons change stays with F7 |

**What F7 actually changed in Lab 3 tests** (all in the F7 PR):

| File | Change | Reason |
|---|---|---|
| `client/tests/lab-03/StaffTicketDetail.test.tsx` "Status control" (4 tests) | the `<select>` queries become queries on the "Change status" button group; the confirm-flow assertions (no confirm for routine moves, `confirm: true` only on Confirm, Cancel sends nothing) are unchanged; the first test now also checks the current status is shown as text; the "reverts the select" test now checks the buttons are as before | the control is a row of buttons, one per `allowedTransitions` entry (FR-09, ui-spec section 5) |
| `client/tests/lab-03/styleConformance.test.tsx` STY-02 Staff Ticket Detail | the staff ticket fixture carries `allowedTransitions` and `resolutionGate` | the screen now reads them; the real API always sends them |
| `e2e/lab-03/staff-ticket-flow.spec.ts` E2E-04 and E2E-05 (staff view) | status is changed with the buttons; the COMPLETED action is recorded through the Actions Taken form (it was an API call in F4) and the test checks Resolved is disabled with "Needs a completed action" before it and enabled after it; E2E-05 checks the status badge and the button group instead of the select value | the select is gone; the gate is now visible in the UI |
| `client/tests/lab-02/ticket-detail.test.tsx` | two tests added to "Problem Appears Resolved" (UI-11, stale banner with Reload); nothing existing changed | Requester side of F7 |

**What F8 actually changed in Lab 3 tests** (all in the F8 PR). The cause is one: every role now lands on its Dashboard
instead of the Ticket Queue (IT Staff), User Management (Administrator) or an empty shell (Requester), so a test that logs in
and expects a page must open it from the navigation, as a person would. No rule asserted by these tests changed.

| File | Change | Reason |
|---|---|---|
| `client/tests/lab-03/AppShell.test.tsx` | the "role-scoped navigation" block is replaced: each role's items in order, landing on the Dashboard, `aria-current`, moving between pages, an address the role cannot use opens the Dashboard (UI-16); new block for dashboard links opening the list they count, a deep link opening a ticket at Actions Taken, a click on the current item returning from an open ticket to its list, and Log out forgetting the address. "Change password" Cancel and success, and the shell-width test, now expect the Dashboard | landing page and navigation (FR-19) |
| `client/tests/lab-03/UserManagement.test.tsx`, `StaffTicketQueue.test.tsx` | the helpers that open the page now click its navigation item after the Dashboard has loaded (`tests/helpers/dashboards.ts`); the queue's "renders without any nav click" test is renamed "opens from the Ticket Queue item" | the pages are no longer the landing page |
| `client/tests/lab-01/App.test.tsx` | mocks the two dashboard calls | the signed-in Requester lands on a dashboard that loads its own numbers; without the mock its error alert made `findByRole("alert")` ambiguous |
| `client/tests/setup.ts` | clears the URL hash after every test | pages are addressed by the hash (`src/routes.ts`); jsdom keeps it between tests of a file |
| `e2e/lab-03/staff-ticket-flow.spec.ts`, `staff-attachments-password.spec.ts`, `user-administration.spec.ts`, `responsive-screenshots.spec.ts` | `openPage(page, "Ticket Queue" or "User Management")` after login (helper in `e2e/helpers/accounts.ts`); assertions unchanged | the landing page |

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
| AC-50 | API-67, API-68, API-69, UI-25 |
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
| BR-10 | API-16, API-67, API-68, API-69 | BR-23 | API-35, API-42 |
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
| FR-08 | API-16, API-67 | FR-20 | UI-01, UI-13, UI-15 |
| FR-09 | API-20, API-21, API-22 | FR-21 | UI-02, UI-06, E2E-04 |
| FR-10 | API-23, API-24, API-25 | FR-22 | A11Y-01 to A11Y-04 |
| FR-11 | API-10, API-28 | FR-23 | RSP-01, RSP-02 |
| FR-12 | API-29, API-31 | FR-24 | REG-01, REG-02 | FR-25 | API-50, API-51, UI-19, E2E-05 |
| FR-26 | API-60, API-62, UI-23 | | |

## 13. What has actually been run

Filled in by each feature PR and finally by the release PR with the output of the full suites
run on `main`.

**F2 (Actions Taken foundation, data), branch `feature/actions-taken-data`**, 2026-10-12:

- `server/tests/lab-04/migration.api.test.ts`: 8 tests pass (MIG-01, MIG-02, MIG-03, the new
  indexes, defaults, database-level constraints, restrict on delete). A mutation check (changing
  the `version` default to 2 in the migration) made MIG-01 and MIG-02 fail, so they are not vacuous.
- `server/tests/lab-04/seed.api.test.ts`: 8 tests pass (SEED-01, SEED-02).
- Full server suite: 19 files, 398 tests pass. Full client suite: 13 files, 145 tests pass.
- Rollback and restore run for real on a scratch copy of the dev database (`toktickit_f2_scratch`,
  dropped afterwards): Lab 3 copy with 23 tickets, `prisma migrate deploy` left 23 tickets with
  `version` 1 on every row, the documented inverse SQL left no `ActionTaken` table and no
  `Ticket.version` column, and `pg_restore` of the pre-migration dump returned a Lab 3 database
  on which `prisma migrate status` reports the Lab 4 migration as not applied. Steps are in the README.

**F3 (Actions Taken API), branch `feature/actions-taken-api`**, 2026-10-14:

- `server/tests/lab-04/actions-taken.api.test.ts`: 52 tests pass (UNIT-01, UNIT-03, API-01 to API-19,
  API-46 to API-49, API-60 to API-64 (F3 part), API-67 (F3 part), API-69, SEC-02, SEC-03 first rung).
  Mutation checks: removing the revision insert on edit fails 5 tests, ignoring the resulting status
  in the RESOLVED rule fails 1, removing the stale check fails 3. Removing only the `version` from
  the `UPDATE ... WHERE` still passes, because the check under the ticket lock already rejects a
  stale caller; the statement-level check is a second guard.
- Review fix (assignee re-check): `actions-taken.api.test.ts` now has 58 tests. Replacing the
  in-transaction check with "always eligible" fails 4 of them (API-70). Removing only `FOR SHARE`
  still passes API-72, because both serial orders are valid there; the lock is argued from
  PostgreSQL's row-lock conflict rules (an `UPDATE` of the User row conflicts with `FOR SHARE`),
  not proven by the test. Full server suite: 20 files, 456 tests pass.
- Not covered yet and left `Planned`: API-26, API-67 and API-68 through the gate, and the status
  change half of API-64, because the status routes are F4.

**F4 (Ticket workflow), branch `feature/ticket-workflow`**, 2026-10-30:

- `server/tests/lab-04/ticket-workflow.api.test.ts`: 34 tests pass (UNIT-02, API-20 to API-32, API-50 to API-54,
  API-26, API-64, API-65, API-66, API-67 and API-68 through the gate). Mutation checks, each made tests fail:
  gate skipped (6 fail), matrix check skipped (1), stale check removed from claim (1), ticket lock removed from the
  status route (1, the lock-held test), owner re-check in the transaction removed (1).
- Lab 3 tests updated as listed in section 9. Full server suite: 21 files, 490 tests pass. Full client suite: 13 files,
  145 tests pass. Full Playwright suite (Lab 2 and Lab 3 specs): 38 tests pass against the real UI, including
  `e2e/lab-03/staff-ticket-flow.spec.ts`.

**F4 review fix (conditional write)**, 2026-10-31: claim, assign, priority, status and mark-resolved now write with
one conditional statement (`UPDATE ... WHERE id = ? AND version = ?`, `updateMany`, zero rows is `409 STALE_VERSION`)
instead of reading the version and then updating by id. API-73 proves it: removing `version` from the `WHERE` makes
all 5 of its cases fail. `ticketWorkflow.api.test.ts` now has 40 tests. Full server suite after the change: 21 files, 496 tests pass.

**F5 (Dashboard API), branch `feature/dashboard-api`**, 2026-10-31:

- `server/tests/lab-04/requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts` and
  `dashboard-drilldown.api.test.ts`: 35 tests pass (UNIT-04, UNIT-05, API-33 to API-45, API-55 to API-59). Every
  expected number is raw SQL written separately from the implementation, for the same instant. API-44 also uses a
  fixed clock and tickets one second either side of the Bangkok-midnight window start. `recentWindowStart` is checked
  against PostgreSQL's `AT TIME ZONE` for a spread of instants and under four different server `TZ` values.
- Mutation checks, each made tests fail: window as "now minus 7 x 24 h" (5 fail), user counts shown to IT Staff (2),
  Requester numbers unscoped (6), open-action count ignoring the ticket's status (1), no zero-filling (1), staff
  queue ignoring `open=1` (1).
- Found while writing the SQL: comparing `"updatedAt"` (a `timestamp` stored in UTC) with a `timestamptz` depends on the
  database session's time zone, so the test SQL writes `"updatedAt" AT TIME ZONE 'UTC'` explicitly. The server passes
  the window start as a UTC instant, so it does not depend on the session zone.
- Contract gaps closed here and written into `api-spec.md`: the queue and the Requester list needed `open=1` so that
  a drill-down returns exactly the counted set (the dashboard counts open tickets for unassigned, assigned to me and
  IT priority); the Requester list accepts `sortBy=updatedAt`; `ownerId` is now strict (an empty value was `0`).

**F5 review fix (recent drill-downs)**, 2026-10-31: the "recently updated" and "recently resolved" drill-downs used
only `sortBy=updatedAt` or `currentStatus=RESOLVED`, so tickets older than the 7-day window appeared on later pages
although the dashboard lists left them out. Both `GET /api/tickets` and `GET /api/staff/tickets` gain `recent=1`,
built by the same `recentUpdatedFilter` the dashboards use; the drill-downs are now `recent=1&sortBy=updatedAt` and
`currentStatus=RESOLVED&recent=1`. API-45 now includes tickets eight days old (and one second before the window
start) and checks each recent drill-down against raw SQL, with a fixed clock; a bad `recent` value is `400`. Four new tests; removing the `recent=1` filter from both lists makes 3 fail. Full server suite: 24 files, 535 tests pass.

**F5 review fix, composition check**, 2026-11-01: `dashboard-drilldown.api.test.ts` gains one case that `recent=1`
composes with `open=1` and `ownerId=me` on both lists (an 8-day-old open ticket is in `open=1` alone and out with
`recent=1`). Making the Requester list let `recent` replace `open` fails it. Server suite: 24 files, 536 tests pass.

**F6 (Actions Taken UI), branch `feature/actions-taken-ui`**, 2026-11-01:

- `client/tests/lab-04/ActionsTaken.test.tsx`: 29 tests pass (UI-01 to UI-06, the Actions Taken part of UI-19, UI-20 to
  UI-23, UI-25). Covers the list order as given, loading, empty, error with Retry, 404 and 403; Requester read-only with
  every field; Edit absent on final entries and no Delete anywhere; create and edit forms with errors under their fields
  (`aria-invalid`, `aria-describedby`), the Completed and Follow-up rules, the Status choices per BR-06 and BR-10, Save
  disabled while sending and one request for a double click, the conflict banner with Reload (the typed input stays and
  the next Save sends the newest version, an entry that became final cannot be saved), and the History panel.
- Lab 2 and Lab 3 client tests that render the two ticket detail screens now mock the Actions Taken list
  (`fetchActions`), since both screens embed it. Client suite: 14 files, 174 tests pass. Full Playwright suite: 38 pass.
- Checked in a real browser against the local servers with the e2e test accounts: empty form shows the field error under
  Description; a Completed action with an assignee saved and appeared with its badge, performer, assignee, result and
  attachment notes; History showed revision 1 with the assignee's name; the Requester sees the same entry read-only; at 375
  px the form stacks in one column and the page has no horizontal scroll. This found one real defect: the first version
  used Bootstrap's `btn-primary` (blue) where the project themes `btn-success` (Zen Green); fixed before this PR.
- Not done here, by design: the Playwright screenshots for `artifacts/lab-04/screenshots/actions-taken/` and the visual
  checklist belong to F10 (ui-spec.md section 9); the dashboard "My recent actions" links that open this section (the
  section has the anchor `#actions-taken`) belong to F8.

**F6 review fixes**, 2026-11-01: (1) `App.tsx` rendered only User Management for the Administrator, so they had no way to
reach the Ticket Queue or Ticket Detail; it now has a "Main" navigation with Ticket Queue and User Management (current page
marked with `aria-current`), AppShell tests cover it, and I checked it in a browser with the e2e Administrator account (queue,
ticket, an action saved as "Performed by E2E Fixture Admin" with Edit and History). (2) An edit sent `assigneeId` every
time, so a legacy action whose assignee was deactivated since could not be saved by the form (the server re-checks an
assignee only when one is sent); an edit now sends it only when the selection changed (create always sends it, null for
nobody). Four new tests: legacy inactive assignee description-only edit, changed and cleared assignee, people list failed,
create. Client suite: 14 files, 180 tests pass. Full Playwright suite: 38 pass.

**F7 (Ticket workflow UI), branch `feature/ticket-workflow-ui`**, 2026-11-01:

- `client/tests/lab-04/TicketWorkflow.test.tsx`: 27 tests pass (UI-07 to UI-10, the ticket controls part of UI-19, UI-24 on
  the staff side). Covers: exactly the `allowedTransitions` as buttons and no select, the list taken from the server
  rather than a client copy, no buttons when nothing is allowed; Resolved disabled with each unmet reason in text and tied to
  the button with `aria-describedby`, only the unmet reasons listed, a disabled click sends nothing, and recording a
  completed action refreshes the gate without a reload; the confirm step for Resolved, Closed, Reopened and Cancelled (nothing
  is sent until Confirm, then `confirm: true`; Cancel sends nothing; the step takes focus; a routine move is sent at once);
  `STALE_VERSION`, `RESOLUTION_GATE` and `ILLEGAL_TRANSITION` in the same banner above the controls (Reload refetches, clears
  it, and the next change carries the new version; the confirm step is closed when the change is rejected; claim and priority
  conflicts use it too; the banner takes focus and is scrolled into view); a successful change refreshes buttons, gate and
  badge; one request for a double click; every write sends the loaded `version`; the Administrator view has the same
  controls (same component as IT Staff).
- `client/tests/lab-02/ticket-detail.test.tsx`: two new tests for the Requester (UI-11 status badge unchanged after "Problem
  appears resolved"; stale version shows the banner with Reload, Reload refetches, the next try sends the new version).
  Client suite: 15 files, 209 tests pass. Full Playwright suite: 38 pass.
- Mutation checks (each made one of these tests fail, then reverted): Resolved not disabled by the gate; no refresh after an
  action is saved; Closed without confirm; the confirm step left open after a conflict; the Requester stale banner removed;
  claim sent with a fixed version; scroll into view removed.
- Checked in a real browser with the e2e Administrator account: status shown as a badge with one button per allowed status;
  after Claim and In Progress, Resolved is disabled with "Needs a completed action" under it; I raised the ticket's version
  from outside, then pressed a status button: the banner "Someone else changed this..." appeared with Reload, Reload
  refreshed IT Priority to the new value and cleared the banner; at 375 px the buttons wrap and the page has no horizontal
  scroll. This found one real defect: with the page scrolled down, the banner (above the controls) was out of view; it now takes
  focus and is scrolled into view (instant, because the page uses smooth scrolling that cancelled a smooth scroll).
- Not changed: the server (F4 already returns `allowedTransitions`, `resolutionGate` and the 409 codes). Not done here, by
  design: Playwright screenshots of the status buttons and conflict banner (F10).

**F8 (Role dashboards UI), branch `feature/dashboards-ui`**, 2026-11-01:

- New tests, `client/tests/lab-04/`: `routes.test.ts` 21 (the URL hash: parse, build, round trip, what each role may open, values it
  drops), `api-dashboard.test.ts` 6 (query strings of the drill-down links and the two dashboard calls), `StaffDashboard.test.tsx` 18
  (UI-12, UI-13, UI-14, UI-17, UI-18), `RequesterDashboard.test.tsx` 11 (UI-15 and its states), `DrillDownLists.test.tsx` 19 (the Ticket Queue
  and My Tickets opened from a link: filters applied, the notice naming the filters that have no control, Clear, link filters ANDed
  with the user's own, opening one ticket, scrolling to Actions Taken). UI-16 is in `AppShell.test.tsx`.
- What the tests pin down: every drill-down is an `<a href>` with an accessible name that carries the number ("View 6 unassigned
  tickets") and its href leads to the exact filter the API spec lists (`ownerId=unassigned&open=1`, `ownerId=me&open=1`,
  `actionAssigneeId=me`, `currentStatus=S`, `itPriority=P&open=1`, `recent=1&sortBy=updatedAt`, and the Requester's four); a zero is
  shown as `0` with "Nothing here" and keeps its link; the Administrator-only user line comes from the response (the server sends
  `userCounts` to that role only); loading shows no numbers, error has Retry, 403 shows the forbidden panel; one `h2`, then `h3`.
- Client suite: 20 files, 291 tests pass (was 15 files, 213). Full Playwright suite: 38 pass.
- Mutation checks (each made tests fail, then reverted): the unassigned link without `open=1`; the role gate on addresses removed; the
  queue not sending `open`; My Tickets not sending `recent`; Retry not returning to "Loading dashboard…" (this one survived the first
  round of tests, so a test was added).
- Checked in a real browser with the e2e accounts. Administrator: the Dashboard is the landing page; "View 9 unassigned tickets" opens
  the queue with Owner = Unassigned, the notice "Open tickets only", and exactly 9 rows (the card said 9); the browser Back button
  returns to the Dashboard; a Recently updated row opens the ticket; at 375 px the navigation wraps, cards stack and the page does not
  scroll sideways. Requester: Dashboard with Open tickets 2 and the lists; "View 2 open tickets" opens My Tickets with 2 tickets and the notice;
  a recent ticket opens straight to its detail.
- Not done here, by design: Playwright coverage of the dashboards and the E2E-03 numbers-match-the-database check (F9);
  screenshots in `artifacts/lab-04/screenshots/` and the contrast measurement (F10).
- Known limit, for the reviewer: the API has no total ticket count for a Requester, so "You have no tickets yet." is shown when
  nothing is open, nothing waits and both lists are empty; a Requester whose only tickets are older than seven days and closed sees it too.

**F9 (E2E and regression), branch `feature/lab4-e2e-regression`**, 2026-11-01:

- New Playwright specs in `e2e/lab-04/`, 23 tests: `actions-taken-flow.spec.ts` 8 (E2E-01, E2E-04), `ticket-resolution.spec.ts` 7
  (E2E-02, E2E-05, and E2E-04's console check for that flow), `dashboards.spec.ts` 8 (E2E-03). They drive the screens as a person does;
  the API is used only to put tickets into the starting state a scenario needs (`e2e/helpers/lab4.ts`).
- E2E-01: Planned action with an assignee; one logged as Completed (the form refuses without a Result, then saves); an empty Description is
  refused under the field; an edit and its History showing both revisions; an assignee deactivated after the form was opened is refused
  under Assignee with the typed text kept; the Requester sees every field and has no Add, Edit or History.
- E2E-02: Resolved is disabled with its reasons until there is an owner and a completed action and nothing is open (the gate clears
  without a reload after the action is saved); the confirm step; on a Resolved ticket a new action can only be Completed; the Requester's
  "Problem Appears Resolved" leaves the badge and the staff buttons as they were; two sessions on one ticket (the stale status change gets the
  banner, Reload shows the other session's priority and the next change works) and two sessions editing one action (second Save gets the banner,
  keeps the typed text, works after Reload).
- E2E-03: the numbers come from `server/scripts/e2e-dashboard-truth.ts`, which reads the database without using `server/src/dashboard.ts`
  (so a bug there cannot appear on both sides), and are compared with the screen for IT Staff (three cards, all eight statuses, the three
  priorities, Recently updated in order, My recent actions with status) and for the Requester (both numbers and both lists); each drill-down
  link opens a list whose size equals the number it counted, with its notice; the recent link's first five rows are the dashboard's five; the
  Administrator's user line equals the database and IT Staff have none; navigation per role, `aria-current`, landing on the Dashboard, a
  Requester or IT Staff typing an address they cannot use stays on the Dashboard; a second Requester's ticket is never on the first one's
  dashboard or in My Tickets, and the second Requester sees theirs and none of the first's. No number is hard-coded because the database also
  holds the seed and earlier specs' tickets; the scenario guarantees the IT Staff member owns tickets and holds open actions, so the checks are
  not zeros agreeing with zeros.
- E2E-04: a double click on Save sends one request (the test slows the request so a second click would land during it); a forced 500 keeps
  the typed Description and Result and the retry saves them; no console error or uncaught exception in the watched sessions. Steps that are
  supposed to fail are wrapped in `expecting(...)` so their expected "Failed to load resource" lines are dropped and every other console error
  fails the test.
- Fixture changes (`server/scripts/e2e-fixture.ts`): a second Requester account `e2e-requester2@toktickit.test`; the sweep of
  `e2e-created-` users now runs after the ticket sweep, because an Action Taken can name such a user as assignee and the foreign key
  restricts deleting a user still referenced. New script `npm run e2e:truth`.
- Mutation checks, each made a spec fail and was reverted: the Requester dashboard not scoped to the Requester (E2E-03), Resolved not disabled
  by the gate (E2E-02), conflicts not shown (E2E-02). The double-click test did NOT fail when only the in-flight guard was removed, because
  the Save button is also disabled while saving, so one defence covers for the other; it fails when both are removed (two actions added),
  so it can catch the bug it is for.
- REG-01 on this branch (lab4-staging with F9): server 24 files 536 tests pass; client 20 files 291 pass; Playwright 61 pass (38 from Lab 2 and 3, 23
  new), also 23 pass on two further consecutive runs of `e2e/lab-04` (the fixture leaves the database ready for the next run). Type checks of server
  and client are clean. REG-02: no Lab 3 test is left in the state "expected to change" in section 9.
- Not in this PR: the run on `main` (F11); accessibility, responsive and screenshot checks A11Y-01 to 04, RSP-01, RSP-02 (F10).
