# Lab 4 — Evidence Map (worksheet `SE+Lab+4.pdf`)

Where each part of the submission (worksheet section 14, "Answer Part 1" to "Answer Part 9") is in the repository, and what is
still open. Written by checking the worksheet against the repository, not from memory; the open items are listed at the end rather than hidden.

## Section 14, part by part

| Part | Points | Worksheet asks for | Where it is | State |
|---|---|---|---|---|
| 1 Git use | 10 | feature branches merged into `lab4-staging`, then `main`; Project/Kanban with all issues Done; rendered `reviewer.md`; README and `.gitignore`; directory structure | `git log --first-parent lab4-staging` (ten feature merges, below); `docs/lab-04/reviewer.md` (generated from the pull requests); `README.md`; `.gitignore`; release PR #79 | `lab4-staging` done. `main` merge and Kanban **open** (below) |
| 2 Spec DD | 5 | rendered `specification.md` with numbered requirements, rules, Action Taken and transition rules, dashboard calculations, AC, migration decisions, Definition of Done; proof it existed before the implementation PRs | `docs/lab-04/specification.md` (the 11 sections of worksheet 9; FR, BR, AC-01 to AC-50, D-1 and later decisions, 7.2 design reasons, 7.4 and 7.4a migration and legacy data, 10 Definition of Done); PR #69 merged before every other PR (table below) | Done |
| 3 Test DD | 10 | rendered `tests.md`: planned tests, AC traceability, real test-file paths, final status, complete unit / API / UI / authorization / workflow / regression / E2E output **from main** | `docs/lab-04/tests.md` (every row `Pass` except REG-01b, the run on `main`, which is pending; every AC traced); `docs/lab-04/test-output/` | Output is from the release candidate; the run **on `main`** is open |
| 4 AI use | 5 | rendered `ai-use.md` naming the LLM, 6 to 10 key prompts, a brief "My Reflection" | `docs/lab-04/ai-use.md` (model, how used, 10 prompts quoted from the transcripts) | Reflection is the author's to write: **open** |
| 5 IT Staff dashboard | 5 | operational metrics, current-user Actions Taken, recent tickets, counts, drill-down, loading / empty / forbidden / safe-failure / responsive; metrics match database queries | `client/src/StaffDashboard.tsx`; `client/tests/lab-04/StaffDashboard.test.tsx`; server tests compare every number with raw SQL (`server/tests/lab-04/staff-dashboard.api.test.ts`, `dashboard-drilldown.api.test.ts`); `e2e/lab-04/dashboards.spec.ts` compares the screen with `server/scripts/e2e-dashboard-truth.ts`; `artifacts/lab-04/screenshots/staff-dashboard/` | Done |
| 6 Actions Taken UI | 10 | list, create, assign, edit, status transition, complete, cancel, validation, inactive-assignee rejection, role restrictions, safe failures, responsive; several actions on one ticket | `client/src/ActionsTaken.tsx`; `ActionsTaken.test.tsx` (33 tests); `e2e/lab-04/actions-taken-flow.spec.ts` (three actions on one ticket, inactive assignee refused, Requester read-only, double click, forced 500); `artifacts/lab-04/screenshots/actions-taken/` | Done |
| 7 Ticket workflow | 5 | permitted transitions, stable ordering, append-only, role-appropriate visibility | `server/src/ticketWorkflow.ts`; `ticket-workflow.api.test.ts`; `TicketWorkflow.test.tsx`; `e2e/lab-04/ticket-resolution.spec.ts`; ordering and revisions in `actions-taken.api.test.ts` (API-09, API-48) | Done |
| 8 Requester dashboard and regression | 5 | Requester-owned metrics, recent and attention tickets, drill-down, ownership protection, regression of authentication, My Tickets, Ticket Detail, attachments, comments, staff functions, notes, user management | `RequesterDashboard.tsx`; `requester-dashboard.api.test.ts`; `dashboards.spec.ts` (a second Requester's tickets never appear); the Lab 2 and 3 suites, unchanged apart from the listed changes (`tests.md` section 9) and passing in `test-output/` | Done |
| 9 Zen Green, responsive, accessibility | 5 | rendered `ui-spec.md`; desktop, tablet, mobile screenshots of all major screens; the completed visual and accessibility checklist | `docs/lab-04/ui-spec.md` (section 9 checklist ticked, from opening the screenshots); `artifacts/lab-04/screenshots/` at 1280, 768 and 375; `accessibility.spec.ts`, `responsive-screenshots.spec.ts` | Done |

### Part 2: the specification existed before the implementation

Merge times of the pull requests into `lab4-staging` (GitHub, UTC). The contract (F1) was merged first.

| PR | Feature | Merged |
|---|---|---|
| #69 | F1 Sprint 4 engineering contract (specification, API, UI, tests) | 2026-10-11 14:53 |
| #70 | F2 Actions Taken foundation (data) | 2026-10-13 16:40 |
| #71 | F3 Actions Taken API | 2026-10-28 15:01 |
| #72 | F4 Ticket workflow | 2026-10-31 11:25 |
| #73 | F5 Dashboard API | 2026-11-01 09:01 |
| #74 | F6 Actions Taken UI | 2026-11-01 14:24 |
| #75 | F7 Ticket workflow UI | 2026-11-01 14:49 |
| #76 | F8 Role dashboards UI | 2026-11-01 16:42 |
| #77 | F9 E2E and regression | 2026-11-01 18:02 |
| #78 | F10 Hardening and polish | 2026-11-01 19:02 |

## Worksheet sections 1 to 13, requirement by requirement

| Worksheet | Requirement | Where it is met |
|---|---|---|
| 1, 4.3, 4.4 | IT Staff and Administrator create and update Actions Taken; Requester does not; BR-01 one ticket per action; BR-02 owner coordinates, others may act | specification BR-01 and later, authorization matrix 3.4; `authorization-sweep.api.test.ts` (new), `actions-taken.api.test.ts` API-49 (action by staff B on staff A's ticket) |
| 4.1 | Action fields: date and time, description, result, performed by (auto), follow-up required, follow-up note (required when needed), attachment notes | spec FR and BR; `schema.prisma` `ActionTaken`; `ActionsTaken.tsx`; API-01 to API-08 |
| 4.1, 4.5 | full status-transition matrix with roles; resolution rule enforced when a client bypasses the screen; "appears resolved" is advisory | spec 7.3, BR-12 to BR-15; `ticket-workflow.api.test.ts` calls the routes directly; `e2e/lab-04/ticket-resolution.spec.ts` |
| 4.1, 4.6, 6.2 | dashboard metrics, calculation, time zone, drill-down, empty states; backend-calculated; concise | api-spec "Dashboards"; BR-18 to BR-23 and BR-27; Asia/Bangkok window; `performance-smoke.api.test.ts` (new) checks they stay concise |
| 5, 5.1 | one ticket, many actions; earlier data stays valid; at least two justified design decisions; stale-update handling | `schema.prisma`; spec 7.2 (design reasons), `version` and optimistic locking (D-4, BR-17) |
| 5.2 | migration preserves data; legacy tickets without actions; dashboard treatment of old records; migration and rollback documented **and tested** | spec 7.4 and 7.4a (new); README "Migrate" and "Rollback"; `migration.api.test.ts` replays the migration and the rollback SQL |
| 5.3 | idempotent seed; all statuses and priorities, owned and unowned; zero, one, many actions; zero and non-zero metrics | `server/prisma/seed.ts`; `seed.api.test.ts` |
| 6, 6.1, 6.2 | the API contract: actions, both dashboards, conflicts, safe errors, health and regression | `api-spec.md`; server suite (553 tests) |
| 7 | navigation per role with active page; reuse of conventions; focus, keyboard, labels, no colour-only cues; no clipped content, overlap or horizontal scroll; no leftover UI | `App.tsx`; `accessibility.spec.ts`, `responsive-screenshots.spec.ts`; the two stray Bootstrap blues found and fixed in F10 |
| 8.1, 8.2 | IT Staff and Requester dashboards | `StaffDashboard.tsx`, `RequesterDashboard.tsx` |
| 8.3, 8.4 | Actions Taken area in Ticket Detail (list, create, edit and view modes; Requester sees all); permitted transitions only, summary refreshed | `ActionsTaken.tsx`, `StaffTicketDetail.tsx`; `ActionsTaken.test.tsx`, `TicketWorkflow.test.tsx` |
| 8.5 | regression of all earlier screens; consistent loading, validation, success, empty, forbidden, conflict, not-found and safe-failure feedback; no duplicate action from repeated clicking or retry; forms keep data after recoverable failure; no console errors, broken links, placeholder text; README current | Lab 1 to 3 suites in `test-output/`; E2E-04 (double click, failed submit keeps values, console watch); the search of `client/src` in `tests.md` F10 entry; README "Lab 4" |
| 8.6 | responsive and accessibility as in Labs 2 and 3 | 375, 768 and 1280 as `ui-spec.md` and the Lab 4 contract require (Lab 3 used 800 for its tablet) |
| 9 | Spec DD: `specification.md` with 11 sections, `ui-spec.md`, `api-spec.md` | `docs/lab-04/` |
| 9.1 | AC-01, AC-02 style criteria; every AC maps to at least one planned test | AC-01 to AC-50; traceability in `tests.md` (checked by script, none missing) |
| 10 | test plan with unit, API or integration, UI component, UI style, responsive, authorization, workflow, migration or regression, **performance-smoke**, end-to-end | `tests.md` sections 2 to 8 and 6a; style rows STY-L4-01 and 02; performance rows PERF-01 to 04 |
| 11, 11.1, 11.2 | GitHub issues covering contract, tests, migration, Actions Taken, workflow, dashboards, regression, accessibility, visual inspection and release; branch flow as in Labs 2 and 3; AI agent rules | issues #58 to #68; feature branches into `lab4-staging`; `ai-use.md` |
| 12 | minimum repository structure | present: `docs/lab-04/` (six files, plus this one and `test-output/`); `server/tests/lab-04/` (the four named files and three more); `client/tests/lab-04/` (the four named files and three more); `e2e/lab-04/` (the three named specs and two more); `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/` |
| 13 | Definition of Done | `specification.md` section 10 |

## Open items (as of this commit)

1. **Merge to `main`** (release PR #79): needs a review or the author's decision; nothing has been pushed to `main` directly.
2. **Test output from `main` itself** (Part 3): the files in `test-output/` are from the release candidate. The same three commands are run on `main`
   after the merge and added in a follow-up pull request.
3. **Kanban** (Part 1): "all Issues in Done" could not be checked, because the GitHub token lacks `read:project`. Issues #58 to #67 stay open until the release PR merges
   (their pull requests merged into `lab4-staging`, not the default branch); #79 closes #58 to #68.
4. **My Reflection** in `ai-use.md` (Part 4): the author's to write.
5. The submitted PDF itself (worksheet section 14, "Answer Part 1" to "Answer Part 9", one concise file with working links) is not built yet.
