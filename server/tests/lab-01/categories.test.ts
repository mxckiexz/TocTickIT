import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { createFixtureUser, deleteFixtureUser, loginAgent } from "../helpers/auth-fixtures.js";

// Lab 3: GET /api/categories now requires an authenticated session (any
// role) instead of being open (docs/lab-03/api-spec.md "Lookup endpoints").
describe("GET /api/categories", () => {
  const email = "categories-fixture@toktickit.test";

  afterAll(async () => {
    await deleteFixtureUser(email);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/categories").expect(401);
    expect(response.body.error).toBeDefined();
  });

  it("rejects a session that still has the default password (requirePasswordUpToDate)", async () => {
    const forcedEmail = "categories-must-change-fixture@toktickit.test";
    await createFixtureUser(forcedEmail, { mustChangePassword: true });
    const agent = await loginAgent(forcedEmail);

    const response = await agent.get("/api/categories").expect(403);
    expect(response.body).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });

    await deleteFixtureUser(forcedEmail);
  });

  it("returns the four seeded categories in id order, for an authenticated session", async () => {
    await createFixtureUser(email);
    const agent = await loginAgent(email);

    const response = await agent.get("/api/categories").expect(200);

    expect(response.body).toHaveLength(4);

    expect(response.body).toEqual([
      {
        id: expect.any(Number),
        name: "Account and Access",
      },
      {
        id: expect.any(Number),
        name: "Hardware",
      },
      {
        id: expect.any(Number),
        name: "Software",
      },
      {
        id: expect.any(Number),
        name: "Network",
      },
    ]);

    const ids = response.body.map(
      (category: { id: number }) => category.id
    );

    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
