# Lab 4 test output

Raw output of the three suites, stripped of colour. All three files were produced in **one run set**, one suite after
another, on the author's local development database, at the **same commit**:

| | |
|---|---|
| Commit under test | `82ec2002f4ae2d5922e8c5f105ec5aed7409ebdd` (branch `release/lab4`) |
| Run set started | 2026-11-02 05:10:32 UTC |

Each file starts with those two facts and the time its own suite started. The commit that adds these three files changes
nothing else, so the code under test is the code of the release pull request. Check it with
`git diff 82ec200 HEAD --stat`: only files in this folder differ.

| File | Command | Result |
|---|---|---|
| `server-vitest.txt` | `cd server && npx vitest run` | 26 files, 553 tests pass |
| `client-vitest.txt` | `cd client && npx vitest run` | 20 files, 291 tests pass |
| `playwright.txt` | `npx playwright test` (repository root) | 102 tests pass |

This is the **release candidate** run (REG-01a in `tests.md`). The run on **`main`** (REG-01b) does not exist yet and is
**pending**: after the release pull request is merged, the same three commands are run on `main` and the output is added
here in a follow-up pull request. There is no CI in this repository.
