# Lab 2 / Feature 1 — API Spec

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
