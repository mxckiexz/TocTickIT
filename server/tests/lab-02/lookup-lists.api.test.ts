import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 3: GET /api/related-systems now requires an authenticated session
// (any role) instead of being open (docs/lab-03/api-spec.md "Lookup
// endpoints") — GET /api/requesters is removed entirely, replaced by
// session-based identity.
describe("GET /api/related-systems", () => {
  const email = "lookup-fixture@toktickit.test";

  afterAll(async () => {
    await deleteFixtureUser(email);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/related-systems").expect(401);
    expect(response.body.error).toBeDefined();
  });

  it("returns only active related systems in id order, for an authenticated session", async () => {
    await createFixtureUser(email);
    const agent = await loginAgent(email);

    const response = await agent.get("/api/related-systems").expect(200);

    const names = response.body.map((system: { name: string }) => system.name);
    expect(names).toContain("Email");
    expect(names).toContain("Corporate Laptop");
    expect(names).not.toContain("Archived System (test fixture)");

    for (const system of response.body) {
      expect(system).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
      });
    }

    const ids = response.body.map((system: { id: number }) => system.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
  });
});

describe("GET /api/requesters (removed in Lab 3)", () => {
  it("no longer exists — the Development Requester picker is gone (specification.md §3.1)", async () => {
    const response = await request(app).get("/api/requesters");
    expect(response.status).toBe(404);
  });
});
