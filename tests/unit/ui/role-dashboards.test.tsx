// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MentorDashboard } from "@/features/mentor/mentor-dashboard";
import { PendingConfirmationList } from "@/features/mentor/pending-confirmation-list";
import { SupervisorDashboard } from "@/features/supervisor/supervisor-dashboard";
import type {
  ConfirmationQueueItemDto,
  RoleDashboardTraineeDto,
  RoleScopeSummaryDto,
} from "@/server/services/dashboard.service";

const metric = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

const trainee = (
  id: string,
  name: string,
  assigned: boolean,
  overrides: Partial<RoleDashboardTraineeDto> = {},
): RoleDashboardTraineeDto => ({
  trainee: {
    id,
    name,
    employeeId: `E-${id}`,
    focusGroup: "D2",
    currentDay: 18,
  },
  stage: "P1",
  learn: metric(45, 90),
  due: metric(12, 18),
  overdueCount: 3,
  pendingConfirmationCount: 2,
  risk: { level: "ATTENTION", reason: "3 项学习任务逾期" },
  assigned,
  canConfirm: assigned,
  accessReason: assigned ? "MENTOR_ASSIGNMENT" : "READ_ONLY",
  reviewers: [{ role: "MENTOR", employeeId: "M001", primary: true }],
  ...overrides,
});

const scope = (
  traineeCount: number,
  learn = metric(45, 90),
  due = metric(12, 18),
): RoleScopeSummaryDto => ({
  traineeCount,
  learn,
  due,
  overdueCount: traineeCount * 3,
  pendingConfirmationCount: traineeCount * 2,
  attentionCount: traineeCount,
  highRiskCount: 0,
});

afterEach(cleanup);

describe("mentor and supervisor dashboards", () => {
  it("mentor renders assigned trainees only with every required card signal", () => {
    render(
      <MentorDashboard
        dashboard={{
          trainees: [
            trainee("assigned", "张三", true),
            trainee("unassigned", "不应出现", false),
          ],
          summary: scope(1),
          confirmationQueue: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "导师工作台" })).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.queryByText("不应出现")).not.toBeInTheDocument();
    const card = screen.getByRole("article", { name: "张三的培养概览" });
    expect(within(card).getByText("Day 18")).toBeInTheDocument();
    expect(within(card).getByText("P1 · 入门")).toBeInTheDocument();
    expect(within(card).getByText("50%", { selector: "strong" })).toBeInTheDocument();
    expect(within(card).getByText("67%", { selector: "strong" })).toBeInTheDocument();
    expect(within(card).getByText("3 项")).toBeInTheDocument();
    expect(within(card).getByText("2 项")).toBeInTheDocument();
    expect(within(card).getByText("重点 D2 · 光路光源")).toBeInTheDocument();
    expect(within(card).getByText("3 项学习任务逾期")).toBeInTheDocument();
    expect(within(card).getByText("主导师 M001")).toBeInTheDocument();
  });

  it("shows every trainee in one read-only supervisor view without reviewer identities", () => {
    const assigned = trainee("assigned", "负责新人", true);
    const unassigned = trainee("unassigned", "其他新人", false, {
      canConfirm: false,
      accessReason: "READ_ONLY",
    });
    render(
      <SupervisorDashboard
        dashboard={{
          trainees: [assigned, unassigned],
          assignedSummary: scope(1),
          allSummary: scope(2, metric(90, 180), metric(24, 36)),
        }}
      />,
    );

    expect(screen.getByRole("searchbox", { name: "搜索新人" })).toBeInTheDocument();
    expect(screen.getByText("负责新人")).toBeInTheDocument();
    expect(screen.getByText("其他新人")).toBeInTheDocument();
    expect(screen.queryByText("主导师 M001")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "新人查看范围" })).not.toBeInTheDocument();
    for (const name of ["负责新人", "其他新人"]) {
      const card = screen.getByRole("article", { name: `${name}的培养概览` });
      expect(within(card).getByText("只读")).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "查看只读进度" })).toBeInTheDocument();
    }
  });

  it("filters the supervisor list by name or employee ID", () => {
    render(
      <SupervisorDashboard
        dashboard={{
          trainees: [
            trainee("assigned", "张三", true),
            trainee("unassigned", "李四", false),
          ],
          assignedSummary: scope(1),
          allSummary: scope(2),
        }}
        query="E-unassigned"
      />,
    );

    expect(screen.queryByText("张三")).not.toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.getByText("1 人")).toBeInTheDocument();
  });

  it("shows stable zero-denominator states without NaN", () => {
    render(
      <SupervisorDashboard
        dashboard={{
          trainees: [
            trainee("empty", "零任务新人", false, {
              canConfirm: false,
              accessReason: "READ_ONLY",
              stage: null,
              learn: metric(0, 0),
              due: metric(0, 0),
              overdueCount: 0,
              pendingConfirmationCount: 0,
              risk: { level: "ON_TRACK", reason: "当前没有逾期任务" },
              reviewers: [],
            }),
          ],
          assignedSummary: scope(0, metric(0, 0), metric(0, 0)),
          allSummary: scope(1, metric(0, 0), metric(0, 0)),
        }}
      />,
    );

    expect(screen.getAllByText("暂无任务").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("阶段待定")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("NaN");
  });

  it("keeps a pending Action row visible with context when confirmation fails", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const item: ConfirmationQueueItemDto = {
      trainee: { id: "assigned", name: "张三", employeeId: "E001" },
      taskId: "task-action",
      day: 7,
      task: "完成首件装调",
      kind: "ACTION",
      content: "在导师陪同下完成首件装调",
    };
    render(<PendingConfirmationList action={confirm} items={[item]} />);

    const row = screen.getByRole("article", { name: "张三第 7 天 Action 确认" });
    expect(within(row).getByText("Action · 干")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "确认张三第 7 天 Action" }));

    expect(await within(row).findByRole("alert")).toHaveTextContent("保存失败，请稍后重试");
    expect(within(row).getByText("完成首件装调")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith({
      traineeId: "assigned",
      taskId: "task-action",
      kind: "ACTION",
      confirmed: true,
    });
  });

  it("removes a Drill from the pending queue after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockResolvedValue(undefined);
    const item: ConfirmationQueueItemDto = {
      trainee: { id: "assigned", name: "李四", employeeId: "E002" },
      taskId: "task-drill",
      day: 9,
      task: "故障演练",
      kind: "DRILL",
      content: "完成传感器故障定位演练",
    };
    render(<PendingConfirmationList action={confirm} items={[item]} />);

    const row = screen.getByRole("article", { name: "李四第 9 天 Drill 确认" });
    expect(within(row).getByText("Drill · 练")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "确认李四第 9 天 Drill" }));
    expect(await screen.findByText("当前没有待确认项目")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith({
      traineeId: "assigned",
      taskId: "task-drill",
      kind: "DRILL",
      confirmed: true,
    });
  });

  it("keeps each confirmation row pending independently until its own request completes", async () => {
    const user = userEvent.setup();
    let resolveAction!: () => void;
    let resolveDrill!: () => void;
    const actionPending = new Promise<void>((resolve) => { resolveAction = resolve; });
    const drillPending = new Promise<void>((resolve) => { resolveDrill = resolve; });
    const confirm = vi.fn((input: { taskId: string }) =>
      input.taskId === "task-action" ? actionPending : drillPending,
    );
    const items: ConfirmationQueueItemDto[] = [
      {
        trainee: { id: "assigned", name: "张三", employeeId: "E001" },
        taskId: "task-action",
        day: 7,
        task: "实践任务",
        kind: "ACTION",
        content: "实践内容",
      },
      {
        trainee: { id: "assigned", name: "张三", employeeId: "E001" },
        taskId: "task-drill",
        day: 8,
        task: "演练任务",
        kind: "DRILL",
        content: "演练内容",
      },
    ];
    render(<PendingConfirmationList action={confirm} items={items} />);
    const actionButton = screen.getByRole("button", { name: "确认张三第 7 天 Action" });
    const drillButton = screen.getByRole("button", { name: "确认张三第 8 天 Drill" });

    await user.click(actionButton);
    await user.click(drillButton);
    expect(actionButton).toBeDisabled();
    expect(drillButton).toBeDisabled();

    resolveAction();
    expect(await screen.findByRole("article", { name: "张三第 8 天 Drill 确认" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "张三第 7 天 Action 确认" })).not.toBeInTheDocument();
    expect(drillButton).toBeDisabled();

    resolveDrill();
    expect(await screen.findByText("当前没有待确认项目")).toBeInTheDocument();
  });

  it("ignores duplicate submissions for the same pending row", () => {
    const never = new Promise<void>(() => undefined);
    const confirm = vi.fn(() => never);
    const item: ConfirmationQueueItemDto = {
      trainee: { id: "assigned", name: "张三", employeeId: "E001" },
      taskId: "task-action",
      day: 7,
      task: "实践任务",
      kind: "ACTION",
      content: "实践内容",
    };
    render(<PendingConfirmationList action={confirm} items={[item]} />);
    const button = screen.getByRole("button", { name: "确认张三第 7 天 Action" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
