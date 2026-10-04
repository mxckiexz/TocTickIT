# Lab 3 — AI Use

**LLM / agent used:** Claude Code (Anthropic) running Claude Sonnet 5 and, for the
last part of the sprint, Claude Sonnet 5.5 (I switched models partway through with
`/model`). It acted as **both** the specification agent and the coding agent from the
handout — one session, one tool, with access to this repository: reading and writing
files, running the server/client/e2e test suites, running `git` and `gh` (branches, PRs,
issues, PR comments), running Prisma migrations against my local development database,
driving a real browser (Playwright) and viewing the screenshots it produced.

**Disclosure on attribution.** By my own choice, commit messages and pull-request
descriptions in this repository do **not** carry AI co-author trailers. This file is
where AI use is disclosed. Concretely, the agent drafted every commit message and PR
description, wrote the "Author's response" comments you will see in `reviewer.md`
(I asked for them and posted them from my GitHub account), and wrote all the code,
tests, migrations, specification documents and screenshots in this sprint under my
direction. Reviews were written by my classmate Thanwarat1303, a different person — see
`reviewer.md`.

## How it was used

The sprint followed the handout's order. First a **specification pass**: the agent read
the lab sheet and the existing Lab 2 code (`schema.prisma`, `app.ts`, the React screens)
and drafted `specification.md`, `api-spec.md`, `ui-spec.md` and `tests.md` — grounded in
the real routes and tables rather than the handout alone. Then eight GitHub issues and
branches off `lab3-staging`, built one at a time. For each feature I named the next one;
the agent implemented schema/migration, API, React screen and tests together, and I asked
for real `npm test` / Playwright output before trusting "done". Every PR then went to
Thanwarat1303; when changes were requested I pasted the review text to the agent, which
fixed every point and added a regression test, then I asked for the PR to be updated.

What stayed mine: scope calls (this sprint's eight-feature breakdown and the
`feature/1…8` renumbering, an Administrator being read-only on tickets), which review
comments were right, when to merge, and the final audit against the lab sheet. I also
treated the agent's own claims with suspicion where it mattered — see the reflection for
the cases where that was necessary.

## Selected prompts

Prompts were in Thai (English glosses in parentheses). Pasted reviewer text is the
reviewer's, quoted here only to show what I gave the agent.

| # | Prompt (as given) | What it drove |
|---|---|---|
| 1 | Pasted the whole Lab 3 handout, plus: "ไฟล์ se คือ เหมือนเป็น ref หรือคลังความรู้เพิ่มเติม เราจะอิง tocticit เป็นหลัก เเละ ลิ้งจากgit เเละอิงจากใบงาน lab3KMUTT … scope น่าจะประมาณนี้" ("the `se` folder is only reference material; we rely mainly on toktickit, git, and the Lab 3 sheet … the scope is roughly this") | Set the source of truth. The agent inspected the real repo (found the Lab 2 dev-selector comment in `schema.prisma`, no auth anywhere) before proposing anything, and treated the course folder as background, not a template. |
| 2 | "เริ่มจากให้คุณสร้าง branch เเต่ละ feature เเต่ตอบคำถามก่อนว่า feature ทั้งหมดมีอะไรบ้าง … ต้องทำ lab3 staging เเยกจาก main ก่อน" ("start by creating a branch per feature, but first answer what all the features are … `lab3-staging` must be split off `main` first") | The eight-feature breakdown, `lab3-staging`, and eight issues/branches. I then asked for them to be renamed `feature/1…8` (the issues landed on #34–#41 because PRs share GitHub's number space). |
| 3 | "เริ่มทำ branch เเรกได้เลย เทสด้วยนะ ขอหลักฐานการเทส … ทำเป็น pdf log เเยกว่าทำอะไรบ้างเพิ่มอะไรบ้าง … เเละ อย่าให้ฉันได้รับ ฟีดเเบ้ค หรือต้องเเก้" ("start the first branch, test it, give me test evidence … a PDF log of what was added … and don't make me get feedback or have to fix things") | The engineering-contract branch and its evidence PDF. Because that branch was documentation only, the agent said plainly that the honest test evidence was a Lab 2 regression baseline and marked every Lab 3 test row `Planned` rather than claiming a pass — which my "no feedback" instruction could have tempted it to gloss over. |
| 4 | "ทำ feature2 ร่างๆไว้รอเลยๆ เเต่อย่าลืมเผื่อ รีวิวเวอร์ เเก้ ฟีเจอร์1" ("rough out feature 2 while it waits, but allow for the reviewer changing feature 1") | Authentication Foundation (User/Session, expand→backfill→contract migration of the Lab 2 Requester table, bcrypt, session cookie) built while PR #43 was still in review, kept out of feature 1's files. |
| 5 | Pasted the first review of the contract: "Hey, I read through the four docs and compared them with the lab sheet … Admin ticket access doesn't match across files …" | The first rework: one Administrator rule across all four documents, the missing authorization matrix, an honest account of which Lab 2 tests must change, and 8 smaller fixes. A second paste ("the required confirmation column is missing") added the transition-confirmation rule (BR-42). |
| 6 | Pasted: "POST /api/staff/tickets/:id/claim has a TOCTOU race … make the claim atomic … add a concurrency regression test using two authenticated staff sessions and Promise.all" | An atomic `updateMany … where ownerId: null` claim and the first concurrency test of the sprint. |
| 7 | Pasted: "Changes requested — the email and Origin fixes look correct, but there is still a BR-37 concurrency race … two Administrators … both pass the guard" | A transaction with `pg_advisory_xact_lock` around the last-admin check-and-update, plus two race tests the agent first confirmed *fail* with the lock disabled. It also reported a second shape of the same race (two admins deactivating each other) that the review hadn't named. |
| 8 | Pasted a message that was not meant for this repository ("Fixed in 1410ffd … comments/notes routes …") followed by "ผิดๆๆ" ("wrong, wrong") | A deliberate test of verification: the agent did not act on the pasted text, said it did not match the branch it was on, and asked what I meant. |
| 9 | "ทำฟีเจอร์ต่อไปเลย" ("do the next feature") — twice, for Administrator User Management and E2E/visual evidence | Features 6 and 7. In 7 the agent opened every screenshot rather than trusting passing assertions, and found two real UI defects (clipped table columns, truncated filter labels) the assertions had missed. |
| 10 | Pasted: "the E2E fixture cleanup is incomplete, so the suite is not fully repeatable yet … regenerate the affected screenshots from the clean fixture state" | One managed `[e2e]` ticket prefix, a sweep that also removes attachment files, two consecutive full runs compared for identical database state, regenerated screenshots. |
| 11 | Attached the Lab 3 sheet: "ตรวจเช็คในใบแลป 03 ว่าฉันทำครบไหม ทุกฟังก์ชันเลย อาจจะทำ feature แยกว่า เก็บตก" ("check against the lab sheet whether I did everything, every function; maybe do a separate leftovers feature") | The agent re-read all 18 pages and checked each requirement against the code instead of against our own spec. It found three unmet requirements (IT Staff could not open attachments; no way to change one's own password after first login; the staff detail omitted Category and Related System) and, while verifying them, a fourth the audit did not ask about: the Log out button was green-on-green and invisible. Fixed as Feature 9 (issue #53), test-first. |

## My reflection

AI made the mechanical half of spec-driven development very fast: turning a lab-sheet
section into numbered requirements, and a numbered requirement into a migration, an
endpoint, a screen and a test that all cite the same ID. The traceability tables in
`tests.md` would have taken me days to keep consistent by hand.

What it did not replace was checking. Three things went wrong in ways I would not have
caught from the agent's own summaries. The first contract draft contradicted itself on
Administrator access, and claimed Lab 2's tests would pass "unmodified" — which the agent's own
Feature 2 work then showed to be false (their fixtures had to change). The reviewer
caught both before I did. The agent twice reported
something as fixed that was not (a filter label still clipped after it said it was fixed;
an end-to-end suite it described as repeatable that was leaving tickets behind), and in
both cases the thing that exposed it was looking at the actual output — a screenshot, a
database count — instead of the green test line. And three separate times the same
check-then-act race slipped in (ticket claim, case-insensitive email, last
Administrator): a sequential test passes on racy code, so only the reviewer's concurrent
cases found them.

The clearest case came last. After every suite was green and the release PR was reviewed,
checking the system against the lab sheet — instead of against our own specification — found
three required behaviours that were simply missing, and a Log out button that had been invisible
(green on green) since the third feature. Every test could click it; none asked whether a person
could see it. Passing tests only prove the things somebody thought to test.

The habit I am keeping: ask the agent for evidence, not assurance, and make it prove a
new test can fail before believing it passes. The agent is thorough once pointed at the
right question; deciding the question — and whether the answer is actually true — is still
my job. I also nearly bypassed my own review gate once (PR #45, merged with changes still
requested) and had to revert it; that was a human mistake, not an AI one, and it is in
`reviewer.md` as it happened.
