# Lab 2 — Test Plan and Evidence

## Backend (`server/tests/lab-02/`, Vitest + Supertest against a real Postgres via Prisma)

`create-ticket.api.test.ts`:

| # | Test | Covers | Result |
|---|------|--------|--------|
| 1 | creates a ticket and returns a unique Ticket Number (AC-01) | AC-01, BR-01 | passed |
| 2 | rejects a submission missing required fields with field-level errors | AC-02 | passed |
| 3 | rejects requesterId/categoryId/relatedSystemId of 0, not just missing | AC-02, BR-06 | passed |
| 4 | rejects a summary that is only whitespace | BR-03 | passed |
| 5 | rejects a requestedPriority outside LOW/MEDIUM/HIGH | BR-04 | passed |
| 6 | rejects an inactive Requester | AC-03 | passed |
| 7 | rejects a requesterId that does not exist | AC-03 | passed |
| 8 | rejects an inactive Category | AC-03 | passed |
| 9 | rejects an inactive Related System | AC-03 | passed |
| 10 | accepts a summary at the 150-character limit and rejects 151 characters | BR-03 boundary | passed |
| 11 | accepts a description at the 2000-character limit and rejects 2001 characters | BR-03 boundary | passed |
| 12 | returns the existing ticket instead of creating a duplicate on resubmission | BR-02 | passed |

`lookup-lists.api.test.ts` (Feature 3):

| # | Test | Result |
|---|------|--------|
| 13 | GET /api/related-systems returns only active related systems in id order | passed |
| 14 | GET /api/requesters returns only active requesters in id order | passed |

`attachments.api.test.ts` (Feature 2, extended on review with BR-07):

| # | Test | Covers | Result |
|---|------|--------|--------|
| 15 | uploads a permitted file and returns its metadata | Feature 2 | passed |
| 16 | rejects an unsupported file type | Feature 2 | passed |
| 17 | rejects a file larger than 5MB | Feature 2 | passed |
| 18 | rejects an upload with no file | Feature 2 | passed |
| 19 | rejects an upload with no requesterId | BR-07 | passed |
| 20 | rejects an upload to a ticket that does not exist | Feature 2 | passed |
| 21 | rejects an upload from a requester who does not own the ticket | BR-07 | passed |
| 22 | rejects a 6th active attachment on the same ticket | Feature 2 | passed |

Run with:

```bash
cd server && npm run test
```

```
 ✓ tests/lab-01/health.test.ts (1 test)
 ✓ tests/lab-01/categories.test.ts (1 test)
 ✓ tests/lab-02/lookup-lists.api.test.ts (2 tests)
 ✓ tests/lab-02/attachments.api.test.ts (8 tests)
 ✓ tests/lab-02/create-ticket.api.test.ts (12 tests)

 Test Files  5 passed (5)
      Tests  24 passed (24)
```

## Frontend (`client/tests/lab-02/create-ticket-form.test.tsx`, Vitest + React Testing Library)

| # | Test | Covers | Result |
|---|------|--------|--------|
| 1 | does not fetch anything until New Ticket is clicked | no side effects until opened | passed |
| 2 | shows the Development Requester picker before the ticket form, and no Requester field inside the form | AC-05 | passed |
| 3 | submits the form as the selected requester and shows the returned unique Ticket Number | AC-04, AC-05 | passed |
| 4 | keeps the same requester active for creating another ticket | AC-05 | passed |
| 5 | returns to the requester picker when Switch requester is clicked | AC-05 | passed |
| 6 | disables the submit button while the request is in flight | BR-02 (client side) | passed |
| 7 | shows field-level errors from a rejected submission without creating a ticket | AC-02 | passed |
| 8 | uploads the selected attachment as the active requester after the ticket is created | BR-07, Feature 2+3 integration | passed |
| 9 | still shows the Ticket Number if the attachment upload fails | graceful degradation | passed |

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
