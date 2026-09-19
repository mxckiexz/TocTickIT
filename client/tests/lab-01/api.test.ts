import { describe, it, expect, vi, afterEach } from "vitest";
import { checkSystem } from "../../src/api.js";

// Regression coverage for checkSystem() itself. App.test.tsx only ever
// mocks the whole api module, so it never actually exercises this
// function's body — that's exactly how it shipped with a hardcoded
// `categories: []` and a dangling TODO despite the comment right above it
// spelling out both fetch calls, invisible to the suite until caught on
// review. This test mocks global.fetch, not checkSystem, so the real
// implementation runs.
describe("checkSystem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fetches health, then fetches and returns the real categories", async () => {
    const categories = [
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/health")) {
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }
      if (url.endsWith("/api/categories")) {
        return new Response(JSON.stringify(categories), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkSystem();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/health"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/categories"));
    expect(result).toEqual({ online: true, categories });
  });

  it("throws without calling /api/categories when health is not ok", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSystem()).rejects.toThrow("Backend unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
