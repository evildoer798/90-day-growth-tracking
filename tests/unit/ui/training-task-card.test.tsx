// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROGRESS_TEXT_LIMITS } from "@/config/input-limits.config";
import { ProgressHeader } from "@/features/progress/progress-header";
import { ProgressFilters } from "@/features/progress/progress-filters";
import { StatsGrid } from "@/features/progress/stats-grid";
import type { ProgressTaskCardViewModel } from "@/features/progress/client-task-view-model";
import {
  TrainingTaskCard,
  type ProgressTaskActions,
} from "@/features/progress/training-task-card";
import type { TraineeDashboard } from "@/server/services/dashboard.service";

afterEach(cleanup);

const baseTask = (
  overrides: Partial<ProgressTaskCardViewModel> = {},
): ProgressTaskCardViewModel => ({
  traineeId: "trainee-1",
  taskId: "task-1",
  day: 4,
  stage: "P1",
  dimension: "D2",
  dimensionName: "光路光源",
  title: "完成光路安装与校准",
  action: { content: "独立完成一次光路安装", submitted: false, confirmed: false },
  drill: { content: "演练激光器安全检查", submitted: false, confirmed: false },
  isFocus: true,
  learnDone: false,
  references: [{ title: "光路安装手册", url: "https://intranet.example/manual" }],
  notes: {},
  confirmationHistory: [],
  ...overrides,
});

const learnerPermissions: TraineeDashboard["permissions"] = {
  canToggleLearn: true,
  canSubmitPractice: true,
  canConfirm: false,
  canWriteMentorNote: false,
};

const reviewerPermissions: TraineeDashboard["permissions"] = {
  canToggleLearn: false,
  canSubmitPractice: false,
  canConfirm: true,
  canWriteMentorNote: true,
};

const readOnlyPermissions: TraineeDashboard["permissions"] = {
  canToggleLearn: false,
  canSubmitPractice: false,
  canConfirm: false,
  canWriteMentorNote: false,
};

const actionSpies = (): ProgressTaskActions => ({
  toggleLearn: vi.fn().mockResolvedValue({}),
  setPracticeSubmission: vi.fn().mockResolvedValue({}),
  setConfirmation: vi.fn().mockResolvedValue({}),
  saveNotes: vi.fn().mockResolvedValue({}),
});

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe("TrainingTaskCard", () => {
  it("marks focus without hiding or relabeling the task dimension", () => {
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={learnerPermissions}
        task={baseTask()}
      />,
    );

    expect(screen.getByText("光路光源")).toBeInTheDocument();
    expect(screen.getByText("重点 D2")).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveAttribute("data-dimension", "D2");
  });

  it("omits blank Action and Drill sections and their completion controls", () => {
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={reviewerPermissions}
        task={baseTask({ action: null, drill: null })}
      />,
    );

    expect(screen.queryByRole("heading", { name: "Action · 干" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Drill · 练" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /确认 Action/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /确认 Drill/ })).not.toBeInTheDocument();
  });

  it("derives today and overdue badges from the supplied current day", () => {
    const { rerender } = render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={readOnlyPermissions}
        task={baseTask({ day: 4 })}
      />,
    );

    expect(screen.getByText("今日")).toBeInTheDocument();
    expect(screen.queryByText("逾期")).not.toBeInTheDocument();

    rerender(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={5}
        permissions={readOnlyPermissions}
        task={baseTask({ day: 4 })}
      />,
    );

    expect(screen.getByText("逾期")).toBeInTheDocument();
    expect(screen.queryByText("今日")).not.toBeInTheDocument();
  });

  it("lets the learner submit Action and Drill without exposing mentor confirmation controls", async () => {
    const user = userEvent.setup();
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={learnerPermissions}
        task={baseTask()}
      />,
    );

    expect(screen.getByRole("button", { name: "标记学习完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交 Action 已完成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交 Drill 已完成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /确认 Action/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /确认 Drill/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    const drawer = screen.getByRole("dialog", { name: "第 4 天任务详情" });
    expect(within(drawer).getByLabelText("学习反馈")).toBeInTheDocument();
    expect(within(drawer).getByLabelText("给导师的留言")).toBeInTheDocument();
    expect(within(drawer).queryByLabelText("留言内容")).not.toBeInTheDocument();
  });

  it("submits only the practice item the learner clicked", async () => {
    const user = userEvent.setup();
    const actions = actionSpies();
    render(
      <TrainingTaskCard
        actions={actions}
        currentDay={4}
        permissions={learnerPermissions}
        task={baseTask()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "提交 Drill 已完成" }));

    expect(actions.setPracticeSubmission).toHaveBeenCalledTimes(1);
    expect(actions.setPracticeSubmission).toHaveBeenCalledWith({
      traineeId: "trainee-1",
      taskId: "task-1",
      kind: "DRILL",
      submitted: true,
    });
    expect(actions.setConfirmation).not.toHaveBeenCalled();
  });

  it("places the completion badge in the dedicated right-side state area", () => {
    const { container } = render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={learnerPermissions}
        task={baseTask({ learnDone: true })}
      />,
    );

    expect(container.querySelector(".training-task-card__state")).toHaveTextContent("已完成");
    expect(container.querySelector(".training-task-card__badges")).not.toHaveTextContent("已完成");
    expect(screen.getByRole("article")).toHaveClass("training-task-card--learned");
  });

  it("shows an assigned reviewer only confirmation and mentor-note controls", async () => {
    const user = userEvent.setup();
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={reviewerPermissions}
        task={baseTask({
          action: { content: "独立完成一次光路安装", submitted: true, confirmed: false },
          drill: { content: "演练激光器安全检查", submitted: true, confirmed: false },
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "标记学习完成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认 Action" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认 Drill" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    const drawer = screen.getByRole("dialog", { name: "第 4 天任务详情" });
    expect(within(drawer).getByLabelText("留言内容")).toBeInTheDocument();
    expect(within(drawer).queryByLabelText("学习反馈")).not.toBeInTheDocument();
    expect(within(drawer).queryByLabelText("给导师的留言")).not.toBeInTheDocument();
  });

  it("shows trainee and mentor messages to each other", async () => {
    const user = userEvent.setup();
    const notes = {
      feedback: "这一步还需要再练习",
      traineeNote: "请导师帮我看一下操作顺序",
      mentorNote: "明天下午一起复盘",
    };
    const learner = render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={learnerPermissions}
        task={baseTask({ notes })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    expect(screen.getByRole("heading", { name: "导师留言" })).toBeInTheDocument();
    expect(screen.getByText("明天下午一起复盘")).toBeInTheDocument();
    learner.unmount();

    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={reviewerPermissions}
        task={baseTask({ notes })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    expect(screen.getByRole("heading", { name: "新人学习记录" })).toBeInTheDocument();
    expect(screen.getByText("这一步还需要再练习")).toBeInTheDocument();
    expect(screen.getByText("请导师帮我看一下操作顺序")).toBeInTheDocument();
  });

  it("renders an unassigned supervisor view as read-only", async () => {
    const user = userEvent.setup();
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={readOnlyPermissions}
        task={baseTask()}
      />,
    );

    expect(screen.getAllByRole("button").map(({ textContent }) => textContent)).toEqual([
      "查看详情",
    ]);
    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    expect(screen.getByRole("dialog", { name: "第 4 天任务详情" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("opens safe external references in a new tab and never links unsafe protocols", async () => {
    const user = userEvent.setup();
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={readOnlyPermissions}
        task={baseTask({
          references: [
            { title: "安全手册", url: "https://intranet.example/safety" },
            { title: "恶意资料", url: "javascript:alert(1)" },
          ],
        })}
      />,
    );

    expect(screen.getByText("2 份资料")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    const safeLink = screen.getByRole("link", { name: /安全手册.*新窗口打开/ });
    expect(safeLink).toHaveAttribute("href", "https://intranet.example/safety");
    expect(safeLink).toHaveAttribute("target", "_blank");
    expect(safeLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: /恶意资料/ })).not.toBeInTheDocument();
    expect(screen.getByText("恶意资料")).toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("labels Action and Drill confirmation history without exposing actor identity", async () => {
    const user = userEvent.setup();
    render(
      <TrainingTaskCard
        actions={actionSpies()}
        currentDay={4}
        permissions={readOnlyPermissions}
        task={baseTask({
          confirmationHistory: [
            { kind: "ACTION_CONFIRMED", occurredAt: "2026-08-14T10:00:00.000Z" },
            { kind: "ACTION_UNCONFIRMED", occurredAt: "2026-08-14T09:00:00.000Z" },
            { kind: "DRILL_CONFIRMED", occurredAt: "2026-08-14T08:00:00.000Z" },
            { kind: "DRILL_UNCONFIRMED", occurredAt: "2026-08-14T07:00:00.000Z" },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    const drawer = screen.getByRole("dialog", { name: "第 4 天任务详情" });
    expect(within(drawer).getByText("Action 确认")).toBeInTheDocument();
    expect(within(drawer).getByText("Action 撤销确认")).toBeInTheDocument();
    expect(within(drawer).getByText("Drill 确认")).toBeInTheDocument();
    expect(within(drawer).getByText("Drill 撤销确认")).toBeInTheDocument();
    expect(drawer).not.toHaveTextContent("PRIVATE-EMPLOYEE");
  });

  it("publishes the server text limits on editable note fields", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TrainingTaskCard actions={actionSpies()} currentDay={4} permissions={learnerPermissions} task={baseTask()} />);
    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    expect(screen.getByLabelText("学习反馈")).toHaveAttribute("maxlength", String(PROGRESS_TEXT_LIMITS.feedback));
    expect(screen.getByLabelText("给导师的留言")).toHaveAttribute("maxlength", String(PROGRESS_TEXT_LIMITS.traineeNote));
    unmount();

    render(<TrainingTaskCard actions={actionSpies()} currentDay={4} permissions={reviewerPermissions} task={baseTask()} />);
    await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
    expect(screen.getByLabelText("留言内容")).toHaveAttribute("maxlength", String(PROGRESS_TEXT_LIMITS.mentorNote));
  });

  describe.each([
    {
      viewer: "learner",
      permissions: learnerPermissions,
      fieldLabel: "学习反馈",
      saveLabel: "保存学习记录与留言",
      pendingMessage: "正在保存学习记录…",
      successMessage: "学习记录已保存",
    },
    {
      viewer: "reviewer",
      permissions: reviewerPermissions,
      fieldLabel: "留言内容",
      saveLabel: "保存给新人的留言",
      pendingMessage: "正在保存留言…",
      successMessage: "给新人的留言已保存",
    },
  ])("$viewer note feedback", ({
    permissions,
    fieldLabel,
    saveLabel,
    pendingMessage,
    successMessage,
  }) => {
    it("announces pending and success inside the open drawer", async () => {
      const user = userEvent.setup();
      const pendingSave = deferred<unknown>();
      const actions = actionSpies();
      vi.mocked(actions.saveNotes).mockReturnValueOnce(pendingSave.promise);
      render(
        <TrainingTaskCard
          actions={actions}
          currentDay={4}
          permissions={permissions}
          task={baseTask()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
      const drawer = screen.getByRole("dialog", { name: "第 4 天任务详情" });
      await user.type(within(drawer).getByLabelText(fieldLabel), "待保存内容");
      await user.click(within(drawer).getByRole("button", { name: saveLabel }));

      expect(within(drawer).getByRole("status")).toHaveTextContent(pendingMessage);
      expect(within(drawer).getByRole("button", { name: saveLabel })).toBeDisabled();
      expect(screen.getByRole("dialog", { name: "第 4 天任务详情" })).toBe(drawer);

      await act(async () => pendingSave.resolve({}));

      expect(await within(drawer).findByRole("status")).toHaveTextContent(successMessage);
      expect(screen.getByRole("dialog", { name: "第 4 天任务详情" })).toBe(drawer);
    });

    it("announces a generic error inside the open drawer", async () => {
      const user = userEvent.setup();
      const pendingSave = deferred<unknown>();
      const actions = actionSpies();
      vi.mocked(actions.saveNotes).mockReturnValueOnce(pendingSave.promise);
      render(
        <TrainingTaskCard
          actions={actions}
          currentDay={4}
          permissions={permissions}
          task={baseTask()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "查看第 4 天任务详情" }));
      const drawer = screen.getByRole("dialog", { name: "第 4 天任务详情" });
      await user.type(within(drawer).getByLabelText(fieldLabel), "失败内容");
      await user.click(within(drawer).getByRole("button", { name: saveLabel }));

      expect(within(drawer).getByRole("status")).toHaveTextContent(pendingMessage);
      await act(async () => pendingSave.reject(new Error("private database details")));

      expect(await within(drawer).findByRole("alert")).toHaveTextContent("保存失败，请稍后重试");
      expect(drawer).not.toHaveTextContent("private database details");
      expect(screen.getByRole("dialog", { name: "第 4 天任务详情" })).toBe(drawer);
    });
  });

  it("announces a Chinese error and keeps server state when a mutation fails", async () => {
    const user = userEvent.setup();
    const actions = actionSpies();
    vi.mocked(actions.toggleLearn).mockRejectedValueOnce(new Error("database details"));
    render(
      <TrainingTaskCard
        actions={actions}
        currentDay={4}
        permissions={learnerPermissions}
        task={baseTask()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "标记学习完成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请稍后重试");
    expect(screen.getByRole("button", { name: "标记学习完成" })).toBeInTheDocument();
    expect(screen.queryByText("database details")).not.toBeInTheDocument();
  });
});

describe("progress summary", () => {
  const dashboardSummary: TraineeDashboard["summary"] = {
    learn: { numerator: 30, denominator: 90, rate: 1 / 3 },
    due: { numerator: 25, denominator: 30, rate: 5 / 6 },
    action: { numerator: 18, denominator: 80, rate: 0.225 },
    drill: { numerator: 10, denominator: 23, rate: 10 / 23 },
    overdueCount: 5,
    focus: { dimension: "D2", learn: { numerator: 4, denominator: 7, rate: 4 / 7 } },
    dimensions: {
      Dall: { numerator: 10, denominator: 43, rate: 10 / 43 },
      D1: { numerator: 5, denominator: 13, rate: 5 / 13 },
      D2: { numerator: 4, denominator: 7, rate: 4 / 7 },
      D3: { numerator: 5, denominator: 13, rate: 5 / 13 },
      D4: { numerator: 6, denominator: 14, rate: 3 / 7 },
    },
    stages: {
      P1: { numerator: 10, denominator: 20, rate: 0.5 },
      P2: { numerator: 10, denominator: 20, rate: 0.5 },
      P3: { numerator: 5, denominator: 25, rate: 0.2 },
      P4: { numerator: 5, denominator: 25, rate: 0.2 },
    },
  };

  it("renders the five required statistics and a semantic overall progress bar", () => {
    render(
      <>
        <ProgressHeader currentDay={30} durationDays={91} employeeId="E001" focusGroup="D2" name="张三" />
        <StatsGrid currentDay={30} durationDays={91} summary={dashboardSummary} />
      </>,
    );

    expect(screen.getByRole("heading", { name: "张三的 91 天成长进度" })).toBeInTheDocument();
    expect(screen.getByText("工号 E001")).toBeInTheDocument();
    expect(screen.getByText("重点方向：D2 · 光路光源")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("学习完成率")).toBeInTheDocument();
    expect(screen.getByText("截至今日完成率")).toBeInTheDocument();
    expect(screen.getByText("Drill 完成率")).toBeInTheDocument();
    expect(screen.getByText("Action 完成率")).toBeInTheDocument();
    expect(screen.getByText("培养 Day")).toBeInTheDocument();
    expect(screen.getByText("剩余 61 天")).toBeInTheDocument();
    expect(screen.getByText("重点 D2 57%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "学习总进度" })).toHaveAttribute(
      "aria-valuenow",
      "33",
    );
  });

  it("renders a URL-backed combined-filter form with all five dimensions and a clean reset", () => {
    render(
      <ProgressFilters
        filters={{ stage: "P2", dimension: "D3", status: "overdue", query: "传感器" }}
        traineeId="trainee-1"
      />,
    );

    const form = screen.getByRole("search", { name: "筛选培养任务" });
    expect(form).toHaveAttribute("action", "/progress/trainee-1");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByRole("combobox", { name: "阶段" })).toHaveValue("P2");
    const dimension = screen.getByRole("combobox", { name: "维度" });
    expect(dimension).toHaveValue("D3");
    expect(within(dimension).getAllByRole("option")).toHaveLength(6);
    expect(screen.getByRole("combobox", { name: "状态" })).toHaveValue("overdue");
    expect(screen.getByRole("searchbox", { name: "搜索任务" })).toHaveValue("传感器");
    expect(screen.getByRole("link", { name: "重置筛选" })).toHaveAttribute(
      "href",
      "/progress/trainee-1",
    );
  });
});
