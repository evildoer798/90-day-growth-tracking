// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DimensionCode } from "@/config/dimensions.config";
import type { Actor } from "@/server/auth/get-actor";
import type {
  DashboardTaskDto,
  TraineeDashboard,
} from "@/server/services/dashboard.service";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  getTraineeDashboard: vi.fn(),
  toggleLearnAction: vi.fn(),
  setPracticeSubmissionAction: vi.fn(),
  setConfirmationAction: vi.fn(),
  saveTaskNotesAction: vi.fn(),
}));

vi.mock("@/server/auth/get-actor", () => ({ getActor: mocks.getActor }));
vi.mock("@/server/services/dashboard.service", () => ({
  getTraineeDashboard: mocks.getTraineeDashboard,
}));
vi.mock("@/server/actions/progress.actions", () => ({
  toggleLearnAction: mocks.toggleLearnAction,
  setPracticeSubmissionAction: mocks.setPracticeSubmissionAction,
  setConfirmationAction: mocks.setConfirmationAction,
  saveTaskNotesAction: mocks.saveTaskNotesAction,
}));

import ProgressPage from "@/app/(protected)/progress/[traineeId]/page";

const actor: Actor = {
  userId: "supervisor-1",
  roles: ["SUPERVISOR"],
  traineeId: null,
  enabled: true,
};

const taskFor = (dimension: DimensionCode, index: number): DashboardTaskDto => ({
  id: `task-${dimension}`,
  stableImportKey: `PLAN-V1-${index}`,
  day: index + 1,
  stage: index < 3 ? "P1" : "P2",
  dimension,
  dimensionName: {
    Dall: "机台管理",
    D1: "机械运动",
    D2: "光路光源",
    D3: "传感器与测校",
    D4: "平台功能",
  }[dimension],
  task: dimension === "D3" ? "传感器校准" : `${dimension} 培养任务`,
  action: null,
  drill: null,
  sortOrder: index + 1,
  isFocus: dimension === "D2",
  references: [],
  progress: null,
  confirmationHistory: [],
});

const dashboard: TraineeDashboard = {
  durationDays: 91,
  trainee: {
    id: "trainee-1",
    name: "张三",
    employeeId: "E001",
    focusGroup: "D2",
    currentDay: 5,
  },
  tasks: (["Dall", "D1", "D2", "D3", "D4"] as const).map(taskFor),
  summary: {
    learn: { numerator: 0, denominator: 5, rate: 0 },
    due: { numerator: 0, denominator: 5, rate: 0 },
    action: { numerator: 0, denominator: 0, rate: null },
    drill: { numerator: 0, denominator: 0, rate: null },
    overdueCount: 4,
    focus: { dimension: "D2", learn: { numerator: 0, denominator: 1, rate: 0 } },
    dimensions: {
      Dall: { numerator: 0, denominator: 1, rate: 0 },
      D1: { numerator: 0, denominator: 1, rate: 0 },
      D2: { numerator: 0, denominator: 1, rate: 0 },
      D3: { numerator: 0, denominator: 1, rate: 0 },
      D4: { numerator: 0, denominator: 1, rate: 0 },
    },
    stages: {
      P1: { numerator: 0, denominator: 3, rate: 0 },
      P2: { numerator: 0, denominator: 2, rate: 0 },
      P3: { numerator: 0, denominator: 0, rate: null },
      P4: { numerator: 0, denominator: 0, rate: null },
    },
  },
  permissions: { canToggleLearn: false, canSubmitPractice: false, canConfirm: false, canWriteMentorNote: false },
};

beforeEach(() => {
  mocks.getActor.mockReset().mockResolvedValue(actor);
  mocks.getTraineeDashboard.mockReset().mockResolvedValue(dashboard);
});

afterEach(cleanup);

describe("protected progress page", () => {
  it("authorizes through the server dashboard and shows every dimension by default", async () => {
    const result = await ProgressPage({
      params: Promise.resolve({ traineeId: "trainee-1" }),
      searchParams: Promise.resolve({}),
    });
    render(result);

    expect(mocks.getActor).toHaveBeenCalledOnce();
    expect(mocks.getTraineeDashboard).toHaveBeenCalledWith(
      actor,
      "trainee-1",
      expect.any(Date),
    );
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(new Set(screen.getAllByRole("article").map((card) => card.dataset.dimension))).toEqual(
      new Set(["Dall", "D1", "D2", "D3", "D4"]),
    );
    expect(screen.getAllByText("重点 D2")).toHaveLength(1);
    expect(screen.queryByText("CERTIFICATION-SHOULD-NOT-RENDER")).not.toBeInTheDocument();
  });

  it("applies combined URL filters without changing dashboard statistics", async () => {
    const result = await ProgressPage({
      params: Promise.resolve({ traineeId: "trainee-1" }),
      searchParams: Promise.resolve({
        stage: "P2",
        dimension: "D3",
        status: "overdue",
        query: "  传感器  ",
      }),
    });
    render(result);

    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("传感器校准")).toBeInTheDocument();
    const learningCard = screen.getByText("学习完成率").closest("li");
    expect(learningCard).not.toBeNull();
    expect(within(learningCard!).getByText("0 / 5 项")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "阶段" })).toHaveValue("P2");
    expect(screen.getByRole("combobox", { name: "维度" })).toHaveValue("D3");
    expect(screen.getByRole("searchbox", { name: "搜索任务" })).toHaveValue("传感器");
  });

  it("shows a clear empty state for a valid filter combination with no matches", async () => {
    const result = await ProgressPage({
      params: Promise.resolve({ traineeId: "trainee-1" }),
      searchParams: Promise.resolve({ dimension: "Dall", status: "today" }),
    });
    render(result);

    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText("没有符合当前筛选条件的任务")).toBeInTheDocument();
  });
});
