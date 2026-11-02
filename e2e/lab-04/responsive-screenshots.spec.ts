import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ADMIN, LAB4_VIEWPORTS, REQUESTER, STAFF, login } from "../helpers/accounts";
import {
  columnsAcross,
  expectNoHorizontalOverflow,
  expectNothingOverlapsOrLeavesTheScreen,
  expectSelectLabelsNotTruncated,
} from "../helpers/layout";
import { seedHardeningTicket, watchConsole, type CreatedTicket } from "../helpers/lab4";

// docs/lab-04/tests.md section 6: RSP-01 (the dashboards at 375, 768 and 1280) and RSP-02 (Ticket Detail with Actions
// Taken and the status buttons at the same widths), plus the screenshots docs/lab-04/ui-spec.md section 9 asks for,
// saved under artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/ as desktop.png,
// tablet.png and mobile.png, with the conflict banner, the gate message, the Requester's read-only view and the
// Administrator's view beside them. Each shot is taken after the layout checks pass, and is then opened and looked at
// (the checklist in ui-spec.md section 9 is filled in from that, not from these assertions).
const SHOTS = path.join(process.cwd(), "artifacts", "lab-04", "screenshots");
const WIDE_COLUMNS: Record<string, number> = { desktop: 3, tablet: 2, mobile: 1 };

async function shot(page: Page, screen: string, name: string, options: { fullPage?: boolean } = { fullPage: true }) {
  const dir = path.join(SHOTS, screen);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: options.fullPage ?? true });
}

// Everything that can go wrong with the layout, in one call.
async function expectSoundLayout(page: Page) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await expectNoHorizontalOverflow(page);
  await expectNothingOverlapsOrLeavesTheScreen(page);
  await expectSelectLabelsNotTruncated(page);
}

test.describe.configure({ mode: "serial" });

for (const [viewportName, size] of Object.entries(LAB4_VIEWPORTS)) {
  test.describe(`${viewportName} (${size.width}x${size.height})`, () => {
    test.use({ viewport: size });

    let ticket: CreatedTicket;
    let staffContext: BrowserContext;
    let staff: Page;
    let watched: ReturnType<typeof watchConsole>;

    test.beforeAll(async ({ browser, playwright }) => {
      ticket = await seedHardeningTicket(playwright, `Hardening ${viewportName}`);
      staffContext = await browser.newContext({ viewport: size });
      staff = await staffContext.newPage();
      await login(staff, STAFF);
      watched = watchConsole(staff);
    });

    test.afterAll(async () => {
      await staffContext.close();
    });

    test("RSP-01: the IT Staff dashboard fits, its cards go 3, 2, 1 across, and nothing overlaps", async () => {
      await staff.goto("/#/dashboard");
      await expect(staff.getByRole("heading", { name: "Unassigned" })).toBeVisible();
      await expect(staff.getByRole("heading", { name: "My recent actions" })).toBeVisible();
      await expectSoundLayout(staff);
      expect(await columnsAcross(staff, "[data-card]"), "cards in the first row").toBe(WIDE_COLUMNS[viewportName]);
      // Non-zero data: the scenario made this person own a ticket and hold open actions.
      await expect(staff.getByRole("link", { name: /^View [1-9]\d* tickets? with my open actions$/ })).toBeVisible();
      await shot(staff, "staff-dashboard", viewportName);
    });

    test("RSP-01: the Requester dashboard fits and stacks its cards on a phone", async ({ browser }) => {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      await login(page, REQUESTER);
      await expect(page.getByRole("heading", { name: "Open tickets" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Recently updated" })).toBeVisible();
      await expectSoundLayout(page);
      expect(await columnsAcross(page, "[data-card]"), "cards in the first row").toBe(viewportName === "mobile" ? 1 : 2);
      await shot(page, "requester-dashboard", viewportName);
      await context.close();
    });

    test("RSP-01: the Administrator dashboard, with its zeros and the user line, fits", async ({ browser }) => {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      await login(page, ADMIN);
      await expect(page.getByText(/^Users: \d+ total, \d+ active$/)).toBeVisible();
      // This account owns no tickets and holds no actions: the zero state, with "Nothing here" and the empty list.
      await expect(page.getByText("You have not recorded any actions yet.")).toBeVisible();
      await expect(page.getByText("Nothing here").first()).toBeVisible();
      await expectSoundLayout(page);
      await shot(page, "staff-dashboard", `administrator-zero-${viewportName}`);
      await context.close();
    });

    test("RSP-02: staff Ticket Detail with Actions Taken and the status buttons fits at this width", async () => {
      await staff.goto("/#/dashboard");
      await staff.goto(`/#/queue/${ticket.id}`);
      await expect(staff.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await expect(staff.locator("#actions-taken li")).toHaveCount(3);
      await expectSoundLayout(staff);

      // The status buttons wrap rather than run off the screen, and each is fully inside the viewport.
      const group = staff.getByRole("group", { name: "Change status" });
      for (const button of await group.getByRole("button").all()) {
        const box = (await button.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      }
      // The gate says why Resolved is shut (open actions remain).
      await expect(staff.getByText("Finish or cancel open actions")).toBeVisible();
      await shot(staff, "actions-taken", viewportName);
      await group.locator("xpath=ancestor::dd[1]").screenshot({ path: ensure("actions-taken", `gate-message-${viewportName}`) });
    });

    test("RSP-02: the Add action form stacks its fields on a phone and nothing is cut off", async () => {
      await staff.getByRole("button", { name: "Add action" }).click();
      const form = staff.getByRole("form", { name: "Add action" });
      await expect(form).toBeVisible();
      await form.getByLabel(/Description/).fill("Check that the fields have room");
      await expectSoundLayout(staff);
      const formWidth = (await form.boundingBox())!.width;
      const description = (await form.getByLabel(/Description/).boundingBox())!.width;
      expect(description, "the Description field uses the width it has").toBeGreaterThan(formWidth * 0.8);
      if (viewportName === "mobile") {
        // One column: Status, Assignee and Action time each take the full width of the form.
        for (const label of [/^Status/, /Assignee/, /Action time/]) {
          const width = (await form.getByLabel(label).boundingBox())!.width;
          expect(width, `${label}`).toBeGreaterThan(formWidth * 0.8);
        }
      }
      await shot(staff, "actions-taken", `add-form-${viewportName}`);
      await form.getByRole("button", { name: "Cancel" }).click();
    });

    test("RSP-02: the Administrator's Ticket Detail has the same enabled controls as IT Staff", async ({ browser }) => {
      const context = await browser.newContext({ viewport: size });
      const admin = await context.newPage();
      await login(admin, ADMIN);
      await admin.goto(`/#/queue/${ticket.id}`);
      await expect(admin.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await expect(admin.locator("#actions-taken li")).toHaveCount(3);
      // The ticket is owned by the IT Staff member, so Reassign (not Claim) is the owner control, as it is for them.
      await expect(admin.getByRole("button", { name: "Reassign" })).toBeEnabled();
      await expect(admin.getByLabel("IT Priority")).toBeEnabled();
      await expect(admin.getByRole("group", { name: "Change status" }).getByRole("button", { name: "Waiting for Requester" })).toBeEnabled();
      await expect(admin.getByLabel("Add a comment")).toBeEnabled();
      await expect(admin.getByLabel("Add an internal note")).toBeEnabled();
      await expect(admin.getByRole("button", { name: "Add action" })).toBeEnabled();
      await expect(admin.locator("#actions-taken li", { hasText: "Order a spare docking station" }).getByRole("button", { name: "Edit" })).toBeEnabled();
      await expectSoundLayout(admin);
      await shot(admin, "actions-taken", `administrator-${viewportName}`);
      await context.close();
    });

    test("RSP-02: the Requester's read-only view fits, with no way to add or edit", async ({ browser }) => {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      await login(page, REQUESTER);
      await page.goto(`/#/my-tickets/${ticket.id}`);
      await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      await expect(page.locator("#actions-taken li")).toHaveCount(3);
      await expect(page.locator("#actions-taken").getByRole("button")).toHaveCount(0);
      await expectSoundLayout(page);
      await shot(page, "actions-taken", `requester-readonly-${viewportName}`);
      await context.close();
    });

    test("RSP-02: the conflict banner is in view, on one screen with the controls it is about", async () => {
      await staff.goto("/#/dashboard");
      await staff.goto(`/#/queue/${ticket.id}`);
      await expect(staff.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
      // Someone else changes the ticket after this page loaded it, then this page tries to change its status.
      const current = await (await staff.request.get(`http://localhost:3000/api/staff/tickets/${ticket.id}`)).json();
      const bump = await staff.request.patch(`http://localhost:3000/api/staff/tickets/${ticket.id}/priority`, {
        data: { itPriority: "LOW", version: current.ticket.version },
        headers: { Origin: "http://localhost:5173" },
      });
      expect(bump.status()).toBe(200);
      await watched.expecting(async () => {
        await staff.getByRole("group", { name: "Change status" }).getByRole("button", { name: "Waiting for Requester" }).click();
        await expect(staff.getByRole("alert").filter({ hasText: "Someone else changed this." })).toBeVisible();
      });
      await staff.waitForFunction(() => document.getAnimations().length === 0);
      const banner = await staff.getByRole("alert").filter({ hasText: "Someone else changed this." }).boundingBox();
      expect(banner!.y, "banner is inside the screen").toBeGreaterThanOrEqual(-1); // sub-pixel rounding
      expect(banner!.y + banner!.height, "banner is inside the screen").toBeLessThanOrEqual(size.height);
      // ...and so are the status buttons it is about, so the person need not hunt for them.
      const buttons = (await staff.getByRole("group", { name: "Change status" }).boundingBox())!;
      expect(buttons.y + buttons.height, "status buttons are on the same screen as the banner").toBeLessThanOrEqual(size.height);
      await expectSoundLayout(staff);
      await shot(staff, "actions-taken", `conflict-banner-${viewportName}`, { fullPage: false });
    });

    test("no console error or uncaught exception on any of these screens", async () => {
      expect(watched.errors()).toEqual([]);
    });
  });
}

function ensure(screen: string, name: string) {
  const dir = path.join(SHOTS, screen);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
}
