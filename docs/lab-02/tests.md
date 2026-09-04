# Lab 2 / Feature 1 — Test Plan and Evidence

All tests live in `server/tests/lab-02/create-ticket.api.test.ts` (Vitest +
Supertest, hitting a real Postgres instance via Prisma — see `server/.env`).

| # | Test | Covers | Result |
|---|------|--------|--------|
| 1 | creates a ticket and returns a unique Ticket Number (AC-01) | AC-01, BR-01 | passed |
| 2 | rejects a submission missing required fields with field-level errors | AC-02 | passed |
| 3 | rejects a summary that is only whitespace | BR-03 | passed |
| 4 | rejects a requestedPriority outside LOW/MEDIUM/HIGH | BR-04 | passed |
| 5 | rejects an inactive Requester | AC-03 | passed |
| 6 | rejects a requesterId that does not exist | AC-03 | passed |
| 7 | rejects an inactive Category | AC-03 | passed |
| 8 | rejects an inactive Related System | AC-03 | passed |
| 9 | accepts a summary at the 150-character limit and rejects 151 characters | BR-03 boundary | passed |
| 10 | accepts a description at the 2000-character limit and rejects 2001 characters | BR-03 boundary | passed |
| 11 | returns the existing ticket instead of creating a duplicate on resubmission | BR-02 | passed |

Run with:

```bash
cd server && npm run test
```

```
 ✓ tests/lab-01/health.test.ts (1 test)
 ✓ tests/lab-01/categories.test.ts (1 test)
 ✓ tests/lab-02/create-ticket.api.test.ts (11 tests)

 Test Files  3 passed (3)
      Tests  13 passed (13)
```

## Known gaps (not yet covered)

- No test exercises the `500` path (DB failure) — would need a mocked Prisma
  client, out of scope for the current integration-test setup.
- No client-side test yet, because no ticket-creation UI exists in this branch
  (see [ui-spec.md](ui-spec.md)).
