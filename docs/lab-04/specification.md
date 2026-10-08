# Lab 4 — Actions Taken, Ticket Workflow, Role Dashboards, Hardening — Specification

> Source of truth for Sprint 4. Extends `docs/lab-03/specification.md`: everything in Lab 1 to
> 3 keeps working. Built from `LAB4_BRIEF.md`; where the Lab 4 handout says something
> different, the handout wins. **The handout was not available when this was drafted**, so
> every point that depends on it is marked `OQ-n` (open question) in §11 and must be
> confirmed before the matching implementation PR. See [api-spec.md](api-spec.md),
> [ui-spec.md](ui-spec.md) and [tests.md](tests.md).

## 1. Sprint Goal

Let IT Staff record what was actually done on a ticket (Actions Taken), make the ticket's
status workflow and its resolution rule impossible to bypass at the API, give each role a
dashboard that answers "what needs my attention" with numbers that match the database, and
harden the whole application (conflicts, double submits, accessibility, responsive layout)
without breaking any Lab 1 to 3 behaviour.

## 2. Stakeholder Request (in our own words)

The helpdesk wants an audit trail of work under each ticket: who did what, when, what came
out of it, and whether a follow-up is needed. A ticket must not be marked Resolved while
work on it is still open, and that has to hold even if someone calls the API directly or two
people edit at the same time (the second one gets told, not silently overwritten). A
Requester can say "it looks fixed to me" but still cannot resolve or close anything. Each
person should land on a dashboard that is relevant to their role: a Requester sees their own
tickets only; IT Staff see what is unassigned, what is theirs, and how work is spread over
statuses and priorities; Administrators see the staff view plus a short user count. Numbers
on a dashboard must open the list behind them.

## 3. Scope

### 3.1 In scope

- Actions Taken: a list of append-only entries under a ticket (create, edit, no delete).
- Status matrix for all 8 statuses with roles, enforced at the backend, and a resolution gate
  for `RESOLVED`.
- Optimistic locking (`version` on `Ticket` and `ActionTaken`) with `409` on a stale write.
- Requester "appears resolved" stays advisory.
- Dashboards: Requester, IT Staff, Administrator (staff metrics plus short user counts).
- Navigation per role with a visible active page; states loading / empty / forbidden /
  conflict / error on every new screen.
- Hardening: double-submit and retry protection, forms keep values after an error,
  accessibility, responsive 375 / 768 / 1280 px, no console errors or placeholder UI.
- Additive migration only, with a tested rollback / restore procedure; idempotent seed.

### 3.2 Explicitly out of scope

SLA and escalation, notifications (email, SMS, LINE, push), inventory or purchasing, billing
and timesheets, multi-level approval, e-signature, BI and export, multi-tenant, cloud
deployment. Also: deleting an Action Taken, uploading files to an Action Taken (only a text
note about attachments), changing Lab 3's login, roles or user management.

### 3.3 Roles

Unchanged from Lab 3: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.

### 3.4 Authorization Matrix

| Action | Requester | IT Staff | Administrator |
|---|---|---|---|
| List Actions Taken of a ticket | own ticket only (else `404`) | any ticket | any ticket |
| Create an Action Taken | no | yes | yes |
| Edit an Action Taken | no | yes | yes |
| Delete an Action Taken | not offered | not offered | not offered |
| Change ticket status (matrix §7.3) | no | yes | no (OQ-2) |
| "Problem appears resolved" (advisory) | own ticket only | no | no |
| Requester dashboard | yes (own tickets only) | no | no |
| Staff dashboard | no | yes | yes |
| User counts on the dashboard | no | no | yes |

`no` means `403` for a role that is authenticated but not allowed, `401` for no session, and
`404` for another Requester's ticket (BR-14 of Lab 3, no leak that it exists). A hidden or
disabled button is feedback only; the API enforces everything above.

## 4. Functional Requirements

**Actions Taken**
- **FR-01** — IT Staff and Administrator list the Actions Taken of any ticket; a Requester
  lists them for their own tickets only, read-only.
- **FR-02** — IT Staff and Administrator create an Action Taken on a ticket. The performer is
  taken from the session, never from the request.
- **FR-03** — IT Staff and Administrator edit an Action Taken they can see; the edit carries
  the `version` the editor last saw.
- **FR-04** — `description` is required; `followUpNote` is required when `followUpRequired`
  is true; `result` is required when the status is `COMPLETED` (OQ-1).
- **FR-05** — An Action Taken has `status` PLANNED, IN_PROGRESS, COMPLETED or CANCELLED and an
  optional `assigneeId`, who must be an active IT Staff or Administrator (OQ-1).
- **FR-06** — Actions Taken are append-only: no delete endpoint. An action that should not
  count is set to CANCELLED.
- **FR-07** — The list is returned in a stable order: `actionAt` ascending, then `id`.
- **FR-08** — Actions cannot be added to a CLOSED or CANCELLED ticket.

**Ticket workflow**
- **FR-09** — A ticket status change is accepted only if the matrix (§7.3) allows it for the
  caller's role; everything else is rejected by the backend.
- **FR-10** — Moving a ticket to RESOLVED is accepted only if the resolution gate passes.
- **FR-11** — A write that carries an out-of-date `version` is rejected `409` and changes
  nothing.
- **FR-12** — The staff ticket detail response includes the ticket `version`, the list of
  statuses the caller may move to now, and the current gate result with its unmet conditions.
- **FR-13** — The Requester's "appears resolved" signal never changes the status.

**Dashboards**
- **FR-14** — A Requester dashboard with: open tickets, waiting for requester, recently
  updated, recently resolved; own tickets only.
- **FR-15** — A staff dashboard with: unassigned, assigned to me, by status, by IT priority,
  recently updated.
- **FR-16** — The Administrator sees the staff dashboard plus a short user count.
- **FR-17** — Every metric has a drill-down to the list behind it with the same filter.
- **FR-18** — A dashboard response contains summary numbers and at most 5 recent tickets,
  never the full ticket list.

**Application**
- **FR-19** — Navigation shows a Dashboard item per role and marks the current page.
- **FR-20** — Every new screen shows loading, empty, forbidden, conflict and error states.
- **FR-21** — Submit buttons are disabled while a request is in flight; a failed submit keeps
  what the user typed.
- **FR-22** — Keyboard operable, visible focus, labelled controls, status never by colour
  alone, contrast at least 4.5:1.
- **FR-23** — No horizontal overflow or overlap at 375, 768 and 1280 px.
- **FR-24** — All Lab 1 to 3 functions behave as before (the test changes forced by the
  resolution gate are listed in `tests.md` §9).

## 5. Business Rules

- **BR-01** — Only IT Staff and Administrator can write an Action Taken; a Requester can never
  create or edit one, even on their own ticket.
- **BR-02** — `performedById`, `createdAt` and `updatedAt` are set by the server.
- **BR-03** — `description` is 1 to 2000 characters after trimming; `result`, 0 to 2000;
  `followUpNote`, 0 to 1000; `attachmentNotes`, 0 to 1000. Content is rendered as text.
- **BR-04** — `followUpRequired = true` with an empty `followUpNote` is rejected `400`; when
  `followUpRequired` is false the note is stored empty.
- **BR-05** — `actionAt` defaults to now, may be in the past, and may not be more than 5
  minutes in the future.
- **BR-06** — Action status moves PLANNED → IN_PROGRESS | COMPLETED | CANCELLED and
  IN_PROGRESS → COMPLETED | CANCELLED. COMPLETED and CANCELLED are final; any edit of a final
  action is rejected `409` (OQ-1).
- **BR-07** — `assigneeId`, when given, must be an active user with role IT_STAFF or
  ADMINISTRATOR; an inactive, missing, or Requester user is rejected `400` (OQ-1).
- **BR-08** — No delete of an Action Taken, by any role.
- **BR-09** — Actions are ordered by `actionAt` then `id`, both ascending, so the order never
  changes between reads.
- **BR-10** — A ticket in CLOSED or CANCELLED accepts no new Action Taken (`409`).
- **BR-11** — The status matrix of Lab 3 §7.3 is unchanged (§7.3 below repeats it with roles).
- **BR-12** — **Resolution gate** (OQ-3): a transition to RESOLVED needs all of
  (a) the ticket has an owner, (b) it has at least one Action Taken with status COMPLETED,
  (c) it has no Action Taken with status PLANNED or IN_PROGRESS. Otherwise `409` with code
  `RESOLUTION_GATE` and the list of unmet conditions.
- **BR-13** — The gate is evaluated inside the same transaction that changes the status, so an
  action added or changed at the same moment cannot slip past it.
- **BR-14** — Confirmation (`confirm: true`) for RESOLVED, CLOSED, REOPENED, CANCELLED stays as
  in Lab 3 (BR-42 there); order of checks stays 401, 403, 400, 404, 409.
- **BR-15** — The Requester's "appears resolved" signal is advisory only: it records who and
  when and never changes `currentStatus`; it does not satisfy the gate.
- **BR-16** — **Optimistic locking**: `Ticket.version` and `ActionTaken.version` start at 1 and
  increase by 1 on every successful change. A write that sends a `version` different from the
  stored one is rejected `409` with code `STALE_VERSION` and the current version.
- **BR-17** — New Lab 4 write routes require `version`. The Lab 3 ticket routes (claim, assign,
  priority, status) accept an optional `version`: when sent it is checked, when omitted the
  route behaves as before (OQ-4). Either way a successful write bumps `Ticket.version`.
- **BR-18** — Dashboard numbers come from the database at request time; "open" means status in
  NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED.
- **BR-19** — A Requester dashboard only ever counts and lists the caller's own tickets.
- **BR-20** — "Recently" means the last 7 days counted from the start of the day 6 days ago in
  the Asia/Bangkok timezone; timestamps are stored in UTC.
- **BR-21** — "Recently resolved" lists tickets currently in RESOLVED ordered by `updatedAt`
  (no separate resolved timestamp is stored; documented limitation).
- **BR-22** — Dashboard recent lists hold at most 5 tickets, each with only number, summary,
  status, priority and `updatedAt`.
- **BR-23** — An empty metric is returned as `0` / an empty list, never omitted or `null`.
- **BR-24** — Error responses never reveal whether another user's ticket or action exists
  (same `404` as a missing one).
- **BR-25** — The migration is additive: no column or row of Lab 1 to 3 is dropped or changed.
  `version` columns are added with a default so existing rows are valid.

## 6. UI Specification Summary

Detail in [ui-spec.md](ui-spec.md). New or changed screens: the Actions Taken section of the
Ticket Detail (staff: list, create mode, edit mode; Requester: read-only), status buttons with
a conflict banner on the staff Ticket Detail, a Staff/Admin Dashboard, a Requester Dashboard,
and a Dashboard item in the navigation. Zen Green tokens, badges (`ticketBadges.tsx`) and form
conventions are reused; nothing new needs a new colour.

## 7. Data Changes

### 7.1 New and changed models

`ActionTaken` (new):

| Field | Type | Notes |
|---|---|---|
| id | Int, PK | |
| ticketId | Int, FK Ticket | required, on delete restrict |
| performedById | Int, FK User | from the session, required |
| assigneeId | Int?, FK User | optional, active IT Staff or Administrator (OQ-1) |
| status | enum ActionStatus | PLANNED (default), IN_PROGRESS, COMPLETED, CANCELLED (OQ-1) |
| actionAt | DateTime | default now |
| description | String | required |
| result | String | default "" |
| followUpRequired | Boolean | default false |
| followUpNote | String | default "" |
| attachmentNotes | String | default "" |
| createdAt, updatedAt | DateTime | server set |
| version | Int | default 1 |

Index `(ticketId, actionAt, id)` for the ordered list. `Ticket` gains `version Int @default(1)`.

### 7.2 Design reasons (decision record)

1. **A separate table, not text on the ticket.** Options: a JSON or text column on `Ticket`;
   a child table. A child table keeps one row per entry with its own author and time (append-only
   history), lets the database count and filter actions for the gate and dashboards, and allows
   a foreign key to the performing user. A text column cannot enforce any of that. Cost: one join.
2. **Composite index `(ticketId, actionAt, id)`.** The only list query is "all actions of one
   ticket in order"; the index serves the filter and the sort together, and `id` makes ties
   stable (BR-09).
3. **Integer `version`, not `updatedAt` or a lock.** Options: compare `updatedAt`; row locks;
   an integer version. `updatedAt` can tie or lose precision; row locks hold a connection
   while a person thinks. A version compared in the `UPDATE ... WHERE version = n` is atomic,
   cheap, and gives a clean `409` (BR-16). Cost: every writer must send it, hence OQ-4.
4. **Foreign key to `User`, not a name.** The history survives a rename; users are never
   deleted (Lab 3 BR-38), so `restrict` never fires.
5. **Enum for action status.** The database rejects any value outside the four.

### 7.3 Ticket status matrix and roles

Unchanged from Lab 3 (`server/src/ticketStatus.ts`); written out here as the Lab 4 contract.
Role that may perform any of these: IT Staff only (OQ-2). `*` = needs `confirm: true`.

| From \ To | New | Open | In Progress | Waiting | Resolved * | Closed * | Reopened * | Cancelled * |
|---|---|---|---|---|---|---|---|---|
| New | | yes | yes | | | | | yes |
| Open | | | yes | yes | | | | yes |
| In Progress | | | | yes | gate | | | yes |
| Waiting for Requester | | | yes | | gate | | | yes |
| Resolved | | | | | | yes | yes | |
| Closed | | | | | | | yes | |
| Reopened | | | yes | yes | gate | | | yes |
| Cancelled | | | | | | | yes | |

`gate` = also needs BR-12. Self-transitions and every blank cell are illegal (`409`).

### 7.4 Migration (additive, with rollback)

One Prisma migration: `CREATE TYPE "ActionStatus"`, `CREATE TABLE "ActionTaken"` with the index
and foreign keys, `ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1`.
Nothing existing is altered or dropped (BR-25). Rollback (documented in the README, tested for
real on a scratch copy): restore from the `pg_dump` taken before the migration, or run the
inverse SQL (`DROP TABLE "ActionTaken"; DROP TYPE "ActionStatus"; ALTER TABLE "Ticket" DROP
COLUMN "version"`) which is only safe before Action Taken data has been written.

### 7.5 Seed

Idempotent upsert, keyed on stable identifiers. Covers every status and priority, tickets with
and without an owner, tickets with 0, 1 and several Actions Taken (including a PLANNED one that
blocks the gate and a ticket that passes it), and dashboard metrics that are zero for one
role and non-zero for another. Demo accounts stay those of Lab 3.

## 8. API Contract

Summary here; exact shapes in [api-spec.md](api-spec.md).

| Capability | Endpoint |
|---|---|
| List actions | `GET /api/tickets/:id/actions` |
| Create action | `POST /api/tickets/:id/actions` |
| Edit action | `PATCH /api/tickets/:id/actions/:actionId` |
| Change status (extended: `version`, gate) | `PATCH /api/staff/tickets/:id/status` |
| Ticket detail (extended: `version`, allowed transitions, gate) | `GET /api/staff/tickets/:id` |
| Requester dashboard | `GET /api/dashboard/requester` |
| Staff / Admin dashboard | `GET /api/dashboard/staff` |

Authentication and session: unchanged (cookie `toktickit_session`, same-origin check on every
write). Conflicts: `409` with `{ error, code, currentVersion }`.

## 9. Acceptance Criteria

**Actions Taken**
- **AC-01** — Given an IT Staff session and a ticket, when they POST an action with a valid
  description, then `201`, `performedById` is the caller, `version` is 1, `status` PLANNED.
- **AC-02** — Given a Requester session, when they POST an action on their own ticket, then
  `403` and nothing is stored.
- **AC-03** — Given a POST with an empty or whitespace `description`, then `400` with the
  message at `description`.
- **AC-04** — Given `followUpRequired: true` and no `followUpNote`, then `400` at
  `followUpNote`; with a note, `201`.
- **AC-05** — Given a request body that contains `performedById`, then it is ignored and the
  session user is stored.
- **AC-06** — Given an `assigneeId` of an inactive user, a Requester, or a missing id, then
  `400` at `assigneeId`; an active IT Staff or Administrator is accepted.
- **AC-07** — Given a ticket with several actions, when listed repeatedly, then the order is
  identical every time (`actionAt`, then `id`).
- **AC-08** — Given a Requester, when they list the actions of their own ticket, then `200`,
  read-only data; of another Requester's ticket, `404`.
- **AC-09** — Given an edit with the current `version`, then `200`, fields changed, `version`
  +1; given an older `version`, then `409` `STALE_VERSION` and the stored row is unchanged.
- **AC-10** — Given an action in COMPLETED or CANCELLED, when edited, then `409`.
- **AC-11** — Given a DELETE on an action, then no such route exists (`404` / `405`).
- **AC-12** — Given a CLOSED or CANCELLED ticket, when an action is posted, then `409`.

**Workflow**
- **AC-13** — Given every cell of the matrix, when IT Staff request the transition, then
  allowed cells succeed and every other cell is `409`, called directly against the API.
- **AC-14** — Given a Requester or an Administrator, when they call the status route, then
  `403`.
- **AC-15** — Given a transition to RESOLVED on a ticket with no owner, then `409`
  `RESOLUTION_GATE` listing "no owner".
- **AC-16** — Given a ticket with an owner but no COMPLETED action, then `409` listing "no
  completed action".
- **AC-17** — Given a ticket with a PLANNED or IN_PROGRESS action, then `409` listing the open
  actions; once they are COMPLETED or CANCELLED and one is COMPLETED, the transition succeeds.
- **AC-18** — Given an action added at the same moment as a RESOLVED request, then the outcome
  is the same as if they ran one after the other (never both succeeded against a stale gate).
- **AC-19** — Given a Requester who marks "appears resolved", then `currentStatus` is
  unchanged and the gate result is unchanged.
- **AC-20** — Given a status request with a stale ticket `version`, then `409`
  `STALE_VERSION`; with no `version`, the Lab 3 behaviour (OQ-4).
- **AC-21** — Given a successful status change, then the response carries the new status,
  the new `version` and the next allowed transitions.
- **AC-22** — Given a successful change by the existing claim, assign or priority route, then
  `Ticket.version` increased by 1.

**Dashboards**
- **AC-23** — Given a Requester with tickets, when they GET their dashboard, then every number
  equals a count over their own tickets and nobody else's.
- **AC-24** — Given a Requester with no tickets, then all metrics are `0` and the lists empty.
- **AC-25** — Given IT Staff, when they GET the staff dashboard, then unassigned, assigned to
  me, by status, by IT priority and recently updated equal raw SQL over the same data.
- **AC-26** — Given an Administrator, then the staff dashboard plus user counts; given IT Staff,
  no user counts.
- **AC-27** — Given any dashboard, then recent lists have at most 5 entries and no full ticket
  list is returned.
- **AC-28** — Given a Requester calling the staff dashboard, or staff calling the Requester
  dashboard, then `403`; no session, `401`.
- **AC-29** — Given a metric card, when its drill-down is followed, then the list shows
  exactly the tickets counted.
- **AC-30** — Given tickets updated near midnight Asia/Bangkok, then they fall on the correct
  side of the 7-day window.

**Application**
- **AC-31** — Given each role, then the navigation shows its Dashboard item with the active
  page marked and no item the role cannot use.
- **AC-32** — Given a stale version in the UI, then a conflict banner with a reload action is
  shown and the user's input is kept.
- **AC-33** — Given a double click on a submit button, then one request is sent.
- **AC-34** — Given a failed submit, then the form still holds what was typed.
- **AC-35** — Given every new screen, then loading, empty, forbidden, conflict and error
  states are visible and meaningful.
- **AC-36** — Given keyboard-only use, then every new control is reachable, focus is visible,
  controls have labels, status is shown with text as well as colour, contrast is at least 4.5:1.
- **AC-37** — Given widths 375, 768 and 1280 px, then no horizontal overflow and no overlap.
- **AC-38** — Given the Lab 1 to 3 suites, then they pass (with the documented changes).
- **AC-39** — Given the migration on a copy of the Lab 3 database, then every Lab 3 row is
  unchanged, `Ticket.version` is 1, and the rollback restores the previous state.

## 10. Definition of Done

- [ ] `docs/lab-04/*` merged into `lab4-staging` before any implementation PR.
- [ ] Every FR, BR and AC has at least one passing automated test in `tests.md`.
- [ ] Lab 1 to 3 suites and `e2e/lab-03` still pass; the Lab 3 test changes are the listed ones.
- [ ] Migration applied to a copy of the Lab 3 database, counts unchanged, rollback tested.
- [ ] Seed runs twice with identical row counts.
- [ ] `e2e/lab-04/*` pass; screenshots at 375 / 768 / 1280 under `artifacts/lab-04/screenshots/`.
- [ ] No console error, dead link, placeholder text or temporary UI.
- [ ] README: setup, migrate, rollback, seed, test, demo accounts.
- [ ] Every feature PR reviewed, recorded in `reviewer.md`, with `Closes #n`.
- [ ] All Lab 4 issues Done on the Kanban board.
- [ ] `lab4-staging` merged into `main` with all tests green, test output from `main` kept.

## 11. Assumptions and Decisions

**Open questions (to confirm against the handout and with the owner before the matching PR):**

- **OQ-1** — Action Taken `status` and `assigneeId` are not fields in the brief's list; they are
  proposed so that Part 6 (assign, change status, complete, cancel, reject an inactive assignee)
  can be demonstrated. Proposed: `assigneeId` optional, active IT Staff or Administrator;
  `status` PLANNED, IN_PROGRESS, COMPLETED, CANCELLED; `result` required to COMPLETE; COMPLETED
  and CANCELLED are final. **Waiting for the owner's confirmation before Phase 1.**
- **OQ-2** — The brief says Administrator may do "everything" with Actions Taken, while Lab 3
  keeps the Administrator read-only on tickets (Lab 3 BR-39). Proposed: Administrator creates and
  edits Actions Taken and sees the staff dashboard, but does not change ticket status or claim.
- **OQ-3** — Lab 3's sheet deferred "blocks resolution while Actions Taken remain incomplete" to
  Lab 4. The brief's example gate is "owner and at least one action". BR-12 combines both; the
  exact handout wording decides.
- **OQ-4** — Lab 3 routes carry no `version`. Proposed: optional on them, required on new routes
  (BR-17), so no Lab 1 to 3 client breaks.
- **OQ-5** — Requesters see every field of an Action Taken, including `followUpNote` and
  `attachmentNotes`. Confirm none of it should be staff-only.

- **OQ-6** — The Lab 3 Administrator UI has only User Management; the Ticket Queue API is
  readable by Administrator but has no screen for them. A dashboard drill-down needs a
  destination, so the proposal adds "Ticket Queue (read-only)" to the Administrator navigation.

**Decisions made here:** new routes live in their own modules (`actionsTaken.ts`,
`dashboard.ts`) registered from `app.ts`, because three features touch the same large file;
dashboard tests compare each endpoint with raw SQL run in the same test (the development
database accumulates fixture rows, so no hard-coded counts); timezone handling is done in SQL
with `AT TIME ZONE 'Asia/Bangkok'`.
