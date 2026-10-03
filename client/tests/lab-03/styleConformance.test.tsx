import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import StaffTicketDetail from "../../src/StaffTicketDetail.js";
import StaffTicketQueue from "../../src/StaffTicketQueue.js";
import UserManagement from "../../src/UserManagement.js";
import * as api from "../../src/api.js";
// Vite "?raw" imports: the source text itself, with no Node fs types needed.
import loginSrc from "../../src/Login.tsx?raw";
import changePasswordSrc from "../../src/ChangePassword.tsx?raw";
import queueSrc from "../../src/StaffTicketQueue.tsx?raw";
import detailSrc from "../../src/StaffTicketDetail.tsx?raw";
import userManagementSrc from "../../src/UserManagement.tsx?raw";
import appSrc from "../../src/App.tsx?raw";
// Badge colors come only from Bootstrap's semantic classes (themed by
// theme.css) — never an ad-hoc hex/rgb — and every badge carries a text label.
const ALLOWED_BADGE_COLOR = /\btext-bg-(success|warning|danger|secondary|info)\b/;

function ticket(overrides: Partial<api.StaffTicketSummary> = {}): api.StaffTicketSummary {
  return {
    id: 1, ticketNumber: "TKT-1", requesterId: 1, requesterName: "R", ownerId: null, ownerName: null,
    categoryId: 1, relatedSystemId: 1, summary: "s", description: "d",
    requestedPriority: "HIGH", itPriority: "LOW", currentStatus: "IN_PROGRESS",
    requesterMarkedResolvedAt: null, requesterMarkedResolvedById: null,
    createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", ...overrides,
  };
}

describe("Zen Green conformance", () => {
  afterEach(() => vi.restoreAllMocks());

  // STY-01
  describe("badges (STY-01)", () => {
    it("every priority/status badge in the Staff Queue uses an allowed semantic color class and has a text label", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
      vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([{ id: 1, name: "VPN" }]);
      vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
        tickets: [ticket(), ticket({ id: 2, requestedPriority: "LOW", itPriority: "MEDIUM", currentStatus: "CLOSED" })],
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
      });
      const { container } = render(<StaffTicketQueue />);
      await screen.findAllByText("HIGH");

      const badges = Array.from(container.querySelectorAll(".badge"));
      expect(badges.length).toBeGreaterThan(0);
      for (const badge of badges) {
        expect(badge.className, `badge "${badge.textContent}"`).toMatch(ALLOWED_BADGE_COLOR);
        expect(badge.textContent?.trim().length, "badge has a visible text label").toBeGreaterThan(0);
      }
    });

    it("maps priority to the documented colors: HIGH danger, MEDIUM warning, LOW secondary", async () => {
      vi.spyOn(api, "fetchCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
      vi.spyOn(api, "fetchRelatedSystems").mockResolvedValue([{ id: 1, name: "VPN" }]);
      vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
        tickets: [ticket({ requestedPriority: "HIGH", itPriority: "MEDIUM" }), ticket({ id: 2, requestedPriority: "LOW", itPriority: "LOW" })],
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
      });
      render(<StaffTicketQueue />);
      await screen.findAllByText("HIGH");

      expect(screen.getAllByText("HIGH")[0].className).toContain("text-bg-danger");
      expect(screen.getAllByText("MEDIUM")[0].className).toContain("text-bg-warning");
      expect(screen.getAllByText("LOW")[0].className).toContain("text-bg-secondary");
    });

    it("renders no hard-coded colors in the Lab 3 screens' markup (inline styles carry no hex/rgb)", async () => {
      vi.spyOn(api, "fetchAdminUsers").mockResolvedValue([
        { id: 1, name: "A", email: "a@x.test", role: "REQUESTER", isActive: true, mustChangePassword: false, createdAt: "2026-09-01T00:00:00Z" },
      ]);
      const { container } = render(<UserManagement />);
      await screen.findAllByText("a@x.test");
      for (const el of Array.from(container.querySelectorAll("[style]"))) {
        expect(el.getAttribute("style")).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
      }
    });

    it("the only color literal in the Lab 3 component sources is a token reference with a fallback", () => {
      const sources: Record<string, string> = {
        "Login.tsx": loginSrc,
        "ChangePassword.tsx": changePasswordSrc,
        "StaffTicketQueue.tsx": queueSrc,
        "StaffTicketDetail.tsx": detailSrc,
        "UserManagement.tsx": userManagementSrc,
        "App.tsx": appSrc,
      };
      const literals = Object.entries(sources).flatMap(([file, text]) =>
        (text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).map((match) => `${file}: ${match}`)
      );
      // StaffTicketDetail's Internal Notes tint: var(--zg-pale-green, #eef7ee).
      expect(literals).toEqual(["StaffTicketDetail.tsx: #eef7ee"]);
      expect(detailSrc).toContain("var(--zg-pale-green, #eef7ee)");
    });
  });

  // STY-02
  describe("editable vs. read-only (STY-02)", () => {
    it("on Staff Ticket Detail, IT Priority is an editable control while Requested Priority is a read-only badge", async () => {
      vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
        ticket: {
          ...ticket(), requesterName: "R", requesterEmail: "r@x.test", ownerName: null, ownerEmail: null,
        } as api.StaffTicket,
        attachments: [], comments: [], notes: [],
      });
      render(<StaffTicketDetail ticketId={1} onBack={() => {}} />);

      const itPriority = await screen.findByLabelText("IT Priority");
      expect(itPriority.tagName).toBe("SELECT");
      expect(itPriority).toBeEnabled();

      // The Requested Priority "HIGH" is plain badge text, not a form control.
      const requested = screen.getByText("HIGH");
      expect(requested.className).toContain("badge");
      expect(requested.closest("select, input, textarea")).toBeNull();
    });

    // The "disabled/read-only fields get --zg-readonly-bg" rule lives in
    // theme.css, which Vitest stubs out entirely — it is asserted against the
    // real stylesheet in a real browser instead: e2e/lab-03/style.spec.ts.
  });
});
