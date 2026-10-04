Test output from runs on main at 1326435 (merge of PR #56), 2026-10-04.
One suite at a time, one shared Postgres database. Raw logs, unedited.
e2e.log is the second Playwright run: the first run on main failed 17 tests because 'npm ci' had deleted the cache of an already-running Vite dev server (504 on every dependency); the server was restarted and the run repeated.
