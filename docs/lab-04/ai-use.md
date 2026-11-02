# Lab 4 — AI Use

**LLM / agent used:** Claude Code (Anthropic), model **Claude Sonnet 5.5** (`claude-sonnet-5-5`) for the whole
sprint: the session transcripts record that model on every reply from 8 October 2026 to the end. It acted as
**both** the specification agent and the coding agent from the handout: one session at a time, one tool, with access
to this repository. It could read and write files, run the server, client and Playwright test suites, run `git`
and `gh` (branches, pull requests, issues, pull-request comments), run Prisma migrations against the local
development database, and drive a real browser to look at the screens it built.

**Who wrote this file.** The sections below up to "Selected prompts" were drafted by the agent from the session
transcripts, the git history and the pull requests, and are to be checked by the author before submission. The
prompts are quoted from the transcripts. **"My Reflection" is left for the author to write in their own words.**

**Disclosure on attribution.** By the author's own choice, commit messages and pull-request descriptions in this
repository do **not** carry AI co-author trailers; this file is where AI use is disclosed. Concretely: the agent
drafted every commit message and pull-request description, and wrote all the code, tests, migrations, specification
documents, README changes and screenshots in this sprint under the author's direction. The "Author's response"
comments in `reviewer.md` were drafted by the agent and posted from the author's GitHub account at the author's
instruction (for example after the author typed "คอมเม้นเลย" ("comment now")). The reviews themselves were
written by a different person, Thanwarat1303. The agent did not review its own work as the reviewer.

## How it was used

The sprint followed the brief (`LAB4_BRIEF.md`) in its own order.

1. **Read, then ask.** The agent read the repository (`schema.prisma`, the routes, the auth middleware, the Zen
   Green theme, the Lab 2 and 3 tests and docs) and summarised it before writing anything. The brief required one
   question before Phase 1: the handout's Actions Taken fields had no assignee or status, but the demo asked for
   assigning, completing, cancelling and refusing an inactive assignee. The agent proposed adding both and waited
   for the author's confirmation; the answer became decision D-1 in `specification.md`.
2. **Specification first.** `specification.md`, `api-spec.md`, `ui-spec.md` and `tests.md` were written and
   reviewed before any implementation, and merged into `lab4-staging` first (PR #69). Eleven GitHub issues
   (#58 to #68, F1 to F11) and one branch per feature came from the brief's feature breakdown.
3. **One feature at a time, tests first.** For each feature the author said which was next ("ทำฟีเจอรต่อไปเลย"),
   and the agent wrote the failing tests, then the code, then ran the suites. For UI work it also opened the
   running app in a browser and looked at it. Each feature became one pull request into `lab4-staging`
   (`Closes #n`), reviewed by Thanwarat1303.
4. **Review rounds.** When changes were requested, the author pasted the review text to the agent. The agent
   fixed every point, added a regression test for it, and reported; the author then asked it to push and, in most
   rounds, to comment on the pull request. Six of the ten feature PRs had at least one changes-requested review;
   `reviewer.md` quotes each one.
5. **Checking the checks.** For most tests the agent also broke the code on purpose ("mutation checks") to confirm
   the test fails, and recorded which tests it had to strengthen because a deliberately broken version still
   passed. These are listed per feature in the log in `tests.md` section 13.
6. **Release (F11).** README, `reviewer.md` (generated from the pull requests' own data, not retyped), this file,
   the test output, and the release pull request into `main`.

What stayed with the author: scope calls (what to build next, the assignee and status decision), which review
comments were right, when to push and comment, when to merge, and the final audit against the brief. The author
also asked questions to understand the work: how much code there was, what a test is, how a full-stack developer
gets feedback, what happens when the code reaches thousands of lines (see prompt 5).

**Things the agent got wrong or left incomplete that were caught** (all in `reviewer.md` or `tests.md`):
the assignee check ran before the transaction, leaving a race (review of PR #71); the Ticket write was not
conditional on `version` (review of PR #72); `recent=1` was missing from the staff list (review of PR #73); the
Administrator could not reach the Ticket Queue in the UI and an edit always sent `assigneeId` (review of PR #74);
tablet screenshots were 800px wide where the contract says 768px (review of PR #78). The agent's own checks found
others, among them a test (API-26b) that could not fail, a refresh failure that replaced the whole Ticket Detail
with an error screen, a double-click test that still passed with its guard removed (because a second defence
covered for it), and two stray Bootstrap blues in the Zen Green theme.

## Selected prompts

Prompts are quoted from the session transcripts. They were in Thai (English glosses in parentheses) and are mostly
short; pasted reviewer text is the reviewer's, quoted only to show what the author gave the agent.

| # | Prompt (as given) | What it drove |
|---|---|---|
| 1 | `@"/Users/aphisamai/Downloads/LAB4_BRIEF.md"`, then "ใช้ skill ที่เกี่ยวกับ code ให้มีประสิทธิภาพด้วยนะ อย่าลืมเเบ่ง feature เเยกbranch" ("use the code skills efficiently, and don't forget to split the features into separate branches") | Reading the repository and the brief, the question about assignee and status (D-1), the Phase 0 engineering contract, the eleven issues F1 to F11 and `lab4-staging`. |
| 2 | Pasted review of the contract: "Request changes — the previous four findings are addressed well: Administrator scope is now consistently aligned with handout §4.3 …" | A later contract round: Action Taken revisions made append-only (an immutable `ActionTakenRevision` table), `version` made required on state-changing routes (D-4), the Ticket row lock (BR-13), and a card label fixed. |
| 3 | Pasted review: "Blocking: the new ticket-row lock closes the concurrent RESOLVED-vs-action race, but the invariant can still be broken without a race. BR-10 …" | BR-10: a RESOLVED ticket accepts only COMPLETED new actions (`409 TICKET_RESOLVED`), enforced in the API and offered that way in the UI; a follow-up paste ("One remaining test-coverage point: API-69 …") added the description-only edit on an inconsistent stored action and fixed the order of checks on edit. |
| 4 | Pasted review of PR #71: "Request changes — one concurrency gap in BR-07. `checkAssignee()` runs before the Action Taken transaction in both POST and PATCH …" | Re-checking the assignee inside the transaction with `FOR SHARE` on the user row, two test seams to hold the gap open deterministically, and a mutation check that the new tests fail without it. |
| 5 | Four questions in a row: "ฉันอยากรุ้ว่าที่ทำมา โค้ดทั้หมดเยอะไหม" ("I want to know whether all the code so far is a lot"), "เทสคืออะไร" ("what is a test"), "โดยปกติเเล้ว คนที่ทำ full stack ก็ เเค่เียนโค้ดไป tester จะเป็นคนบอกเองว่าเเก้อะไรตรงไหนใช่มั้ย" ("normally a full-stack developer just writes code and a tester tells them what to fix, right?"), "เเล้วถ้าโค้ดทีเป็นพัน บรรทัด" ("and if the code is thousands of lines?") | Explanations only, no code change: the size of what had been written, what the tests are for, and why tests written first are what keeps a codebase of that size safe to change. The author's questions, not the agent's initiative. |
| 6 | Pasted review of PR #72: "One blocking point before merge: the ticket workflow routes read and compare `ticket.version` after taking the Ticket lock, but the write itself is still `tx.ticket.update({ where: { id: ticketId } })`." | `updateTicketIfVersion`: one `UPDATE … WHERE id AND version`, so the optimistic lock cannot be defeated even without the row lock; a test seam that bumps the version between the check and the write. |
| 7 | Pasted review of PR #74: "Thanks — the component work and coverage are strong, but I found two blocking issues before merge. 1. Administrator cannot reach this UI. …" | A "Main" navigation for the Administrator (Ticket Queue and User Management) and an edit that sends `assigneeId` only when the assignee changed, so a description-only edit on an action whose assignee was deactivated no longer fails; four new tests. |
| 8 | "มีข้อผิดพลาดอื่นๆ อีกไหม" ("are there any other errors?") | A self-review, not a reviewer's finding: the agent re-read its own pull request, found that a failed refresh after a successful write replaced the whole Ticket Detail with an error screen and threw away what the user had typed, and fixed it test-first (a notice with Retry). It also listed what it had not checked. |
| 9 | "ทำฟีเจอรต่อไปเลย" ("do the next feature"), said repeatedly during the sprint | The loop itself: the agent took the next issue, branched from the current `lab4-staging`, wrote tests first, implemented, ran the suites, looked at the result in a browser, opened the pull request, and stopped for review. |
| 10 | Pasted review of PR #78: "found one blocking issue before approval. The Lab 4 contract requires responsive checks at 375px, 768px and 1280px … e2e/helpers/accounts.ts defines the tablet viewport as 800px …" | A separate 768px set of viewports for Lab 4, regenerated screenshots and a rerun of RSP-01 and RSP-02. The agent did not change the shared 800px constant that Lab 3's own contract uses, said so in its reply on the pull request, and offered to move both labs if the reviewer wanted. |

## My Reflection

(To be written by the author, in their own words, on how the specification agent and the coding agent were used.)
