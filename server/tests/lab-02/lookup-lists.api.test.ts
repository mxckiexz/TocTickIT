import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/related-systems", () => {
  it("returns only active related systems in id order", async () => {
    const response = await request(app).get("/api/related-systems").expect(200);

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

describe("GET /api/requesters", () => {
  it("returns only active requesters in id order", async () => {
    const response = await request(app).get("/api/requesters").expect(200);

    const emails = response.body.map((requester: { email: string }) => requester.email);
    expect(emails).toContain("jennifer.anderson@toktickit.test");
    expect(emails).not.toContain("emily.carter@toktickit.test");

    for (const requester of response.body) {
      expect(requester).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
      });
    }

    const ids = response.body.map((requester: { id: number }) => requester.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => a - b));
  });
});
