# Lab 2 — Create an IT Support Ticket — Specification

> Kept as the source of truth to check the API/tests against — update this file
> first when the contract changes, then update the code and tests to match.
> Covers Feature 1 (`POST /api/tickets`), Feature 2 (attachment upload),
> Feature 3 (the ticket-creation UI that ties both into one flow),
> Feature 4 (`GET /api/tickets`, the My Tickets list), Feature 5
> (search, filter, sort, and pagination on that same endpoint), Feature 6
> (`GET /api/tickets/:id`, the Ticket Detail screen), Feature 7
> (inspecting a ticket's attachments from that screen), Feature 8
> (adding a new attachment to an existing ticket from that same screen),
> and Feature 9 (soft-removing one of a Requester's own attachments).

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
- **Feature 6** (`feature6`): backend only, `GET /api/tickets/:id` — a single
  ticket's full detail, ownership-scoped the same way as Feature 4's list,
  plus the `TicketDetail` React view reached by clicking a ticket in My
  Tickets. Attachments on this screen are **deferred to Feature 7** — this
  endpoint returns the ticket's own fields only, no attachment list.
- **Feature 7** (`feature/7-inspect-ticket-information-and-attachments`):
  backend `GET /api/tickets/:id/attachments` (list) and
  `GET /api/tickets/:id/attachments/:attachmentId` (view/download one file),
  both ownership-scoped the same way as Feature 6 (BR-12). `TicketDetail`
  now shows an Attachments section below the ticket's own fields. Adding a
  new attachment from this screen, and soft-removing one, are **deferred to
  Features 8 and 9**.
- **Feature 8**
  (`feature/8-add-a-permitted-attachment-to-an-existing-ticket;-and`):
  client-only — no backend changes. `TicketDetail` gets an "Add an
  attachment" control below the attachments list, calling the same
  `POST /api/tickets/:id/attachments` Feature 2 already built (type/size/
  count limits and BR-07 ownership were already enforced server-side; this
  feature is purely about reaching that existing endpoint from an
  *existing* ticket's detail screen, as opposed to Feature 3's "attach
  while creating a new ticket" flow). A successful upload refreshes the
  attachments list in place.
- **Feature 9**
  (`feature/9-remove-one-of-their-own-permitted-attachments-using-the-required-soft-removal-rules`):
  `DELETE /api/tickets/:id/attachments/:attachmentId`, ownership-scoped the
  same way as Features 6–8 (BR-14), plus a "Remove" control per attachment
  on `TicketDetail` with an in-app confirmation modal (not a native
  browser popup) carrying an optional removal-reason field (BR-15). As
  flagged during Feature 7's review, removal is a **soft** removal: the
  `Attachment` row is kept (`removedAt`, and now `removalReason`, set
  instead of the row being deleted) so its metadata stays visible in the
  list — the download endpoint and the upload endpoint's active-count
  check are what actually treat a removed attachment as gone, freeing a
  slot for a new upload.

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
- **AC-08** (Feature 6) — Ticket Detail screen, Given–When–Then:
  - **Given** a Requester owns a ticket, **when** they call
    `GET /api/tickets/:id` with their own `requesterId`, **then** the
    response is `200` with that ticket's full fields.
  - **Given** a Requester does not own a ticket that exists, **when** they
    call `GET /api/tickets/:id` with their own `requesterId`, **then** the
    response is `403` and no ticket data is returned (BR-11).
  - **Given** any caller, **when** `:id` does not reference an existing
    ticket, **then** the response is `404`.
  - **Given** any caller, **when** `:id` is not a positive integer or
    `requesterId` is missing/not a positive integer, **then** the response
    is `400`.
  - **Given** a Requester viewing My Tickets, **when** they click a ticket's
    number, **then** the Ticket Detail screen opens for that ticket, and a
    "Back to My Tickets" control returns to the list with its previous
    search/filter/sort/page state intact.
- **AC-09** (Feature 7) — Inspect a ticket's attachments, Given–When–Then:
  - **Given** a Requester owns a ticket with one or more attachments,
    **when** they call `GET /api/tickets/:id/attachments` with their own
    `requesterId`, **then** the response is `200` with that ticket's
    attachments (metadata only), oldest first.
  - **Given** a Requester owns a ticket with no attachments, **when** they
    call the same endpoint, **then** the response is `200` with `[]`.
  - **Given** a Requester owns a ticket and one of its attachments, **when**
    they call `GET /api/tickets/:id/attachments/:attachmentId` with their
    own `requesterId`, **then** the response is `200` with that file's
    bytes and its original `mimeType`.
  - **Given** any caller, **when** the `requesterId` does not match the
    ticket's owner (BR-12), **then** both endpoints respond `403`.
  - **Given** any caller, **when** `:attachmentId` exists but belongs to a
    *different* ticket than `:id`, **then** the download endpoint responds
    `404` — the same as if it didn't exist at all.
  - **Given** a Requester viewing the Ticket Detail screen, **when** it
    finishes loading, **then** an Attachments section lists each file as a
    link that opens/downloads it, or states there are none.
- **AC-10** (Feature 8) — Add an attachment from Ticket Detail, Given–When–Then:
  - **Given** a Requester is viewing one of their own tickets with fewer
    than 5 active attachments, **when** they pick a permitted file and
    submit the "Add an attachment" control, **then** the file is uploaded
    via `POST /api/tickets/:id/attachments`, and the Attachments section
    refreshes to include it.
  - **Given** the upload is rejected (wrong type, too large, or the ticket
    already has 5 attachments), **when** that happens, **then** the API's
    own error message is shown and the attachments list is left unchanged.
  - **Given** a ticket already has 5 attachments, **when** the Requester
    views its detail screen, **then** the file input and Upload button are
    disabled and a message explains the limit is reached — a client-side
    convenience only; the server's `409` remains the actual enforcement.
- **AC-11** (Feature 9) — Remove one of a Requester's own attachments,
  Given–When–Then:
  - **Given** a Requester owns a ticket and one of its active attachments,
    **when** they call `DELETE /api/tickets/:id/attachments/:attachmentId`
    with their own `requesterId`, **then** the response is `200`, the
    attachment's `removedAt` is set, its row is retained, and its physical
    file is deleted from disk (BR-14).
  - **Given** an attachment has been removed, **when** anyone calls the
    download endpoint or the upload endpoint's active-count check for that
    ticket, **then** the removed attachment is treated as gone for those
    two purposes — its download `404`s and it does not count toward the
    5-active-attachment limit — but it is **not** hidden from the list
    endpoint: `GET /api/tickets/:id/attachments` still returns it, with a
    non-null `removedAt`, matching the handout's own example ("A removed
    Attachment remains visible as metadata but cannot be downloaded").
  - **Given** any caller, **when** the `requesterId` does not match the
    ticket's owner, **then** the response is `403` and the attachment is
    left untouched.
  - **Given** any caller, **when** `:attachmentId` does not exist, belongs
    to a different ticket than `:id`, or is already removed, **then** the
    response is `404`.
  - **Given** a request body includes an optional `reason` string, **when**
    the removal succeeds, **then** it is stored as the attachment's
    `removalReason` and returned in the response (BR-15); omitting it
    records `null` — a reason is never required.
  - **Given** a Requester viewing the Ticket Detail screen, **when** they
    click "Remove" next to one of their active attachments, **then** an
    in-app confirmation dialog opens (not a native browser popup) with an
    optional reason field; confirming removes the attachment and the
    Attachments section refreshes to show it as a struck-through,
    non-downloadable row instead of disappearing; cancelling makes no API
    call.

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
- **BR-11 — Ticket Detail ownership** (Feature 6): `GET /api/tickets/:id`
  requires `requesterId` and rejects with `403` unless it matches
  `ticket.requesterId` — the same rule as BR-07's attachment ownership,
  applied to viewing a ticket's detail instead of adding a file to it.
- **BR-12 — Inspect-attachments ownership** (Feature 7): both
  `GET /api/tickets/:id/attachments` and
  `GET /api/tickets/:id/attachments/:attachmentId` require `requesterId`
  and reject with `403` unless it matches `ticket.requesterId` — same rule
  as BR-07/BR-11, applied to listing/viewing attachments. The download
  endpoint additionally scopes `:attachmentId` to `:id`'s ticket — an
  attachment id that exists but belongs to a different ticket is `404`, not
  served. The list endpoint also returns **public metadata only** —
  `storedFilename` (the random name a file is actually saved under on
  disk) is never included in its response, unlike the upload endpoint's
  `201` response. Found on review: the list originally returned the same
  shape as the upload response, `storedFilename` included.
- **BR-13 — Inspect-attachments ordering** (Feature 7):
  `GET /api/tickets/:id/attachments` orders by `createdAt asc, id asc` —
  oldest (upload order) first, with `id` as a tiebreaker so the order stays
  predictable when two attachments share a `createdAt` (same reasoning as
  BR-08).

- **BR-14 — Attachment removal ownership and soft-delete rules** (Feature 9):
  `DELETE /api/tickets/:id/attachments/:attachmentId` requires `requesterId`
  and rejects with `403` unless it matches `ticket.requesterId` — same rule
  as BR-07/BR-11/BR-12, applied to removing an attachment. Removal is
  **soft**: the row is never deleted, only its `removedAt` timestamp is
  set, so metadata (original filename, size, upload time, and now
  `removalReason`) is retained for the ticket's history — and, per the
  handout's own example, **stays visible**: `GET /api/tickets/:id/attachments`
  still returns a removed attachment, `removedAt` non-null, alongside active
  ones. The physical file on disk *is* deleted, the download endpoint
  404s for it, and the upload endpoint's active-count check filters on
  `removedAt: null` so a removed attachment frees up a slot in the
  5-active limit — only the list endpoint keeps showing it. Removing an
  already-removed attachment, or one belonging to a different ticket, is
  `404` — indistinguishable from an attachment id that never existed.

  *(Revision note: the first implementation filtered removed attachments
  out of the list endpoint too, treating them as fully gone everywhere.
  Peer review flagged this as inconsistent with the handout's explicit
  example, which describes a removed attachment as visible metadata that
  merely can't be downloaded — fixed as described above.)*

- **BR-15 — Optional removal reason** (Feature 9, handout section 4.5):
  `DELETE /api/tickets/:id/attachments/:attachmentId` accepts an optional
  `reason` string in the JSON request body (not a query param, since it's
  free text rather than an id). It's trimmed, capped at 500 characters
  (`400` if longer), and stored as `removalReason` — `null` when omitted
  or blank. A reason is never required to complete a removal; this is a
  capture-only field with no other behavioral effect (e.g. it isn't
  searchable/filterable anywhere else in the app).

See [api-spec.md](api-spec.md) for the exact request/response contract and
[tests.md](tests.md) for how each rule is covered by tests.
