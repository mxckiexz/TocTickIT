# Lab 2 — Create an IT Support Ticket — Specification

> Kept as the source of truth to check the API/tests against — update this file
> first when the contract changes, then update the code and tests to match.
> Covers Feature 1 (`POST /api/tickets`), Feature 2 (attachment upload),
> Feature 3 (the ticket-creation UI that ties both into one flow),
> Feature 4 (`GET /api/tickets`, the My Tickets list), and Feature 5
> (search, filter, sort, and pagination on that same endpoint).

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
  own ticket list, ownership-scoped and newest first.
- **Feature 5** (`feature5`): search, filter, sort, and pagination on
  `GET /api/tickets`, plus the `MyTickets` React view that uses them. The
  response shape changed from a bare `Ticket[]` (Feature 4) to
  `{ tickets, pagination }` (BR-09) — Feature 4's own tests were updated in
  the same change to match, since this endpoint didn't ship to `main` between
  the two features.

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
- **AC-07** (Feature 5) — search, filter, sort, and pagination, Given–When–Then:
  - **Given** a Requester has tickets whose summary, description, or ticket
    number contains a term, **when** they call `GET /api/tickets` with that
    term as `search`, **then** only those tickets are returned (case-insensitive).
  - **Given** a Requester has tickets across more than one Category, Related
    System, or Requested Priority, **when** they call `GET /api/tickets` with
    `categoryId`, `relatedSystemId`, `requestedPriority`, and/or
    `currentStatus`, **then** only tickets matching every supplied filter are
    returned.
  - **Given** a Requester has more tickets than fit on one page, **when** they
    call `GET /api/tickets` with `page`/`pageSize`, **then** the response's
    `tickets` array holds only that page's rows and `pagination` reports the
    correct `page`, `pageSize`, `totalItems`, and `totalPages` — no ticket is
    skipped or duplicated across consecutive pages.
  - **Given** any caller, **when** `sortBy`, `sortDir`, `page`, or `pageSize`
    is present but invalid (unsupported field/direction, non-positive, or
    `pageSize` over the max), **then** the response is `400`.

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
- **BR-08 — My Tickets ordering**: `GET /api/tickets` orders by the chosen
  `sortBy`/`sortDir` (default `createdAt desc`), with `id desc` as a
  tiebreaker so the order stays predictable when two tickets share the
  sorted-on value (e.g. the same `createdAt` millisecond, or an equal
  `summary`/`requestedPriority`).
- **BR-09 — My Tickets response envelope** (Feature 5): `GET /api/tickets`
  returns `{ tickets: Ticket[], pagination: { page, pageSize, totalItems,
  totalPages } }`, not a bare array. `pageSize` defaults to 10 and is capped
  at 50; `page` defaults to 1.
- **BR-10 — My Tickets search/filter fields** (Feature 5): `search` matches
  (case-insensitive, substring) against `summary`, `description`, or
  `ticketNumber`. `categoryId`, `relatedSystemId`, `requestedPriority`, and
  `currentStatus` each narrow the result set when supplied; omitted filters
  place no constraint. All filters combine with AND.

See [api-spec.md](api-spec.md) for the exact request/response contract and
[tests.md](tests.md) for how each rule is covered by tests.
