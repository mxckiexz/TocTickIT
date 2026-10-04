import { readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPrisma } from "../src/prisma.js";

// BR-37 ("the system always has at least one active Administrator") is a
// global invariant, so the e2e spec that proves the last-admin guard has to
// run with the e2e fixture Administrator as the *only* active one.
//   isolate -> deactivate every other active Administrator, remembering which
//   restore -> reactivate exactly those
// The remembered ids live in a temp file so `restore` works from a different
// process (the spec's afterAll, globalSetup healing a crashed earlier run, or
// globalTeardown). `restore` with no state file is a no-op, so it's always
// safe to call.
const E2E_ADMIN_EMAIL = "e2e-admin@toktickit.test";
const STATE_FILE = path.join(os.tmpdir(), "toktickit-e2e-admin-isolation.json");

async function isolate() {
  const prisma = getPrisma();
  if (existsSync(STATE_FILE)) {
    // A previous isolate was never restored — heal that first, otherwise its
    // ids would be forgotten and those Administrators left deactivated.
    await restore();
  }
  const others = await prisma.user.findMany({
    where: { role: "ADMINISTRATOR", isActive: true, NOT: { email: E2E_ADMIN_EMAIL } },
    select: { id: true },
  });
  const ids = others.map((o) => o.id);
  writeFileSync(STATE_FILE, JSON.stringify(ids));
  await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
  console.log(`e2e admin isolation: deactivated ${ids.length} other Administrator(s)`);
}

async function restore() {
  if (!existsSync(STATE_FILE)) return;
  const ids: number[] = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  await getPrisma().user.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
  rmSync(STATE_FILE);
  console.log(`e2e admin isolation: restored ${ids.length} Administrator(s)`);
}

const command = process.argv[2];

(async () => {
  if (command === "isolate") await isolate();
  else if (command === "restore") await restore();
  else throw new Error('Usage: e2e-admins.ts <isolate|restore>');
})()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
