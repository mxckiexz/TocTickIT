# Lab 2 — Test Plan and Evidence

Each test below has a stable ID (`B#` = backend, `F#` = frontend) so it can be
referenced from the AC/BR traceability matrix at the bottom of this file
without repeating the scenario text. "Expected Result" is the plan; "Result"
is what actually happened when it was run — see the run output further down.

## Backend test plan (`server/tests/lab-02/`, Vitest + Supertest against a real Postgres via Prisma)

### `create-ticket.api.test.ts`

| ID | Scenario | Expected Result | Result |
|----|----------|------------------|--------|
| B1 | Valid ticket submission | `201`; response includes a unique `ticketNumber` matching `TKT-\d{4}-\d{6}` | passed |
| B2 | Submission with `{}` (all required fields missing) | `400`; `errors` has one message per missing field | passed |
| B3 | `requesterId`/`categoryId`/`relatedSystemId` sent as `0` | `400`; treated as missing, not as a valid id | passed |
| B4 | `summary` is whitespace only | `400`; `errors.summary` set | passed |
| B5 | `requestedPriority` outside `LOW`/`MEDIUM`/`HIGH` | `400`; `errors.requestedPriority` set | passed |
| B6 | `requesterId` references an inactive Requester | `400`; `errors.requesterId` set | passed |
| B7 | `requesterId` does not exist | `400`; `errors.requesterId` set | passed |
| B8 | `categoryId` references an inactive Category | `400`; `errors.categoryId` set | passed |
| B9 | `relatedSystemId` references an inactive Related System | `400`; `errors.relatedSystemId` set | passed |
| B10 | `summary` at exactly 150 / 151 chars | 150 → `201`; 151 → `400 errors.summary` | passed |
| B11 | `description` at exactly 2000 / 2001 chars | 2000 → `201`; 2001 → `400 errors.description` | passed |
| B12 | Same Requester resubmits identical content within 10s | `200` with the **existing** ticket, no second row created | passed |

### `lookup-lists.api.test.ts` (Feature 3)

| ID | Scenario | Expected Result | Result |
|----|----------|------------------|--------|
| B13 | `GET /api/related-systems` | `200`; only active related systems, ordered by `id` asc | passed |
| B14 | `GET /api/requesters` | `200`; only active requesters, ordered by `id` asc | passed |

### `attachments.api.test.ts` (Feature 2, extended on review with BR-07)

| ID | Scenario | Expected Result | Result |
|----|----------|------------------|--------|
| B15 | Upload a permitted file (owner's `requesterId`) | `201`; returns the `Attachment`, `storedFilename` differs from the original | passed |
| B16 | Upload an unsupported file type | `415` | passed |
| B17 | Upload a file over 5MB | `413` | passed |
| B18 | Upload with no file attached | `400` | passed |
| B19 | Upload with no `requesterId` field | `400` | passed |
| B20 | Upload to a ticket id that does not exist | `404` | passed |
| B21 | Upload with a `requesterId` that does not own the ticket | `403`; no `Attachment` row created | passed |
| B22 | Upload a 6th file to the same ticket | `409` (limit is 5 active attachments) | passed |

### `my-tickets.api.test.ts` (Feature 4)

| ID | Scenario | Expected Result | Result |
|----|----------|------------------|--------|
| B23 | Requester A requests their own tickets | `200`; every returned ticket has `requesterId === A`, Requester B's ticket is absent | passed |
| B24 | Requester B requests their own tickets | `200`; contains B's ticket, not Requester A's | passed |
| B25 | Requester A has 2+ tickets created at different times | `200`; `createdAt` strictly descending | passed |
| B26 | Two tickets share the exact same `createdAt` (set explicitly in the fixture) | `200`; the higher `id` sorts first (BR-08 tiebreak) | passed |
| B27 | A Requester with zero tickets (dedicated fixture, not a "found to currently have none" seeded row) requests their list | `200`; `[]` | passed |
| B28 | `requesterId` query param omitted | `400` | passed |
| B29 | `requesterId=0` | `400` | passed |

Run with:

```bash
cd server && npm run test
```

```
 ✓ tests/lab-01/health.test.ts (1 test)
 ✓ tests/lab-01/categories.test.ts (1 test)
 ✓ tests/lab-02/lookup-lists.api.test.ts (2 tests)
 ✓ tests/lab-02/my-tickets.api.test.ts (7 tests)
 ✓ tests/lab-02/attachments.api.test.ts (8 tests)
 ✓ tests/lab-02/create-ticket.api.test.ts (12 tests)

 Test Files  6 passed (6)
      Tests  31 passed (31)
```

## Frontend test plan (`client/tests/lab-02/create-ticket-form.test.tsx`, Vitest + React Testing Library)

| ID | Scenario | Expected Result | Result |
|----|----------|------------------|--------|
| F1 | App renders, nothing clicked yet | `fetchCategories`/`fetchRequesters`/etc. are never called | passed |
| F2 | Click "New Ticket" with no active Requester | Development Requester picker shown first; ticket form (and its Requester field) not shown yet | passed |
| F3 | Pick a Requester, fill the form, submit | `createTicket` called with that Requester's id; returned `ticketNumber` displayed | passed |
| F4 | Click "Create another ticket" after a successful submission | Same Requester still active — no re-prompt | passed |
| F5 | Click "Switch requester" | Returns to the Development Requester picker | passed |
| F6 | Submit while the request is in flight | Submit button reads "Submitting…" and is disabled until it resolves | passed |
| F7 | `createTicket` rejects with field errors | Errors shown inline per field; no ticket-created state shown | passed |
| F8 | Submit with a file attached | `uploadAttachment` called with `(ticketId, requesterId, file)` after the ticket is created | passed |
| F9 | `uploadAttachment` rejects | Ticket Number still shown; a warning about the failed attachment is shown alongside it | passed |

Run with:

```bash
cd client && npm run test
```

```
 ✓ tests/lab-01/App.test.tsx (3 tests)
 ✓ tests/lab-02/create-ticket-form.test.tsx (9 tests)

 Test Files  2 passed (2)
      Tests  12 passed (12)
```

## AC / BR → Test traceability matrix

| Acceptance Criterion / Business Rule | Covered by |
|---|---|
| AC-01 — unique Ticket Number on valid submission | B1 |
| AC-02 — field-level errors on invalid/missing submission | B2, B3, F7 |
| AC-03 — inactive/nonexistent Requester, Category, or Related System rejected | B6, B7, B8, B9 |
| AC-04 — Requester fills in and submits the ticket form, sees the Ticket Number | F3 |
| AC-05 — Development Requester picked first, stays active across ticket creations | F2, F4, F5 |
| AC-06 — My Tickets returns only the caller's own tickets (incl. empty list, incl. validation) | B23, B24, B27, B28, B29 |
| BR-01 — Ticket Number format | B1 |
| BR-02 — duplicate-submission prevention (server) / disabled-while-submitting (client) | B12, F6 |
| BR-03 — summary/description length limits | B4, B10, B11 |
| BR-04 — requestedPriority enum | B5 |
| BR-05 — initial `currentStatus: "New"` | B1 (asserted in the response body) |
| BR-06 — ids must be positive, not just present | B3 |
| BR-07 — attachment ownership | B19, B21, F8 |
| BR-08 — My Tickets ordering incl. `id desc` tiebreak | B25, B26 |

## Manual verification

Ran both dev servers and drove the real form in a browser:
- Filled every field with valid data → got `Ticket created successfully. Your
  Ticket Number: TKT-2026-000036`.
- Submitted with everything empty → all six fields showed their own error
  message together in one round trip. This is what surfaced BR-06 — before
  the fix, only the text-field errors showed and the three dropdown errors
  were silently swallowed.
- (Review fixes) Selected "Michael Brown" as the Development Requester,
  created a ticket, saw "Creating as Michael Brown" persist through page
  reload (localStorage) and through "Create another ticket" without
  re-prompting.
- `curl`'d `POST /api/tickets/:id/attachments` with `requesterId` set to a
  Requester who does **not** own the ticket → `403
  {"error":"You do not have permission to add attachments to this ticket."}`,
  and with the actual owner's id → `201` succeeds normally.

## Known gaps (not yet covered)

- No test exercises the `500` paths (DB failure) — would need a mocked Prisma
  client, out of scope for the current integration-test setup.
- No test covers uploading more than one attachment from the form (the
  `<input type="file">` is single-file; multi-file selection during creation
  is not part of this feature).
- `GET /api/tickets` has no search, filter, sort-option, or pagination tests —
  **deferred to Feature 5** (see [specification.md](specification.md) Feature 4
  scope and [api-spec.md](api-spec.md)). This endpoint's own test coverage
  (ownership, ordering incl. the `id desc` tiebreak, empty list, validation)
  is complete for what it currently does.
