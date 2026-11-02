# Lab 4 test output

Raw output of the three suites, stripped of colour, each file starting with the command, the branch and commit, and the time.

| File | Command | Result |
|---|---|---|
| `server-vitest.txt` | `cd server && npx vitest run` | 26 files, 553 tests pass |
| `client-vitest.txt` | `cd client && npx vitest run` | 20 files, 291 tests pass |
| `playwright.txt` | `npx playwright test` (repository root) | 102 tests pass |

These runs are on the **release candidate** (`release/lab4`, which is `lab4-staging` plus the documentation of the
release pull request), on the author's local development database. After the release pull request is merged, the same
three commands are run on `main` and the output is added here in a follow-up pull request, so that the evidence
the brief asks for ("test output from main") is from `main` itself. There is no CI in this repository.
