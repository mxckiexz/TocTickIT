import { test, expect } from "@playwright/test";
import { ADMIN, REQUESTER, STAFF, login } from "../helpers/accounts";

// docs/lab-03/tests.md STY-02, the stylesheet half (the component half —
// editable select vs read-only badge — is client/tests/lab-03/
// styleConformance.test.tsx; Vitest stubs CSS files out, so the rule itself
// has to be checked in a real browser).
test("STY-02: the loaded theme styles disabled/read-only fields with the soft gray-green token", async ({ page }) => {
  await page.goto("/");
  const rule = await page.evaluate(() => {
    const css: CSSStyleRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      for (const r of Array.from(sheet.cssRules)) {
        if (r instanceof CSSStyleRule && /\.form-control:disabled/.test(r.selectorText)) css.push(r);
      }
    }
    return css.map((r) => ({
      selector: r.selectorText,
      background: r.style.backgroundColor || r.style.getPropertyValue("background-color"),
      token: getComputedStyle(document.documentElement).getPropertyValue("--zg-readonly-bg").trim(),
    }));
  });
  // Bootstrap ships its own .form-control:disabled rule first; the theme's
  // (loaded after it) is the one that must win and must use the token.
  expect(rule.length, "a .form-control:disabled rule is loaded").toBeGreaterThan(0);
  expect(rule[0].token.toLowerCase()).toBe("#f0f3ef");
  expect(rule[rule.length - 1].background).toContain("--zg-readonly-bg");
});

test("STY-02: a real disabled field renders with that gray-green, an active one with the normal surface", async ({ page }) => {
  await page.goto("/");
  const colors = await page.evaluate(() => {
    const make = (disabled: boolean) => {
      const input = document.createElement("input");
      input.className = "form-control";
      input.disabled = disabled;
      document.body.appendChild(input);
      const bg = getComputedStyle(input).backgroundColor;
      input.remove();
      return bg;
    };
    return { disabled: make(true), active: make(false) };
  });
  expect(colors.disabled).toBe("rgb(240, 243, 239)");
  expect(colors.active).not.toBe(colors.disabled);
});

// docs/lab-03/tests.md STY-03. The header's Log out button was green-on-green
// (invisible) from Feature 3 until Feature 9: every functional test passed
// because the button existed and was clickable — none of them checked that a
// person could *see* it. This one measures real contrast in a real browser, for
// every control in the header, for every role.
function luminance([r, g, b]: number[]) {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: number[], b: number[]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [role, account] of [
  ["Requester", REQUESTER],
  ["IT Staff", STAFF],
  ["Administrator", ADMIN],
] as const) {
  test(`STY-03: every control in the ${role} app header is readable against the header (contrast >= 4.5:1)`, async ({ page }) => {
    await login(page, account);
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

    const controls = await page.evaluate(() => {
      const parse = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number);
      const header = document.querySelector(".zg-app-header")!;
      const headerBg = parse(getComputedStyle(header).backgroundColor);
      // Effective background: the element's own if opaque, else the header's.
      const bgOf = (el: Element) => {
        const own = parse(getComputedStyle(el).backgroundColor);
        return own.length === 3 || (own.length === 4 && own[3] === 1) ? own.slice(0, 3) : headerBg.slice(0, 3);
      };
      return [...header.querySelectorAll("button, .badge")].map((el) => ({
        name: (el.textContent ?? "").trim(),
        text: parse(getComputedStyle(el).color).slice(0, 3),
        background: bgOf(el),
      }));
    });

    expect(controls.map((c) => c.name)).toEqual(expect.arrayContaining(["Change password", "Log out"]));
    for (const control of controls) {
      expect(contrast(control.text, control.background), `"${control.name}" text vs its background`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

// The same header at phone width: the actions must stay on one line each
// (wrapping the group is fine, wrapping a label inside its button is not) and
// the header must not overflow the viewport.
test("STY-03: at phone width the header actions keep their labels on one line", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, ADMIN);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  const result = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".zg-app-header button")] as HTMLElement[];
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      buttons: buttons.map((b) => {
        const style = getComputedStyle(b);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
        return { name: (b.textContent ?? "").trim(), lines: Math.round((b.getBoundingClientRect().height - padding - border) / lineHeight) };
      }),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(0);
  for (const button of result.buttons) expect(button.lines, `"${button.name}" wraps onto ${button.lines} lines`).toBe(1);
});
