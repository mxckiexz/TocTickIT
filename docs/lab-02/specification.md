# Lab 2 — Create an IT Support Ticket — Specification

> Kept as the source of truth to check the API/tests against — update this file
> first when the contract changes, then update the code and tests to match.
> Covers Feature 1 (`POST /api/tickets`), Feature 2 (attachment upload),
> Feature 3 (the ticket-creation UI that ties both into one flow), and
> Feature 4 (`GET /api/tickets`, the My Tickets list).

## Scope

- **Feature 1** (`feature/1-create-an-IT-support-ticket`): backend only,
  `POST /api/tickets`.
- **Feature 2** (`feature/2-upload-permitted-supporting-attachments`): backend
  only, `POST /api/tickets/:id/attachments`.
- **Feature 3** (`feature3`, `feature3-fixes`): the client-side ticket-creation
  form — `GET /api/related-systems` and `GET /api/requesters` (new lookup
  endpoints the form needs), plus the React form itself, so a Requester can
  actually fill in a ticket, optionally attach one supporting file, submit,
  and see the unique Ticket Number that comes back. See [ui-spec.md](ui-spec.md).
- **Feature 4** (`feature4`): backend only, `GET /api/tickets` — a Requester's
  own ticket list, ownership-scoped and newest first. Search, filtering,
  sorting options, and pagination are **explicitly deferred to Feature 5** —
  this endpoint always returns the full list for the given `requesterId`, in
  one fixed order.

## Entities

| Entity | Fields | Notes |
|---|---|---|
| Requester | id, name, email, isActive | Stands in for authentication until Lab 3. Only an active Requester may submit a ticket. |
| Category | id, name, isActive | Seeded: Account and Access, Hardware, Software, Network. Only an active Category may be used. |
| RelatedSystem | id, name, isActive | Seeded: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop. Only an active RelatedSystem may be used. |
| Ticket | id, ticketNumber, requesterId, categoryId, relatedSystemId, summary, description, requestedPriority, currentStatus, createdAt, updatedAt | Created via `POST /api/tickets`. |

## Acceptance Criteria

- **AC-01**: Submitting a valid ticket creates a `Ticket` row and returns it with a
  unique, backend-generated `ticketNumber`.
- **AC-02**: Submitting with missing/invalid required fields returns field-level
  validation errors and creates no row.
- **AC-03**: Submitting with a Requester, Category, or RelatedSystem that is
  inactive or does not exist is rejected.
- **AC-04** (Feature 3): a Requester can fill in and submit the ticket form in
  the browser — picking Category/Related System from real data, optionally
  attaching one supporting file — and sees the unique Ticket Number displayed
  on success.
- **AC-05** (Feature 3, added on review): before reaching the ticket form, the
  user picks a Development Requester in a separate step. That choice stays
  active — reused for every ticket created and every attachment uploaded in
  the session — until the user explicitly switches. The Requester field is
  not part of the ticket form itself.
- **AC-06** (Feature 4) — My Tickets list, Given–When–Then:
  - **Given** a Requester has one or more tickets in the system,
    **when** they call `GET /api/tickets` with their own `requesterId`,
    **then** the response is `200` and contains only tickets whose
    `requesterId` matches theirs — no ticket belonging to another Requester
    appears, ordered `createdAt desc, id desc` (BR-08).
  - **Given** a Requester has no tickets, **when** they call `GET /api/tickets`
    with their own `requesterId`, **then** the response is `200` with an
    empty array — not an error.
  - **Given** any caller, **when** `requesterId` is missing or not a positive
    integer, **then** the response is `400` and no ticket data is returned.

## Business Rules

- **BR-01 — Ticket Number**: backend-generated, format `TKT-<year>-<6-digit
  sequence>` (e.g. `TKT-2026-000042`), unique, never supplied by the client.
- **BR-02 — Duplicate-submission prevention**: if the same Requester resubmits a
  ticket with identical Category, Related System, Summary, Description, and
  Requested Priority within 10 seconds of their prior submission, the API returns
  the ticket that was already created (`200`) instead of inserting a second row.
  This guards against double-clicks and naive client retries; it is not a
  substitute for a client-side "submitting…" disabled-button state, which should
  still be added when the ticket form is built.
- **BR-03 — Field limits**: `summary` ≤ 150 characters, `description` ≤ 2000
  characters, both required and not whitespace-only.
- **BR-04 — Requested Priority**: one of `LOW`, `MEDIUM`, `HIGH`.
- **BR-05 — Initial status**: every new ticket starts with `currentStatus: "New"`.
- **BR-06 — Ids must be positive**: `requesterId`/`categoryId`/`relatedSystemId`
  of `0` (or negative) are rejected as "required", not treated as a valid
  reference. Found while building the Feature 3 form: an unselected `<select>`
  coerces to `0` via `Number("")`, which a bare `Number.isInteger()` check let
  through.
- **BR-07 — Attachment ownership**: `POST /api/tickets/:id/attachments` must
  be called with the `requesterId` of the Requester adding the file, and it is
  rejected with `403` unless it matches `ticket.requesterId` — one Requester
  cannot attach a file to another Requester's ticket. Added on peer review;
  before this fix the endpoint only checked that the ticket existed.
- **BR-08 — My Tickets ordering**: `GET /api/tickets` orders by `createdAt
  desc`, with `id desc` as a tiebreaker, so the order stays predictable when
  two tickets share a `createdAt` (same millisecond, or a clock with lower
  precision). Search, filter, sort options, and pagination are **deferred to
  Feature 5** — not part of this endpoint's contract yet.

See [api-spec.md](api-spec.md) for the exact request/response contract and
[tests.md](tests.md) for how each rule is covered by tests.
