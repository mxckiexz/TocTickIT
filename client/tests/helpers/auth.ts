import { vi } from "vitest";
import * as api from "../../src/api.js";
import type { AuthUser } from "../../src/api.js";

// Lab 3: every screen now sits behind the App shell's session check
// (GET /api/auth/me on mount) instead of the removed Lab 2
// DevRequesterPicker. Tests that render <App /> mock that call directly so
// the shell resolves straight to the authenticated view.
export const DEFAULT_USER: AuthUser = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer.anderson@toktickit.test",
  role: "REQUESTER",
  mustChangePassword: false,
};

export function mockLoggedInUser(overrides: Partial<AuthUser> = {}): AuthUser {
  const user = { ...DEFAULT_USER, ...overrides };
  vi.spyOn(api, "getCurrentUser").mockResolvedValue(user);
  return user;
}
