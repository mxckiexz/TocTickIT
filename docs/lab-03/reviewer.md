# Lab 3 — Peer Review Log

**Reviewer:** [Thanwarat1303](https://github.com/Thanwarat1303) (peer reviewer — a different person from the author)  
**Author:** [mxckiexz](https://github.com/mxckiexz)  
**Repository:** [mxckiexz/TocTickIT](https://github.com/mxckiexz/TocTickIT)

Every review round and author response below is quoted verbatim from the pull request itself (`gh pr view <n> --json reviews,comments`), with GitHub's own timestamps — nothing here is paraphrased or reconstructed. Every Lab 3 feature branch went `feature/N-*` → PR → `lab3-staging`; the final PR is `lab3-staging` → `main`.

## Summary

| Feature | PR | Review rounds | Final status | Merged by |
|---|---|---|---|---|
| 1 — Sprint 3 Engineering Contract (issue #34) | [#43](https://github.com/mxckiexz/TocTickIT/pull/43) | 3 rounds: 2 changes-requested → approved | Merged | Thanwarat1303 |
| 2 — Authentication Foundation (issue #35) | [#44](https://github.com/mxckiexz/TocTickIT/pull/44) | 2 changes-requested → approved | Merged | Thanwarat1303 |
| 3 — Authorization & Requester Regression (issue #36), first merge | [#45](https://github.com/mxckiexz/TocTickIT/pull/45) | 1 changes-requested; merged by the author without a recorded re-approval | Merged, then reverted by #46 | mxckiexz |
| 3 — Revert of #45 | [#46](https://github.com/mxckiexz/TocTickIT/pull/46) | approved | Merged | Thanwarat1303 |
| 4 — IT Staff Ticket Queue (issue #37) | [#47](https://github.com/mxckiexz/TocTickIT/pull/47) | 1 changes-requested → approved | Merged | Thanwarat1303 |
| 3 — Re-merge of Authorization & Requester Regression (issue #36) | [#48](https://github.com/mxckiexz/TocTickIT/pull/48) | approved | Merged | Thanwarat1303 |
| 5 — IT Staff Ticket Detail & Workflow (issue #38) | [#49](https://github.com/mxckiexz/TocTickIT/pull/49) | 1 changes-requested → approved | Merged | Thanwarat1303 |
| 6 — Administrator User Management (issue #39) | [#50](https://github.com/mxckiexz/TocTickIT/pull/50) | 3 changes-requested → approved | Merged | Thanwarat1303 |
| 7 — E2E, Visual & Responsive Evidence (issue #40) | [#51](https://github.com/mxckiexz/TocTickIT/pull/51) | 1 changes-requested → approved | Merged | Thanwarat1303 |

**Feature 8 — Release Integration (issue #41):** this PR, and the final `lab3-staging` → `main` PR, are
not in the table above because they have not been reviewed yet. This log only quotes reviews that
happened; their rows and review text are added once Thanwarat1303 has reviewed them.

## PR #43 — Feature 1 — Sprint 3 Engineering Contract (issue #34)

[Feature1: Sprint 3 Engineering Contract (spec, API, UI, test plan)](https://github.com/mxckiexz/TocTickIT/pull/43) · branch `feature/1-lab3-engineering-contract` · opened 2026-09-19 05:34:03 UTC · merged 2026-09-26 16:04:28 UTC · +1979/−0 across 5 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-09-19 09:02:14 UTC:

> I read through the four docs and compared them with the lab sheet. The structure looks complete and I like that the test status is honestly "Planned". I found a few places where the docs disagree with each other, and since the other branches will build on this, I think they should be fixed here first.
>
> 1. Admin ticket access doesn't match across files. §3.3 and §11 and the ui-spec say Admin has no ticket access, but FR-15, BR-04/05/17/18/23, AC-20/28 and the api-spec (/api/staff/* and comments/notes) all let Admin in. Also BR-04 in the handout says Admin can see Internal Notes, so maybe read-only access is the safer choice? Either way, pick one and make everything match.
>
> 2. I couldn't find an authorization matrix. The handout §4.3 asks for one. A simple role x action table should be enough, and it would help with item 1 too.
>
> 3. AC-10 / API-12 / REG-01 / DoD say the Lab 2 tests still pass "unmodified", but I don't think that can be true. The Lab 2 server tests use requesterId everywhere and expect 403 for other people's tickets (BR-14 changes that to 404), and the client and e2e tests use DevRequesterPicker, which we have to remove. Can you write down how those tests get updated? REG-01 also doesn't include e2e.
>
> 4. Wrong current password: AC-08 says 400, but api-spec and API-07 say 401. Please make them the same.
>
> 5. IT Staff has no way to get the list of people they can assign a ticket to, because the only user list is /api/admin/users. Also please say that GET /api/requesters gets removed, and whether /api/categories and /api/related-systems need login.
>
> 6. /api/auth/me and /logout have to work while mustChangePassword is true, otherwise the client can't know to show the Change Password screen. Right now the api-spec says change-password is the only route allowed.
>
> 7. mark-resolved has no status check on the server, but the UI hides the button for Resolved/Closed/Cancelled. Maybe return 409 there.
>
> 8. The Origin check says "403 before any other check", which conflicts with the order in BR-13.
>
> Small things:
> - tests.md says "see §9" for what was actually run, but that is §12 now. UI-04 points to client/tests/App.test.tsx, which doesn't exist (it's in lab-01).
> - §7.2 says Requester is unchanged but §7.4 drops the table. FR-15 says "see FR-22" but FR-22 is the user list.
> - The docs and the log still say feature/34 and #35-#41 after the rename to 1-8. A small mapping would help.
> - Could you add Planned rows for seed idempotency and BR-13/19/23/38?
>
> Things like indexes, email normalization, safe rendering and owner deactivation can wait until the feature branch that needs them, I think.
>
> Thanks! I can check again once you've updated it

**Author's response** — mxckiexz, 2026-09-19 10:20:30 UTC:

> Thanks for the thorough review — all addressed in a652d5c. Point-by-point:
>
> 1. **Admin ticket access** — resolved to **read-only**. BR-04 (the handout's own given rule) requires Admin to see Internal Notes, so that's the floor; everything else (claim/assign, priority, status, posting comments/notes) is IT Staff only. New BR-39 states this once, explicitly; BR-05/17/18/20/23, AC-16/20a-b/28a-b, and every affected api-spec.md route were updated to match it — no more "no access" language anywhere.
> 2. **Authorization matrix** — added as specification.md §3.4 (role × action table, 18 rows).
> 3. **"Unmodified" Lab 2 tests** — you're right, it can't be true. AC-10, API-12, REG-01, and the DoD item now say what's actually required: tests.md §2.9 lists the two real changes (403→404 for BR-14 once Feature 3 lands; DevRequesterPicker removal in client/e2e tests), and REG-01 now explicitly includes e2e. (Feature 2, built in parallel, already had to do the mechanical `prisma.requester`→`prisma.user` fixture rename — that's noted there too, as evidence it's a real, already-encountered category of change, not speculation.)
> 4. **Wrong-password status code** — AC-08 now says 401, matching api-spec.md (which was already correct).
> 5. **Assignable-users gap** — added `GET /api/staff/assignable-users` (IT Staff only, BR-41/FR-28). Also documented that `GET /api/requesters` is removed in Feature 3, and that `/api/categories`/`/api/related-systems` now require a session (any role) — Lab 3's default is "authenticated unless stated otherwise."
> 6. **`/me` and `/logout` during forced password change** — this was already correct in the Feature 2 code; only the api-spec.md wording was ambiguous. Reworded to explicitly exempt both (plus `/login`, which never had a session to gate).
> 7. **mark-resolved on a terminal ticket** — added BR-40/AC-29: `409` if `currentStatus` is already RESOLVED/CLOSED/CANCELLED, independent of the UI hiding the button.
> 8. **Origin-check ordering** — reworded both BR-13 and api-spec.md's Authentication section to say explicitly that the Origin/CSRF check is an earlier middleware-level gate, before BR-13's ladder even starts, not the ladder's first rung.
>
> Small things: tests.md's `§9` self-reference fixed to `§12`; UI-04 now points at a real path (`client/tests/lab-03/AppShell.test.tsx`, not the nonexistent `App.test.tsx`); §7.2's stale "Requester unchanged" line and FR-15's broken "see FR-22" cross-reference fixed; added a branch/issue number mapping table (specification.md §10.1) since branches were renamed 34–41 → 1–8 after this doc was first drafted; added Planned rows for seed idempotency (SEED-01) and BR-13/17/19/23/33/38, which weren't traced before.
>
> Ran a diff of every AC/BR id between `specification.md` and `tests.md`'s two traceability matrices after the edits — both are now 100% covered (AC-01 through AC-30, BR-01 through BR-41), not just the ones this round of feedback touched.

**Reviewer (changes requested)** — Thanwarat1303, 2026-09-19 10:52:36 UTC:

> I rechecked the updated contract. The Admin read-only decision, authorization matrix, Lab 2 test migration notes, wrong-password status, assignable-users endpoint, forced-password-change exceptions, mark-resolved conflict, Origin ordering, cross-references, issue mapping, and traceability rows all look addressed.
>
> One item still appears incomplete: `specification.md` §7.3 still shows only the transition matrix and does not include the required `Required confirmation` column. I also could not find a planned test that verifies confirmation-required transitions.
>
> Please add the confirmation requirement for each relevant transition (for example Cancelled, Resolved, and Closed), then add tests for missing versus accepted confirmation. After that, I should be ready to approve.

**Author's response** — mxckiexz, 2026-09-20 19:21:58 UTC:

> Fixed in a40763c — you're right, §7.3 had the matrix and roles but dropped the handout's "required confirmation" dimension entirely.
>
> Added:
> - specification.md §7.3: a target-status confirmation table. Confirmation is a property of the **target** status, not the specific from→to pair — reaching `RESOLVED`, `CLOSED`, `REOPENED`, or `CANCELLED` always needs it, regardless of the legal source status; every other target doesn't. New **BR-42** states the rule, new **AC-31** covers it.
> - api-spec.md: `PATCH /api/staff/tickets/:id/status` takes an optional `confirm` field, required `true` for those four targets — `400` if missing/false. Check order is explicit: shape → confirmation (`400`) → matrix legality (`409`), so a transition that's both illegal *and* missing confirmation is `400`, not `409` (BR-13's 400-before-409 order applies here too).
> - ui-spec.md §7: the status `<select>` now opens the same inline confirm/cancel step as §5.2's "Problem Appears Resolved" for those four targets before sending `confirm: true`.
> - tests.md: API-57 (missing/false confirm → 400 for all four), API-58 (confirm:true → 200 for all four), API-59 (a non-confirmation target ignores `confirm` entirely), API-60 (illegal + unconfirmed → 400 not 409), UI-14 (the confirm-dialog behavior in the component).
>
> Traceability re-checked end to end after this change — still 100% (AC-01–31, BR-01–42 all have at least one test row).

**Reviewer (approved)** — Thanwarat1303, 2026-09-26 16:04:19 UTC:

> Approved. The Lab 3 engineering contract is complete and matches the documented scope. The four required specification documents are included, the Administrator access decision is clearly documented, and the existing Lab 2 test suites pass with no regressions. Feature-specific implementation and tests are correctly deferred to the follow-up branches.

## PR #44 — Feature 2 — Authentication Foundation (issue #35)

[Feature2: Authentication Foundation (User/Session model, login, forced password change)](https://github.com/mxckiexz/TocTickIT/pull/44) · branch `feature/2-authentication-foundation` · opened 2026-09-19 06:17:33 UTC · merged 2026-09-27 16:16:15 UTC · +1773/−59 across 22 files

**Author's response** — mxckiexz, 2026-09-26 16:11:47 UTC:

> Brought this branch up to date with `lab3-staging` now that Feature 1 (#43, the Sprint 3 engineering contract) has merged. This branch was cut before #43 existed, and #43 changed twice in review (`a652d5c`, `a40763c`) before merging, so it had never been checked against the finalized contract.
>
> **What I did**
> - Merged `lab3-staging` into this branch (plain merge, no history rewrite — the PR diff is unchanged: 22 files, +1399 −59, none of them under `docs/lab-03`).
> - Re-checked the auth implementation against the merged `docs/lab-03/api-spec.md` / `specification.md` (login/logout/me/change-password shapes and status codes, BR-01/02/06–12/16, cookie flags, 8h fixed expiry, case-insensitive email lookup, identical 401 for unknown/wrong/inactive, 401 for wrong current password per the reviewed AC-08). No mismatches — the review-fix commit for #43 (item 6) already notes this branch's `/me` + `/logout` behavior was correct.
>
> **Re-verified on the merged base**
> - `server`: 111/111 tests passing (11 files), `tsc --noEmit` clean, `npm run build` clean
> - `client`: 51/51 tests passing (7 files), `tsc --noEmit` clean
> - `prisma migrate status`: schema up to date (6 migrations incl. `20260919060000_lab3_auth_foundation`)
> - These match the numbers in `docs/lab-03/tests.md` §12 for this branch.
>
> **Left as-is on purpose (per the contract's own scope split)**
> - `requireSameOrigin` (Origin allow-list, SEC-07) and `requirePasswordUpToDate` (API-10) are exported from `auth.ts` but not mounted on any route yet — they only become meaningful once Feature 3 (#36) puts real protected routes behind sessions. `tests.md` §12 already lists API-10 / SEC-07 as not-yet-passing here.
> - `tests.md`'s **Final** column isn't touched here: §12 says it's updated in bulk at Release Integration (#41).

**Reviewer (changes requested)** — Thanwarat1303, 2026-09-26 16:46:27 UTC:

> I found two points to address before approval:
>
> 1. `requireSameOrigin` is implemented but not mounted on `POST /api/auth/logout` or `POST /api/auth/change-password`. The API spec requires the Origin gate for every state-changing request, so please apply it to these auth routes and add coverage for missing/mismatched Origin.
>
> 2. The migration tests are weaker than their names and the summary claim: MIG-01 only checks counts are greater than zero, MIG-02 does not compare migrated fields against the original Requester rows, and MIG-03 only checks that Ticket.requesterId resolves to some User. Please add exact before/after or invariant assertions, or describe the evidence as manual-only.
>
> The deliberate deferral of session authorization for Lab 2 ticket routes to Feature 3 is understood and is not a blocker for this branch.

**Author's response** — mxckiexz, 2026-09-26 17:10:02 UTC:

> Both points addressed (7c7c1f1, 9e33b1e). Thanks — the second one was worse than described, see below.
>
> **1. Origin gate** — `requireSameOrigin` was exported but never mounted, so login, logout and change-password had no gate at all. It's now mounted on `/api/auth` ahead of `express.json()`/`cookieParser()`, so it runs before any session lookup (403 even with no session, not 401 — spec BR-13's note). `CLIENT_ORIGIN` is now exported from `auth.ts` rather than declared in both files.
>
> New tests (16, scoped to `/api/auth`): missing Origin and three forged Origins (incl. a lookalike host and `"null"`) on all three routes; 403-not-401 with no session; a forged logout leaves the victim's session intact; a matching Origin reaches the route's own 400; and the CORS preflight isn't blocked. I disabled the gate to check they aren't vacuous: 14 of them fail.
>
> Lab 2's ticket/attachment routes are still deliberately ungated — Feature 3 extends this to every protected route. That means the *full* SEC-07 route sweep in `tests.md` stays with Feature 3; this covers the routes this branch introduces.
>
> **2. Migration tests** — you were right, and MIG-02's loop even claimed in a comment to check `mustChangePassword` while only asserting the hash was truthy. They now replay the real Lab 2 migrations + `20260919060000_lab3_auth_foundation` in a throwaway Postgres schema inside one transaction that is always rolled back (live tables never touched, nothing to clean up — checked: no leftover schemas), against an awkward fixture: non-contiguous ids, an inactive Requester who owns a ticket, an apostrophe/non-ASCII name, multi-line text, a soft-removed attachment. Asserted exactly, from a real before/after snapshot:
> - MIG-01: Ticket/Attachment/Category/RelatedSystem rows unchanged column-for-column
> - MIG-02: each Requester → exactly one User with same id/name/email/isActive/createdAt, role REQUESTER, `mustChangePassword` true, and a hash that verifies the documented default `ChangeMe123!`
> - MIG-03: every Ticket keeps its `requesterId`, which resolves to the same person; FK moved from `"Requester"` to `"User"`
> - plus: Requester table dropped, and the User id sequence continues at max+1
>
> I broke the migration SQL four ways (mustChangePassword, hard-coded isActive, sequence not advanced, silent Ticket edit); each is caught by the matching test. The old live-DB assertions survive as one clearly-labelled *state* check, not a before/after.
>
> **Two things you should know**
> - The old test here labelled "MIG-04" (Requester table dropped) doesn't match `tests.md`'s MIG-04 (status/`itPriority` backfill, which belongs to the branch that adds those columns), and `tests.md` §12 currently lists MIG-01–04 as passing on this branch. I renamed mine to a plain contract-step check and left `docs/lab-03/tests.md` alone (§12 says it's updated in bulk at #41), but that §12 line will need correcting there.
> - While verifying I hit a real intermittent failure in the *existing* UNIT-01 (one bcrypt hash + two verifies at the mandated cost 12): ~1.4s alone, but 5148ms under CPU pressure against vitest's 5s default. I kept the cost at 12 and gave the auth file a 30s per-test allowance instead; UNIT-01 now also asserts the hash is bcrypt at cost 12 (BR-06). Full suite passes under heavy load (load avg ~30–50) as well as unloaded.
>
> **Now:** server 129/129 (93 Lab 1/2 + 6 migration + 30 auth), client 51/51, `tsc` clean on both, server build clean. PR description updated to match (it still said 111).

**Reviewer (changes requested)** — Thanwarat1303, 2026-09-27 15:59:10 UTC:

> The Origin-gate and migration-test fixes look good. I independently confirmed that both server and client builds pass.
>
> One remaining security concern: in `server/src/app.ts`, `bcrypt.compare` is skipped when the email is unknown:
>
> ```ts
> const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;
> ```
>
> Please perform a dummy bcrypt comparison for unknown/inactive users as well, so login response timing does not reveal whether an email exists. After that, this PR looks ready from my side. Also please confirm that the PR base does not already contain another migration creating `User`/the role enum, otherwise the migration must be rebased or reduced to the actual diff.

**Author's response** — mxckiexz, 2026-09-27 16:09:26 UTC:

> **Timing fix (862cf1f)** — `verifyPassword` was skipped entirely (`user ? await verifyPassword(...) : false`) for an unknown email, so a known email cost one bcrypt compare more than an unknown one in response timing, even though the body/status already matched (BR-07).
>
> It now always runs: `verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)`, where `DUMMY_PASSWORD_HASH` is a fixed, unrelated bcrypt hash (cost 12) exported from `auth.ts` — not a real account's hash, so it can't be used to log in as anyone.
>
> New test spies on `verifyPassword` and asserts it's called exactly once per attempt: with the dummy hash for an unknown email, with the real user's hash for a known one. Reverted the fix to check the test isn't vacuous — it failed with "called 0 times" for the unknown-email case, as expected.
>
> **Migration base** — confirmed: `origin/lab3-staging` (this PR's base) has only Lab 2's 5 migrations and no `User`/`Role` anywhere in its schema. `20260919060000_lab3_auth_foundation` is the only migration that creates them — nothing to rebase or reduce.
>
> Now: server 130/130 (added 1), client 51/51 unchanged, both `tsc` and server build clean.

**Reviewer (approved)** — Thanwarat1303, 2026-09-27 16:16:05 UTC:

> okay kub, approve

## PR #45 — Feature 3 — Authorization & Requester Regression (issue #36), first merge

[Feature 3: Authorization & Requester Regression (issue #36)](https://github.com/mxckiexz/TocTickIT/pull/45) · branch `feature/3-authorization-requester-regression` · opened 2026-09-27 17:02:47 UTC · merged 2026-09-28 12:05:23 UTC · +2740/−1334 across 37 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-09-27 17:26:16 UTC:

> Request changes — I found two issues during review.
>
> 1. **Forced password-change bypass**
>
> `GET /api/categories` and `GET /api/related-systems` only use `requireAuth` (`server/src/app.ts` around lines 190 and 218). They are missing `requirePasswordUpToDate`.
>
> The contract says that a user with `mustChangePassword: true` must receive `403` from every authenticated route except `/api/auth/me`, `/api/auth/logout`, and `/api/auth/change-password`. A user who still has the default password can currently call both lookup endpoints directly.
>
> Please add `requirePasswordUpToDate` after `requireAuth` on both routes, and add regression coverage that a `mustChangePassword: true` session gets `403` with `code: "PASSWORD_CHANGE_REQUIRED"` from each endpoint.
>
> 2. **Feature 3 migration is not covered by the migration tests**
>
> `server/tests/lab-03/migration.api.test.ts` currently covers the earlier auth migration (MIG-01 through MIG-03), but I could not find a replay test for `20260927120000_lab3_authorization_requester_regression`. `tests.md` also still lists MIG-04 as Planned.
>
> Please add a migration replay test from the pre-Feature-3 schema that verifies:
>
> - existing `currentStatus: "New"` values become `TicketStatus.NEW`;
> - `itPriority` is copied exactly from `requestedPriority`;
> - existing tickets/attachments are preserved without row drift;
> - the new nullable ownership/resolution fields remain null for existing tickets.
>
> The authorization, session-derived requester identity, ownership masking, comment/note permissions, and global Origin gate otherwise look well implemented.

**What happened next (from the PR history):** the author merged #45 on 2026-09-28 with the reviewer's changes-requested review still the latest review on the PR — there is no recorded re-approval. That bypassed the review gate this log exists to evidence, so the merge was reverted in [#46](https://github.com/mxckiexz/TocTickIT/pull/46) (approved) and the same work was re-merged through [#48](https://github.com/mxckiexz/TocTickIT/pull/48) (approved). The net result on `lab3-staging` is the reviewed code; the history keeps the mistake visible rather than rewritten.

## PR #46 — Feature 3 — Revert of #45

[Revert PR #45 (Feature 3: Authorization & Requester Regression)](https://github.com/mxckiexz/TocTickIT/pull/46) · branch `revert-pr-45-feature-3` · opened 2026-09-28 12:08:48 UTC · merged 2026-09-29 04:07:03 UTC · +1334/−2740 across 37 files

**Reviewer (approved)** — Thanwarat1303, 2026-09-29 04:06:17 UTC:

> Approved. The revert snapshot cleanly returns `lab3-staging` to the pre-Feature-3 state: the Feature 3 migration, schema additions, requester-regression routes, and comment/note functionality are all absent, while the existing authentication foundation remains intact.
>
> Please reopen the Feature 3 PR from its updated branch after this revert lands. It should be reviewed again with the two requested fixes included before merging.

## PR #47 — Feature 4 — IT Staff Ticket Queue (issue #37)

[Feature 4: IT Staff Ticket Queue (issue #37)](https://github.com/mxckiexz/TocTickIT/pull/47) · branch `feature/4-it-staff-ticket-queue` · opened 2026-09-29 04:46:11 UTC · merged 2026-09-29 15:50:16 UTC · +1435/−16 across 7 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-09-29 05:47:32 UTC:

> Changes requested.
>
> 1. `GET /api/staff/tickets` currently validates `categoryId` and `relatedSystemId` only as positive integers. The API contract says each must reference an existing Category / RelatedSystem, but requests such as `?categoryId=999999` currently return `200` with an empty list instead of `400`. Please validate that the referenced lookup record exists and add coverage for both unknown IDs.
>
> 2. On mobile, the search input is currently inside the collapsed `Filters` disclosure. The UI spec says the filter disclosure should appear above the search box, which implies search remains immediately available while the secondary filters are collapsed. Please keep search visible and collapse only the filter controls.
>
> Also, please rebase after Feature 3 is re-merged into `lab3-staging` and resolve the current conflicts before requesting merge again.

**Author's response** — mxckiexz, 2026-09-29 06:02:40 UTC:

> Addressed both review points:
>
> 1. `GET /api/staff/tickets` now checks `categoryId`/`relatedSystemId` reference an existing row (400 on an unknown id, e.g. `?categoryId=999999`), with test coverage for both.
> 2. Mobile: the search box now stays visible above the "Filters" disclosure button's collapsed dropdowns, per `ui-spec.md` §6 — only the secondary filters (category/related system/priority/status/owner) collapse.
>
> Verified: server 206/206, client 71/71, both `tsc --noEmit`/`npm run build` clean.
>
> **Rebase**: `lab3-staging` still doesn't have Feature 3 (PR #45 was merged then reverted via #46, and hasn't been re-merged yet) — rebasing onto it right now would drop the `requireRole`/session/schema infrastructure this branch depends on. I'll rebase and resolve conflicts as soon as #45 lands.

**Reviewer (approved)** — Thanwarat1303, 2026-09-29 09:07:21 UTC:

> Approved — both requested fixes are correctly implemented and covered by tests.
>
> - Unknown `categoryId` / `relatedSystemId` now return `400`.
> - On mobile, Search remains visible while only secondary filters collapse.
>
> Please rebase onto `lab3-staging` and resolve the current conflicts after Feature 3 is re-merged. Once the rebased branch passes the test suite again, this is ready to merge.

**Author's response** — mxckiexz, 2026-09-29 10:42:23 UTC:

> Rebased onto \`lab3-staging\` now that Feature 3 is back in (#48, merged) — clean rebase, zero conflicts, diff is now just this feature's own 7 files.
>
> Re-verified: server 206/206 tests, client 71/71 tests, both \`tsc --noEmit\`/\`npm run build\` clean on both packages.
>
> Ready to merge per the approval.

## PR #48 — Feature 3 — Re-merge of Authorization & Requester Regression (issue #36)

[Re-merge Feature 3: Authorization & Requester Regression (issue #36)](https://github.com/mxckiexz/TocTickIT/pull/48) · branch `restore-feature-3` · opened 2026-09-29 09:53:44 UTC · merged 2026-09-29 10:37:23 UTC · +2740/−1334 across 37 files

**Reviewer (approved)** — Thanwarat1303, 2026-09-29 10:37:11 UTC:

> Approved. The Feature 3 restoration includes the previously requested password-change guards and the real migration replay coverage. No new blocking issue found.
>
> Please merge this into `lab3-staging`, then rebase Feature 4 onto the updated staging branch, resolve its conflicts, and rerun the full test suite before merging Feature 4.

## PR #49 — Feature 5 — IT Staff Ticket Detail & Workflow (issue #38)

[Feature 5: IT Staff Ticket Detail & Workflow (issue #38)](https://github.com/mxckiexz/TocTickIT/pull/49) · branch `feature/5-it-staff-ticket-detail-workflow` · opened 2026-09-29 16:31:17 UTC · merged 2026-10-01 16:31:26 UTC · +2281/−26 across 9 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-01 16:02:18 UTC:

> I found one blocking issue before approval.
>
> `POST /api/staff/tickets/:id/claim` has a TOCTOU race: it first reads the ticket to check `ownerId === null`, then performs an unconditional `update`. If two IT Staff users claim the same unassigned ticket concurrently, both requests can observe `null` and both return `200`; the later update overwrites the earlier owner.
>
> This conflicts with the endpoint contract, which requires a claim on an already-owned ticket to return `409`.
>
> Please make the claim atomic, e.g. use `updateMany` with `where: { id: ticketId, ownerId: null }`, then return `409` when the affected count is `0` (after distinguishing a nonexistent ticket as `404`). Please also add a concurrency regression test using two authenticated staff sessions and `Promise.all`, asserting exactly one `200`, one `409`, and that the final owner is the successful claimant.
>
> The status matrix, confirmation order, role restrictions, and client confirmation flow otherwise align with the documented Lab 3 contract.

**Author's response** — mxckiexz, 2026-10-01 16:21:09 UTC:

> Fixed in e754e01 — confirmed the race, exactly as described.
>
> - \`POST /api/staff/tickets/:id/claim\` now uses \`prisma.ticket.updateMany({ where: { id: ticketId, ownerId: null }, data: { ownerId: req.user!.id } })\` instead of findUnique-then-update. The WHERE clause's \`ownerId: null\` is checked and written atomically by Postgres, so only one of two concurrent claims can ever affect a row.
> - When \`result.count === 0\`, a follow-up \`findUnique\` (id only) distinguishes a nonexistent ticket (404) from an already-claimed one (409) — \`updateMany\`'s count can't tell those apart on its own.
> - On success, the updated ticket is re-fetched with \`findUniqueOrThrow\` for the response body (unconditional update no longer returns the row directly).
>
> Added the concurrency regression test you described: two authenticated staff sessions (\`staffAAgent\`/\`staffBAgent\`, already set up in this file's fixtures) claim the same unassigned ticket via \`Promise.all\`, asserting exactly one \`200\` and one \`409\`, and that the persisted \`ownerId\` matches whichever response actually got \`200\`.
>
> 295/295 server tests passing (89 in \`staff-ticket-detail.api.test.ts\`, including the new one), 92/92 client tests passing — full suite re-run, not just the touched file.

**Reviewer (approved)** — Thanwarat1303, 2026-10-01 16:31:16 UTC:

> Approved — I verified the atomic claim fix and its concurrency regression test. The endpoint now correctly returns one `200` and one `409` for simultaneous claims, and the persisted owner matches the successful claimant. Ready to merge

## PR #50 — Feature 6 — Administrator User Management (issue #39)

[Feature 6: Administrator User Management (issue #39)](https://github.com/mxckiexz/TocTickIT/pull/50) · branch `feature/6-admin-user-management` · opened 2026-10-01 16:53:01 UTC · merged 2026-10-02 14:59:12 UTC · +1841/−6 across 9 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-01 17:13:59 UTC:

> Changes requested — I found two security/correctness issues in the implementation.
>
> 1. The mutating Administrator routes (`POST /api/admin/users`, `PATCH /api/admin/users/:id`, and `POST /api/admin/users/:id/reset-password`) are missing the same-origin and CSRF middleware. They currently use `requireAuth`, `requireRole("ADMINISTRATOR")`, and `requirePasswordUpToDate`, but should also enforce `requireSameOrigin` and `requireCsrf`, consistent with the rest of the state-changing API surface.
>
> 2. Case-insensitive email uniqueness is still vulnerable to a concurrent create/update race. The implementation does `findFirst` and then `create`/`update` in separate operations, while the database's normal unique constraint is case-sensitive. Two simultaneous requests using differently cased forms of the same email could both pass the pre-check.
>
> Please make the case-insensitive constraint database-enforced (for example, a unique index on `LOWER(email)` through a migration) and translate its unique-violation error into the documented `409` email response. Please add regression coverage for CSRF/origin rejection on all three write routes and for the case-insensitive duplicate handling.

**Author's response** — mxckiexz, 2026-10-01 17:28:26 UTC:

> Thanks — addressed both in 4b4835c.
>
> **2. Case-insensitive email race** — confirmed, real gap. Added migration `20261002080000_lab3_admin_email_case_insensitive_unique` (a unique index on `LOWER(email)` — the existing `User_email_key` is a plain case-sensitive btree, so it never caught this). Both `POST /api/admin/users` and `PATCH /api/admin/users/:id` now catch the resulting Prisma `P2002` violation and translate it into the same documented `409` the `findFirst` pre-check already gave for the non-concurrent case (the pre-check stays, for a clean error on the common path — the index is now the actual source of truth). Added two concurrency regression tests: concurrent *create* with differently-cased emails, and concurrent *edit* moving two different users to differently-cased forms of the same email — both assert exactly one success, one `409`, and exactly one row in the DB afterward.
>
> **1. Origin/CSRF middleware** — I looked into this before changing anything, since I wanted to understand exactly what was missing before touching security-critical code. Two findings:
> - `requireSameOrigin` is mounted globally in `app.ts` (`app.use(requireSameOrigin)`, before `express.json()`/`cookieParser()`, before any route is registered) — it already runs on every mutating route in the app, including these three. No existing route (including the ones already merged, e.g. `POST /api/tickets`, the staff claim/assign/priority/status routes) lists it per-route either; they all rely on the same global mount. So functionally these routes were already covered.
> - There is no `requireCsrf` function anywhere in this codebase at any point in its history. The documented CSRF defense (`specification.md` §11, `api-spec.md` "Authentication") is specifically `SameSite=Lax` + the Origin allow-list — that design was reviewed and accepted during the engineering-contract round (PR #43). I don't think a second mechanism is called for unless that decision should be revisited, which I'd want to raise explicitly rather than assume.
>
> What *was* genuinely missing: regression coverage. Only `auth.api.test.ts`'s `SEC-07` block tested Origin-gate rejection, scoped to `/api/auth/*` — no later branch (staff routes, now admin routes) added the equivalent for its own new routes. Added that same pattern (no-Origin-header + 3 forged-Origin values, `.each`'d) for all three mutating admin routes now, so the existing protection is actually proven here rather than assumed.
>
> If you did mean an additional token-based CSRF mechanism beyond Origin-checking, happy to open that as a scope discussion rather than a silent change to this PR — let me know.
>
> 342/342 server tests passing (47 in `users-admin.api.test.ts`, up from 33), 103/103 client tests passing (re-run as a baseline, unaffected).

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-02 13:07:54 UTC:

> Changes requested — the email and Origin fixes look correct, but there is still a BR-37 concurrency race.
>
> With exactly two active Administrators, both can concurrently PATCH their own account from `ADMINISTRATOR` to `IT_STAFF`. Each request reads `otherActiveAdmins === 1` before either update commits, so both pass the guard and both updates can succeed. The system is then left with zero active Administrators.
>
> The count check and update need to be made atomic/serialized for the last-admin invariant. For PostgreSQL, this could be done in a transaction with an appropriate transaction-scoped advisory lock around the active-admin count and update, or with serializable isolation plus a safe retry/conflict response. Please add a concurrency regression test with two authenticated Administrator sessions, two simultaneous self-demotions, and assertions that exactly one succeeds, one returns `409`, and one active Administrator remains.
>
> Everything else in the latest update looks correct: the global Origin middleware is present before body/cookie parsing, the new unique `LOWER(email)` index is real, `P2002` is translated to the documented `409`, and both create/edit concurrency tests exercise the new database invariant.

**Author's response** — mxckiexz, 2026-10-02 14:24:09 UTC:

> Confirmed and fixed in 2a83b37.
>
> **Fix:** `PATCH /api/admin/users/:id` now does its lookup, guards, and update inside one transaction that first takes a transaction-scoped `pg_advisory_xact_lock` — only for requests that change `role` or `isActive` (name/email edits can't affect the invariant, so they skip it). The second request waits, then reads the first's committed state and gets its own 409. Everything the guard depends on, including the target row itself, is now read *inside* the lock rather than before it.
>
> **One thing worth flagging beyond the scenario you described:** the race isn't limited to self-demotion. Two Administrators *deactivating each other* at the same moment hits the same hole — each request alone is safe (the other admin would remain), together they leave nobody. My earlier note in the test file claiming cross-admin actions can never reach zero was only true one request at a time; I've corrected that comment, and the fix covers both shapes.
>
> **Tests** (two authenticated Administrator sessions, system temporarily reduced to exactly two active Administrators and restored afterward, even on failure):
> - two simultaneous self-demotions → exactly one `200`, one `409` ("At least one active Administrator is required."), one active Administrator remains
> - two simultaneous mutual deactivations → exactly one `200`, loser blocked, one active Administrator remains. The loser is normally the guard's `409`; if the winner's commit lands before the loser's *session lookup* runs, the loser is already deactivated (BR-16) and gets a `401` instead — the test accepts either, since both mean the second deactivation didn't happen. Without the lock the outcome is `[200, 200]`, which neither branch allows.
>
> I checked the tests actually catch the bug: with the lock line disabled they fail 3/3 runs; with it they pass 5/5.
>
> 344/344 server, 103/103 client passing.

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-02 14:47:08 UTC:

> The BR-37 production fix looks correct: the transaction-scoped advisory lock is acquired before the target lookup, active-admin count, and update, so it serializes both self-demotions and mutual deactivations correctly.
>
> One remaining test-isolation issue before approval: `withExactlyTwoActiveAdmins` directly deactivates every other active Administrator in the shared test database. The Vitest configuration still allows test files to run in parallel, and other files (`staff-queue`, `staff-ticket-detail`, and `comments-notes`) use active Administrator fixtures concurrently. This can intermittently turn those fixtures into `401` sessions during a full-suite run.
>
> Please either isolate this scenario from the shared database or configure server test files to run serially while preserving the two concurrent requests inside this test. The `Promise.all` race test should remain concurrent; only cross-file database interference needs to be prevented.

**Author's response** — mxckiexz, 2026-10-02 14:54:24 UTC:

> Good catch — fixed in d91711d.
>
> `server/vitest.config.ts` now sets `fileParallelism: false`, so test *files* run one at a time. That closes the cross-file interference (`withExactlyTwoActiveAdmins` deactivating other files' Administrator fixtures mid-run). I went with serial files rather than isolating the scenario, because the invariant under test is global ("at least one active Administrator in the system") — there's no per-test slice of the shared DB to isolate it into. The `Promise.all` inside each race test is untouched: the concurrency is two requests within a single test, not parallel files.
>
> Cost: the full server suite goes from ~20s to ~70s.
>
> 344/344 passing on a clean serial run. For transparency: on one earlier serial run, a single Lab 2 test failed (`remove-attachment.api.test.ts` › "soft-removes the attachment … deletes the file"), while I was also running other tests against the same DB. It passed 12/12 in isolation and on the next clean full run, and I don't think it's related to this PR — the remove-attachment handler deletes the file with a fire-and-forget `unlink` (not awaited) and responds immediately, so the test's `existsSync(...) === false` check right after the response races the unlink under load. That's pre-existing from Lab 2. I've left it alone to keep this PR in scope; happy to make the handler await the unlink in a small follow-up if you want it.

**Reviewer (approved)** — Thanwarat1303, 2026-10-02 14:58:59 UTC:

> Reviewed the update. `fileParallelism: false` correctly prevents cross-file interference in the shared database while preserving the real `Promise.all` concurrency within the BR-37 race tests.
>
> The reported attachment deletion timing issue is pre-existing and outside this PR’s scope. Please track it as a small follow-up, but it does not block this Administrator User Management feature.
>
> Approved.

## PR #51 — Feature 7 — E2E, Visual & Responsive Evidence (issue #40)

[Feature 7: E2E, Visual & Responsive Evidence (issue #40)](https://github.com/mxckiexz/TocTickIT/pull/51) · branch `feature/7-e2e-visual-responsive-evidence` · opened 2026-10-02 15:10:33 UTC · merged 2026-10-03 13:58:06 UTC · +847/−52 across 37 files

**Reviewer (changes requested)** — Thanwarat1303, 2026-10-02 16:14:01 UTC:

> Changes requested: the E2E fixture cleanup is incomplete, so the suite is not fully repeatable yet.
>
> `e2e/lab-02/requester-ticket-flow.spec.ts` creates a ticket with the summary `E2E flow check ${Date.now()}`, but `server/scripts/e2e-fixture.ts` only removes tickets whose summary starts with `[e2e]`. Those Lab 2 flow tickets therefore accumulate after every run. The committed Staff Queue screenshot already shows many stale `E2E flow check ...` rows.
>
> Please give all E2E-created tickets a single managed prefix, or extend fixture cleanup to remove the existing `E2E flow check ` records and their dependent comments, notes, and attachments before each run. Then regenerate the affected screenshots from the clean fixture state.
>
> Also, please rename the PR title to reflect the E2E / visual / responsive evidence feature rather than “add IT staff ticket detail UI”.

**Author's response** — mxckiexz, 2026-10-02 16:20:12 UTC:

> Fixed in 064d3bf — you're right, and thanks for catching the screenshot.
>
> **Cleanup.** Every ticket any e2e spec creates now carries one managed prefix, `[e2e]`: the Lab 2 graded flow spec (`requester-ticket-flow.spec.ts`) was the odd one out (`E2E flow check <timestamp>`), so it now uses `[e2e] Lab 2 flow check …`. `e2e-fixture.ts` also sweeps the two *legacy* prefixes once (`E2E flow check ` and Lab 2's evidence generator's `PDF evidence — `) — 11 + 4 of them had piled up in the dev DB. The sweep removes comments, notes and attachment rows as before, and now also unlinks the attachment **files** from disk (the previous version would have left those behind).
>
> **Repeatability, measured rather than assumed.** Two consecutive full runs leave identical state: 3 managed tickets, 0 legacy, 6 total, 7 e2e users — and the 3 non-e2e rows are pre-existing dev data I deliberately don't touch. Screenshots regenerated from that clean state: the queue shows 6 rows instead of 19.
>
> **One more thing I got wrong, found while regenerating.** I'd said the truncated filter labels were fixed, but the new desktop screenshot still clipped "All related systems" by ~12px. Filters now share the row equally, and the responsive spec measures every visible dropdown's selected text against its width — I confirmed that check fails on the old layout before keeping it.
>
> **PR title.** It already reads "Feature 7: E2E, Visual & Responsive Evidence (issue #40)" — #51 is the only open PR and I don't see the "IT staff ticket detail UI" wording anywhere on it. Possibly you were looking at #49's title (that's Feature 5)? Happy to reword it if you meant something else.
>
> e2e 24/24, client 103/103.

**Reviewer (approved)** — Thanwarat1303, 2026-10-03 13:57:57 UTC:

> Reviewed the follow-up. The fixture cleanup is now deterministic: all E2E-created tickets use the managed `[e2e]` prefix, legacy ticket prefixes are swept, and dependent communication, attachment records, and attachment files are cleaned up safely.
>
> The new dropdown-width assertion also directly covers the visual truncation that the previous page-overflow check missed.
>
> Approved.

## Overall reflection

Across the nine pull requests in this log (seven feature PRs, the revert #46, and the re-merge #48), the reviewer requested changes 11 times and approved 8 times. Reading the rounds back, the findings fall into three groups, and they changed how the rest of the sprint was built:

1. **The contract disagreed with itself (PR #43).** The first two rounds were not about code at all: Administrator ticket access was "none" in some sections and "full" in others, the required authorization matrix and the confirmation requirement on status transitions were missing, and the docs claimed Lab 2's tests would pass "unmodified" when they could not. Fixing the spec before any code existed was cheaper than finding the same contradictions in four branches' implementations — and every later feature was built against a contract the reviewer had already signed off.
2. **Check-then-act races, three times (PRs #49 and #50).** The ticket `claim` read then wrote (two staff could both "win"), the case-insensitive email check read then wrote (two requests could both pass), and the last-active-Administrator count read then wrote (two admins could demote themselves at once and leave zero). Each was found by the reviewer, not by the author's own tests, because a sequential test cannot see a race. The pattern is the lesson: an invariant that matters must be enforced by the database or serialized (an atomic conditional update, a `LOWER(email)` unique index, an advisory lock) and proved by a test that runs the two requests concurrently — each fix above ships with exactly such a regression test, verified to fail without the fix.
3. **Process and test hygiene (PRs #45, #50, #51).** PR #45 was merged by the author while the reviewer's changes-requested review was still the latest on it; it had to be reverted and re-merged through an approved PR (#46, #48). The review gate only works if nobody merges around it, including the author. Separately, the reviewer caught test-suite problems the author had not: race tests that deactivated administrators other test files depend on (fixed by running files serially), and an end-to-end suite that was not repeatable because it left tickets behind (fixed with one managed fixture prefix and a full sweep).

What I would do differently: write the concurrent regression test at the same time as the first implementation of any rule phrased "at most one" / "at least one" / "unique", rather than after the reviewer asks; and treat "changes requested" as a hard stop on merging, not a state to resolve later.
