import { test } from "@playwright/test";
import path from "node:path";

// Generates the responsive visual-inspection evidence required by section
// 8.7/8.8 and Part 9 of the labsheet — desktop/tablet/mobile screenshots of
// Create Ticket, My Tickets, and Ticket Detail, saved under
// artifacts/lab-02/screenshots/<screen>/<viewport>.png. Not itself a
// correctness test (no assertions) — it's an artifact-generation script
// that happens to run through Playwright's test runner so it shares the
// same webServer/browser setup as the rest of the e2e suite.

// Playwright's config sets testDir relative to the repo root and runs with
// that as cwd, so this resolves to <repo root>/artifacts/lab-02/screenshots.
const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts", "lab-02", "screenshots");

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 800, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

async function selectSeededRequester(page: import("@playwright/test").Page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("capture responsive screenshots for Create Ticket, My Tickets, and Ticket Detail", async ({
  page,
}) => {
  for (const [viewportName, size] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(size);
    await page.goto("/");
    await selectSeededRequester(page);

    // --- Create Ticket ---
    await page.getByRole("button", { name: "New Ticket" }).click();
    const requesterOption = page.locator("#devRequesterId option", { hasText: "Jennifer Anderson" });
    const requesterValue = await requesterOption.getAttribute("value");
    await page.getByLabel(/^Requester/i).selectOption(requesterValue!);
    await page.getByRole("button", { name: /Continue as this Requester/i }).click();
    await page.waitForSelector("text=Submit Ticket");
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "create-ticket", `${viewportName}.png`),
      fullPage: true,
    });

    // --- My Tickets ---
    await page.getByRole("button", { name: "My Tickets" }).click();
    await page
      .locator("table")
      .or(page.getByText("No tickets match"))
      .first()
      .waitFor();
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "my-tickets", `${viewportName}.png`),
      fullPage: true,
    });

    // --- Ticket Detail ---
    const firstTicketButton = page.locator("table button").first();
    await firstTicketButton.waitFor();
    await firstTicketButton.click();
    await page.waitForSelector("text=Attachments");
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, "ticket-detail", `${viewportName}.png`),
      fullPage: true,
    });
  }
});
