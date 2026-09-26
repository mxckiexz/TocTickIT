import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";

// Issue 3 — seed supported IT request categories.
// Safe to run multiple times without duplicates.
//
// Lab 3 — local-dev-only default password for every seeded User (Requester,
// IT Staff, and Administrator alike): documented here and in
// server/.env.example, never a real secret. Every seeded account has
// mustChangePassword: true, so this value only ever gets someone past the
// forced Change Password screen once (docs/lab-03/specification.md §7.5).
const SEED_DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe123!";

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

  // Lab 3 — docs/lab-03/specification.md §7.5's required seed mix: 4 active +
  // 1 inactive Requester (the Lab 2 Requester rows, now migrated to User —
  // this upsert only matters for a from-scratch database), 3 active + 1
  // inactive IT Staff, 1 active Administrator.
  const passwordHash = await hashPassword(SEED_DEFAULT_PASSWORD);

  const users = [
    { name: "Jennifer Anderson", email: "jennifer.anderson@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "Michael Brown", email: "michael.brown@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "Sarah Johnson", email: "sarah.johnson@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "David Lee", email: "david.lee@toktickit.test", role: "REQUESTER" as const, isActive: true },
    { name: "Emily Carter", email: "emily.carter@toktickit.test", role: "REQUESTER" as const, isActive: false },
    { name: "Priya Nair", email: "priya.nair@toktickit.test", role: "IT_STAFF" as const, isActive: true },
    { name: "Marcus Chen", email: "marcus.chen@toktickit.test", role: "IT_STAFF" as const, isActive: true },
    { name: "Olivia Martinez", email: "olivia.martinez@toktickit.test", role: "IT_STAFF" as const, isActive: true },
    { name: "Daniel Kim", email: "daniel.kim@toktickit.test", role: "IT_STAFF" as const, isActive: false },
    { name: "Grace Thompson", email: "grace.thompson@toktickit.test", role: "ADMINISTRATOR" as const, isActive: true },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, isActive: user.isActive },
      create: { ...user, passwordHash, mustChangePassword: true },
    });
  }

  console.log("Category, RelatedSystem, and User (Requester/IT Staff/Administrator) seed completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });