import { getPrisma } from "../src/prisma.js";

// Issue 3 — seed supported IT request categories.
// Safe to run multiple times without duplicates.
async function main() {
  const prisma = getPrisma();

  const categories = [
    "Account and Access",
    "Hardware",
    "Software",
    "Network",
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Category seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });