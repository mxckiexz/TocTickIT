import { vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import * as api from "../../src/api.js";

// Lab 4 F8: every role lands on its Dashboard, so any test that renders <App /> and wants another page mocks the two
// dashboard calls and opens the page from the navigation, as a person would.
export const STAFF_DASHBOARD: api.StaffDashboardData = {
  generatedAt: "2026-11-01T10:00:00.000Z",
  timezone: "Asia/Bangkok",
  unassigned: 6,
  assignedToMe: 3,
  ticketsWithMyOpenActions: 2,
  myRecentActions: [],
  byStatus: { NEW: 2, OPEN: 1, IN_PROGRESS: 3, WAITING_FOR_REQUESTER: 0, RESOLVED: 1, CLOSED: 4, REOPENED: 0, CANCELLED: 1 },
  byItPriority: { LOW: 3, MEDIUM: 5, HIGH: 1 },
  recentlyUpdated: [],
};

export const REQUESTER_DASHBOARD: api.RequesterDashboardData = {
  generatedAt: "2026-11-01T10:00:00.000Z",
  timezone: "Asia/Bangkok",
  openTickets: 4,
  waitingForRequester: 1,
  recentlyUpdated: [],
  recentlyResolved: [],
};

export function mockDashboards() {
  vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue(STAFF_DASHBOARD);
  vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue(REQUESTER_DASHBOARD);
}

// Opens a page from the navigation row once the shell has landed on the Dashboard.
export async function openFromNavigation(name: string) {
  await screen.findByRole("heading", { name: "Dashboard" });
  fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name }));
}
