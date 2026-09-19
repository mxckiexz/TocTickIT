# Lab 2 — Reviewer Log

**Reviewer:** [Thanwarat1303](https://github.com/Thanwarat1303) (classmate peer reviewer for this sprint)
**Author:** [mxckiexz](https://github.com/mxckiexz)
**Repository:** [mxckiexz/TocTickIT](https://github.com/mxckiexz/TocTickIT)

Every feature branch in this sprint went through at least one round of
review from Thanwarat1303 before merging into `Lab02-staging`, following
the required branch flow (feature branch → PR → peer review → merge).
This file is generated from the repository's actual PR review history
(`gh pr view <n> --json reviews` / `gh api .../pulls/<n>/reviews`) — every
quote below is the reviewer's or author's real comment, not paraphrased.

## Summary

| Feature | PR | Review rounds | Final status |
|---|---|---|---|
| 1 — Create an IT support ticket | [#9](https://github.com/mxckiexz/TocTickIT/pull/9) | 1 changes-requested → approved | Merged |
| 2 — Upload permitted supporting attachments | [#11](https://github.com/mxckiexz/TocTickIT/pull/11) | Approved first pass | Merged |
| 3 — Receive a unique Ticket Number | [#12](https://github.com/mxckiexz/TocTickIT/pull/12) → fixes in [#15](https://github.com/mxckiexz/TocTickIT/pull/15) | 1 changes-requested → approved (in follow-up PR) | Merged |
| 4 — View own tickets in My Tickets | [#16](https://github.com/mxckiexz/TocTickIT/pull/16) | 3 changes-requested → approved | Merged |
| 5 — Search, filter, sort, and page through tickets | [#17](https://github.com/mxckiexz/TocTickIT/pull/17) | 1 changes-requested → approved | Merged |
| 6 — Open a Ticket Detail screen | [#18](https://github.com/mxckiexz/TocTickIT/pull/18) | 1 changes-requested → approved | Merged |
| 7 — Inspect ticket information and attachments | [#19](https://github.com/mxckiexz/TocTickIT/pull/19) | 1 changes-requested → approved | Merged |
| 8 — Add a permitted attachment to an existing ticket | [#20](https://github.com/mxckiexz/TocTickIT/pull/20) | 1 changes-requested → approved (via follow-up comment) | Merged |
| 9 — Remove one of a Requester's own attachments (soft removal) | [#21](https://github.com/mxckiexz/TocTickIT/pull/21) | 1 changes-requested → approved | Merged |

## PR #9 — Feature 1: Create an IT support ticket

**Reviewer (changes requested):**
> I found one issue in the test cleanup. `ticket.deleteMany()` deletes every ticket in the database after each test, including tickets that were not created by this test file.
> Could you change it so the tests delete only the tickets they created, or use a separate test database? Then I can review it again. Thanks you!

**Author's response:** scoped the test cleanup to only the tickets created by that test file, and replied "I already fixed. please check again".

**Reviewer (approved):** "okay kub"

## PR #11 — Feature 2: Upload permitted supporting attachments

**Reviewer (approved on first pass):**
> I reviewed the attachment upload part. I checked the ownership check, allowed file types, 5 MB limit, five-file limit per ticket, metadata saving, and cleanup for rejected uploads. Everything looks good for the scope of this PR. The other attachment features can be added in later PRs. Nice work, approved kub

## PR #12 → #15 — Feature 3: Receive a unique Ticket Number

**Reviewer (changes requested, PR #12):**
> 1. Attachment ownership: `POST /api/tickets/:id/attachments` checks whether the ticket exists, but it does not verify that the selected requester owns that ticket. Please pass the requester identity and check it against `ticket.requesterId`. Please also add a test for uploading to another requester's ticket.
> 2. Development Requester flow: the requester dropdown is currently inside the Create Ticket form. The lab requires a separate Development Requester selection first, then the selected requester should stay active while creating tickets. Please add that flow, or clearly link it to a separate feature if it will be implemented there.

**Author's response:** added the ownership check (BR-07) with a rejection test, and reworked the Requester selection into its own step (`DevRequesterPicker`) that stays active across ticket creation (AC-05) — delivered as follow-up PR #15 since #12 had already merged by the time the fix was ready.

**Reviewer (approved, PR #15):**
> I checked both requested fixes. The attachment API now verifies the selected requester against the ticket owner, rejects non-owner uploads with 403, and has tests confirming that no attachment record is created. The Development Requester selection is now a separate step, stays active across ticket creation and page reloads, and can be changed using Switch requester. The Create Ticket form also uses the active requester instead of asking for it again. Everything looks good for this PR. Just remember to bring these fixes into the Feature 4 branch after this is merged. Approved.

## PR #16 — Feature 4: View own tickets in My Tickets

Three review rounds:

**Round 1 (changes requested):**
> There are just a couple of things to update before I approve:
> - `specification.md` still says it only covers Features 1–3.
> - `api-spec.md` does not include the `GET /api/tickets` contract yet.
> - `tests.md` still shows 24 backend tests and does not include the six new My Tickets tests.
> - Please consider adding `id DESC` as a secondary sort after `createdAt DESC`, so the order stays predictable when two tickets have the same timestamp.

**Round 2 (changes requested):**
> - AC-06 should be written in explicit Given–When–Then format.
> - `api-spec.md` currently says `Ticket[]`, but it should list the actual response fields and their types.
> - `tests.md` still needs the required Planned-Test Table and an AC-to-test traceability matrix.
> - The empty-list test assumes that the third seeded requester has no tickets. Please use a dedicated requester fixture so the test remains reliable even when the database already contains tickets.

**Round 3 (changes requested):**
> 1. The planned-test tables still use only `ID | Scenario | Expected Result | Result`. The labsheet requires columns for Test ID, Type, Requirement/AC, What It Tests, Expected Result, Automated Test File, and Final. Please update the table format so those details are included.
> 2. The dedicated `no-tickets-fixture` Requester is created in `beforeAll`, but it is not removed in `afterAll`. Please delete that Requester after deleting the test tickets so the test does not leave fixture data in the database.

**Reviewer (approved):** "Everything looks good for the scope of Feature 4 เริ่ดคั้บ approve"

## PR #17 — Feature 5: Search, filter, sort, and page through tickets

**Reviewer (changes requested):**
> Could you please add a Status filter to the My Tickets page? The API already supports `currentStatus`, and AC-07 includes it, but the UI currently only has Category, Related System, and Priority filters. Please add an "All statuses" option and at least the current `New` status, then add a client test for it. Also, the API supports searching by ticket number, but the automated tests currently cover summary and description searches only. Please add one test for ticket number search as well.

**Author's response:** added the Status filter (with "All statuses" + "New") and a client test for it, plus a backend test for ticket-number search.

**Reviewer (approved):** "The Status filter is now available in My Tickets and correctly sends `currentStatus=New` to the API. The ticket number search test was also added, and the docs/test plan match the implementation. Everything looks good now. Approved!"

## PR #18 — Feature 6: Open a Ticket Detail screen

**Reviewer (changes requested):**
> 1. Please add one API test for an invalid non-numeric requesterId, for example `requesterId=abc`, and confirm it returns 400.
> 2. The Back navigation test currently confirms that the ticket list returns, but it does not verify that the previous search/filter/sort/page state is kept. Please make the test use a non-default list state, open a ticket, go back, and verify that state is still applied.

**Reviewer (approved):** "Rechecked the updates for Feature 6. The invalid `requesterId` case now correctly returns 400, and the Back-navigation test properly verifies that the previous search, category filter, and sort state are preserved without an extra ticket-list fetch. Everything looks good now. Approved 👍"

## PR #19 — Feature 7: Inspect ticket information and attachments

**Reviewer (changes requested):**
> - The list endpoint currently returns `storedFilename`, which is an internal server-side filename. Please return only public attachment metadata.
> - The `Content-Disposition` header may not preserve filenames with spaces or non-ASCII characters correctly. Please use a proper UTF-8 filename format.
> - Please add `id` as a secondary ascending sort so oldest-first ordering stays predictable when two attachments have the same `createdAt`.
> - The integration tests delete the database rows but leave the uploaded files in `server/uploads`. Please clean up those files in `afterAll`.
> - It would also be good to add a `requesterId=abc` test to confirm the documented 400 response.
> Soft removal can remain in the next feature as documented, but it must eventually retain metadata and block removed-file downloads.

This last note became the concrete spec basis for Feature 9's BR-14.

**Reviewer (approved):** "All five review points have been addressed. The list endpoint now returns only public metadata, filename handling supports spaces and UTF-8 names, ordering has a stable ID tiebreaker, uploaded test files are cleaned up, and the new validation tests cover the requested cases. Everything looks good now. Approved 👍"

## PR #20 — Feature 8: Add a permitted attachment to an existing ticket

**Reviewer (changes requested):**
> One small test improvement before I approve: F30 says the existing attachment list stays unchanged when an upload fails, but the current test starts with an empty list. Could you make that test start with one existing attachment and verify that it is still shown after the upload error? That would prove the stated behavior directly.

**Author's response:** rewrote F30 to start from one existing attachment and assert it's still shown (plus that `fetchTicketAttachments` wasn't called again), and replied "Ready for another look 🙏" — approved via the follow-up conversation before merge.

## PR #21 — Feature 9: Remove one of a Requester's own attachments (soft removal)

**Reviewer (changes requested):**
> 1. Removed attachments disappear entirely — should still be visible as metadata. The labsheet explicitly says: "A removed Attachment remains visible as metadata but cannot be downloaded." Right now `GET /api/tickets/:id/attachments` filters with `removedAt: null`, so a removed attachment vanishes from both the API response and the UI — as if it never existed. That doesn't match the example the handout gives.
> 2. No removal-reason handling at all. Section 4.5 of the handout asks you to define "confirmation and removal-reason requirements." Right now there's only a `window.confirm()` — no reason is captured anywhere.
> 3. (Nitpick) `window.confirm()` doesn't match the Zen Green theme.

**Author's response:** fixed the list endpoint to include removed attachments (with `removedAt`/`removalReason`), rendered them as struck-through rows in `TicketDetail`, added an optional `removalReason` field end-to-end, and replaced the native confirm with an in-app modal — addressing all 3 points including the nitpick.

**Reviewer (approved):** "ok, approve"

## Overall reflection

Every feature went through real, substantive review — nothing merged
without at least one round of feedback, and several (Feature 3, 4, 7, 9)
had review comments that changed the actual design (ownership checks
added after being missed, the Development Requester flow reworked into
its own step, `storedFilename` leakage caught, soft-removal's list
visibility corrected against the handout's own wording). The review
history above is preserved as-is in each PR's conversation on GitHub —
this file only reproduces it for the submission PDF.
