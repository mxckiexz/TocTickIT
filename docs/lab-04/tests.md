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

Coverage targets: 100% of rules BR-01 to BR-25 and criteria AC-01 to AC-39 have a test; every new
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
| UNIT-01 | BR-06 | action status move lookup | PLANNED → IN_PROGRESS / COMPLETED / CANCELLED, IN_PROGRESS → COMPLETED / CANCELLED allowed; everything else, including self and from final, rejected | `actions-taken.api.test.ts` | Planned |
| UNIT-02 | BR-12 | resolution gate evaluator `(owner, actions[]) → unmet[]` | `NO_OWNER`, `NO_COMPLETED_ACTION`, `OPEN_ACTIONS` exactly when true; empty when all pass; cancelled actions ignored | `ticket-workflow.api.test.ts` | Planned |
| UNIT-03 | BR-03, BR-04, BR-05 | action validator | trims; 1 to 2000; follow-up rule; `actionAt` window (5 min ahead) | `actions-taken.api.test.ts` | Planned |
| UNIT-04 | BR-20 | start of the 7-day window in Asia/Bangkok | midnight boundary; not shifted by the server timezone | `staff-dashboard.api.test.ts` | Planned |

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
| API-13 | BR-06 | every action status pair | allowed pairs `200`, others `400` | Planned |
| API-14 | FR-04 | COMPLETE without `result` | `400` at `result` | Planned |
| API-15 | AC-11, BR-08 | DELETE an action | no route (`404` / `405`) | Planned |
| API-16 | AC-12, BR-10 | POST on a CLOSED and on a CANCELLED ticket | `409 TICKET_CLOSED` | Planned |
| API-17 | BR-05 | `actionAt` past / default / 6 minutes ahead / not a date | `201` / now / `400` / `400` | Planned |
| API-18 | BR-14 order | no session, bad ids, missing ticket, invalid body + missing ticket | `401`, `400`, `404`, ladder holds | Planned |
| API-19 | Lab 3 SEC-07 | forged and missing Origin on POST and PATCH | `403` | Planned |

### 3.2 Ticket workflow (`server/tests/lab-04/ticket-workflow.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| API-20 | AC-13, BR-11 | every allowed matrix cell, generated from `STATUS_TRANSITIONS`, gate satisfied for RESOLVED | `200` | Planned |
| API-21 | AC-13, BR-11 | every other cell including self-transitions | `409 ILLEGAL_TRANSITION` | Planned |
| API-22 | AC-14 | Requester and Administrator call the status route | `403` | Planned |
| API-23 | AC-15, BR-12 | RESOLVED with no owner | `409 RESOLUTION_GATE`, `NO_OWNER` | Planned |
| API-24 | AC-16, BR-12 | owner, no COMPLETED action | `409`, `NO_COMPLETED_ACTION` | Planned |
| API-25 | AC-17, BR-12 | PLANNED / IN_PROGRESS action present; then completed or cancelled | `409 OPEN_ACTIONS`; then `200` | Planned |
| API-26 | AC-18, BR-13 | RESOLVED and "add a PLANNED action" fired together, 20 rounds | outcome equals one of the two serial orders, never a resolved ticket with an open action created before it | Planned |
| API-27 | AC-19, BR-15 | Requester marks "appears resolved" | status unchanged, gate unchanged, signal recorded | Planned |
| API-28 | AC-20, BR-17 | status with stale `version`; with none | `409 STALE_VERSION`; Lab 3 behaviour | Planned |
| API-29 | AC-21 | successful status change | response has new status, `version`, `allowedTransitions`, `resolutionGate` | Planned |
| API-30 | AC-22, BR-17 | claim, assign, priority, mark-resolved | `version` +1 each; stale optional `version` → `409` | Planned |
| API-31 | FR-12 | staff detail GET as IT Staff and Administrator | `version`, transitions, gate present; Administrator transitions empty | Planned |
| API-32 | BR-14 | RESOLVED without `confirm` on a ticket that also fails the gate | `400` first, then after confirm `409` | Planned |
| API-33 | api-spec | queue with `ownerId=me` | only the caller's tickets | Planned |

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

### 3.4 Cross-cutting security (`server/tests/lab-04/authorization.api.test.ts`)

| ID | AC / BR | What | Expected | Final |
|---|---|---|---|---|
| SEC-01 | AC-02, AC-14, AC-28 | role × route sweep including all new routes, no session, forged Origin | each role gets 403 outside its set, 401 with no session, 403 on forged Origin | Planned |
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
| UI-02 | AC-04, AC-34 | create: required fields, follow-up note required when checked, errors under fields, values kept after an error | `ActionsTaken.test.tsx` | Planned |
| UI-03 | AC-09, AC-32 | edit sends `version`; `409` shows the conflict banner and keeps input | `ActionsTaken.test.tsx` | Planned |
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
| UI-16 | AC-31 | navigation per role, `aria-current` on the active item | `AppShell.test.tsx` (Lab 3 file, extended) | Planned |

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
| E2E-01 | AC-01 to AC-08 | staff adds two actions to one ticket, edits one, sees validation messages; Requester sees them read-only | `actions-taken-flow.spec.ts` | Planned |
| E2E-02 | AC-15 to AC-20, AC-32 | gate blocks Resolved; finish the actions; resolve; Requester advisory leaves the status; two sessions edit, second sees the conflict banner | `ticket-resolution.spec.ts` | Planned |
| E2E-03 | AC-23 to AC-31 | each role's dashboard numbers match the database; drill-down lists match; navigation per role; Requester isolation | `dashboards.spec.ts` | Planned |
| E2E-04 | AC-33, AC-34 | double click sends one request; failed submit keeps values; no console error during E2E-01 to 03 | `actions-taken-flow.spec.ts` | Planned |

## 8. Regression

| ID | AC | What | Expected | Final |
|---|---|---|---|---|
| REG-01 | AC-38 | full Lab 1 to 3 server, client and Playwright suites on `lab4-staging` and again on `main` | all pass | Planned |
| REG-02 | AC-38 | the Lab 3 tests listed in §9, updated in the PR that forces the change | pass, each change recorded | Planned |

## 9. Lab 3 tests expected to change (not "unmodified")

The resolution gate and the status buttons change behaviour that Lab 3 tests relied on. Each is
fixed in the PR that causes it (F4 for the API, F7 for the UI), with the reason written here:

| Lab 3 test | Why it changes | Planned change |
|---|---|---|
| `staff-ticket-detail.api.test.ts` API-34, API-57 to API-60 | they reach RESOLVED on a ticket with no owner and no actions | create an owner and a COMPLETED action first (helper) |
| `staff-ticket-detail.api.test.ts` UNIT-03 generated cases | same | same helper |
| `e2e/lab-03/staff-ticket-flow.spec.ts` E2E-04 | resolves a claimed ticket with no actions; uses the status `<select>` | add a completed action; use the status buttons |
| `client/tests/lab-03/StaffTicketDetail.test.tsx` UI-08, UI-14 | status `<select>` becomes buttons | assertions move to the buttons |
| `e2e/lab-03/responsive-screenshots.spec.ts` | screenshots of the changed Ticket Detail | regenerate and re-inspect |

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
| AC-13 | API-20, API-21, UI-07 |
| AC-14 | API-22, SEC-01 |
| AC-15 | API-23, UI-08, UNIT-02, E2E-02 |
| AC-16 | API-24, UNIT-02 |
| AC-17 | API-25, UNIT-02, E2E-02 |
| AC-18 | API-26 |
| AC-19 | API-27, UI-11, E2E-02 |
| AC-20 | API-28, E2E-02 |
| AC-21 | API-29, UI-10 |
| AC-22 | API-30 |
| AC-23 | API-34, E2E-03 |
| AC-24 | API-35, UI-15 |
| AC-25 | API-39 |
| AC-26 | API-40, UI-14 |
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

## 12. Traceability: business rules → tests

| BR | Tests | BR | Tests |
|---|---|---|---|
| BR-01 | API-02 | BR-14 | API-32, UI-09 |
| BR-02 | API-05 | BR-15 | API-27 |
| BR-03 | API-03, UNIT-03 | BR-16 | API-10, API-11 |
| BR-04 | API-04 | BR-17 | API-28, API-30 |
| BR-05 | API-17, UNIT-03 | BR-18 | API-39, API-42 |
| BR-06 | API-13, UNIT-01 | BR-19 | API-34 |
| BR-07 | API-06 | BR-20 | API-44, UNIT-04 |
| BR-08 | API-15 | BR-21 | API-38 |
| BR-09 | API-07 | BR-22 | API-36, API-41 |
| BR-10 | API-16 | BR-23 | API-35, API-42 |
| BR-11 | API-20, API-21 | BR-24 | API-08, SEC-02 |
| BR-12 | API-23, API-24, API-25, UNIT-02 | BR-25 | MIG-01, MIG-02 |
| BR-13 | API-26 | | |

## 12b. Traceability: functional requirements → tests

| FR | Tests | FR | Tests |
|---|---|---|---|
| FR-01 | API-08, UI-01, UI-04 | FR-13 | API-27, UI-11 |
| FR-02 | API-01, API-05 | FR-14 | API-34, API-35, UI-15 |
| FR-03 | API-09, API-10 | FR-15 | API-39, UI-12 |
| FR-04 | API-04, API-14, UNIT-03 | FR-16 | API-40, UI-14 |
| FR-05 | API-06, API-13, UNIT-01 | FR-17 | API-45, UI-12 |
| FR-06 | API-15 | FR-18 | API-36, API-41 |
| FR-07 | API-07 | FR-19 | UI-16, E2E-03 |
| FR-08 | API-16 | FR-20 | UI-01, UI-13, UI-15 |
| FR-09 | API-20, API-21, API-22 | FR-21 | UI-02, UI-06, E2E-04 |
| FR-10 | API-23, API-24, API-25 | FR-22 | A11Y-01 to A11Y-04 |
| FR-11 | API-10, API-28 | FR-23 | RSP-01, RSP-02 |
| FR-12 | API-29, API-31 | FR-24 | REG-01, REG-02 |

## 13. What has actually been run

Nothing yet. This section is filled in by each feature PR and finally by the release PR with the
output of the full suites run on `main`.
