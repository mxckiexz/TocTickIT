# Lab 4 — API Spec

Extends `docs/lab-03/api-spec.md`. Everything not listed here is unchanged. Authentication is
the Lab 3 session cookie (`toktickit_session`); every state-changing request must pass the
same-origin check; the order of checks is 401, 403, 400, 404, 409. Rule IDs refer to
[specification.md](specification.md).

## Conventions

- JSON bodies; timestamps are ISO 8601 UTC.
- Error body: `{ "error": "<safe message>" }`; validation errors add
  `"errors": { "<field>": "<message>" }`; conflicts add `"code"` and `"currentVersion"`.
- Messages never reveal whether a resource of another user exists (BR-24).
- `version` is an integer. It is returned on every ticket and action, and sent back on writes.

### Conflict body

```json
{ "error": "This record was changed by someone else. Reload and try again.",
  "code": "STALE_VERSION", "currentVersion": 4 }
```

Other `409` codes: `ILLEGAL_TRANSITION`, `RESOLUTION_GATE`, `ACTION_FINAL`, `TICKET_CLOSED`.

## Roles (read this first)

The handout gives the Administrator IT Staff behavior (§4.3; specification D-2, BR-26). Wherever
this document or Lab 3 says "IT Staff" for a ticket operation, the Administrator is allowed too
and receives the same responses. A Requester gets `403` on every such route. Lab 3 routes
changed by this rule:

| Lab 3 route | Lab 3 roles | Lab 4 roles |
|---|---|---|
| `POST /api/staff/tickets/:id/claim` | IT_STAFF | IT_STAFF, ADMINISTRATOR |
| `POST /api/staff/tickets/:id/assign` | IT_STAFF | IT_STAFF, ADMINISTRATOR; `ownerId` may be an active IT_STAFF or ADMINISTRATOR |
| `PATCH /api/staff/tickets/:id/priority` | IT_STAFF | IT_STAFF, ADMINISTRATOR |
| `PATCH /api/staff/tickets/:id/status` | IT_STAFF | IT_STAFF, ADMINISTRATOR |
| `POST /api/tickets/:id/comments` | REQUESTER (own), IT_STAFF | REQUESTER (own), IT_STAFF, ADMINISTRATOR |
| `POST /api/tickets/:id/notes` | IT_STAFF | IT_STAFF, ADMINISTRATOR |
| `GET /api/staff/assignable-users` | IT_STAFF (returns IT_STAFF) | IT_STAFF, ADMINISTRATOR (returns active IT_STAFF and ADMINISTRATOR) |

`400` for an `ownerId` that is a Requester, inactive or missing is unchanged.

## Actions Taken

Object (`ActionTaken`):

```json
{ "id": 12, "ticketId": 7,
  "performedBy": { "id": 3, "name": "Priya Nair" },
  "assignee": { "id": 5, "name": "Marcus Chen" },
  "status": "PLANNED",
  "actionAt": "2026-10-08T03:15:00.000Z",
  "description": "Replaced the docking station",
  "result": "", "followUpRequired": false, "followUpNote": "",
  "attachmentNotes": "", "createdAt": "...", "updatedAt": "...", "version": 1 }
```

`assignee` is `null` when none. A Requester reading their own ticket's actions receives exactly
the same fields (specification D-5).

### `GET /api/tickets/:id/actions`

Roles: REQUESTER (own ticket), IT_STAFF, ADMINISTRATOR (any). Password change required first.

| Status | When | Body |
|---|---|---|
| 200 | ok | `{ "actions": [ActionTaken, ...] }` ordered by `actionAt`, then `id` (BR-09); `[]` when none |
| 400 | non-numeric ticket id | `{ error }` |
| 401 | no session | |
| 404 | ticket missing, or a Requester's ticket that is not theirs | `{ "error": "Ticket not found." }` |

### `POST /api/tickets/:id/actions`

Roles: IT_STAFF, ADMINISTRATOR. Body (all but `description` optional). `status` may be
`PLANNED` (the default when omitted), `IN_PROGRESS` or `COMPLETED`; `result` is required when
`status` is `COMPLETED`:

```json
{ "description": "…", "actionAt": "ISO", "status": "PLANNED",
  "result": "", "assigneeId": 5, "followUpRequired": false,
  "followUpNote": "", "attachmentNotes": "" }
```

`performedById` in the body is ignored (AC-05).

| Status | When |
|---|---|
| 201 | created; body is the `ActionTaken` with `version` 1 |
| 400 | validation: `description` empty or over 2000; `followUpNote` missing when `followUpRequired`; `actionAt` more than 5 minutes ahead or not a date; `assigneeId` inactive, missing, or not IT Staff / Administrator; `status` not allowed on create (`CANCELLED`, or an unknown value) at `errors.status`; `result` empty when `status` is `COMPLETED` at `errors.result` |
| 401 / 403 | no session / Requester |
| 404 | ticket does not exist |
| 409 | `TICKET_CLOSED` (ticket is CLOSED or CANCELLED) |

### `PATCH /api/tickets/:id/actions/:actionId`

Roles: IT_STAFF, ADMINISTRATOR. Body: any editable field plus a required `version`:

```json
{ "version": 1, "status": "COMPLETED", "result": "Dock replaced, tested" }
```

| Status | When |
|---|---|
| 200 | updated; body is the new `ActionTaken`, `version` +1 |
| 400 | same field validation as create; `version` missing or not an integer; status move not allowed by BR-06 (PLANNED → PLANNED and any move out of a final status are not moves; an unchanged `status` in the body is accepted); `result` empty when the resulting status is `COMPLETED` |
| 401 / 403 | no session / Requester |
| 404 | ticket or action missing, or the action belongs to another ticket |
| 409 | `STALE_VERSION`; `ACTION_FINAL` (the action is COMPLETED or CANCELLED); `TICKET_CLOSED` |

There is **no** `DELETE` route (AC-11). Edits overwrite in place and bump `version` and
`updatedAt`; `ticketId`, `performedBy` and `createdAt` never change (BR-08).

## Ticket workflow

### `GET /api/staff/tickets/:id` (extended)

Roles: IT_STAFF, ADMINISTRATOR (unchanged). The `ticket` object gains:

```json
{ "version": 4,
  "allowedTransitions": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  "resolutionGate": { "ok": false, "unmet": ["NO_OWNER", "NO_COMPLETED_ACTION", "OPEN_ACTIONS"] } }
```

`allowedTransitions` is the same for IT Staff and Administrator (BR-26) and is empty only when
the current status has no legal next state for the caller. `unmet` values: `NO_OWNER`,
`NO_COMPLETED_ACTION`, `OPEN_ACTIONS`.

### `PATCH /api/staff/tickets/:id/status` (extended)

Roles: IT_STAFF, ADMINISTRATOR. Body: `{ "currentStatus": "RESOLVED", "confirm": true, "version": 4 }`.
`version` is optional here (D-4).

| Status | When | Body |
|---|---|---|
| 200 | changed | `{ ticket: { ..., version, allowedTransitions, resolutionGate } }` |
| 400 | invalid status value; missing `confirm` for RESOLVED / CLOSED / REOPENED / CANCELLED; `version` not an integer | `{ error, errors }` |
| 401 / 403 | no session / a Requester | |
| 404 | ticket missing | |
| 409 | `ILLEGAL_TRANSITION`; `RESOLUTION_GATE` (body adds `"unmet": [...]`); `STALE_VERSION` | conflict body |

The gate check and the update run in one transaction (BR-13).

### Existing routes that now bump `version`

`POST /api/staff/tickets/:id/claim`, `POST .../assign`, `PATCH .../priority` and
`POST /api/tickets/:id/mark-resolved` accept an optional `version` and return the new one.
A stale `version` is `409 STALE_VERSION`. Without `version` they behave as in Lab 3.

### `GET /api/staff/tickets` (extended filter)

Roles: IT_STAFF, ADMINISTRATOR. Two additions, both for dashboard drill-downs:

- `ownerId=me` is a shorthand for the caller's id ("assigned to me"); `ownerId=unassigned` is a
  readable alias of Lab 3's `ownerId=0`.
- `actionAssigneeId=me` keeps only open tickets (BR-18) that hold at least one Action Taken with
  `assigneeId` = caller and status PLANNED or IN_PROGRESS (BR-27). It returns each such ticket
  once, so the list size equals the dashboard's `ticketsWithMyOpenActions`.

Any other value for these two params is `400`. Everything else as in Lab 3.

## Dashboards

Both return summary numbers and at most 5 recent tickets (FR-18). Empty means `0` / `[]`.

### `GET /api/dashboard/requester`

Role: REQUESTER. Own tickets only (BR-19).

```json
{ "generatedAt": "ISO", "timezone": "Asia/Bangkok",
  "openTickets": 4, "waitingForRequester": 1,
  "recentlyUpdated": [TicketBrief], "recentlyResolved": [TicketBrief] }
```

Drill-downs (client links): `/my-tickets?open=1`, `/my-tickets?currentStatus=WAITING_FOR_REQUESTER`,
`/my-tickets?sort=updatedAt`, `/my-tickets?currentStatus=RESOLVED`.

### `GET /api/dashboard/staff`

Roles: IT_STAFF, ADMINISTRATOR (the same data and rules for both).

```json
{ "generatedAt": "ISO", "timezone": "Asia/Bangkok",
  "unassigned": 6, "assignedToMe": 3,
  "ticketsWithMyOpenActions": 2,
  "myRecentActions": [ActionBrief],
  "byStatus": { "NEW": 2, "OPEN": 1, "IN_PROGRESS": 3, "WAITING_FOR_REQUESTER": 0,
                "RESOLVED": 1, "CLOSED": 4, "REOPENED": 0, "CANCELLED": 1 },
  "byItPriority": { "LOW": 3, "MEDIUM": 5, "HIGH": 2 },
  "recentlyUpdated": [TicketBrief],
  "userCounts": { "total": 18, "active": 15, "byRole": { "REQUESTER": 10, "IT_STAFF": 5, "ADMINISTRATOR": 3 } } }
```

`userCounts` is present for ADMINISTRATOR only. `unassigned` and `assignedToMe` and
`byItPriority` count open tickets (BR-18); `byStatus` counts all eight statuses (zeros kept).
`TicketBrief`: `{ id, ticketNumber, summary, currentStatus, itPriority, updatedAt }`.

Current-user Actions Taken (BR-27, handout Part 5):

- `ticketsWithMyOpenActions`: `SELECT count(DISTINCT a."ticketId") FROM "ActionTaken" a JOIN
  "Ticket" t ON t.id = a."ticketId" WHERE a."assigneeId" = :me AND a.status IN ('PLANNED',
  'IN_PROGRESS') AND t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER',
  'REOPENED')`. Empty: `0`. Drill-down: the Ticket Queue with `actionAssigneeId=me`.
- `myRecentActions`: the caller's actions where `performedById` = caller, ordered by `actionAt`
  descending then `id` descending, at most 5, any ticket. Empty: `[]`. Each row opens its
  ticket detail at the Actions Taken section.
- `ActionBrief`: `{ id, ticketId, ticketNumber, status, actionAt, description }` where
  `description` is cut to the first 120 characters (with an ellipsis when cut). No result,
  follow-up or attachment text is included: the dashboard stays concise (FR-18).

Drill-downs: queue links with `ownerId=unassigned`, `ownerId=me`, `actionAssigneeId=me`,
`currentStatus=<S>`, `itPriority=<P>`, `sortBy=updatedAt`.

| Status | When |
|---|---|
| 200 | ok |
| 401 | no session |
| 403 | wrong role |
| 500 | `{ "error": "Failed to load the dashboard" }` (no detail leaked) |

## Migration note

Database changes are additive (specification §7.4): table `ActionTaken`, enum `ActionStatus`,
column `Ticket.version`.
