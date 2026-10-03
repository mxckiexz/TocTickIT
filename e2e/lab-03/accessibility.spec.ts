import { test, expect } from "@playwright/test";
import { REQUESTER } from "../helpers/accounts";

// docs/lab-03/tests.md A11Y-01/A11Y-02 (ui-spec.md §9).
test("A11Y-01: Login is operable by keyboard alone, Enter submits", async ({ page }) => {
  await page.goto("/");

  // Tab order reaches every control: Email -> Password -> Log in.
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/^Email/i)).toBeFocused();
  await page.keyboard.type(REQUESTER.email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/^Password/i)).toBeFocused();
  await page.keyboard.type(REQUESTER.password);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^Log in$/i })).toBeFocused();

  // Enter on the focused submit button logs in.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("A11Y-01: pressing Enter in the password field submits the form", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/^Email/i).fill(REQUESTER.email);
  await page.getByLabel(/^Password/i).fill(REQUESTER.password);
  await page.getByLabel(/^Password/i).press("Enter");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("A11Y-02: keyboard focus is always visible on the new interactive controls", async ({ page }) => {
  await page.goto("/");
  // The theme replaces Bootstrap's blue ring with a green box-shadow; a
  // focused control must show *some* ring (shadow or outline), never none.
  async function hasVisibleFocusRing(locator: ReturnType<typeof page.locator>) {
    return locator.evaluate((el) => {
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
      const shadow = style.boxShadow !== "none";
      return outline || shadow;
    });
  }

  await page.keyboard.press("Tab");
  const email = page.getByLabel(/^Email/i);
  await expect(email).toBeFocused();
  expect(await hasVisibleFocusRing(email), "Email input focus ring").toBe(true);

  await page.keyboard.press("Tab");
  const password = page.getByLabel(/^Password/i);
  expect(await hasVisibleFocusRing(password), "Password input focus ring").toBe(true);

  await page.getByLabel(/^Email/i).fill(REQUESTER.email);
  await page.getByLabel(/^Password/i).fill(REQUESTER.password);
  await page.keyboard.press("Tab");
  const submit = page.getByRole("button", { name: /^Log in$/i });
  await expect(submit).toBeFocused();
  expect(await hasVisibleFocusRing(submit), "Log in button focus ring").toBe(true);
});
