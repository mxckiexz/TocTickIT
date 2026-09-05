# Lab 2 — Test Plan and Evidence

Each test below has a stable Test ID (`B#` = backend, `F#` = frontend) so it
can be referenced from the AC/BR traceability matrix at the bottom of this
file without repeating the "What It Tests" text. "Expected Result" is the
plan; "Final" is what actually happened when it was run — see the run output
further down for the full suite confirmation.

**Type** classifies each case as **Positive** (valid input, expects success),
**Negative** (invalid input, expects a client error), or **Boundary** (an
exact edge value or limit — e.g. a length cap, a count limit, or an ordering
tiebreak).

## Backend test plan (`server/tests/lab-02/`, Vitest + Supertest against a real Postgres via Prisma)

### `create-ticket.api.test.ts`

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| B1 | Positive | AC-01, BR-01, BR-05 | Valid ticket submission | `201`; unique `ticketNumber` matching `TKT-\d{4}-\d{6}`; `currentStatus: "New"` | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B2 | Negative | AC-02 | Submission with `{}` (all required fields missing) | `400`; `errors` has one message per missing field | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B3 | Negative | AC-02, BR-06 | `requesterId`/`categoryId`/`relatedSystemId` sent as `0` | `400`; treated as missing, not as a valid id | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B4 | Negative | BR-03 | `summary` is whitespace only | `400`; `errors.summary` set | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B5 | Negative | BR-04 | `requestedPriority` outside `LOW`/`MEDIUM`/`HIGH` | `400`; `errors.requestedPriority` set | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B6 | Negative | AC-03 | `requesterId` references an inactive Requester | `400`; `errors.requesterId` set | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B7 | Negative | AC-03 | `requesterId` does not exist | `400`; `errors.requesterId` set | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B8 | Negative | AC-03 | `categoryId` references an inactive Category | `400`; `errors.categoryId` set | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B9 | Negative | AC-03 | `relatedSystemId` references an inactive Related System | `400`; `errors.relatedSystemId` set | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B10 | Boundary | BR-03 | `summary` at exactly 150 / 151 chars | 150 → `201`; 151 → `400 errors.summary` | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B11 | Boundary | BR-03 | `description` at exactly 2000 / 2001 chars | 2000 → `201`; 2001 → `400 errors.description` | `server/tests/lab-02/create-ticket.api.test.ts` | passed |
| B12 | Positive | BR-02 | Same Requester resubmits identical content within 10s | `200` with the **existing** ticket, no second row created | `server/tests/lab-02/create-ticket.api.test.ts` | passed |

### `lookup-lists.api.test.ts` (Feature 3)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| B13 | Positive | Feature 3 | `GET /api/related-systems` | `200`; only active related systems, ordered by `id` asc | `server/tests/lab-02/lookup-lists.api.test.ts` | passed |
| B14 | Positive | Feature 3 | `GET /api/requesters` | `200`; only active requesters, ordered by `id` asc | `server/tests/lab-02/lookup-lists.api.test.ts` | passed |

### `attachments.api.test.ts` (Feature 2, extended on review with BR-07)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| B15 | Positive | Feature 2 | Upload a permitted file (owner's `requesterId`) | `201`; returns the `Attachment`, `storedFilename` differs from the original | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B16 | Negative | Feature 2 | Upload an unsupported file type | `415` | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B17 | Negative | Feature 2 | Upload a file over 5MB | `413` | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B18 | Negative | Feature 2 | Upload with no file attached | `400` | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B19 | Negative | BR-07 | Upload with no `requesterId` field | `400` | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B20 | Negative | Feature 2 | Upload to a ticket id that does not exist | `404` | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B21 | Negative | BR-07 | Upload with a `requesterId` that does not own the ticket | `403`; no `Attachment` row created | `server/tests/lab-02/attachments.api.test.ts` | passed |
| B22 | Boundary | Feature 2 | Upload a 6th file to the same ticket (limit is 5) | `409` | `server/tests/lab-02/attachments.api.test.ts` | passed |

### `my-tickets.api.test.ts` — core My Tickets (Feature 4)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| B23 | Positive | AC-06 | Requester A requests their own tickets | `200`; every returned ticket has `requesterId === A`, Requester B's ticket is absent | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B24 | Positive | AC-06 | Requester B requests their own tickets | `200`; contains B's ticket, not Requester A's | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B25 | Positive | BR-08 | Requester A has 2+ tickets created at different times | `200`; `createdAt` strictly descending (default sort) | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B26 | Boundary | BR-08 | Two tickets share the exact same `createdAt` (set explicitly in the fixture) | `200`; the higher `id` sorts first (tiebreak) | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B27 | Positive | AC-06 | A Requester with zero tickets (dedicated fixture, cleaned up in `afterAll` — not a "found to currently have none" seeded row) requests their list | `200`; `tickets: []` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B28 | Negative | AC-06 | `requesterId` query param omitted | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B29 | Negative | AC-06 | `requesterId=0` | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B30 | Positive | BR-09 | Any valid request | Response body always has `pagination: { page, pageSize, totalItems, totalPages }` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |

### `my-tickets.api.test.ts` — search, filter, sort, and pagination (Feature 5)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| B31 | Positive | AC-07 | `search` matches a word in `summary` | Only the matching ticket returned | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B32 | Positive | AC-07 | `search` in a different case than stored | Same match as B31 (case-insensitive) | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B33 | Positive | AC-07 | `search` matches a unique term only present in `description` | Only that ticket returned | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B34 | Positive | AC-07 | `search` matches a fixture's own `ticketNumber` | Only that ticket returned | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B35 | Positive | BR-10 | `search` matches nothing | `200`; `tickets: []`, `pagination.totalItems: 0` — not an error | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B36 | Positive | AC-07 | `categoryId` filter | Only tickets in that category | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B37 | Positive | AC-07 | `relatedSystemId` filter | Only tickets on that related system | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B38 | Positive | AC-07 | `requestedPriority` filter | Only tickets at that priority | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B39 | Positive | AC-07 | `currentStatus=New` filter | All fixture tickets (all are `"New"`) | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B40 | Positive | BR-10 | `currentStatus` value no ticket currently has | `200`; `tickets: []` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B41 | Positive | BR-10 | `categoryId` + `search` together | Only tickets matching **both** (AND) | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B42 | Negative | AC-07 | `categoryId=not-a-number` | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B43 | Negative | AC-07 | `requestedPriority=URGENT` | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B44 | Positive | BR-08 | `sortBy=summary&sortDir=asc` | `tickets` alphabetically ascending by `summary` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B45 | Positive | BR-08 | `sortBy=summary&sortDir=desc` | `tickets` alphabetically descending by `summary` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B46 | Negative | AC-07 | `sortBy=id` (not a supported field) | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B47 | Negative | AC-07 | `sortDir=sideways` | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B48 | Positive | BR-09 | 5 tickets, `pageSize=2`, pages 1–3 requested in turn | Pages hold 2, 2, 1 tickets; `pagination` matches on page 1 (`totalItems:5, totalPages:3`); the 5 ids across all 3 pages are all distinct — no gap, no duplicate | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B49 | Negative | AC-07 | `page=0` | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B50 | Negative | AC-07 | `pageSize=51` (over the 50 max) | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |
| B51 | Negative | AC-07 | `pageSize=lots` (non-numeric) | `400` | `server/tests/lab-02/my-tickets.api.test.ts` | passed |

### `ticket-detail.api.test.ts` (Feature 6)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| B52 | Positive | AC-08 | The owning Requester requests a ticket's detail | `200`; full ticket fields returned | `server/tests/lab-02/ticket-detail.api.test.ts` | passed |
| B53 | Negative | AC-08, BR-11 | A different Requester requests the same ticket | `403`; no ticket data returned | `server/tests/lab-02/ticket-detail.api.test.ts` | passed |
| B54 | Negative | AC-08 | `:id` references a ticket that does not exist | `404` | `server/tests/lab-02/ticket-detail.api.test.ts` | passed |
| B55 | Negative | AC-08 | `:id` is not numeric | `400` | `server/tests/lab-02/ticket-detail.api.test.ts` | passed |
| B56 | Negative | AC-08 | `requesterId` query param omitted | `400` | `server/tests/lab-02/ticket-detail.api.test.ts` | passed |
| B57 | Negative | AC-08 | `requesterId=0` | `400` | `server/tests/lab-02/ticket-detail.api.test.ts` | passed |

Run with:

```bash
cd server && npm run test
```

```
 ✓ tests/lab-01/health.test.ts (1 test)
 ✓ tests/lab-01/categories.test.ts (1 test)
 ✓ tests/lab-02/lookup-lists.api.test.ts (2 tests)
 ✓ tests/lab-02/ticket-detail.api.test.ts (6 tests)
 ✓ tests/lab-02/create-ticket.api.test.ts (12 tests)
 ✓ tests/lab-02/attachments.api.test.ts (8 tests)
 ✓ tests/lab-02/my-tickets.api.test.ts (29 tests)

 Test Files  7 passed (7)
      Tests  59 passed (59)
```

## Frontend test plan

### `create-ticket-form.test.tsx` (Vitest + React Testing Library)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| F1 | Positive | Design constraint (no side effects until opened) | App renders, nothing clicked yet | `fetchCategories`/`fetchRequesters`/etc. are never called | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F2 | Positive | AC-05 | Click "New Ticket" with no active Requester | Development Requester picker shown first; ticket form (and its Requester field) not shown yet | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F3 | Positive | AC-04 | Pick a Requester, fill the form, submit | `createTicket` called with that Requester's id; returned `ticketNumber` displayed | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F4 | Positive | AC-05 | Click "Create another ticket" after a successful submission | Same Requester still active — no re-prompt | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F5 | Positive | AC-05 | Click "Switch requester" | Returns to the Development Requester picker | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F6 | Positive | BR-02 (client side) | Submit while the request is in flight | Submit button reads "Submitting…" and is disabled until it resolves | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F7 | Negative | AC-02 | `createTicket` rejects with field errors | Errors shown inline per field; no ticket-created state shown | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F8 | Positive | BR-07 | Submit with a file attached | `uploadAttachment` called with `(ticketId, requesterId, file)` after the ticket is created | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |
| F9 | Negative | Graceful degradation (not a formal AC/BR) | `uploadAttachment` rejects | Ticket Number still shown; a warning about the failed attachment is shown alongside it | `client/tests/lab-02/create-ticket-form.test.tsx` | passed |

### `my-tickets.test.tsx` (Feature 5)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| F10 | Positive | Design constraint (no side effects until opened) | App renders, "My Tickets" not clicked | `fetchTickets` never called | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F11 | Positive | AC-05 | Click "My Tickets" with no active Requester | Same `DevRequesterPicker` as the New Ticket flow (reused, not duplicated) | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F12 | Positive | AC-06 | Pick a Requester | `fetchTickets` called with that Requester's id; list renders, default sort `createdAt desc` | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F13 | Positive | AC-06 | `fetchTickets` resolves with `tickets: []` | "No tickets match your search and filters." shown | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F14 | Positive | AC-07 | Type into the search box | `fetchTickets` is **not** called per keystroke; called once, ~300ms after typing stops, with the final value | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F15 | Positive | AC-07 | Change the category filter | Re-fetches with `categoryId` set and `page` reset to 1 | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F16 | Positive | AC-07, BR-08 | Change the sort dropdown | Re-fetches with the matching `sortBy`/`sortDir` pair | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F17 | Positive | AC-07, BR-09 | Click "Next" then check button state | Re-fetches with `page: 2`; "Previous" enables, "Next" disables once on the last page | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F18 | Positive | AC-07 | On page 2, change a filter | Re-fetches with `page` reset to 1, not still on page 2 | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F19 | Positive | AC-05 | Open "New Ticket" first, then click the "My Tickets" tab | Switches view **without** re-showing the Requester picker — same active Requester carries over | `client/tests/lab-02/my-tickets.test.tsx` | passed |
| F20 | Positive | AC-07 | Change the status filter | "All statuses" option present; re-fetches with `currentStatus: "New"` and `page` reset to 1 | `client/tests/lab-02/my-tickets.test.tsx` | passed |

### `ticket-detail.test.tsx` (Feature 6)

| Test ID | Type | Requirement/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| F21 | Positive | Design constraint (no side effects until opened) | List renders with one ticket, its row not clicked | `fetchTicketDetail` never called | `client/tests/lab-02/ticket-detail.test.tsx` | passed |
| F22 | Positive | AC-08 | Click a ticket's Ticket Number | `fetchTicketDetail` called with `(ticketId, requesterId)`; Summary, Description, Category name, Related System name, and Priority all shown | `client/tests/lab-02/ticket-detail.test.tsx` | passed |
| F23 | Positive | AC-08 | Click "Back to My Tickets" from the detail screen | Returns to the My Tickets list, same ticket row still there | `client/tests/lab-02/ticket-detail.test.tsx` | passed |
| F24 | Negative | AC-08, BR-11 | `fetchTicketDetail` rejects (e.g. a 403) | The API's error message is shown in place of the ticket fields | `client/tests/lab-02/ticket-detail.test.tsx` | passed |

Run with:

```bash
cd client && npm run test
```

```
 ✓ tests/lab-01/App.test.tsx (3 tests)
 ✓ tests/lab-02/create-ticket-form.test.tsx (9 tests)
 ✓ tests/lab-02/my-tickets.test.tsx (11 tests)
 ✓ tests/lab-02/ticket-detail.test.tsx (4 tests)

 Test Files  4 passed (4)
      Tests  27 passed (27)
```

## AC / BR → Test traceability matrix

| Acceptance Criterion / Business Rule | Covered by |
|---|---|
| AC-01 — unique Ticket Number on valid submission | B1 |
| AC-02 — field-level errors on invalid/missing submission | B2, B3, F7 |
| AC-03 — inactive/nonexistent Requester, Category, or Related System rejected | B6, B7, B8, B9 |
| AC-04 — Requester fills in and submits the ticket form, sees the Ticket Number | F3 |
| AC-05 — Development Requester picked first, stays active across ticket creations (and now across New Ticket / My Tickets) | F2, F4, F5, F11, F19 |
| AC-06 — My Tickets returns only the caller's own tickets (incl. empty list, incl. validation) | B23, B24, B27, B28, B29, F12, F13 |
| AC-07 — search, filter, sort, and pagination on My Tickets | B31, B33, B34, B36–B39, B42, B43, B44, B45, B46, B47, B48, B49, B50, B51, F14, F15, F16, F17, F18, F20 |
| AC-08 — Ticket Detail screen, ownership-checked | B52, B53, B54, B55, B56, B57, F22, F23, F24 |
| BR-01 — Ticket Number format | B1 |
| BR-02 — duplicate-submission prevention (server) / disabled-while-submitting (client) | B12, F6 |
| BR-03 — summary/description length limits | B4, B10, B11 |
| BR-04 — requestedPriority enum | B5 |
| BR-05 — initial `currentStatus: "New"` | B1 (asserted in the response body) |
| BR-06 — ids must be positive, not just present | B3 |
| BR-07 — attachment ownership | B19, B21, F8 |
| BR-08 — My Tickets ordering incl. `id desc` tiebreak, extended to whichever `sortBy` is chosen | B25, B26, B44, B45, F16 |
| BR-09 — My Tickets response envelope (`{ tickets, pagination }`) | B30, B48, F17 |
| BR-10 — My Tickets search/filter fields combine with AND | B35, B40, B41, B42, B43 |
| BR-11 — Ticket Detail ownership | B53, F24 |

## Manual verification

Ran both dev servers and drove the real app in a browser:

**Feature 1–4 (from earlier rounds):**
- Filled every field with valid data → got `Ticket created successfully. Your
  Ticket Number: TKT-2026-000036`.
- Submitted with everything empty → all six fields showed their own error
  message together in one round trip (surfaced BR-06).
- Selected "Michael Brown" as the Development Requester, created a ticket,
  saw "Creating as Michael Brown" persist through page reload (localStorage)
  and through "Create another ticket" without re-prompting.
- `curl`'d `POST /api/tickets/:id/attachments` with a non-owning
  `requesterId` → `403`; with the actual owner's id → `201`.

**Feature 5:** created a dozen tickets spread across all 4
categories/related systems and 3 priorities via the API, then drove the real
`MyTickets` view:
- Entry: clicking **My Tickets** from the front screen shows the same
  `DevRequesterPicker` as **New Ticket**; picking "Jennifer Anderson" and
  opening the list shows all her tickets, newest first, with real
  category/related-system names resolved (not raw ids).
- Search: typing `ticket 7` narrowed the table to exactly the one matching
  ticket after the debounce.
- Filter: selecting priority "High" (after clearing the search box) narrowed
  the table to exactly the 3 HIGH-priority tickets.
- Sort: switching to "Summary (A–Z)" re-sorted the table alphabetically;
  confirmed by reading the rendered rows.
- Pagination: with 14 tickets and the default page size of 10, "Page 1 of 2
  (14 tickets)" showed 10 rows; clicking **Next** loaded the remaining 4 and
  disabled **Next** (page 2 of 2).
- Switch requester → back to the picker; picking "No Tickets Fixture" showed
  "No tickets match your search and filters." (the dedicated empty-state
  fixture, not a flaky "currently has none" assumption).
- Test data (the 12 manually-created tickets) was deleted from the DB after
  verification.

**Feature 6 (this round):** with the same active Requester's existing
tickets already in the list:
- Clicked a Ticket Number (`TKT-2026-000036`) → Ticket Detail screen opened
  showing Summary, Description, Category ("Hardware"), Related System
  ("VPN"), Requested Priority ("MEDIUM"), Status ("New"), Created, and Last
  Updated — all correct against what the list row showed.
- Clicked "← Back to My Tickets" → returned to the list with the same rows
  and pagination state as before.
- `curl`'d `GET /api/tickets/:id` directly: the ticket's actual owner
  (`requesterId=1`) → `200` with the full ticket; a different active
  Requester (`requesterId=2`) → `403
  {"error":"You do not have permission to view this ticket."}`.

## Known gaps (not yet covered)

- No test exercises the `500` paths (DB failure) — would need a mocked Prisma
  client, out of scope for the current integration-test setup.
- No test covers uploading more than one attachment from the form (the
  `<input type="file">` is single-file; multi-file selection during creation
  is not part of this feature).
- No test covers combining more than two query params at once (e.g.
  search + category + priority + sort + page all together) — each is tested
  individually and pairwise (B41); a full combination is exercised only in
  manual verification above, not as an automated test.
- `sortBy` only supports `createdAt`, `summary`, and `requestedPriority` —
  sorting by `categoryId`/`relatedSystemId`/`currentStatus` isn't offered (no
  test needed since the API rejects anything outside that list, covered by
  B46).
- `TicketDetail` has no independent route (no router in this app) — there's
  no test (or behavior) for reloading the page while on the detail screen,
  since it isn't expected to preserve state across a reload. Not a gap in
  Feature 6's own contract, just a known limitation of the current
  navigation approach.
- Attachments are not shown on the Ticket Detail screen — intentionally
  deferred to Feature 7 (see [specification.md](specification.md) Feature 6
  scope).
