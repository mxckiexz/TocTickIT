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

  const relatedSystems = [
    "Email",
    "Campus Wi-Fi",
    "VPN",
    "LEB2 App",
    "Grade Submission App",
    "Printer",
    "Corporate Laptop",
  ];

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const requesters = [
    { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", isActive: true },
    { name: "Michael Brown", email: "michael.brown@toktickit.test", isActive: true },
    { name: "Sarah Johnson", email: "sarah.johnson@toktickit.test", isActive: true },
    { name: "David Lee", email: "david.lee@toktickit.test", isActive: true },
    { name: "Emily Carter", email: "emily.carter@toktickit.test", isActive: false },
  ];

  for (const requester of requesters) {
    await prisma.requester.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    });
  }

  console.log("Category, RelatedSystem, and Requester seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });