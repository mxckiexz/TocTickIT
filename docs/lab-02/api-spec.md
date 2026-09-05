# Lab 2 — API Spec

## `POST /api/tickets`

### Request body

```json
{
  "requesterId": 1,
  "categoryId": 1,
  "relatedSystemId": 1,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drains much faster than usual, even when idle.",
  "requestedPriority": "MEDIUM"
}
```

| Field | Type | Required | Rule |
|---|---|---|---|
| requesterId | integer | yes | must reference an active Requester |
| categoryId | integer | yes | must reference an active Category |
| relatedSystemId | integer | yes | must reference an active RelatedSystem |
| summary | string | yes | trimmed non-empty, ≤ 150 chars |
| description | string | yes | trimmed non-empty, ≤ 2000 chars |
| requestedPriority | string | yes | one of `LOW`, `MEDIUM`, `HIGH` |

### Responses

| Status | When | Body |
|---|---|---|
| `201 Created` | Valid submission, no recent duplicate | The created `Ticket` (includes `id`, `ticketNumber`, `currentStatus: "New"`, timestamps). |
| `200 OK` | Valid submission that exactly matches a ticket the same Requester submitted in the last 10 seconds (BR-02) | The **existing** `Ticket` — no new row is created. |
| `400 Bad Request` | Any required field missing/invalid, or requesterId/categoryId/relatedSystemId not found or not active | `{ "errors": { "<field>": "<message>" } }` — one entry per failing field. Field-presence/format errors are checked before existence/active-state errors. |
| `500 Internal Server Error` | Unexpected server/DB failure | `{ "error": "Failed to create ticket" }` |

### Ticket Number format

`TKT-<createdAt year>-<id zero-padded to 6 digits>`, e.g. `TKT-2026-000042`.
Regex: `^TKT-\d{4}-\d{6}$`.

## `GET /api/categories`

Returns only **active** categories, `[{ id, name }]`, ordered by `id` ascending.
Inactive categories are intentionally excluded so a ticket form never offers a
choice that `POST /api/tickets` would then reject.

## `GET /api/related-systems`

Same shape and same active-only filtering as `GET /api/categories`:
`[{ id, name }]`, ordered by `id` ascending.

## `GET /api/requesters`

Active Requesters only: `[{ id, name, email }]`, ordered by `id` ascending.
Lab 2 has no real authentication yet, so the client uses this to let the user
pick which Requester they're acting as (see the `Requester` model comment in
`server/prisma/schema.prisma`).

## `POST /api/tickets/:id/attachments`

Multipart upload, fields `requesterId` (text) and `file`. One file per call —
call it again to add more, up to the per-ticket limit.

| Status | When | Body |
|---|---|---|
| `201 Created` | File accepted | The created `Attachment` (`id`, `ticketId`, `originalFilename`, `storedFilename`, `mimeType`, `sizeBytes`, `createdAt`). |
| `400 Bad Request` | Missing/invalid ticket id, missing/invalid `requesterId`, or no file sent | `{ "error": "<message>" }` |
| `403 Forbidden` | `requesterId` doesn't match `ticket.requesterId` (BR-07) | `{ "error": "You do not have permission to add attachments to this ticket." }` |
| `404 Not Found` | `:id` doesn't reference an existing ticket | `{ "error": "Ticket not found." }` |
| `409 Conflict` | Ticket already has 5 attachments | `{ "error": "A ticket can have at most 5 active attachments." }` |
| `413 Payload Too Large` | File over 5MB | `{ "error": "File exceeds the 5MB limit." }` |
| `415 Unsupported Media Type` | Mime type not JPG/PNG/WEBP/PDF | `{ "error": "Unsupported file type. Allowed: JPG, PNG, WEBP, PDF." }` |

Check order: ticket id shape → `requesterId` shape → file present → mime type
→ ticket exists (404) → ownership (403) → attachment count (409). A rejected
file is deleted from disk immediately in every case — nothing is left
orphaned.

## `GET /api/tickets`

The My Tickets list (Feature 4), extended with search, filter, sort, and
pagination (Feature 5) — a Requester's own tickets, ownership-scoped.

### Query parameters

| Query param | Type | Required | Rule |
|---|---|---|---|
| requesterId | integer | yes | must be a positive integer (no active/exists check — an id with zero tickets just returns an empty list) |
| search | string | no | case-insensitive substring match against `summary` OR `description` OR `ticketNumber` |
| categoryId | integer | no | must be a positive integer if present |
| relatedSystemId | integer | no | must be a positive integer if present |
| requestedPriority | string | no | one of `LOW`, `MEDIUM`, `HIGH` if present |
| currentStatus | string | no | exact match, non-empty if present |
| sortBy | string | no | one of `createdAt` (default), `summary`, `requestedPriority` |
| sortDir | string | no | `asc` or `desc` (default `desc`) |
| page | integer | no | positive integer, default `1` |
| pageSize | integer | no | positive integer up to 50, default `10` |

All filters combine with AND (BR-10). Ordering is `sortBy sortDir`, with
`id desc` as a tiebreaker (BR-08).

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | Valid `requesterId` and any other params valid | `{ tickets, pagination }` (shape below, BR-09) |
| `400 Bad Request` | `requesterId` missing/non-integer/`<= 0`, or any other param present but invalid | `{ "error": "<message>" }` |
| `500 Internal Server Error` | Unexpected server/DB failure | `{ "error": "Failed to retrieve tickets" }` |

### Response body

```
{
  "tickets": Ticket[],
  "pagination": {
    "page": number,
    "pageSize": number,
    "totalItems": number,
    "totalPages": number
  }
}
```

Each entry in `tickets` is a full `Ticket` row (no joins/nesting —
`categoryId` etc. are ids, not embedded objects):

| Field | Type | Notes |
|---|---|---|
| id | integer | |
| ticketNumber | string | Format `TKT-<year>-<6-digit sequence>`, e.g. `TKT-2026-000042` (BR-01). |
| requesterId | integer | Always equal to the `requesterId` query param, by construction. |
| categoryId | integer | |
| relatedSystemId | integer | |
| summary | string | ≤ 150 chars (BR-03). |
| description | string | ≤ 2000 chars (BR-03). |
| requestedPriority | string | One of `LOW`, `MEDIUM`, `HIGH` (BR-04). |
| currentStatus | string | `"New"` for every ticket returned by this endpoint today (BR-05) — no status transitions exist yet. |
| createdAt | string | ISO 8601 timestamp. |
| updatedAt | string | ISO 8601 timestamp. |

`pagination.totalItems` is the count of tickets matching `requesterId` plus
any filters/search, independent of `page`/`pageSize`; `totalPages` is
`ceil(totalItems / pageSize)`, minimum `1`.

Example response for
`GET /api/tickets?requesterId=1&search=battery&sortBy=summary&sortDir=asc&page=1&pageSize=10`:

```json
{
  "tickets": [
    {
      "id": 42,
      "ticketNumber": "TKT-2026-000042",
      "requesterId": 1,
      "categoryId": 2,
      "relatedSystemId": 1,
      "summary": "Laptop battery drains quickly",
      "description": "Battery drains much faster than usual, even when idle.",
      "requestedPriority": "MEDIUM",
      "currentStatus": "New",
      "createdAt": "2026-09-04T10:12:03.000Z",
      "updatedAt": "2026-09-04T10:12:03.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

**Breaking change from Feature 4**: the `200` body used to be a bare
`Ticket[]`. It's now `{ tickets, pagination }` — Feature 4's own tests were
updated to match in the same change that added this (see
[tests.md](tests.md)), since Feature 4 hadn't shipped to `main` yet when
Feature 5 was built.

## `GET /api/tickets/:id`

The Ticket Detail screen (Feature 6) — one ticket's full fields, ownership
checked the same way as `POST /api/tickets/:id/attachments` (BR-07).
Attachments are **not** part of this response — that's Feature 7.

### Query parameters

| Query param | Type | Required | Rule |
|---|---|---|---|
| requesterId | integer | yes | must be a positive integer; must match the ticket's `requesterId` |

### Responses

| Status | When | Body |
|---|---|---|
| `200 OK` | `:id` exists and `requesterId` matches its owner | The full `Ticket` (same field shape as an entry in `GET /api/tickets`'s `tickets` array — see above) |
| `400 Bad Request` | `:id` not a positive integer, or `requesterId` missing/non-integer/`<= 0` | `{ "error": "<message>" }` |
| `403 Forbidden` | `:id` exists but `requesterId` doesn't match its owner (BR-11) | `{ "error": "You do not have permission to view this ticket." }` |
| `404 Not Found` | `:id` doesn't reference an existing ticket | `{ "error": "Ticket not found." }` |
| `500 Internal Server Error` | Unexpected server/DB failure | `{ "error": "Failed to retrieve ticket" }` |

Check order: `:id` shape → `requesterId` shape → ticket exists (404) →
ownership (403) — same order attachments use, existence before ownership so
a non-owner can't distinguish "doesn't exist" from "not yours" by response
shape alone (both are meaningfully different statuses here, unlike some APIs
that collapse them to 404 for privacy; this one intentionally doesn't, since
there's no sensitive data to hide by ticket id existing or not).

Example response for `GET /api/tickets/42?requesterId=1`:

```json
{
  "id": 42,
  "ticketNumber": "TKT-2026-000042",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 1,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drains much faster than usual, even when idle.",
  "requestedPriority": "MEDIUM",
  "currentStatus": "New",
  "createdAt": "2026-09-04T10:12:03.000Z",
  "updatedAt": "2026-09-04T10:12:03.000Z"
}
```
