// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getTrainingPlanSettings: vi.fn(),
}));

vi.mock("@/server/auth/get-actor", () => ({ getActor: vi.fn().mockResolvedValue({ userId: "admin", roles: ["ADMIN"], enabled: true }) }));
vi.mock("@/server/auth/require-permission", () => ({ requireManageUsers: vi.fn() }));
vi.mock("@/server/db/prisma", () => ({ prisma: { trainingTask: { findMany: mocks.findMany } } }));
vi.mock("@/server/repositories/training-plan-settings.repository", () => ({
  getTrainingPlanSettings: mocks.getTrainingPlanSettings,
  TRAINING_PLAN_MIN_DAYS: 1,
  TRAINING_PLAN_MAX_DAYS: 365,
}));
vi.mock("@/features/admin/training-duration-control", () => ({
  TrainingDurationControl: ({ durationDays, revision }: { durationDays: number; revision: number }) => <div data-testid="duration-control">{durationDays} 天 · revision {revision}</div>,
}));
vi.mock("@/features/admin/task-form", () => ({
  TaskForm: ({ maximumDay }: { maximumDay: number }) => <div data-testid="task-form">最大 Day {maximumDay}</div>,
}));

import AdminTasksPage from "@/app/(protected)/admin/tasks/page";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ADMIN tasks page", () => {
  it("places the plan duration control between the page title and task list", async () => {
    mocks.getTrainingPlanSettings.mockResolvedValue({ id: "default", durationDays: 100, revision: 3, updatedAt: new Date() });
    mocks.findMany.mockResolvedValue([{
      id: "task-1", day: 4, stage: "P1", dimension: "D1", dimensionName: "机械运动",
      task: "测试任务", action: null, drill: null, sortOrder: 2, enabled: true,
      stableImportKey: "task-1", references: [],
    }]);

    const { container } = render(await AdminTasksPage());
    const title = screen.getByRole("heading", { level: 1, name: "任务库与版本" });
    const durationControl = screen.getByTestId("duration-control");
    const taskSummary = screen.getByText(/Day 4 · D1 · 测试任务/);
    expect(title.compareDocumentPosition(durationControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(durationControl.compareDocumentPosition(taskSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("task-form")).toHaveTextContent("最大 Day 100");
    expect(container.querySelector(".admin-task-list")).toContainElement(taskSummary.closest("details"));
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ day: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }));
  });
});
