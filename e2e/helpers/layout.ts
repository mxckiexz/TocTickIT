import { expect, type Locator, type Page } from "@playwright/test";

// Lab 4 F10 (docs/lab-04/ui-spec.md sections 7 to 9): the checks that need a real browser's layout and computed styles.

// "No clipping, overlap or horizontal scroll": the page itself never scrolls sideways.
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "document is wider than the viewport").toBeLessThanOrEqual(0);
}

// A wide table may scroll inside its wrapper; what must not happen is a column pushed off-screen. A page-level check
// cannot see that (the wrapper swallows it), so the wrapper itself is measured.
export async function expectTablesFitTheirWrapper(page: Page) {
  const clipped = await page.locator(".table-responsive:visible").evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth));
  for (const amount of clipped) expect(amount, "table is wider than its wrapper (columns clipped off-screen)").toBeLessThanOrEqual(0);
}

// A <select> too narrow for its selected option truncates it without any overflow the checks above can see.
export async function expectSelectLabelsNotTruncated(page: Page) {
  const truncated = await page.locator("select:visible").evaluateAll((selects) =>
    (selects as HTMLSelectElement[])
      .map((select) => {
        const style = getComputedStyle(select);
        const ctx = document.createElement("canvas").getContext("2d")!;
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text = select.selectedOptions[0]?.text ?? "";
        const needed = ctx.measureText(text).width + 44;
        return needed > select.clientWidth ? `"${text}" needs ~${Math.ceil(needed)}px, select is ${select.clientWidth}px` : null;
      })
      .filter(Boolean)
  );
  expect(truncated, "dropdown labels are truncated").toEqual([]);
}

// Controls must not run off the right edge or overlap each other. Looks at every visible button, link, field and card.
export async function expectNothingOverlapsOrLeavesTheScreen(page: Page, within = "body") {
  const problems = await page.locator(within).evaluate((root) => {
    const boxes = [...root.querySelectorAll<HTMLElement>("button, a.btn, input, select, textarea, [data-card]")]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden")
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const found: string[] = [];
    const name = (el: HTMLElement) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30);
    for (const { el, r } of boxes) {
      if (r.right > window.innerWidth + 1 || r.left < -1) found.push(`"${name(el)}" leaves the screen (${Math.round(r.left)}..${Math.round(r.right)})`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 2 && y > 2) found.push(`"${name(a.el)}" overlaps "${name(b.el)}"`);
      }
    }
    return found;
  });
  expect(problems, "controls overlap or leave the screen").toEqual([]);
}

// How many of `selector` share the first row: 3, 2 or 1 cards across.
export async function columnsAcross(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluateAll((els) => {
    const tops = els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => Math.round(el.getBoundingClientRect().top));
    return tops.filter((top) => Math.abs(top - tops[0]) < 4).length;
  });
}

// Does a focused element show a ring: an outline or a box-shadow. Never neither.
export async function hasVisibleFocusRing(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    return outline || style.boxShadow !== "none";
  });
}

export interface ContrastFailure {
  text: string;
  tag: string;
  ratio: number;
  needed: number;
  color: string;
  background: string;
}

// WCAG contrast of every piece of visible text under `root` against the background it is really drawn on (the
// element's own and its ancestors' backgrounds composited, so a translucent fill counts). Text of at least 24px, or
// 18.66px and bold, only needs 3:1; disabled controls are exempt by WCAG 1.4.3 and are returned separately.
export async function measureContrast(page: Page, root = "body"): Promise<{ failures: ContrastFailure[]; disabled: ContrastFailure[]; checked: number }> {
  // Buttons fade between their states over 150ms; a colour read halfway through is neither state, so wait for rest.
  await page.waitForFunction(() => document.getAnimations().length === 0);
  return page.locator(root).evaluate((rootEl) => {
    type RGBA = [number, number, number, number];
    const parse = (css: string): RGBA => {
      const m = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
      return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
    };
    const over = (top: RGBA, below: RGBA): RGBA => {
      const a = top[3] + below[3] * (1 - top[3]);
      if (a === 0) return [255, 255, 255, 0];
      return [0, 1, 2].map((i) => (top[i] * top[3] + below[i] * below[3] * (1 - top[3])) / a).concat(a) as RGBA;
    };
    const backgroundOf = (el: Element): RGBA => {
      const chain: RGBA[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) chain.push(parse(getComputedStyle(node).backgroundColor));
      let result: RGBA = [255, 255, 255, 1];
      for (const layer of chain.reverse()) result = over(layer, result);
      return result;
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const failures: ContrastFailure[] = [];
    const disabled: ContrastFailure[] = [];
    let checked = 0;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || seen.has(el) || !(n.textContent ?? "").trim()) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || el.closest("[hidden], script, style")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fg = parse(style.color);
      const bg = backgroundOf(el);
      const text = over(fg, bg);
      const l1 = lum(text), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(style.fontSize);
      const bold = parseInt(style.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const needed = large ? 3 : 4.5;
      checked++;
      const record: ContrastFailure = {
        text: (el.textContent ?? "").trim().slice(0, 40),
        tag: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : ""),
        ratio: Math.round(ratio * 100) / 100,
        needed,
        color: style.color,
        background: `rgb(${bg.slice(0, 3).map(Math.round).join(", ")})`,
      };
      if (ratio < needed) {
        const isDisabled = !!el.closest(":disabled, [aria-disabled='true']");
        (isDisabled ? disabled : failures).push(record);
      }
    }
    return { failures, disabled, checked };
  });
}
