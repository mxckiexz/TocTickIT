import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import {
  ADMIN,
  ATTACHMENT_FILENAME,
  CHANGEPW_SHOTS,
  REQUESTER,
  REQUESTER_RESOLVE_TICKET,
  STAFF,
  STAFF_FLOW_TICKET,
  THREAD_INTERNAL_NOTE,
  THREAD_REQUESTER_COMMENT,
  THREAD_STAFF_COMMENT,
  VIEWPORTS,
  login,
  logout,
  runAdminIsolation,
} from "../helpers/accounts";

// docs/lab-03/ui-spec.md §10 + tests.md RSP-01/RSP-02: desktop/tablet/mobile
// evidence for every new Lab 3 screen, saved under
// artifacts/lab-03/screenshots/<screen>/<viewport>.png (the repository
// structure the handout's §12 requires), plus the automatable half of the
// visual-inspection checklist: no horizontal overflow, and the right
// table-vs-cards layout at each width.
const SHOTS = path.join(process.cwd(), "artifacts", "lab-03", "screenshots");

async function shot(page: Page, screen: string, name: string) {
  const dir = path.join(SHOTS, screen);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

// Visual-checklist item: "No clipping, overlap, or horizontal scroll".
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "document is wider than the viewport").toBeLessThanOrEqual(0);
}

// Visual-checklist item "no clipping": a wide table may legitimately scroll
// inside its .table-responsive wrapper, but the columns that carry the
// screen's point (Owner/Status, Role/Status) must not be pushed off-screen at
// the widths where the table layout is used. A page-level overflow check
// can't see this — the wrapper swallows it — so compare the wrapper itself.
async function expectTableFitsItsWrapper(page: Page) {
  const clipped = await page.locator(".table-responsive:visible").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(clipped, "table is wider than its wrapper (columns clipped off-screen)").toBeLessThanOrEqual(0);
}

// Visual-checklist item "no clipping", for dropdowns: a <select> that is too
// narrow for its selected option's text truncates it ("All related syster")
// without any overflow the checks above can see. Measure the selected text
// with the select's own font against its usable width (padding + arrow ~ 44px).
async function expectSelectLabelsNotTruncated(page: Page) {
  const truncated = await page.locator("select:visible").evaluateAll((selects) =>
    (selects as HTMLSelectElement[])
      .map((select) => {
        const style = getComputedStyle(select);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text = select.selectedOptions[0]?.text ?? "";
        const needed = ctx.measureText(text).width + 44;
        return needed > select.clientWidth ? `"${text}" needs ~${Math.ceil(needed)}px, select is ${select.clientWidth}px` : null;
      })
      .filter(Boolean)
  );
  expect(truncated, "dropdown labels are truncated").toEqual([]);
}

test.describe.configure({ mode: "serial" });

for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
  test.describe(`${viewportName} (${size.width}x${size.height})`, () => {
    test.use({ viewport: size });

    test("authentication screens: Login, validation, and forced Change Password", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: /^Log in$/i })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, "authentication", viewportName);

      await page.getByLabel(/^Email/i).fill("nobody@toktickit.test");
      await page.getByLabel(/^Password/i).fill("wrong-password");
      await page.getByRole("button", { name: /^Log in$/i }).click();
      await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
      await expectNoHorizontalOverflow(page);
      await shot(page, "authentication", `login-error-${viewportName}`);

      await login(page, CHANGEPW_SHOTS);
      await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, "authentication", `change-password-${viewportName}`);
    });

    test("voluntary Change Password, opened from the app shell header (FR-30)", async ({ page }) => {
      await login(page, STAFF);
      // The header carries both actions at every width without overflowing.
      await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, "authentication", `change-password-voluntary-${viewportName}`);
    });

    test("Requester Ticket Detail: Public Comments from both roles, no Internal Note, Problem Appears Resolved", async ({ page }) => {
      await login(page, REQUESTER);
      await page.getByRole("button", { name: "My Tickets" }).click();
      await page.locator('[aria-label="Search tickets"]:visible').fill("TKT-E2E-000002");
      await page.getByRole("button", { name: "TKT-E2E-000002" }).click();
      await expect(page.getByText(REQUESTER_RESOLVE_TICKET)).toBeVisible();

      // Both roles' Public Comments are shown...
      await expect(page.getByText(THREAD_STAFF_COMMENT)).toBeVisible();
      await expect(page.getByText(THREAD_REQUESTER_COMMENT)).toBeVisible();
      // ...and the staff-only Internal Note never reaches a Requester's page.
      await expect(page.getByText(THREAD_INTERNAL_NOTE)).toHaveCount(0);
      await expect(page.getByText(/Internal/)).toHaveCount(0);
      await expect(page.getByLabel("Add a comment")).toBeVisible();
      await expect(page.getByRole("button", { name: "Problem Appears Resolved" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, "requester-ticket-detail", viewportName);

      // The confirming state (BR-05: a one-way signal, asked for first). Cancelled,
      // so the fixture is left untouched for E2E-05.
      await page.getByRole("button", { name: "Problem Appears Resolved" }).click();
      await expect(page.getByRole("button", { name: "Yes, mark resolved" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, "requester-ticket-detail", `confirm-resolved-${viewportName}`);
      await page.getByRole("button", { name: /^(Cancel|No)/ }).click();
      await expect(page.getByRole("button", { name: "Problem Appears Resolved" })).toBeVisible();
    });

    test("IT Staff Ticket Queue: table on desktop/tablet, stacked cards on mobile (RSP-01)", async ({ page }) => {
      await login(page, STAFF);
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await expect(page.getByRole("button", { name: /TKT-/ }).first()).toBeVisible();

      const table = page.locator("table");
      if (viewportName === "mobile") {
        await expect(table).toBeHidden();
        await expect(page.locator(".d-md-none").getByText("Updated").first()).toBeVisible();
      } else {
        await expect(table).toBeVisible();
        // Wide table never forces page-level horizontal scroll (it scrolls
        // inside .table-responsive at most).
        const lastUpdatedColumn = page.locator("th", { hasText: "Last Updated" });
        // ui-spec §6: Category and Last Updated drop out at tablet width.
        if (viewportName === "tablet") await expect(lastUpdatedColumn).toBeHidden();
        else await expect(lastUpdatedColumn).toBeVisible();
        await expectTableFitsItsWrapper(page);
      }
      await expectSelectLabelsNotTruncated(page);
      await expectNoHorizontalOverflow(page);
      await shot(page, "staff-queue", viewportName);
    });

    test("IT Staff Ticket Detail: editable vs read-only fields, Internal Notes visually distinct", async ({ page }) => {
      await login(page, STAFF);
      await page.locator('[aria-label="Search tickets"]:visible').fill(STAFF_FLOW_TICKET);
      await page.getByRole("button", { name: "TKT-E2E-000001" }).click();
      await expect(page.getByRole("heading", { name: "TKT-E2E-000001" })).toBeVisible();

      // Requested Priority is a read-only badge; IT Priority is an editable select.
      await expect(page.getByLabel("IT Priority")).toBeEditable();
      await expect(page.getByText("Internal — IT Staff only")).toBeVisible();
      // Category/Related System by name and an openable attachment (FR-29/31).
      await expect(page.locator("dt", { hasText: /^Category$/ })).toBeVisible();
      await expect(page.locator("dt", { hasText: /^Related System$/ })).toBeVisible();
      await expect(page.getByRole("link", { name: ATTACHMENT_FILENAME })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, "staff-ticket-detail", viewportName);
    });

    test("Administrator User Management: table on desktop/tablet, cards on mobile (RSP-02)", async ({ page }) => {
      runAdminIsolation("restore"); // no-op unless an earlier run crashed
      await login(page, ADMIN);
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

      if (viewportName === "mobile") await expect(page.locator("table")).toBeHidden();
      else {
        await expect(page.locator("table")).toBeVisible();
        await expectTableFitsItsWrapper(page);
      }
      await expectNoHorizontalOverflow(page);
      await shot(page, "user-management", viewportName);

      // Create/Edit forms stay usable single-column at every width.
      await page.getByRole("button", { name: "Create user" }).click();
      await expect(page.getByLabel(/Default password/i)).toBeVisible();
      await expectSelectLabelsNotTruncated(page);
      await expectNoHorizontalOverflow(page);
      await shot(page, "user-management", `create-user-${viewportName}`);
      await logout(page);
    });
  });
}
