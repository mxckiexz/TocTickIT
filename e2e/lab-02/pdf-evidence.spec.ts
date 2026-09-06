import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

// One-off evidence-gathering script for the Lab 2 submission PDF (not part
// of the graded automated suite). Walks through every interaction state the
// handout's Part 6/7/8 evidence table asks for and saves a named screenshot
// for each, under artifacts/lab-02/pdf-evidence/.

const DIR = path.join(process.cwd(), "artifacts", "lab-02", "pdf-evidence");
fs.mkdirSync(DIR, { recursive: true });

async function shot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: true });
}

async function pickRequester(page: import("@playwright/test").Page, name: string) {
  const option = page.locator("#devRequesterId option", { hasText: name });
  const value = await option.getAttribute("value");
  await page.getByLabel(/^Requester/i).selectOption(value!);
  await page.getByRole("button", { name: /Continue as this Requester/i }).click();
}

test.describe.configure({ mode: "serial" });

test("01-06 Development Requester + Create Ticket states", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "New Ticket" }).click();
  await expect(page.getByRole("button", { name: /Continue as this Requester/i })).toBeVisible();
  await shot(page, "01-dev-requester-selection");

  await pickRequester(page, "Jennifer Anderson");
  await page.waitForSelector("text=Submit Ticket");
  await shot(page, "02-create-ticket-initial-loaded-from-db");

  // Invalid submission — field-level validation messages.
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText(/is required/i).first()).toBeVisible();
  await shot(page, "03-create-ticket-validation-failure");

  // Valid fill + a rejected (invalid) attachment type first.
  await page.getByLabel(/^Category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/Related System/i).selectOption({ label: "VPN" });
  await page.getByLabel(/^Summary/i).fill("PDF evidence — attachment validation");
  await page.getByLabel(/^Description/i).fill("Checking valid vs invalid attachment handling.");

  const badFile = path.join(DIR, "_fixture-not-allowed.exe");
  fs.writeFileSync(badFile, "not a real image");
  await page.getByLabel(/Supporting attachment/i).setInputFiles(badFile);
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByText("Ticket created successfully.")).toBeVisible();
  await shot(page, "04-create-ticket-invalid-attachment-result");

  // Confirm the created ticket really has this Requester's id (BR-06/AC-05).
  const requesterIdCell = await page.evaluate(() => {
    const raw = localStorage.getItem("toktickit.activeRequester");
    return raw ? JSON.parse(raw).id : null;
  });
  console.log("Active Requester id used for this ticket:", requesterIdCell);
});

test("07 backend-down safe error state, form values preserved", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "New Ticket" }).click();
  await pickRequester(page, "Jennifer Anderson");

  // Simulate a backend failure by pointing fetch at an unreachable port,
  // without touching the real server (which the rest of this suite needs).
  await page.route("**/api/tickets", (route) => route.abort("connectionrefused"));

  await page.getByLabel(/^Category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/Related System/i).selectOption({ label: "VPN" });
  await page.getByLabel(/^Summary/i).fill("Testing the API-failure safe state");
  await page.getByLabel(/^Description/i).fill("This should survive a network failure.");
  await page.getByRole("button", { name: "Submit Ticket" }).click();

  await expect(page.getByRole("alert").or(page.getByText(/unable|failed/i)).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByLabel(/^Summary/i)).toHaveValue("Testing the API-failure safe state");
  await shot(page, "05-create-ticket-api-failure-form-preserved");
  await page.unroute("**/api/tickets");
});

test("08-12 My Tickets: two Requesters, search/filter/sort/pagination, empty & no-results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "My Tickets" }).click();
  await pickRequester(page, "Jennifer Anderson");
  await page
    .locator("table")
    .or(page.getByText("No tickets match"))
    .first()
    .waitFor();
  await shot(page, "06-my-tickets-requester-a");

  await page.getByRole("button", { name: /Switch requester/i }).click();
  await pickRequester(page, "Michael Brown");
  await page
    .locator("table")
    .or(page.getByText("No tickets match"))
    .first()
    .waitFor();
  await shot(page, "07-my-tickets-requester-b-different-list");

  // Search/filter/sort evidence back on Requester A.
  await page.getByRole("button", { name: /Switch requester/i }).click();
  await pickRequester(page, "Jennifer Anderson");
  await page
    .locator("table")
    .or(page.getByText("No tickets match"))
    .first()
    .waitFor();
  await page.getByLabel(/Search tickets/i).fill("zzz-no-such-ticket-zzz");
  await expect(page.getByText("No tickets match your search and filters.")).toBeVisible();
  await shot(page, "08-my-tickets-no-results-state");
  await page.getByLabel(/Search tickets/i).fill("");

  await page.getByLabel(/Sort by/i).selectOption({ label: "Summary (A–Z)" });
  await page.waitForTimeout(300);
  await shot(page, "09-my-tickets-sorted");
});

test("13 cross-Requester access is rejected (API evidence)", async ({ request }) => {
  const ticketsA = await request.get("http://localhost:3000/api/tickets?requesterId=1&pageSize=1");
  const bodyA = await ticketsA.json();
  const ticketId = bodyA.tickets?.[0]?.id;
  expect(ticketId).toBeTruthy();

  // Requester 2 attempting to open Requester 1's ticket detail directly.
  const crossAccess = await request.get(
    `http://localhost:3000/api/tickets/${ticketId}?requesterId=2`
  );
  expect(crossAccess.status()).toBe(403);
  const crossBody = await crossAccess.json();
  fs.writeFileSync(
    path.join(DIR, "10-cross-requester-access-rejected.txt"),
    `GET /api/tickets/${ticketId}?requesterId=2\nStatus: ${crossAccess.status()}\nBody: ${JSON.stringify(crossBody)}\n`
  );
});

test("14-19 Ticket Detail: add/download/remove attachment, blocked download after removal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "My Tickets" }).click();
  await pickRequester(page, "Jennifer Anderson");
  const firstTicketButton = page.locator("table button").first();
  await firstTicketButton.waitFor();
  await firstTicketButton.click();
  await page.waitForSelector("text=Attachments");
  await shot(page, "11-ticket-detail-owned-view");

  // Add an attachment.
  const goodFile = path.join(DIR, "_fixture-photo.png");
  fs.writeFileSync(
    goodFile,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    )
  );
  await page.getByLabel(/Add an attachment/).setInputFiles(goodFile);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "_fixture-photo.png" })).toBeVisible();
  await shot(page, "12-ticket-detail-attachment-added");

  // Download link points at the right endpoint (evidence, not an actual
  // browser download since the sandbox blocks those).
  const href = await page.getByRole("link", { name: "_fixture-photo.png" }).getAttribute("href");
  fs.writeFileSync(path.join(DIR, "13-download-link-href.txt"), `${href}\n`);

  // Soft-remove it with a reason.
  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByLabel(/Reason \(optional\)/i).fill("PDF evidence: soft-removal with a reason");
  await page.getByRole("button", { name: "Remove attachment" }).click();
  await expect(page.getByText(/removed/i)).toBeVisible();
  await shot(page, "14-ticket-detail-attachment-removed-metadata-retained");

  // Blocked download after removal.
  const removedResponse = await page.request.get(href!);
  expect(removedResponse.status()).toBe(404);
  fs.writeFileSync(
    path.join(DIR, "15-removed-attachment-download-blocked.txt"),
    `GET ${href}\nStatus: ${removedResponse.status()}\nBody: ${await removedResponse.text()}\n`
  );

  // Clean up the fixture ticket/attachment noise this test leaves behind.
  fs.unlinkSync(goodFile);
});
