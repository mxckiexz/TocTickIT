import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { REQUESTER, STAFF, login } from "../helpers/accounts";
import { hasVisibleFocusRing, measureContrast } from "../helpers/layout";
import { seedHardeningTicket, watchConsole, type CreatedTicket } from "../helpers/lab4";

// docs/lab-04/tests.md section 6: A11Y-01 to A11Y-04 (AC-36, FR-22; ui-spec.md section 8) on the screens Lab 4 added or
// changed: both dashboards, the staff Ticket Detail with Actions Taken, the status buttons, the gate message and the
// conflict banner, and the Requester's read-only view. Contrast is measured in the real browser against the colours
// that are really drawn, not read off the stylesheet.
test.describe.configure({ mode: "serial" });

let ticket: CreatedTicket;
let staffContext: BrowserContext;
let staff: Page;
let requesterContext: BrowserContext;
let requester: Page;
let watched: ReturnType<typeof watchConsole>;

test.beforeAll(async ({ browser, playwright }) => {
  ticket = await seedHardeningTicket(playwright, "Hardening a11y");
  staffContext = await browser.newContext();
  staff = await staffContext.newPage();
  await login(staff, STAFF);
  watched = watchConsole(staff);
  requesterContext = await browser.newContext();
  requester = await requesterContext.newPage();
  await login(requester, REQUESTER);
});

test.afterAll(async () => {
  await staffContext.close();
  await requesterContext.close();
});

async function openStaffTicket(page: Page) {
  await page.goto("/#/dashboard");
  await page.goto(`/#/queue/${ticket.id}`);
  await expect(page.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  await expect(page.locator("#actions-taken li").first()).toBeVisible();
}

// Presses Tab until the element is focused, so a control that the keyboard cannot reach fails the test.
async function tabTo(page: Page, target: ReturnType<Page["locator"]>, limit = 120) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
  }
  throw new Error("the keyboard never reached the control");
}

test("A11Y-01: with the keyboard alone staff add a completed action and resolve the ticket", async () => {
  await openStaffTicket(staff);
  // Start from the top of the page, as a person who has just arrived would.
  await staff.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await tabTo(staff, staff.getByRole("button", { name: "Add action" }));
  await staff.keyboard.press("Enter");
  const form = staff.getByRole("form", { name: "Add action" });
  await expect(form).toBeVisible();

  await tabTo(staff, form.getByLabel(/Description/));
  await staff.keyboard.type("Rebooted the dock and re-seated the cable");
  await tabTo(staff, form.getByLabel(/^Status/));
  await staff.keyboard.type("Completed");
  await expect(form.getByLabel(/^Status/)).toHaveValue("COMPLETED");
  await tabTo(staff, form.getByLabel(/^Result/));
  await staff.keyboard.type("Dock is stable");
  await tabTo(staff, form.getByRole("button", { name: /^Save/ }));
  await staff.keyboard.press("Enter");
  await expect(staff.locator("#actions-taken li", { hasText: "Rebooted the dock" })).toBeVisible();

  // The Planned and In progress actions are still open, so finish them with the keyboard too, then resolve.
  for (const description of ["Order a spare docking station", "Update the dock firmware"]) {
    const item = staff.locator("#actions-taken li", { hasText: description });
    await tabTo(staff, item.getByRole("button", { name: "Edit" }));
    await staff.keyboard.press("Enter");
    const edit = staff.getByRole("form", { name: "Edit action" });
    await tabTo(staff, edit.getByLabel(/^Status/));
    await staff.keyboard.type("Completed");
    await tabTo(staff, edit.getByLabel(/^Result/));
    await staff.keyboard.type("Done");
    await tabTo(staff, edit.getByRole("button", { name: /^Save/ }));
    await staff.keyboard.press("Enter");
    await expect(staff.locator("#actions-taken li", { hasText: description }).getByText("Completed", { exact: true })).toBeVisible();
  }

  const resolved = staff.getByRole("group", { name: "Change status" }).getByRole("button", { name: "Resolved" });
  await expect(resolved).toBeEnabled();
  await tabTo(staff, resolved);
  await staff.keyboard.press("Enter");
  // The confirm step takes focus, so the next Tab lands inside it.
  await tabTo(staff, staff.getByRole("button", { name: "Confirm", exact: true }), 6);
  await staff.keyboard.press("Enter");
  await expect(staff.locator(".badge", { hasText: /^Resolved$/ })).toBeVisible();
});

// A fresh ticket for the screens below, since the one above is now Resolved.
test("setup: a ticket with open work again", async ({ playwright }) => {
  ticket = await seedHardeningTicket(playwright, "Hardening a11y screens");
});

async function tabThrough(page: Page, limit: number) {
  const without: string[] = [];
  const offTheme: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let reached = 0;
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press("Tab");
    // Bootstrap fades the ring in over 150ms; look once it has settled, as a person would.
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Inside a date-time field the keyboard also visits the calendar button, which the browser draws its own ring
      // on and which is not `:focus` on the input; that stop is the browser's, not ours.
      if (!el.matches(":focus")) return { skip: true as const };
      const style = getComputedStyle(el);
      const ring = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || `${el.tagName} ${el.getAttribute("type") ?? ""} ${el.id}`).trim().slice(0, 60);
      return { skip: false as const, name, ring, shadow: style.boxShadow, outline: style.outlineColor };
    });
    if (!info) break;
    if (info.skip) continue;
    reached++;
    if (!info.ring) without.push(info.name);
    // Only Zen Green tokens (ui-spec.md section 9): Bootstrap's own blue ring (13, 110, 253) is a stray colour.
    if (/13, 110, 253/.test(info.shadow) || /13, 110, 253/.test(info.outline)) offTheme.push(info.name);
  }
  return { reached, without, offTheme };
}

test("A11Y-02: every control on the staff dashboard shows a focus ring when the keyboard reaches it", async () => {
  await staff.goto("/#/dashboard");
  await expect(staff.getByRole("heading", { name: "Unassigned" })).toBeVisible();
  const { reached, without, offTheme } = await tabThrough(staff, 80);
  expect(reached).toBeGreaterThan(20);
  expect(without, "controls without a focus ring").toEqual([]);
  expect(offTheme, "focus rings in a colour that is not Zen Green").toEqual([]);
});

test("A11Y-02: and on the Requester dashboard", async () => {
  await requester.goto("/#/dashboard");
  await expect(requester.getByRole("heading", { name: "Open tickets" })).toBeVisible();
  const { reached, without, offTheme } = await tabThrough(requester, 60);
  expect(reached).toBeGreaterThan(8);
  expect(without, "controls without a focus ring").toEqual([]);
  expect(offTheme, "focus rings in a colour that is not Zen Green").toEqual([]);
});

test("A11Y-02: and on the staff Ticket Detail with the Add action form open", async () => {
  await openStaffTicket(staff);
  await staff.getByRole("button", { name: "Add action" }).click();
  await expect(staff.getByRole("form", { name: "Add action" })).toBeVisible();
  const { reached, without, offTheme } = await tabThrough(staff, 90);
  expect(reached).toBeGreaterThan(15);
  expect(without, "controls without a focus ring").toEqual([]);
  expect(offTheme, "focus rings in a colour that is not Zen Green").toEqual([]);
  await staff.getByRole("form", { name: "Add action" }).getByRole("button", { name: "Cancel" }).click();
});

test("style: a ticked checkbox in the action form is Zen Green, not Bootstrap blue", async () => {
  await openStaffTicket(staff);
  await staff.getByRole("button", { name: "Add action" }).click();
  const box = staff.getByRole("form", { name: "Add action" }).getByLabel(/Follow-up required/);
  await box.check();
  const colours = await box.evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderColor }));
  const green = await staff.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue("--zg-primary-green");
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  expect(colours.background).toBe(green);
  expect(colours.border).toBe(green);
  await staff.getByRole("form", { name: "Add action" }).getByRole("button", { name: "Cancel" }).click();
});

// ui-spec.md section 9: "Only Zen Green tokens; no stray colour". Bootstrap's own blue (13, 110, 253) is the colour that
// shows up when a component is used without its theme override, so look for it in every colour a screen draws.
async function bootstrapBlueIn(page: Page, root: string) {
  return page.locator(root).evaluate((rootEl) => {
    const blue = /rgba?\(13, 110, 253/;
    const found: string[] = [];
    for (const el of [rootEl, ...rootEl.querySelectorAll("*")]) {
      const style = getComputedStyle(el);
      for (const property of ["color", "backgroundColor", "borderTopColor", "outlineColor", "boxShadow", "textDecorationColor"] as const) {
        if (blue.test(style[property])) found.push(`${(el.textContent ?? "").trim().slice(0, 30) || el.tagName} (${property})`);
      }
    }
    return found;
  });
}

test("style: Bootstrap's own blue is not drawn on the new screens", async () => {
  for (const [page, address, ready] of [
    [staff, "/#/dashboard", "Unassigned"],
    [requester, "/#/dashboard", "Open tickets"],
  ] as const) {
    await page.goto(address);
    await expect(page.getByRole("heading", { name: ready })).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().length === 0);
    expect(await bootstrapBlueIn(page, "body"), `${address} as ${ready}`).toEqual([]);
  }
  await openStaffTicket(staff);
  await staff.waitForFunction(() => document.getAnimations().length === 0);
  expect(await bootstrapBlueIn(staff, "body"), "staff Ticket Detail").toEqual([]);
  await requester.goto(`/#/my-tickets/${ticket.id}`);
  await expect(requester.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  await requester.waitForFunction(() => document.getAnimations().length === 0);
  expect(await bootstrapBlueIn(requester, "body"), "Requester Ticket Detail").toEqual([]);
});

test("A11Y-03: text on the staff dashboard has the contrast WCAG asks for (4.5:1, 3:1 for large text)", async () => {
  await staff.goto("/#/dashboard");
  await expect(staff.getByRole("heading", { name: "Unassigned" })).toBeVisible();
  const { failures, checked } = await measureContrast(staff, "main, .zg-surface");
  expect(checked).toBeGreaterThan(20);
  expect(failures).toEqual([]);
});

test("A11Y-03: and on the Requester dashboard", async () => {
  await requester.goto("/#/dashboard");
  await expect(requester.getByRole("heading", { name: "Open tickets" })).toBeVisible();
  const { failures, checked } = await measureContrast(requester, ".zg-surface");
  expect(checked).toBeGreaterThan(8);
  expect(failures).toEqual([]);
});

test("A11Y-03: and on the staff Ticket Detail: Actions Taken, the form, the status buttons and the gate message", async () => {
  await openStaffTicket(staff);
  await expect(staff.getByText("Finish or cancel open actions")).toBeVisible();
  await staff.getByRole("button", { name: "Add action" }).click();
  const form = staff.getByRole("form", { name: "Add action" });
  await form.getByLabel(/^Status/).selectOption("COMPLETED");
  await form.getByRole("button", { name: /^Save/ }).click();
  await expect(form.getByText("Description is required.")).toBeVisible();
  const { failures, disabled, checked } = await measureContrast(staff, ".zg-surface");
  expect(checked).toBeGreaterThan(40);
  expect(failures).toEqual([]);
  // The one thing allowed below the limit is a disabled control (WCAG 1.4.3): the Resolved button the gate holds shut.
  for (const entry of disabled) expect(entry.text).toBe("Resolved");
  await form.getByRole("button", { name: "Cancel" }).click();
});

test("A11Y-03: and on the conflict banner", async () => {
  await openStaffTicket(staff);
  // Someone else changes the ticket after this page loaded it.
  const response = await staff.request.get(`http://localhost:3000/api/staff/tickets/${ticket.id}`);
  const version = (await response.json()).ticket.version;
  const bump = await staff.request.patch(`http://localhost:3000/api/staff/tickets/${ticket.id}/priority`, {
    data: { itPriority: "LOW", version },
    headers: { Origin: "http://localhost:5173" },
  });
  expect(bump.status()).toBe(200);
  await watched.expecting(async () => {
    await staff.getByRole("group", { name: "Change status" }).getByRole("button", { name: "Waiting for Requester" }).click();
    await expect(staff.getByRole("alert").filter({ hasText: "Someone else changed this." })).toBeVisible();
  });
  const { failures } = await measureContrast(staff, "[role='alert']");
  expect(failures).toEqual([]);
});

test("A11Y-03: and on the Requester's read-only Ticket Detail", async () => {
  await requester.goto(`/#/my-tickets/${ticket.id}`);
  await expect(requester.getByRole("heading", { name: ticket.ticketNumber })).toBeVisible();
  await expect(requester.locator("#actions-taken li").first()).toBeVisible();
  const { failures, checked } = await measureContrast(requester, ".zg-surface");
  expect(checked).toBeGreaterThan(20);
  expect(failures).toEqual([]);
});

test("A11Y-04: status, priority and follow-up are words in the page, never colour alone", async () => {
  await requester.goto(`/#/my-tickets/${ticket.id}`);
  await expect(requester.locator("#actions-taken li").first()).toBeVisible();
  await openStaffTicket(staff);

  for (const page of [staff, requester]) {
    // Every badge has text; a coloured chip with nothing in it would carry meaning by colour alone.
    const empty = await page.locator(".badge").evaluateAll((els) => els.filter((el) => !(el.textContent ?? "").trim()).length);
    expect(empty, "badges without text").toBe(0);
    // Each Action Taken says its status in words, and the follow-up is a word badge plus its note.
    await expect(page.locator("#actions-taken li", { hasText: "Replaced the faulty docking station" }).getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.locator("#actions-taken li", { hasText: "Order a spare docking station" }).getByText("Planned", { exact: true })).toBeVisible();
    await expect(page.locator("#actions-taken li", { hasText: "Update the dock firmware" }).getByText("In progress", { exact: true })).toBeVisible();
    await expect(page.getByText("Follow-up needed")).toBeVisible();
    await expect(page.getByText("Follow-up: Check again after the next firmware update")).toBeVisible();
  }
  // The ticket's own status and priority are words too.
  await expect(staff.locator(".badge", { hasText: /^In Progress$/ })).toBeVisible();
  await expect(staff.locator(".badge", { hasText: /^MEDIUM$/ })).toBeVisible(); // Requested Priority
  await expect(staff.getByLabel("IT Priority")).toContainText(/Low|Medium|High/); // IT Priority is a word in a select

  // The dashboards' counts carry the status name in the same row as the number.
  await staff.goto("/#/dashboard");
  await expect(staff.getByRole("heading", { name: "By status" })).toBeVisible();
  const rows = await staff.getByRole("heading", { name: "By status" }).locator("xpath=ancestor::*[@data-card]").locator("li").allInnerTexts();
  expect(rows).toHaveLength(8);
  for (const row of rows) expect(row).toMatch(/[A-Za-z]+.*\d+|\d+.*[A-Za-z]+/);
});

test("no console error or uncaught exception on any of these screens", async () => {
  expect(watched.errors()).toEqual([]);
});
