import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const response = await request(app)
      .get("/api/categories")
      .expect(200);

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