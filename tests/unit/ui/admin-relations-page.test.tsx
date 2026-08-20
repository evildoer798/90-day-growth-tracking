// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  traineeFindMany: vi.fn(), userFindMany: vi.fn(), relationFindMany: vi.fn(),
}));

vi.mock("@/server/auth/get-actor", () => ({ getActor: vi.fn().mockResolvedValue({ userId: "admin", roles: ["ADMIN"], enabled: true }) }));
vi.mock("@/server/auth/require-permission", () => ({ requireManageUsers: vi.fn() }));
vi.mock("@/server/actions/admin.actions", () => ({ replaceReviewerRelationAction: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  trainee: { findMany: mocks.traineeFindMany }, user: { findMany: mocks.userFindMany }, userTraineeRelation: { findMany: mocks.relationFindMany },
} }));

import AdminRelationsPage from "@/app/(protected)/admin/relations/page";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ADMIN relation history page", () => {
  it("distinguishes current, scheduled, ended, and cancelled inclusive ranges", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T04:00:00.000Z"));
    mocks.traineeFindMany.mockResolvedValue([]); mocks.userFindMany.mockResolvedValue([]);
    const base = { type: "MENTOR", isPrimary: true, user: { username: "M001" }, trainee: { name: "新人", employeeId: "E001" } };
    mocks.relationFindMany.mockResolvedValue([
      { ...base, id: "current", enabled: true, startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-08-15T00:00:00.000Z") },
      { ...base, id: "future", enabled: true, startDate: new Date("2026-08-20T00:00:00.000Z"), endDate: null },
      { ...base, id: "ended", enabled: true, startDate: new Date("2026-07-01T00:00:00.000Z"), endDate: new Date("2026-07-31T00:00:00.000Z") },
      { ...base, id: "cancelled", enabled: false, startDate: new Date("2026-08-25T00:00:00.000Z"), endDate: new Date("2026-08-25T00:00:00.000Z") },
    ]);
    render(await AdminRelationsPage());
    expect(screen.getByText("当前有效")).toBeInTheDocument();
    expect(screen.getByText("待生效")).toBeInTheDocument();
    expect(screen.getByText("已结束")).toBeInTheDocument();
    expect(screen.getByText("已取消")).toBeInTheDocument();
    expect(screen.getByText("2026-08-25 — 2026-08-25")).toBeInTheDocument();
  });
});
