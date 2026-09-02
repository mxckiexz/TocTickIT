import { getPrisma } from "../src/prisma.js";

// Issue 3 — seed supported IT request categories.
// Safe to run multiple times without duplicates.
async function main() {
  const prisma = getPrisma();

  const categories = [
    { name: "Account and Access", isActive: true },
    { name: "Hardware", isActive: true },
    { name: "Software", isActive: true },
    { name: "Network", isActive: true },
    { name: "Archived Category (test fixture)", isActive: false },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { isActive: category.isActive },
      create: category,
    });
  }

  const relatedSystems = [
    { name: "Email", isActive: true },
    { name: "Campus Wi-Fi", isActive: true },
    { name: "VPN", isActive: true },
    { name: "LEB2 App", isActive: true },
    { name: "Grade Submission App", isActive: true },
    { name: "Printer", isActive: true },
    { name: "Corporate Laptop", isActive: true },
    { name: "Archived System (test fixture)", isActive: false },
  ];

  for (const relatedSystem of relatedSystems) {
    await prisma.relatedSystem.upsert({
      where: { name: relatedSystem.name },
      update: { isActive: relatedSystem.isActive },
      create: relatedSystem,
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
      update: { name: requester.name, isActive: requester.isActive },
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