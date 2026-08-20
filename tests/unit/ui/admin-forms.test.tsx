// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/admin.actions", () => ({
  createTraineeAction: vi.fn(), updateTraineeAction: vi.fn(), setTraineeEnabledAction: vi.fn(),
  createUserAction: vi.fn(), updateUserAction: vi.fn(), resetUserPasswordAction: vi.fn(), setUserEnabledAction: vi.fn(),
  replaceReviewerRelationAction: vi.fn(), updateTrainingTaskAction: vi.fn(), setTrainingTaskEnabledAction: vi.fn(),
}));

import { RelationForm } from "@/features/admin/relation-form";
import { TaskForm } from "@/features/admin/task-form";
import { TraineeForm, TraineeStatusForm } from "@/features/admin/trainee-form";
import { UserForm, UserSecurityForm } from "@/features/admin/user-form";

afterEach(cleanup);

const failure = {
  success: false as const,
  formError: "请检查表单中的错误",
  fieldErrors: { name: ["姓名已被占用"] },
};

describe("ADMIN forms", () => {
  it("submits a trainee edit and retains the edited value with Chinese field feedback on failure", async () => {
    const action = vi.fn().mockResolvedValue(failure);
    const user = userEvent.setup();
    render(<TraineeForm action={action} durationDays={91} initial={{
      id: "trainee-1", name: "原姓名", employeeId: "e001", focusGroup: "D1",
      trainingStartDate: "2026-08-15", trainingDayOverride: null,
    }} />);

    const name = screen.getByLabelText("姓名");
    await user.clear(name);
    await user.type(name, "新姓名");
    await user.click(screen.getByRole("button", { name: "保存新人修改" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ id: "trainee-1", name: "新姓名" })));
    expect(name).toHaveValue("新姓名");
    expect(screen.getByLabelText("Day 覆盖（可选）")).toHaveAttribute("max", "91");
    expect(screen.getByText("姓名已被占用")).toBeInTheDocument();
    expect(screen.getByText("请检查表单中的错误")).toBeInTheDocument();
  });

  it("keeps trainee and staff roles mutually exclusive while retaining a failed edit", async () => {
    const action = vi.fn().mockResolvedValue({ success: false, formError: "角色设置无效", fieldErrors: { roles: ["请重新选择角色"] } });
    const user = userEvent.setup();
    render(<UserForm action={action} initial={{ id: "user-1", username: "E001", roles: ["MENTOR"], traineeId: null }} trainees={[{ id: "t1", label: "小王 · E001" }]} />);

    await user.click(screen.getByRole("checkbox", { name: "TRAINEE" }));
    expect(screen.getByRole("checkbox", { name: "MENTOR" })).not.toBeChecked();
    await user.selectOptions(screen.getByLabelText(/新人档案/), "t1");
    await user.click(screen.getByRole("button", { name: "保存账户修改" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1", roles: ["TRAINEE"], traineeId: "t1" })));
    expect(screen.getByRole("checkbox", { name: "TRAINEE" })).toBeChecked();
    expect(screen.getByLabelText(/新人档案/)).toHaveValue("t1");
    expect(screen.getByText("请重新选择角色")).toBeInTheDocument();
  });

  it("keeps risky-operation confirmation and password on failure, then clears them only on success", async () => {
    const resetAction = vi.fn()
      .mockResolvedValueOnce({ success: false, formError: "重置失败，请重试" })
      .mockResolvedValueOnce({ success: true, data: {} });
    const toggleAction = vi.fn().mockResolvedValue({ success: false, formError: "停用失败，请重试" });
    const user = userEvent.setup();
    render(<UserSecurityForm enabled id="user-1" resetAction={resetAction} toggleAction={toggleAction} />);
    const password = screen.getByLabelText("新密码（不会显示现有密码）");
    const confirmation = screen.getByRole("checkbox", { name: "确认敏感操作" });
    await user.type(password, "new-pass-123");
    await user.click(confirmation);
    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await screen.findByText("重置失败，请重试");
    expect(password).toHaveValue("new-pass-123");
    expect(confirmation).toBeChecked();

    await user.click(screen.getByRole("button", { name: "重置密码" }));
    await screen.findByText("密码已重置");
    expect(password).toHaveValue("");
    expect(confirmation).not.toBeChecked();
  });

  it("does not clear trainee, relation, or task confirmations when their actions fail", async () => {
    const user = userEvent.setup();
    const failedAction = vi.fn().mockResolvedValue({ success: false, formError: "操作失败，请重试" });
    const { unmount } = render(<TraineeStatusForm action={failedAction} enabled id="t1" />);
    await user.click(screen.getByRole("checkbox", { name: "确认停用" }));
    await user.click(screen.getByRole("button", { name: "停用" }));
    await screen.findByText("操作失败，请重试");
    expect(screen.getByRole("checkbox", { name: "确认停用" })).toBeChecked();
    unmount();

    render(<RelationForm action={failedAction} reviewers={[{ id: "u1", label: "导师" }]} trainees={[{ id: "t1", label: "新人" }]} />);
    await user.type(screen.getByLabelText("生效日期"), "2026-08-15");
    await user.click(screen.getByRole("checkbox", { name: /确认替换/ }));
    await user.click(screen.getByRole("button", { name: "确认替换关系" }));
    await screen.findByText("操作失败，请重试");
    expect(screen.getByRole("checkbox", { name: /确认替换/ })).toBeChecked();
    cleanup();

    render(<TaskForm toggleAction={failedAction} updateAction={failedAction} value={{
      id: "task-1", day: 1, stage: "P1", dimension: "D1", dimensionName: "机械运动",
      task: "任务", action: null, drill: null, sortOrder: 1, enabled: true, references: [],
    }} />);
    await user.click(screen.getByRole("checkbox", { name: "确认停用任务" }));
    await user.click(screen.getByRole("button", { name: "停用任务" }));
    await screen.findByText("操作失败，请重试");
    expect(screen.getByRole("checkbox", { name: "确认停用任务" })).toBeChecked();
  });

  it("does not expose or submit the cancelled Milestone field", async () => {
    const action = vi.fn().mockResolvedValue({ success: true, data: {} });
    const user = userEvent.setup();
    render(<TaskForm updateAction={action} value={{
      id: "task-1", day: 1, stage: "P1", dimension: "D1", dimensionName: "机械运动",
      task: "任务", action: null, drill: null, sortOrder: 1, enabled: true, references: [],
    }} />);

    expect(screen.queryByLabelText(/Milestone/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存任务版本" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0]?.[0]).not.toHaveProperty("milestone");
  });

  it("keeps task Day as a plain numeric field and saves its edited value", async () => {
    const action = vi.fn().mockResolvedValue({ success: true, data: {} });
    const user = userEvent.setup();
    render(<TaskForm maximumDay={120} updateAction={action} value={{
      id: "task-1", day: 42, stage: "P2", dimension: "D2", dimensionName: "光路光源",
      task: "任务", action: null, drill: null, sortOrder: 1, enabled: true, references: [],
    }} />);

    const dayInput = screen.getByRole("spinbutton", { name: "任务 Day（1–120）" });
    expect(dayInput).toHaveAttribute("min", "1");
    expect(dayInput).toHaveAttribute("max", "120");
    expect(screen.queryByRole("button", { name: /增加一天|减少一天/ })).not.toBeInTheDocument();
    await user.clear(dayInput);
    await user.type(dayInput, "43");
    await user.click(screen.getByRole("button", { name: "保存任务版本" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(expect.objectContaining({ day: 43 })));
  });
});
