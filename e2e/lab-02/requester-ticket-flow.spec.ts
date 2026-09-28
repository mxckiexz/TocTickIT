import { test, expect } from "@playwright/test";

// Required E2E scenario (labsheet section 9.2): "A Requester creates a
// Ticket and later finds it in My Tickets." Exercises the real app end to
// end — Development Requester selection, ticket creation, the generated
// Ticket Number, then finding and opening that same ticket from My Tickets.
test("a Requester creates a ticket and later finds it in My Tickets", async ({ page }) => {
  const uniqueSummary = `E2E flow check ${Date.now()}`;

  await page.goto("/");

  // Start from a clean slate so the Development Requester picker always
  // shows, regardless of what a previous run left in localStorage.
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "New Ticket" }).click();

  // Development Requester selection (section 8.1) — a testing mechanism,
  // not real authentication.
  await expect(page.getByRole("button", { name: /Continue as this Requester/i })).toBeVisible();
  // Options are rendered as "<name> (<email>)" — match by name substring
  // rather than the full label, since the email isn't worth hardcoding here.
  const requesterOption = page.locator("#devRequesterId option", { hasText: "Jennifer Anderson" });
  const requesterValue = await requesterOption.getAttribute("value");
  await page.getByLabel(/^Requester/i).selectOption(requesterValue!);
  await page.getByRole("button", { name: /Continue as this Requester/i }).click();

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
