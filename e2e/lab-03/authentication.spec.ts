import { test, expect } from "@playwright/test";
import { FIRST_LOGIN, INACTIVE, REQUESTER, login, logout } from "../helpers/accounts";

const API = "http://localhost:3000";

// docs/lab-03/tests.md §9 — E2E-01..E2E-03 (AC-01, AC-02, AC-05, AC-06).
test.describe("Authentication", () => {
  // E2E-01
  test("valid login opens the app shell with the user's name and role; invalid and inactive logins show the same safe message", async ({
    page,
  }) => {
    await login(page, REQUESTER);
    await expect(page.getByText("E2E Fixture Requester")).toBeVisible();
    await expect(page.getByText("REQUESTER", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Ticket" })).toBeVisible();
    await logout(page);

    // Wrong password, and an inactive account with the *correct* password:
    // identical, non-revealing message (BR-07 / AC-05).
    await login(page, { email: REQUESTER.email, password: "definitely-wrong" });
    const wrongPassword = page.getByRole("alert");
    await expect(wrongPassword).toHaveText("Invalid email or password.");

    await login(page, INACTIVE);
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
    // Nothing about the account leaks into the page.
    await expect(page.getByText(/inactive|suspended|disabled/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  });

  // E2E-02
  test("a default-password account is held on Change Password until a valid new password is saved", async ({ page }) => {
    await login(page, FIRST_LOGIN);

    await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();
    // The normal application is unavailable (AC-02): no navigation, no logout bar.
    await expect(page.getByRole("button", { name: "New Ticket" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);

    // Mismatched confirmation is rejected and keeps the user on this screen.
    await page.getByLabel(/^Current password/i).fill(FIRST_LOGIN.password);
    await page.getByLabel(/^New password/i).fill("E2E-Changed-Pass1");
    await page.getByLabel(/^Confirm new password/i).fill("something-else-1");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Change your password" })).toBeVisible();

    // A wrong current password is rejected too.
    await page.getByLabel(/^Current password/i).fill("not-the-current-one");
    await page.getByLabel(/^Confirm new password/i).fill("E2E-Changed-Pass1");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("alert")).toHaveText("Current password is incorrect.");

    // The valid change opens the normal app.
    await page.getByLabel(/^Current password/i).fill(FIRST_LOGIN.password);
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Ticket" })).toBeVisible();

    // And the new password is the one that works from now on.
    await logout(page);
    await login(page, { email: FIRST_LOGIN.email, password: "E2E-Changed-Pass1" });
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  // E2E-03
  test("logging out ends the session: reloading and calling the API directly both fail", async ({ page }) => {
    await login(page, REQUESTER);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(200);

    await logout(page);

    // Direct access after logout: the shell goes back to Login, not a cached page...
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^Log in$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Ticket" })).toHaveCount(0);
    // ...and the server no longer honors the old session cookie (BR-10).
    expect((await page.request.get(`${API}/api/auth/me`)).status()).toBe(401);
    expect((await page.request.get(`${API}/api/tickets`)).status()).toBe(401);
  });
});
