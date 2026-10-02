import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The API tests share one real Postgres database, and some assert on
    // *global* state: users-admin's BR-37 concurrency tests temporarily
    // reduce the system to exactly two active Administrators (deactivating
    // every other one, including other files' Administrator fixtures, whose
    // sessions would then 401 mid-run). Test *files* therefore run one at a
    // time. Tests inside a file still run in order, and the two concurrent
    // requests inside each race test are unaffected — they're a Promise.all
    // within a single test, not parallel files.
    fileParallelism: false,
  },
});
