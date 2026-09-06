# Lab 2 — AI Use

**LLM / agent used:** Claude Code (Anthropic), running Claude models
(Sonnet 5 / Opus, depending on the session) as an AI coding agent with
tool access to this repository — reading/writing files, running the test
suites, running `git`/`gh` commands, and driving a real browser for
manual verification.

## How it was used

Each of the 9 backlog features followed the same loop: I described the
feature (usually pointing at the labsheet section and the pre-existing
stub branch name), the agent proposed and wrote the implementation
(schema/migration, Express endpoint, React UI, and tests together), I ran
it and asked for the actual `npm run test` output before trusting "done",
then pushed and opened the PR. When my classmate reviewer
(Thanwarat1303) came back with change requests, I pasted the review text
back to the agent and asked for the fixes — the agent's job was to
address every point named in the review, not to reinterpret or drop any.

I made the calls the agent couldn't: which branch to reuse, when a
PR needed to be closed and reopened after a conflict, whether a
divergence from the handout's example (Feature 9's first draft hid
removed attachments instead of keeping them visible as metadata) was
acceptable or needed fixing, and — after doing my own audit against the
labsheet PDF — which gaps (Zen Green color tokens, missing docs, no
GitHub Issues) were worth going back and closing before submission.

## Selected prompts

| # | Prompt (as given) | What it drove |
|---|---|---|
| 1 | "ทำ feature 3 เลย ใน branch feature3" ("do feature 3 now, in branch feature3") | Kicked off a full feature implementation (backend endpoint, migration, React form, tests) from just a feature number and branch name — the agent had to read the labsheet's scope for that item itself. |
| 2 | Pasted the reviewer's Feature 3 review verbatim (ownership check missing, Requester picker should be its own step) followed by "แก้ให้ที" ("fix it for me") | The most common loop in this project: paste real review feedback, get every point addressed, re-run tests, re-push. |
| 3 | "ต้องการ revert feature3" → later clarified the real intent was to fix, not revert | Tested whether the agent would blindly execute a stated action (revert) or actually engage with what I meant once I clarified — it correctly switched from "prepare a revert PR" to "close the now-redundant revert PR and fix forward" once I explained. |
| 4 | "ทำ feature9 เลย ขอเเบบไม่ต้องเเก้" ("do feature 9, want it done without needing revisions") | Pushed the agent to self-review before asking for my sign-off — e.g. it caught its own test file's physical-file cleanup bug via a before/after file-count check, the same kind of issue the reviewer had flagged on an earlier feature, before I ever saw it. |
| 5 | Pasted the reviewer's Feature 9 review (removed attachments should stay visible as metadata; add a removal-reason field; the confirm dialog doesn't match the theme) | A 3-point review fix that changed real behavior (API response shape, a new DB column, a new UI modal) — not just a text tweak. |
| 6 | "เช็ค feature ทั้งหมดว่าตรงตาม lab ไหม" ("check whether all the features match the lab requirements") | Asked the agent to audit the finished work against the actual labsheet PDF rather than just its own specification.md — this is what surfaced the Zen Green color-token gap, the missing `reviewer.md`/`ai-use.md`, and the missing GitHub Issues/Kanban board. |
| 7 | "แก้ให้หมด" ("fix everything") | Authorized the agent to close every gap found in the audit above — required one clarifying question first (whether to disclose AI use truthfully in this very file, given I'd earlier asked for no AI-attribution in commits/PRs that teammates see) before proceeding. |
| 8 | "push เลย" / "ปิด PR #14 แล้วแก้ต่อบน Feature 3 ที่ merge ไปแล้ว" (git/PR housekeeping decisions) | Day-to-day git workflow: committing, pushing, opening PRs, and — when a revert PR became redundant — closing it and continuing on the already-merged branch instead. |

## My reflection

AI made the repetitive part of Spec-Driven Development fast — turning a
labsheet section into `specification.md`/`api-spec.md`/`tests.md` entries,
writing the matching endpoint and tests together, and then doing the
same again for each review round without losing track of which point was
already fixed. What it didn't replace was my own judgment: deciding which
of the reviewer's comments actually mattered, catching that Feature 9's
first pass diverged from the handout's own wording (which the reviewer
also caught), and — most recently — noticing that "my specification.md
matches" isn't the same question as "does this match the real labsheet,"
and asking for that audit myself instead of assuming the docs were
already correct. The agent is thorough once pointed at the right
question; picking the right question is still mine.
