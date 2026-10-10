# Lab 4 — Actions Taken, Ticket Workflow, Role Dashboards, Hardening — Specification

> Source of truth for Sprint 4. Extends `docs/lab-03/specification.md`: everything in Lab 1 to
> 3 keeps working, except the places listed in §3.5, where the Lab 4 handout deliberately
> changes a Lab 3 rule. Built from the Lab 4 handout (the handout wins over any earlier
> summary of it). The first draft was written without the handout and carried open questions;
> after review against the handout every one of them is closed as a numbered decision in §11,
> and no open question remains. See [api-spec.md](api-spec.md), [ui-spec.md](ui-spec.md) and
> [tests.md](tests.md).

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

- Actions Taken: a list of entries under a ticket (create, edit while not final, never delete;
  every edit keeps the previous values as an immutable revision, BR-08).
- Status matrix for all 8 statuses with roles, enforced at the backend, and a resolution gate
  for `RESOLVED`.
- Optimistic locking (`version` on `Ticket` and `ActionTaken`), required on every state-changing
  ticket route and on the action edit, with `409` on a stale write (BR-17).
- Pessimistic ticket-row lock shared by every Action Taken write and every ticket status write,
  so the resolution gate cannot be bypassed by a concurrent action (BR-13).
- Requester "appears resolved" stays advisory.
- The Administrator performs every IT Staff ticket operation (handout §4.3), see §3.4 and §3.5.
- Dashboards: Requester, IT Staff, Administrator (staff metrics plus short user counts); the staff
  dashboard includes the current user's Actions Taken.
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

The handout (§4.3) gives the Administrator "IT Staff behavior" plus the administrative access
needed for support. Therefore on tickets the Administrator and IT Staff columns are identical;
the only extra Administrator rights are the Lab 3 user-management routes (BR-26).

| Action | Requester | IT Staff | Administrator |
|---|---|---|---|
| List Actions Taken of a ticket | own ticket only (else `404`) | any ticket | any ticket |
| Create an Action Taken | no | yes | yes |
| Edit an Action Taken | no | yes | yes |
| Delete an Action Taken | not offered | not offered | not offered |
| Change ticket status (matrix §7.3) | no | yes | yes |
| Claim / assign a ticket owner, set IT priority | no | yes | yes |
| Post a Public Comment / Internal Note | comment on own ticket only, no note | yes | yes |
| "Problem appears resolved" (advisory) | own ticket only | no | no |
| Requester dashboard | yes (own tickets only) | no | no |
| Staff dashboard (including my Actions Taken) | no | yes | yes |
| User counts on the dashboard | no | no | yes |
| User management (Lab 3) | no | no | yes |

`no` means `403` for a role that is authenticated but not allowed, `401` for no session, and
`404` for another Requester's ticket (BR-14 of Lab 3, no leak that it exists). A hidden or
disabled button is feedback only; the API enforces everything above.

### 3.5 Lab 3 rules that Lab 4 changes on purpose

The handout gives the Administrator IT Staff behavior (§4.3). That reverses these Lab 3 rules;
each is replaced, not weakened, and the affected Lab 3 tests are listed in `tests.md` §9.

| Lab 3 rule | Lab 4 rule |
|---|---|
| BR-39: Administrator is read-only on tickets, comments and notes | BR-26: Administrator performs every IT Staff ticket operation |
| BR-17 / BR-41: a ticket owner and an assignable user must be an active `IT_STAFF` | BR-26: an active `IT_STAFF` or `ADMINISTRATOR` |
| BR-23: Administrator cannot transition status | BR-26: Administrator transitions status like IT Staff |
| AC-20b, AC-28b: Administrator gets `403` on claim, assign, priority, status, comment and note writes | `200` / `201`, same validation as IT Staff |

Unchanged: login, sessions, user management (Administrator only), the Requester rules, BR-14
(`404` for another Requester's ticket).

## 4. Functional Requirements

**Actions Taken**
- **FR-01** — IT Staff and Administrator list the Actions Taken of any ticket; a Requester
  lists them for their own tickets only, read-only.
- **FR-02** — IT Staff and Administrator create an Action Taken on a ticket. The performer is
  taken from the session, never from the request.
- **FR-03** — IT Staff and Administrator edit an Action Taken they can see; the edit carries
  the `version` the editor last saw.
- **FR-04** — `description` is required; `followUpNote` is required when `followUpRequired`
  is true; `result` is required when the status is `COMPLETED`, on create and on edit (D-1).
- **FR-05** — An Action Taken has `status` PLANNED, IN_PROGRESS, COMPLETED or CANCELLED and an
  optional `assigneeId`, who must be an active IT Staff or Administrator (D-1). A new action
  may be created as PLANNED (default), IN_PROGRESS or COMPLETED, never as CANCELLED.
- **FR-06** — Actions Taken are never deleted (no delete endpoint); an action that should not
  count is set to CANCELLED. Edits are allowed until the action is final; each edit stores the
  previous values as an immutable revision (BR-08).
- **FR-26** — IT Staff and Administrator list the revisions of an Action Taken (oldest first),
  read-only.
- **FR-07** — The list is returned in a stable order: `actionAt` ascending, then `id`.
- **FR-08** — Actions cannot be added to a CLOSED or CANCELLED ticket.

**Ticket workflow**
- **FR-09** — A ticket status change is accepted only if the matrix (§7.3) allows it and the
  caller is IT Staff or Administrator; everything else is rejected by the backend.
- **FR-10** — Moving a ticket to RESOLVED is accepted only if the resolution gate passes.
- **FR-11** — A write that carries an out-of-date `version` is rejected `409` and changes
  nothing.
- **FR-12** — The staff ticket detail response includes the ticket `version`, the list of
  statuses the caller may move to now (the same list for IT Staff and Administrator), and the
  current gate result with its unmet conditions.
- **FR-13** — The Requester's "appears resolved" signal never changes the status.

**Dashboards**
- **FR-14** — A Requester dashboard with: open tickets, waiting for requester, recently
  updated, recently resolved; own tickets only.
- **FR-15** — A staff dashboard with: unassigned, assigned to me, by status, by IT priority,
  recently updated, and the current user's Actions Taken: the number of open tickets that hold
  an open action assigned to me, and my 5 most recent actions (BR-27).
- **FR-16** — The Administrator sees the staff dashboard plus a short user count.
- **FR-17** — Every metric has a drill-down to the list behind it with the same filter.
- **FR-18** — A dashboard response contains summary numbers and at most 5 recent tickets,
  never the full ticket list.

**Administrator on tickets**
- **FR-25** — The Administrator may claim, assign, set IT priority, change status, post comments
  and notes, and create and edit Actions Taken exactly as IT Staff do (BR-26). The Ticket Queue
  and Ticket Detail screens are reachable from the Administrator navigation with all controls.

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
- **BR-06** — Action status. **On create** the allowed statuses are PLANNED (the default when
  omitted), IN_PROGRESS and COMPLETED; CANCELLED is rejected `400` because there is nothing
  yet to cancel. **On edit** the allowed moves are PLANNED → IN_PROGRESS | COMPLETED |
  CANCELLED and IN_PROGRESS → COMPLETED | CANCELLED; an unchanged status is allowed (the edit
  changes other fields). COMPLETED and CANCELLED are final; any edit of a final action is
  rejected `409 ACTION_FINAL`. `result` is required whenever the status is COMPLETED, on create
  and on edit (D-1).
- **BR-07** — `assigneeId`, when given, must be an active user with role IT_STAFF or
  ADMINISTRATOR; an inactive, missing, or Requester user is rejected `400` (D-1).
- **BR-08** — **Append-only means no deletion and no lost value.** No role can delete an Action
  Taken and there is no delete route. The `ActionTaken` row is the *current projection*; the
  history is `ActionTakenRevision`, an immutable table. Creating an action writes revision 1
  (the created values); every successful edit writes one more revision holding the values the
  edit produced, in the same transaction as the update, with the editor and time. Revisions are
  never updated or deleted and have no write route; so every value an action ever had can be
  read back. An edit bumps `version` and `updatedAt` on the projection, while `ticketId`,
  `performedById` and `createdAt` never change. `ActionTakenRevision.revision` equals the
  `ActionTaken.version` it was written at, which makes the two easy to cross-check.
- **BR-09** — Actions are ordered by `actionAt` then `id`, both ascending, so the order never
  changes between reads.
- **BR-10** — A ticket in CLOSED or CANCELLED accepts no new Action Taken (`409`).
- **BR-11** — The status matrix of Lab 3 §7.3 is unchanged (§7.3 below repeats it); the roles
  allowed to use it are IT Staff and Administrator (BR-26).
- **BR-12** — **Resolution gate** (D-3): a transition to RESOLVED needs all of
  (a) the ticket has an owner, (b) it has at least one Action Taken with status COMPLETED,
  (c) it has no Action Taken with status PLANNED or IN_PROGRESS. Otherwise `409` with code
  `RESOLUTION_GATE` and the list of unmet conditions.
- **BR-13** — **Gate and Action Taken writes are serialized on the Ticket row.** Every Action
  Taken create, every Action Taken edit, and every ticket status change (not only RESOLVED) runs
  in one transaction whose first statement is `SELECT ... FROM "Ticket" WHERE id = $1 FOR
  UPDATE` (the "ticket lock"). An action write takes the lock before reading the action again
  and before the closed-ticket check (BR-10); a status change takes it before the matrix check,
  the gate check (BR-12) and the status write. Lock order is always Ticket, then ActionTaken, so
  there is no deadlock. Because the gate is read and the status written while the lock is held,
  no action can be created or edited between the check and the write: the outcome is always one
  of the two serial orders. The action edit finds `ticketId` with an unlocked read (it never
  changes, BR-28), takes the ticket lock, then re-reads the action and compares `version`
  (BR-16). Isolation stays READ COMMITTED; no retry is needed because writers wait on the lock.
- **BR-14** — Confirmation (`confirm: true`) for RESOLVED, CLOSED, REOPENED, CANCELLED stays as
  in Lab 3 (BR-42 there); order of checks stays 401, 403, 400, 404, 409.
- **BR-15** — The Requester's "appears resolved" signal is advisory only: it records who and
  when and never changes `currentStatus`; it does not satisfy the gate.
- **BR-16** — **Optimistic locking**: `Ticket.version` and `ActionTaken.version` start at 1 and
  increase by 1 on every successful change. A write that sends a `version` different from the
  stored one is rejected `409` with code `STALE_VERSION` and the current version.
- **BR-17** — `version` is **required** on every Lab 4 state-changing write: the action edit
  and the ticket routes claim, assign, priority, status and mark-resolved. A missing or
  non-integer `version` is `400` with `errors.version`; a wrong one is `409 STALE_VERSION`
  (BR-16). The check and the update are one statement (`UPDATE ... WHERE id = $1 AND version =
  $2`) so a caller can never overwrite a change it has not seen. Every successful write bumps
  `Ticket.version`. Comments and internal notes insert a new row and overwrite nothing, so they
  need no `version` and do not bump it (D-4). The Lab 3 client and tests are updated to send
  `version` (`tests.md` §9).
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
- **BR-26** — **Administrator performs IT Staff behavior** (handout §4.3). Every route that is
  IT Staff only in Lab 3 (claim, assign, set priority, change status, post a Public Comment,
  post an Internal Note, assignable users) is open to IT Staff and Administrator alike, with the
  same validation and the same results. The ticket owner and every "assignable user" may be an
  active `IT_STAFF` or `ADMINISTRATOR`. Administrator keeps the user-management routes, which
  stay Administrator only. This replaces Lab 3 BR-17, BR-23, BR-39 and BR-41 (§3.5).
- **BR-27** — **My Actions Taken on the staff dashboard.** The card is labelled "Open actions
  assigned to me" and the list "My recent actions"; the two use different people on purpose:
  the card counts by `assigneeId` (work I must do), the list by `performedById` (work I
  recorded). "Open action assigned to me" means an
  Action Taken with `assigneeId` = caller and status PLANNED or IN_PROGRESS on a ticket whose
  status is open (BR-18). The metric `ticketsWithMyOpenActions` counts the distinct such
  tickets. `myRecentActions` lists the caller's 5 newest actions by `actionAt` then `id`
  descending where `performedById` = caller, on any ticket, with only id, ticket id and number,
  status, `actionAt` and the first 120 characters of the description. Both are `0` / `[]` when
  nothing matches (BR-23).
- **BR-28** — An Action Taken belongs to exactly one ticket (`ticketId` is required and fixed)
  and may be performed by any IT Staff or Administrator, not only the ticket owner (handout
  §4.4 BR-01, BR-02). The owner coordinates the ticket; the performer is whoever recorded the
  action.

## 6. UI Specification Summary

Detail in [ui-spec.md](ui-spec.md). New or changed screens: the Actions Taken section of the
Ticket Detail (staff and Administrator: list, create mode, edit mode; Requester: read-only), status
buttons with a conflict banner on the staff Ticket Detail (same controls for IT Staff and
Administrator), a Staff/Admin Dashboard with a "My actions" card and list, a Requester
Dashboard, and a Dashboard item in the navigation. Zen Green tokens, badges (`ticketBadges.tsx`) and form
conventions are reused; nothing new needs a new colour.

## 7. Data Changes

### 7.1 New and changed models

`ActionTaken` (new):

| Field | Type | Notes |
|---|---|---|
| id | Int, PK | |
| ticketId | Int, FK Ticket | required, on delete restrict |
| performedById | Int, FK User | from the session, required |
| assigneeId | Int?, FK User | optional, active IT Staff or Administrator (D-1) |
| status | enum ActionStatus | PLANNED (default), IN_PROGRESS, COMPLETED, CANCELLED (D-1); create allows the first three |
| actionAt | DateTime | default now |
| description | String | required |
| result | String | default "" |
| followUpRequired | Boolean | default false |
| followUpNote | String | default "" |
| attachmentNotes | String | default "" |
| createdAt, updatedAt | DateTime | server set |
| version | Int | default 1 |

Index `(ticketId, actionAt, id)` for the ordered list, and `(assigneeId, status)` for the "open
actions assigned to me" dashboard metric (BR-27). `Ticket` gains `version Int @default(1)`.

`ActionTakenRevision` (new, immutable, BR-08):

| Field | Type | Notes |
|---|---|---|
| id | Int, PK | |
| actionTakenId | Int, FK ActionTaken | required, on delete restrict |
| revision | Int | equals `ActionTaken.version` at that moment; unique with `actionTakenId` |
| editedById | Int, FK User | from the session (the creator for revision 1) |
| editedAt | DateTime | server set |
| status, assigneeId, actionAt, description, result, followUpRequired, followUpNote, attachmentNotes | same types as `ActionTaken` | the values the action had at this revision |

Unique `(actionTakenId, revision)`. No update or delete route exists, and the application never
issues an `UPDATE` or `DELETE` on this table.

### 7.2 Design reasons (decision record)

1. **A separate table, not text on the ticket.** Options: a JSON or text column on `Ticket`;
   a child table. A child table keeps one row per entry with its own author and time (append-only
   history), lets the database count and filter actions for the gate and dashboards, and allows
   a foreign key to the performing user. A text column cannot enforce any of that. Cost: one join.
   History of edits lives in a second child table, `ActionTakenRevision` (BR-08), because an
   in-place overwrite would lose the earlier values and "no delete" alone is not append-only.
2. **Composite index `(ticketId, actionAt, id)`.** The only list query is "all actions of one
   ticket in order"; the index serves the filter and the sort together, and `id` makes ties
   stable (BR-09).
3. **Integer `version`, not `updatedAt` or a lock.** Options: compare `updatedAt`; row locks;
   an integer version. `updatedAt` can tie or lose precision; row locks hold a connection
   while a person thinks. A version compared in the `UPDATE ... WHERE version = n` is atomic,
   cheap, and gives a clean `409` (BR-16). Cost: every writer must send it, hence D-4. The
   version protects a person's stale view; the Ticket-row lock (BR-13) protects the gate, which
   spans several rows and so cannot be covered by one row's version.
4. **Foreign key to `User`, not a name.** The history survives a rename; users are never
   deleted (Lab 3 BR-38), so `restrict` never fires.
5. **Enum for action status.** The database rejects any value outside the four.

### 7.3 Ticket status matrix and roles

Unchanged from Lab 3 (`server/src/ticketStatus.ts`); written out here as the Lab 4 contract.
Roles that may perform any of these: IT Staff and Administrator (BR-26, D-2); a Requester
never. `*` = needs `confirm: true`.

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

One Prisma migration: `CREATE TYPE "ActionStatus"`, `CREATE TABLE "ActionTaken"` and
`CREATE TABLE "ActionTakenRevision"` with their indexes and foreign keys, `ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1`.
Nothing existing is altered or dropped (BR-25). Rollback (documented in the README, tested for
real on a scratch copy): restore from the `pg_dump` taken before the migration, or run the
inverse SQL (`DROP TABLE "ActionTakenRevision"; DROP TABLE "ActionTaken"; DROP TYPE "ActionStatus"; ALTER TABLE "Ticket" DROP
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
| Edit action (writes a revision) | `PATCH /api/tickets/:id/actions/:actionId` |
| List revisions of an action | `GET /api/tickets/:id/actions/:actionId/revisions` |
| Change status (extended: `version`, gate) | `PATCH /api/staff/tickets/:id/status` |
| Ticket detail (extended: `version`, allowed transitions, gate) | `GET /api/staff/tickets/:id` |
| Lab 3 staff routes opened to Administrator (BR-26) | claim, assign, priority, status, `POST /api/tickets/:id/comments`, `POST /api/tickets/:id/notes`, `GET /api/staff/assignable-users` |
| Requester dashboard | `GET /api/dashboard/requester` |
| Staff / Admin dashboard (includes my Actions Taken) | `GET /api/dashboard/staff` |

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
- **AC-48** — Given an action created and then edited twice, when its revisions are listed, then
  there are 3 revisions numbered 1 to 3, each holding the values the action had at that point
  (including values the later edits overwrote on the projection), each with its editor and time;
  a stale or rejected edit adds no revision; no route updates or deletes a revision (BR-08).
- **AC-49** — Given an edit that fails after the revision insert would have run (forced error in
  a test), then neither the projection nor the revisions change (one transaction).
- **AC-40** — Given a create request, then `status` omitted stores PLANNED; PLANNED, IN_PROGRESS
  and COMPLETED are accepted; CANCELLED is `400` at `status`; COMPLETED without a `result` is
  `400` at `result`, and with one is `201`.
- **AC-41** — Given an edit, then every move in BR-06 is accepted, every other move is `400`, an
  unchanged status is accepted, and COMPLETED without a `result` is `400` at `result`.
- **AC-42** — Given a Requester viewing the actions of their own ticket, then every field of
  every entry is returned and shown: time, performer, assignee, status, description, result,
  follow-up flag and note, attachment notes (D-5).

**Workflow**
- **AC-13** — Given every cell of the matrix, when IT Staff or an Administrator request the
  transition, then allowed cells succeed and every other cell is `409`, called directly against
  the API.
- **AC-14** — Given a Requester, when they call the status route, then `403`; given an
  Administrator, the same request is handled exactly as for IT Staff.
- **AC-15** — Given a transition to RESOLVED on a ticket with no owner, then `409`
  `RESOLUTION_GATE` listing "no owner".
- **AC-16** — Given a ticket with an owner but no COMPLETED action, then `409` listing "no
  completed action".
- **AC-17** — Given a ticket with a PLANNED or IN_PROGRESS action, then `409` listing the open
  actions; once they are COMPLETED or CANCELLED and one is COMPLETED, the transition succeeds.
- **AC-18** — Given an action created or edited at the same moment as a RESOLVED request, then
  the outcome is the same as if they ran one after the other, and the final state is never a
  RESOLVED ticket holding a PLANNED or IN_PROGRESS action (BR-13).
- **AC-19** — Given a Requester who marks "appears resolved", then `currentStatus` is
  unchanged and the gate result is unchanged.
- **AC-20** — Given a status request with a stale ticket `version`, then `409`
  `STALE_VERSION`; with no `version`, `400` at `errors.version`; in both cases nothing changes.
- **AC-21** — Given a successful status change, then the response carries the new status,
  the new `version` and the next allowed transitions.
- **AC-22** — Given a claim, assign, priority or mark-resolved request, then with the current
  `version` it succeeds and `Ticket.version` increases by 1; with a stale one `409
  STALE_VERSION`; with none `400` at `errors.version`; nothing changes in the last two cases.
- **AC-43** — Given an Administrator, when they claim, assign (to an IT Staff or an
  Administrator), set priority, change status, post a Public Comment, post an Internal Note, or
  create and edit an Action Taken, then each succeeds with the same response as for IT Staff;
  a Requester still gets `403` on every one of them (BR-26).
- **AC-44** — Given an assign request whose `ownerId` is an inactive user, a Requester, or a
  missing id, then `400`; an active IT Staff or Administrator is accepted, and
  `GET /api/staff/assignable-users` lists both roles, active only, for IT Staff and
  Administrator, `403` for a Requester.

**Dashboards**
- **AC-23** — Given a Requester with tickets, when they GET their dashboard, then every number
  equals a count over their own tickets and nobody else's.
- **AC-24** — Given a Requester with no tickets, then all metrics are `0` and the lists empty.
- **AC-25** — Given IT Staff, when they GET the staff dashboard, then unassigned, assigned to
  me, by status, by IT priority and recently updated equal raw SQL over the same data.
- **AC-26** — Given an Administrator, then the staff dashboard plus user counts; given IT Staff,
  no user counts.
- **AC-45** — Given IT Staff or an Administrator with actions on tickets, when they GET the staff
  dashboard, then `ticketsWithMyOpenActions` equals raw SQL over the caller's open actions on
  open tickets, and `myRecentActions` equals the caller's 5 newest performed actions in the
  documented order (BR-27); another user's actions are never counted or listed.
- **AC-46** — Given a caller with no assigned open actions and no performed actions, then
  `ticketsWithMyOpenActions` is `0`, `myRecentActions` is `[]`, and the UI shows "Nothing
  here" and "You have not recorded any actions yet."
- **AC-47** — Given the "Open actions assigned to me" card, when its drill-down (`actionAssigneeId=me`) is
  followed, then the Ticket Queue lists exactly the tickets counted; given a row of "My recent
  actions", then it opens that ticket's detail at the Actions Taken section.
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

No open question remains. The first draft carried six (OQ-1 to OQ-6); after review against the
Lab 4 handout each is closed here as a final engineering decision. Handout section numbers are
cited so a reader can check them.

- **D-1 (was OQ-1) — Action Taken `status` and `assigneeId` are in the model.** The handout's
  field list (§3, §8.3) names the content fields, and Part 6 requires the UI to demonstrate
  "create, assign, edit, status transition, complete, cancel, validation, inactive-assignee
  rejection". Those can only be shown if an action has an assignee and a status, so both are
  fields. `assigneeId`: optional, an active IT Staff or Administrator (BR-07). `status`:
  PLANNED, IN_PROGRESS, COMPLETED, CANCELLED with the moves of BR-06; COMPLETED and CANCELLED
  are final. Create allows PLANNED (default), IN_PROGRESS and COMPLETED, so a finished piece of
  work can be logged in one step; `result` is required whenever the status is COMPLETED, on
  create and on edit. The assignee is "the person responsible for doing the action"; it may
  differ from the performer and from the ticket owner (BR-28).
- **D-2 (was OQ-2) — The Administrator performs IT Staff behavior on tickets.** Handout §4.3:
  "Administrator: perform IT Staff behavior and retain administrative access". So claim, assign,
  priority, status, comments, notes, Actions Taken, the queue and the detail screen are all open
  to the Administrator with identical rules (BR-26, §3.4, FR-25). The Lab 3 read-only rule
  (Lab 3 BR-39) is replaced, with the owner eligibility widened to active IT Staff or
  Administrator, because an Administrator who claims a ticket becomes its owner. The affected
  Lab 3 tests are listed in `tests.md` §9. User management stays Administrator only.
- **D-3 (was OQ-3) — The resolution gate.** The handout (§4.5) requires the backend to enforce
  "the resolution rule" and leaves its content to the contract. Ours (BR-12): the ticket has an
  owner, at least one COMPLETED action, and no PLANNED or IN_PROGRESS action. This satisfies
  Lab 3's deferred "block resolution while Actions Taken remain incomplete" and the stakeholder
  text that the owner coordinates the whole ticket and the work is recorded. CANCELLED actions
  are ignored by the gate.
- **D-4 (was OQ-4) — `version` is required on every state-changing ticket route.** Handout §6.1
  requires stale and concurrent updates to be handled. An optional `version` would let a caller
  that omits it silently overwrite another caller's claim, assignment, priority or status, which
  is exactly the lost update the handout forbids, and a server-side fallback (read, then write)
  cannot guarantee it without the caller's view of the record. So the action PATCH and the
  claim, assign, priority, status and mark-resolved routes all require it (BR-17). Cost: the Lab 3
  client and the Lab 3 tests that call these routes must send `version`; they are listed in
  `tests.md` §9. Comments and notes only insert rows, so they stay unversioned.
- **D-5 (was OQ-5) — Requesters see every field of every Action Taken on their own ticket.**
  Handout §8.3: "Requesters will see all Actions Taken items", each with date/time, description,
  result, performed by, follow-up required, follow-up note and attachment notes. None of these
  is staff-only, so the Requester response has exactly the same fields as the staff response
  and the Requester UI is read-only (AC-42). Anything that must stay private belongs in an
  Internal Note, which a Requester can never read.
- **D-6 (was OQ-6) — The Administrator navigation gets the Ticket Queue.** With D-2 the
  Administrator works on tickets, so the navigation is Dashboard, Ticket Queue, User Management.
  It is also the destination of every dashboard drill-down.
- **D-7 — "Current-user Actions Taken" on the staff dashboard** (handout Part 5) is two things,
  both defined in BR-27: a count of open tickets that hold an open action assigned to me
  (drill-down: Ticket Queue filter `actionAssigneeId=me`), and my 5 most recent performed
  actions (each row opens its ticket). A count of tickets, not of actions, so the drill-down
  list can match the number exactly (AC-47).

**Other decisions:** new routes live in their own modules (`actionsTaken.ts`, `dashboard.ts`)
registered from `app.ts`, because three features touch the same large file; dashboard tests
compare each endpoint with raw SQL run in the same test (the development database accumulates
fixture rows, so no hard-coded counts); timezone handling is done in SQL with
`AT TIME ZONE 'Asia/Bangkok'`.
