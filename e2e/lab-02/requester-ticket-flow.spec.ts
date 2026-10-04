import { test, expect } from "@playwright/test";

// Required E2E scenario (labsheet section 9.2): "A Requester creates a
// Ticket and later finds it in My Tickets." Exercises the real app end to
// end. Lab 3: the Development Requester picker is gone (removed along with
// DevRequesterPicker.tsx/RequesterBanner.tsx) — identity now comes from a
// real login, against the dedicated e2e fixture account that
// e2e/global-setup.ts restores to a known password before every run.
test("a Requester creates a ticket and later finds it in My Tickets", async ({ page }) => {
  // "[e2e]" is the managed prefix server/scripts/e2e-fixture.ts sweeps before
  // every run, so this ticket doesn't accumulate across runs.
  const uniqueSummary = `[e2e] Lab 2 flow check ${Date.now()}`;

  await page.goto("/");

  await page.getByLabel(/^Email/i).fill("e2e-requester@toktickit.test");
  await page.getByLabel(/^Password/i).fill("E2E-Fixture-Pass1");
  await page.getByRole("button", { name: /^Log in$/i }).click();

  await page.getByRole("button", { name: "New Ticket" }).click();

  // Create Ticket (Feature 3) — fill every required field.
  await page.getByLabel(/^Category/i).selectOption({ label: "Hardware" });
  await page.getByLabel(/Related System/i).selectOption({ label: "VPN" });
  await page.getByLabel(/^Summary/i).fill(uniqueSummary);
  await page.getByLabel(/^Description/i).fill("Created by the Lab 2 e2e suite.");
  await page.getByRole("button", { name: "Submit Ticket" }).click();

  // Confirmation shows the backend-generated Ticket Number (AC-01) and,
  // per the handout's required Create Ticket field, a Ticket Date.
  await expect(page.getByText("Ticket created successfully.")).toBeVisible();
  const ticketNumberLocator = page.getByText(/^Your Ticket Number: /);
  await expect(ticketNumberLocator).toBeVisible();
  const ticketNumberText = await ticketNumberLocator.innerText();
  const ticketNumber = ticketNumberText.replace("Your Ticket Number: ", "").trim();
  expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  await expect(page.getByText(/^Ticket Date: /)).toBeVisible();

  // My Tickets (Feature 4/5) — the same Requester finds their own new
  // ticket by searching for its Ticket Number.
  await page.getByRole("button", { name: "My Tickets" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.getByLabel(/Search tickets/i).fill(ticketNumber);
  const ticketRowButton = page.getByRole("button", { name: ticketNumber });
  await expect(ticketRowButton).toBeVisible();

  // Ticket Detail (Feature 6) — opening it shows the same Summary just
  // submitted, proving it's the same ticket, not a false-positive search
  // match.
  await ticketRowButton.click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
  await expect(page.getByText(uniqueSummary)).toBeVisible();
});
