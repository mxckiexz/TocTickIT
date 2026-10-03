import { test, expect } from "@playwright/test";

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
