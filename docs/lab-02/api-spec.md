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

The My Tickets list (Feature 4) — a Requester's own tickets, ownership-scoped.

| Query param | Type | Required | Rule |
|---|---|---|---|
| requesterId | integer | yes | must be a positive integer (no active/exists check — an id with zero tickets just returns `[]`) |

| Status | When | Body |
|---|---|---|
| `200 OK` | Valid `requesterId` | `Ticket[]` — only rows where `ticket.requesterId` matches, ordered by `createdAt desc, id desc` (BR-08). `[]` if the Requester has no tickets. |
| `400 Bad Request` | `requesterId` missing, non-integer, or `<= 0` | `{ "error": "requesterId is required." }` |
| `500 Internal Server Error` | Unexpected server/DB failure | `{ "error": "Failed to retrieve tickets" }` |

**Deferred to Feature 5** (not implemented here): search, filtering, sort
options other than the fixed order above, and pagination. This endpoint
always returns the Requester's complete ticket list in one response.
