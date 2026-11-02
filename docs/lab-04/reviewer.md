# Lab 4 — Peer Review Log

**Reviewer:** [Thanwarat1303](https://github.com/Thanwarat1303) (peer reviewer — a different person from the author)  
**Author:** [mxckiexz](https://github.com/mxckiexz)  
**Repository:** [mxckiexz/TocTickIT](https://github.com/mxckiexz/TocTickIT)

Every review round and author response below is quoted verbatim from the pull request itself (`gh pr view <n> --json reviews,comments` and the pull request's inline comments), with GitHub's own timestamps; nothing is paraphrased or reconstructed. Every Lab 4 feature branch went `feature/*` → PR → `lab4-staging`; the release PR is `release/lab4` → `main`. The author's responses were drafted by the AI agent and posted from the author's GitHub account at the author's instruction (see `ai-use.md`).

## Summary

| Feature | PR | Review rounds | Final status | Merged by |
|---|---|---|---|---|
| F1 — Sprint 4 Engineering Contract (issue #58) | [#69](https://github.com/mxckiexz/TocTickIT/pull/69) | 4 changes-requested → approved | Merged | Thanwarat1303 |
| F2 — Actions Taken foundation (data) (issue #59) | [#70](https://github.com/mxckiexz/TocTickIT/pull/70) | approved | Merged | Thanwarat1303 |
| F3 — Actions Taken API (issue #60) | [#71](https://github.com/mxckiexz/TocTickIT/pull/71) | 1 changes-requested → approved | Merged | Thanwarat1303 |
| F4 — Ticket workflow (status matrix, resolution gate, version) (issue #61) | [#72](https://github.com/mxckiexz/TocTickIT/pull/72) | 1 changes-requested → approved | Merged | Thanwarat1303 |
| F5 — Dashboard API (issue #62) | [#73](https://github.com/mxckiexz/TocTickIT/pull/73) | 1 changes-requested → approved | Merged | Thanwarat1303 |
| F6 — Actions Taken UI (issue #63) | [#74](https://github.com/mxckiexz/TocTickIT/pull/74) | 1 changes-requested → approved | Merged | Thanwarat1303 |
| F7 — Ticket workflow UI (issue #64) | [#75](https://github.com/mxckiexz/TocTickIT/pull/75) | approved | Merged | Thanwarat1303 |
| F8 — Role dashboards UI (issue #65) | [#76](https://github.com/mxckiexz/TocTickIT/pull/76) | approved | Merged | Thanwarat1303 |
| F9 — E2E and regression (issue #66) | [#77](https://github.com/mxckiexz/TocTickIT/pull/77) | approved | Merged | Thanwarat1303 |
| F10 — Hardening and polish (issue #67) | [#78](https://github.com/mxckiexz/TocTickIT/pull/78) | 1 changes-requested → approved | Merged | Thanwarat1303 |

**Notes on the table.** Issues #58 to #67 stay open until the release PR merges into `main`: a feature PR that says `Closes #n` only closes the issue when it is merged into the default branch, and these were merged into `lab4-staging`. The release PR lists them all so that GitHub closes them with the merge. Rounds are counted from review states: a round is one `CHANGES_REQUESTED` review, followed by the author's fix, until an `APPROVED` review.

**Not in this log yet.** The release PR (`release/lab4` → `main`, issue #68) has not been reviewed, so nothing is written for it here.

**On PR #77.** The reviewer could not run the live Playwright suite (no `DATABASE_URL` or PostgreSQL in their environment) and approved pending a live or CI result. The repository has no CI. The author reran all three suites on the development database before the merge (Playwright 61, server 536, client 291, all passing); no comment about that was posted on the pull request.

## PR #69 — F1 — Sprint 4 Engineering Contract (issue #58)

[F1: Sprint 4 engineering contract (spec, API, UI, test plan)](https://github.com/mxckiexz/TocTickIT/pull/69) · branch `feature/lab4-contract` · opened 2026-10-08 09:50:22 UTC · merged 2026-10-11 14:53:49 UTC · +1388/−0 across 6 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-08 17:13:36 UTC:

> Thanks — this is a strong contract overall: the traceability is detailed, the planned test coverage is comprehensive, and calling out the Lab 3 tests affected by the resolution gate up front is exactly the right approach.
>
> I found a few issues that should be resolved before this is merged as the implementation baseline.
>
> 1. **Administrator scope conflicts with the Lab 4 handout.** The handout §4.3 says that an Administrator may “Perform IT Staff behavior”. However, the authorization matrix, status matrix, API contract, and API-22 currently make Administrator status changes return `403`, and `allowedTransitions` is empty for Administrator. This is no longer an open question once the handout is available. Please make the Administrator’s ticket-operation scope match IT Staff behavior, then update the role matrix, `PATCH /api/staff/tickets/:id/status`, detail response, UI, and the related tests. Please also explicitly decide whether claim/assign/priority follow the same rule.
>
> 2. **The Staff Dashboard omits current-user Actions Taken.** Lab 4 Part 5 explicitly requires demonstration of “current-user Actions Taken”. The current specification/API/UI plan contains ticket metrics and recently updated tickets only. Please add a concise current-user Actions Taken metric or recent list, define its backend query, empty behavior and drill-down, and add API/UI/E2E coverage.
>
> 3. **OQ-1 and OQ-5 should be resolved, not left pending.** Part 6 explicitly requires assign, status transition, complete, cancel, and inactive-assignee rejection; §8.3 also states that Requesters see all Actions Taken items and lists their fields. Therefore `status`/`assigneeId` and Requester field visibility are already supported by the handout. Please convert these from open questions into final engineering decisions before implementation.
>
> 4. **The Action Taken create contract is internally inconsistent.** `POST /actions` says creation only allows `PLANNED` or `IN_PROGRESS`, but the same validation row says a missing `result` is invalid when the create status is `COMPLETED`; the UI also exposes an unspecified Status field. Please choose the permitted create states and make the FR, BR, API, UI and tests agree.
>
> Minor wording point: the document calls Actions Taken “append-only” while allowing in-place edits. Since the handout requires edit mode, please define append-only as “no deletion” or document the audit/revision behavior so Part 7 is unambiguous.

**Author's response** — mxckiexz, 2026-10-08 17:20:03 UTC:

> Pushed b2ad893. Each point, with where to look:
>
> 1. **Administrator scope.** Now follows handout 4.3: the Administrator performs every IT Staff ticket operation. Claim, assign, priority, status, comments, notes and Actions Taken all follow the same rule (decision D-2, BR-26, FR-25). Updated: authorization matrix (spec 3.4), a new 3.5 listing the Lab 3 rules this replaces (BR-17, BR-23, BR-39, BR-41), status matrix roles (7.3), a roles table at the top of api-spec, the detail response, ui-spec (Administrator navigation and controls), and tests (API-22, API-31, API-50 to API-54, UI-19, E2E-05, SEC-01). An Administrator can now own a ticket, so assignable users and valid owners are active IT Staff or Administrators. The Lab 3 tests that must change are listed in tests 9.
> 2. **Current-user Actions Taken.** Added to the staff dashboard (BR-27, D-7, FR-15): tickets with my open actions (count with the SQL, empty behavior, drill-down to the queue with actionAssigneeId=me) and my 5 most recent actions (each row opens its ticket). Coverage: API-55 to API-59, UNIT-05, UI-17, UI-18, E2E-03, AC-45 to AC-47.
> 3. **OQ-1 and OQ-5.** Closed as D-1 and D-5 with the handout sections cited. I closed the other four open questions the same way (D-2, D-3, D-4, D-6); there is no open question left.
> 4. **Create contract.** Create allows PLANNED (default), IN_PROGRESS or COMPLETED; CANCELLED is rejected; result is required whenever the status is COMPLETED, on create and on edit. FR-04, FR-05, BR-06, the API validation row, the UI Status select and tests (API-46, UI-20, AC-40, AC-41) now agree.
>
> Minor wording point: append-only is now defined as no deletion; edits happen in place with a version bump and no revision history (BR-08, API-48).

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-09 16:34:03 UTC:

> Request changes — the previous four findings are addressed well: Administrator scope is now consistently aligned with handout §4.3, the current-user Action Taken dashboard data is specified with API/UI/tests, the open questions are resolved as documented decisions, and the create-status contract is now consistent.
>
> Three contract issues still need resolution before implementation:
>
> 1. **“Append-only” is currently defined as only “no deletion”, while PATCH overwrites an existing Action Taken and API-48 explicitly expects no revision rows.** The handout requires append-only behavior while also requiring edit behavior. Please use an immutable revision/audit model (for example, ActionTakenRevision with a current projection), or otherwise preserve the prior values on every edit. “No delete” alone is not append-only evidence.
>
> 2. **D-4 leaves version optional on existing ticket write routes.** A caller that omits `version` can still silently overwrite another caller’s claim, assignment, priority, or status update. That conflicts with the handout’s stale/concurrent-update requirement. Require version for every state-changing ticket route in Lab 4 and update the Lab 3 client/tests, or specify a server-side fallback that guarantees no lost update.
>
> 3. **BR-13 says the resolution-gate check is in the same transaction, but does not specify locking/isolation.** A transaction alone does not prove that a concurrent Action Taken create/update cannot occur between the gate check and the status write. Specify a shared Ticket-row lock for both Action Taken writes and the RESOLVED transition, or serializable isolation with retry. API-26 should then prove that concurrent requests cannot leave a RESOLVED ticket with an open action.
>
> Minor clarification: “My open actions” is based on `assigneeId`, while “My recent actions” is based on `performedById`. Please either label the card “Open actions assigned to me” or make the definition consistently reflect current-user-performed actions.

**Author's response** — mxckiexz, 2026-10-10 15:49:08 UTC:

> Thanks for the review. All three contract issues and the minor point are addressed in 1d80015 (docs only: specification, api-spec, tests, ui-spec).
>
> 1. Append-only: added an immutable `ActionTakenRevision` table (BR-08, section 7.1). `ActionTaken` is the current projection. Create writes revision 1 and every successful edit writes one more revision in the same transaction, so every earlier value can be read back. New route `GET /api/tickets/:id/actions/:actionId/revisions` (staff only); no write or delete route on revisions. API-48 now expects one new revision row. New AC-48, AC-49, FR-26, API-60 to API-63, UI-23.
>
> 2. Version: `version` is now required on the action edit and on claim, assign, priority, status and mark-resolved (BR-17, D-4). Missing is 400 at `errors.version`, stale is 409, and the check and update are one `UPDATE ... WHERE version = n`. Comments and notes only insert rows, so they stay unversioned. The Lab 3 tests and client calls that must now send `version` are listed in tests.md section 9. New API-65 (concurrent claim, assign, priority) and API-66.
>
> 3. Gate locking: every Action Taken create, every action edit and every ticket status change takes `SELECT ... FOR UPDATE` on the Ticket row first (BR-13), always in the order Ticket then ActionTaken. The gate check and the status write happen while the lock is held, so no action can appear in between. API-26 now races RESOLVED against both an action create and an action edit, 20 rounds each, and checks the database afterwards for a RESOLVED ticket with an open action. It also holds the lock in the test to show the write waits. API-64 covers deadlock.
>
> Minor: the card is now "Open actions assigned to me" (by `assigneeId`), and BR-27 states why "My recent actions" uses `performedById`.
>
> Please take another look.

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-10 15:55:38 UTC:

> Blocking: the new ticket-row lock closes the concurrent RESOLVED-vs-action race, but the invariant can still be broken without a race.
>
> BR-10 currently rejects Action Taken creation only on CLOSED or CANCELLED tickets. A staff member can therefore create a new PLANNED or IN_PROGRESS action after a ticket is already RESOLVED. That leaves a RESOLVED ticket with an open action, which contradicts AC-18 and the resolution-gate rule.
>
> Please define and test the post-resolution behaviour explicitly. I recommend rejecting creation of an open Action Taken on a RESOLVED ticket with a documented 409 (requiring the ticket to be reopened first), then extending API-16 or adding a dedicated test for the direct non-concurrent case. The existing API-26 race test should remain, but it cannot cover this path.

**Author's response** — mxckiexz, 2026-10-10 15:59:02 UTC:

> Thanks, good catch. The blocking point is fixed in 45b3d71 (docs only).
>
> BR-10 now says what each ticket status accepts. CLOSED and CANCELLED still reject any new or edited action (409 TICKET_CLOSED). A RESOLVED ticket accepts a new action only with status COMPLETED (a late record of finished work, result required). Creating a PLANNED or IN_PROGRESS action there is 409 TICKET_RESOLVED with the message "Reopen the ticket before adding open work". The same rule covers an edit that would leave an action open on a RESOLVED ticket. The check runs after the ticket lock is taken, so it reads the current status.
>
> The invariant is now stated without relying on timing: a RESOLVED ticket never holds a PLANNED or IN_PROGRESS action, whether the ticket was resolved first or the action was added later. New AC-50, FR-08 updated, TICKET_RESOLVED added to api-spec, and the Add action form on a RESOLVED ticket offers only Completed with a hint (ui-spec).
>
> Tests, none of them concurrent: API-67 resolves through the gate, then posts PLANNED, IN_PROGRESS, COMPLETED with a result and COMPLETED without one, and checks the database afterwards for any open action. API-68 reopens, adds a PLANNED action, and shows RESOLVED is blocked by the gate until it is completed. API-69 inserts an inconsistent open action directly in the database and checks the edit is rejected. UI-25 covers the form. API-16 and API-26 are unchanged.

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-10 16:22:20 UTC:

> One remaining test-coverage point: API-69 currently changes the inconsistent PLANNED action to IN_PROGRESS. Please also PATCH an unrelated editable field, such as `description`, while omitting `status` (or keeping it PLANNED), and assert `409 TICKET_RESOLVED` with the row unchanged.
>
> The rule says an edit may never leave an action open on a RESOLVED ticket. Without that case, an implementation that checks only an incoming open `status` value could still allow a description-only edit of inconsistent PLANNED data.

**Author's response** — mxckiexz, 2026-10-11 11:13:52 UTC:

> Agreed, thanks. Fixed in the latest commit (docs only).
>
> API-69 now PATCHes the inconsistent PLANNED action on a RESOLVED ticket four ways: status IN_PROGRESS; description only with status omitted; description with status PLANNED sent; result and followUpNote only. Each must be 409 TICKET_RESOLVED, with the row, version and revisions unchanged afterwards. The only edit accepted there is one that makes the action COMPLETED (with a result) or CANCELLED.
>
> BR-10 and the api-spec now say the check is made on the status the action would have after the edit, not on the status in the request body, so a description-only edit of open data is rejected too.

**Reviewer (approved)** — Thanwarat1303, 2026-10-11 14:53:14 UTC:

> Confirmed. API-69 now covers the description-only and omitted-status paths that were missing, and the contract correctly evaluates the resulting action status rather than only the request body.
>
> The invariant, API behaviour, UI plan, and traceability are aligned. Approved from my side.

## PR #70 — F2 — Actions Taken foundation (data) (issue #59)

[F2: Actions Taken foundation (data)](https://github.com/mxckiexz/TocTickIT/pull/70) · branch `feature/actions-taken-data` · opened 2026-10-11 18:39:12 UTC · merged 2026-10-13 16:40:22 UTC · +707/−25 across 7 files

**Reviewer (approved)** — Thanwarat1303, 2026-10-13 16:40:13 UTC:

> Reviewed in detail. The additive migration, schema relations, indexes, default versions, idempotent seed, rollback guidance, and migration/seed tests are aligned with the Lab 4 contract.
>
> I specifically checked that existing Lab 3 rows are preserved, Ticket.version defaults to 1, revision history is created with seeded actions, resolved/closed tickets contain no open actions, and the documented rollback limitation is stated clearly.
>
> Approved from my side.

## PR #71 — F3 — Actions Taken API (issue #60)

[F3: Actions Taken API](https://github.com/mxckiexz/TocTickIT/pull/71) · branch `feature/actions-taken-api` · opened 2026-10-14 05:55:24 UTC · merged 2026-10-28 15:01:20 UTC · +1355/−34 across 6 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-17 16:44:22 UTC:

> Request changes — one concurrency gap in BR-07.
>
> `checkAssignee()` runs before the Action Taken transaction in both POST and PATCH. Between that read and the later `ActionTaken` create/update, an Administrator can deactivate the assignee or change their role. The request can then commit an action assigned to an inactive user or a Requester, although BR-07 says the assignee must be active IT Staff or Administrator.
>
> Please keep the early validation for the documented 400-before-404 order, but re-check the supplied assignee inside the transaction after taking the Ticket lock and immediately before writing. Please add a regression test that changes the fixture assignee to inactive (or REQUESTER) between the pre-check and write, and assert that no action/revision is written.
>
> Also, avoid swallowing a database error in `checkAssignee(...).catch(() => undefined)`, because it turns a failed eligibility check into a later misleading write failure.
>
> Everything else I checked aligns well with the contract: route access, requester visibility, revision history, ticket lock ordering, stale-version handling, RESOLVED/CLOSED rules, no-delete behavior, origin protection, and the planned test coverage.

**Author's response** — mxckiexz, 2026-10-17 17:07:45 UTC:

> Thanks, fixed in 0113262.
>
> Assignee re-check (BR-07): POST and PATCH keep the early check for the 400-before-404 order, and now check the supplied assignee again inside the transaction, after the Ticket lock and immediately before the write. The re-check takes FOR SHARE on the assignee's User row, so a concurrent deactivation or role change either happens first (the request is 400 at assigneeId and nothing is written) or waits until the write commits. On a PATCH only an assignee supplied in that request is re-checked; an existing assignment is left alone.
>
> Swallowed error: removed `.catch(() => undefined)`. A database error in the early check now reaches the route's catch and is a 500 with a safe body, not a field error and not a later write failure.
>
> Tests (API-70 to API-72, tests.md updated): the fixture assignee is deactivated, and separately turned into a Requester, between the early check and the write, on POST and on PATCH; each is 400 at assigneeId with no action or revision written and the edited action unchanged. A mocked database error in the check gives a 500 with no leaked detail and nothing written. A 5-round race creates an action while the assignee is being deactivated and accepts only a committed 201 or a 400. Replacing the in-transaction check with "always eligible" fails 4 of these tests; the full server suite passes (456).
>
> One limit to be clear about: removing only FOR SHARE does not fail any test, because both serial orders in the race are valid outcomes. That lock is justified by PostgreSQL's row-lock conflict rules (an UPDATE of the User row conflicts with FOR SHARE), and I wrote this in tests.md section 13 rather than claiming the test proves it.

**Reviewer (approved)** — Thanwarat1303, 2026-10-28 15:01:04 UTC:

> Approved. I re-checked the assignee race fix.
>
> The early validation preserves the documented 400-before-404 order, while `checkAssigneeLocked()` is now the authoritative check inside the transaction after the Ticket lock. The `FOR SHARE` lock on the User row correctly prevents an assignee from changing role or being deactivated between that check and the Action Taken write.
>
> I also verified the POST/PATCH outcomes: an assignee changed to inactive or REQUESTER in the test seam produces `400` at `errors.assigneeId`, with no new action/revision and no mutation of the existing action. The database-error path now correctly returns a safe `500` rather than swallowing the failure.
>
> API-70 through API-72 and the documentation updates match the implementation. Good to merge.

## PR #72 — F4 — Ticket workflow (status matrix, resolution gate, version) (issue #61)

[F4: Ticket workflow (status matrix, resolution gate, version)](https://github.com/mxckiexz/TocTickIT/pull/72) · branch `feature/ticket-workflow` · opened 2026-10-30 14:32:39 UTC · merged 2026-10-31 11:25:47 UTC · +1172/−421 across 21 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-30 19:38:52 UTC:

> One blocking point before merge: the ticket workflow routes read and compare `ticket.version` after taking the Ticket lock, but the write itself is still `tx.ticket.update({ where: { id: ticketId } })`.
>
> This does not yet meet the D-4 / BR-17 contract that the optimistic-lock check and write must be one conditional update (`WHERE id = ? AND version = ?`). The lock makes the current routes serialize correctly, but the database write does not independently enforce the loaded version.
>
> Please change claim, assign, priority, status, and mark-resolved to use an update with both `id` and `version` in the predicate (for example `updateMany`), increment the version there, and return `409 STALE_VERSION` if the count is zero. Please add a regression test that proves a stale conditional write cannot modify the row.
>
> The rest of the implementation looks consistent: route split, status matrix/gate, Administrator parity, owner re-check, and test coverage are all in good shape.

**Author's response** — mxckiexz, 2026-10-31 08:03:23 UTC:

> Thanks, fixed in 5521429.
>
> Claim, assign, priority, status and mark-resolved now write with one conditional statement, `UPDATE ... WHERE id = ? AND version = ?` (`updateMany`, version incremented in the same statement). If no row matches, nothing is written and the response is 409 STALE_VERSION with the current version. The version comparison made under the Ticket lock stays as the first, cheaper rejection, but the write no longer depends on it.
>
> Regression test (API-73): a test seam runs inside the transaction after the version was compared and just before the write, and bumps the ticket's version through the same transaction. For each of the five routes the request then gets 409 STALE_VERSION with `currentVersion` = loaded + 1, the row's own fields are unchanged (owner, priority, status, requester signal), and the only change to `version` is the simulated writer's bump. Taking `version` out of the `WHERE` makes all five cases fail; with it they pass. A control case with nothing intervening still succeeds.
>
> Server suite: 21 files, 496 tests pass. tests.md and api-spec.md describe the conditional write.

**Reviewer (approved)** — Thanwarat1303, 2026-10-31 11:25:38 UTC:

> Re-reviewed the conditional-write fix in `5521429`. The blocking issue is resolved.
>
> All five ticket writes now use the loaded version in the write predicate and increment it in the same statement. API-73 is a meaningful regression test: it changes the version after the in-transaction pre-check but before the write, verifies `409 STALE_VERSION`, verifies that the route-specific fields stay unchanged, and fails if `version` is removed from the `WHERE` clause.
>
> Documentation matches the implementation. Approved to merge.

## PR #73 — F5 — Dashboard API (issue #62)

[F5: Dashboard API](https://github.com/mxckiexz/TocTickIT/pull/73) · branch `feature/dashboard-api` · opened 2026-10-31 11:54:07 UTC · merged 2026-11-01 09:01:03 UTC · +1084/−33 across 8 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-31 16:41:35 UTC:

> One blocking issue before merge: the “recent” drill-downs do not currently return the same set as their dashboard lists.
>
> Both dashboard endpoints correctly filter `recentlyUpdated` (and the Requester’s `recentlyResolved`) to the Bangkok seven-day window. However, the documented drill-downs only use `sortBy=updatedAt` or `currentStatus=RESOLVED`; neither `/api/tickets` nor `/api/staff/tickets` receives a seven-day filter. Older tickets will therefore appear in later pages even though they are not in the dashboard list, which conflicts with FR-17 and the PR claim that drill-downs return exactly the counted/listed set.
>
> Please add a shared filter such as `recent=1` to both list endpoints, computed with the same Bangkok window as the dashboard. Then use `recent=1&sortBy=updatedAt` for recently updated and `currentStatus=RESOLVED&recent=1` for recently resolved, with regression coverage containing an older-than-seven-days ticket.

**Author's response** — mxckiexz, 2026-10-31 17:57:10 UTC:

> Thanks, you are right: the recent drill-downs only sorted or filtered by status, so tickets older than the Bangkok 7-day window appeared on later pages.
>
> Fixed in 19e12c9 (pushed to this branch from another session before I could push mine): `GET /api/tickets` and `GET /api/staff/tickets` both take `recent=1`, built by one shared `recentUpdatedFilter` that uses the same Bangkok window and the same clock as the dashboards, and any other value is 400. The drill-downs are now `recent=1&sortBy=updatedAt` (recently updated) and `currentStatus=RESOLVED&recent=1` (recently resolved). `api-spec.md` and `tests.md` are updated.
>
> Regression coverage (in 19e12c9): tickets eight days old, one second before the window start and exactly at the start, with a fixed clock; for staff and Requester, the list equals raw SQL for the same instant in the dashboard's order and the dashboard's rows are its first rows; without `recent=1` the old tickets are present, with it they are not; bad values are 400.
>
> I added one more case in 03ef5f6: `recent=1` composes with `open=1` and `ownerId=me` instead of replacing them (an 8-day-old open ticket is in `open=1` alone and out once `recent=1` is added). Making the Requester list let `recent` replace `open` fails it. Server suite: 24 files, 536 tests pass.

**Reviewer (approved)** — Thanwarat1303, 2026-11-01 09:00:49 UTC:

> Reviewed the recent drill-down fix. The shared `recent=1` filter now uses the same Bangkok seven-day window as the dashboard, composes correctly with existing queue/list filters, rejects invalid values, and the added boundary and raw-SQL coverage addresses the original mismatch. Docs are aligned as well. No further blocking issue from my review — okay to merge.

## PR #74 — F6 — Actions Taken UI (issue #63)

[F6: Actions Taken UI](https://github.com/mxckiexz/TocTickIT/pull/74) · branch `feature/actions-taken-ui` · opened 2026-11-01 10:11:48 UTC · merged 2026-11-01 14:24:02 UTC · +1416/−24 across 14 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-11-01 10:32:25 UTC:

> Thanks — the component work and coverage are strong, but I found two blocking issues before merge.
>
> 1. Administrator cannot reach this UI. `client/src/App.tsx` still renders only `<UserManagement />` for the `ADMINISTRATOR` role. Therefore an Administrator has no Ticket Queue or Staff Ticket Detail route in the browser, so the claim that IT Staff and Administrator use the same Actions Taken UI is not true in this branch. Please expose the Ticket Queue/Ticket Detail flow to Administrator as required by the Lab 4 UI specification, while retaining User Management navigation.
>
> 2. Editing a legacy action assigned to an inactive user is broken from the UI. `ActionForm.handleSubmit()` always includes `assigneeId` in the PATCH body, even when the user did not change the assignee. The API intentionally re-checks an assignee only when `assigneeId` is supplied, so this UI behavior turns a description-only edit into a 400 if the existing assignee was later deactivated. It also conflicts with the displayed message that the form can still save without changing the assignee after the people list fails.
>
> Please omit `assigneeId` from an edit request unless the selection changed (but continue sending it for create and when the user explicitly clears/changes it), then add a UI regression test for editing an action whose existing assignee is no longer active.

**Reviewer (approved)** — Thanwarat1303, 2026-11-01 14:23:54 UTC:

> Re-reviewed the latest commit. Both requested fixes are now implemented correctly and covered by regression tests:
>
> - Administrator can navigate between Ticket Queue and User Management, so the Actions Taken UI is reachable for Administrator.
> - Edit requests omit `assigneeId` unless the user actually changes or clears it, so a legacy action assigned to an inactive user can still receive an unrelated edit.
>
> I also verified the updated Actions Taken tests and client production build. Ready to merge.

**Author's response** — mxckiexz, 2026-11-01 14:24:33 UTC:

> Thanks for the review. Both points are fixed in 47b0e29.
>
> 1. Administrator access: App.tsx now gives the Administrator a Main navigation with Ticket Queue and User Management (aria-current marks the current page). Ticket Queue opens the same Staff Ticket Detail and Actions Taken UI as IT Staff. The landing page stays User Management until the Dashboard arrives with F8. The Lab 3 AppShell tests are updated and listed in docs/lab-04/tests.md section 9.
>
> 2. Editing an action with an inactive assignee: the edit form now sends assigneeId only when the selection changed (null when cleared). Create still always sends it. New UI tests cover a description-only edit when the existing assignee is inactive, changing and clearing the assignee, and the people-list-failed case.
>
> Client tests pass (180) and the Playwright suite passes (38). I also checked the Administrator flow in the browser.

## PR #75 — F7 — Ticket workflow UI (issue #64)

[F7: Ticket workflow UI](https://github.com/mxckiexz/TocTickIT/pull/75) · branch `feature/ticket-workflow-ui` · opened 2026-11-01 14:39:42 UTC · merged 2026-11-01 14:49:03 UTC · +725/−104 across 10 files

**Reviewer (approved)** — Thanwarat1303, 2026-11-01 14:48:52 UTC:

> Reviewed the latest UI workflow changes.
>
> No blocking findings. The implementation now follows the Lab 4 UI specification:
>
> - Status buttons come from server-provided `allowedTransitions`.
> - Resolved is disabled when the resolution gate is not satisfied, with all unmet reasons shown.
> - Confirmation is required only for Resolved, Closed, Reopened and Cancelled, and `confirm: true` is sent only after Confirm.
> - Conflict handling covers claim, reassignment, priority and status changes, with Reload and focus/scroll behaviour.
> - Requester stale-version handling for “Problem Appears Resolved” is covered.
> - Ticket data and resolution-gate state refresh after Action Taken changes.
> - Responsive behaviour was checked at 375px without horizontal overflow.
>
> The relevant client tests passed (56 tests across the workflow and requester detail suites), and the client TypeScript/build check passed. I found no blocking issue.

## PR #76 — F8 — Role dashboards UI (issue #65)

[F8: Role dashboards UI](https://github.com/mxckiexz/TocTickIT/pull/76) · branch `feature/dashboards-ui` · opened 2026-11-01 15:08:36 UTC · merged 2026-11-01 16:42:22 UTC · +2004/−126 across 27 files

**Reviewer (approved)** — Thanwarat1303, 2026-11-01 16:42:08 UTC:

> Reviewed locally. I checked the role-based navigation, hash routing and fallback behavior, dashboard data mapping, drill-down URLs and filter composition, filtered-list notices, loading/error/forbidden states, accessibility labels, and the affected client tests.
>
> I found no blocking issue. The Lab 4 client test set passes locally (135/135), and the client build/type-check is clean.
>
> One minor non-blocking note: some “View all recently updated tickets” drill-down links do not include a numeric count in their accessible name. Since the API does not provide a total for those recent lists, the current wording is reasonable, but it may be worth documenting this as an intentional exception if we want the wording to match the “every drill-down carries the number” statement exactly.
>
> Approved — ready to merge.

## PR #77 — F9 — E2E and regression (issue #66)

[F9: E2E and regression](https://github.com/mxckiexz/TocTickIT/pull/77) · branch `feature/lab4-e2e-regression` · opened 2026-11-01 16:58:50 UTC · merged 2026-11-01 18:02:55 UTC · +1012/−18 across 8 files

**Reviewer (approved)** — Thanwarat1303, 2026-11-01 17:56:34 UTC:

> Reviewed PR #66.
>
> I checked the three Lab 4 Playwright specs, fixture reset and cleanup order, independent dashboard truth queries, role isolation, dashboard drill-downs, Actions Taken flows, resolution-gate scenarios, conflict handling, and the boundary between API setup and UI assertions.
>
> The extracted repository lists all 23 Lab 4 tests across the expected three specs. The server and client builds both pass. Fixture cleanup correctly removes tickets and related records before deleting managed users, and the dashboard truth script uses independent SQL rather than importing the dashboard implementation.
>
> I found no blocking issue. I could not run the live Playwright suite in this environment because `DATABASE_URL` and the PostgreSQL test database were unavailable, so the reported 61 Playwright tests and full regression count should still be confirmed by CI or on the configured development database.
>
> Approved pending the live/CI regression result.

## PR #78 — F10 — Hardening and polish (issue #67)

[F10: Hardening and polish](https://github.com/mxckiexz/TocTickIT/pull/78) · branch `feature/lab4-hardening` · opened 2026-11-01 18:40:40 UTC · merged 2026-11-01 19:02:36 UTC · +780/−19 across 35 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-11-01 18:43:56 UTC:

> I found one blocking issue before approval.
>
> The Lab 4 contract requires responsive checks at 375px, 768px and 1280px (FR-23 and AC-37 in specification.md, plus ui-spec.md sections 7 and 9). However, `e2e/helpers/accounts.ts` defines the tablet viewport as 800px, and the generated tablet screenshots are also 800px wide.
>
> Please change the tablet viewport to 768px, regenerate all tablet screenshots, and rerun RSP-01/RSP-02. Please do not change the specification to 800px, because the current Lab 4 contract explicitly requires 768px.
>
> The client and server builds pass, and the Lab 4 test files list correctly. I will approve after the required 768px responsive run and evidence are regenerated.

**Author's response** — mxckiexz, 2026-11-01 18:52:52 UTC:

> Thanks for the review. Fixed in d80d6d2.
>
> - The Lab 4 responsive spec now runs at 1280, 768 and 375 (`LAB4_VIEWPORTS` in `e2e/helpers/accounts.ts`; the tablet is 768x1024). The specification is unchanged.
> - RSP-01 and RSP-02 were rerun at the three widths: 27 pass, and the test titles show `tablet (768x1024)`. All Lab 4 screenshots were regenerated; the full-page tablet images measure 768px wide (the `gate-message-tablet.png` crop is narrower because it is a crop of the status area, not the page).
> - Full Playwright suite: 102 pass.
>
> One thing I did differently from the wording of the review: I did not change the existing `VIEWPORTS` constant from 800 to 768. The Lab 3 spec and its committed screenshots use it, and the Lab 3 contract states reference widths of 1280 / 800 / 375 (docs/lab-03/ui-spec.md, line 318), so changing it would regenerate Lab 3's evidence at a width its own contract does not use. Lab 4 has its own constant instead. If you want both labs on 768, say so and I will change Lab 3 too and regenerate its screenshots.

**Reviewer (approved)** — Thanwarat1303, 2026-11-01 19:02:27 UTC:

> Rechecked the fixed archive and confirmed that the responsive issue is resolved.
>
> Lab 4 now uses the separate `LAB4_VIEWPORTS` constant with 1280, 768 and 375 widths. The Playwright titles show `tablet (768x1024)`, and the regenerated full-page tablet screenshots are 768px wide. The narrower gate-message crop is expected because it only captures the status area.
>
> Keeping Lab 3's existing 800px `VIEWPORTS` is correct because Lab 3 has its own contract and committed screenshots at that width.
>
> The Lab 4 test files list correctly, client and server builds pass, and I found no additional blocking issue. Approved pending the reported full Playwright result of 102/102 on the configured database.
