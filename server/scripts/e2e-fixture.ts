import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";

// Run before the e2e suite (see e2e/global-setup.ts). Lab 3's seed.ts
// deliberately never resets an existing user's password on re-run (an
// upsert shouldn't silently rotate a real account's credentials) — but that
// means the e2e suite's login step can't rely on a seeded user's default
// password staying put after the first run ever exercises the real Change
// Password flow. This script instead owns one dedicated fixture account,
// unconditionally restored to a known password and mustChangePassword:
// false before every e2e run, so the suite's login step is deterministic
// regardless of what a previous run did to it.
export const E2E_REQUESTER_EMAIL = "e2e-requester@toktickit.test";
export const E2E_REQUESTER_PASSWORD = "E2E-Fixture-Pass1";

async function main() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(E2E_REQUESTER_PASSWORD);

  await prisma.user.upsert({
    where: { email: E2E_REQUESTER_EMAIL },
    update: {
      passwordHash,
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      name: "E2E Fixture Requester",
      email: E2E_REQUESTER_EMAIL,
      role: "REQUESTER",
      passwordHash,
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log(`e2e fixture Requester ready: ${E2E_REQUESTER_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
