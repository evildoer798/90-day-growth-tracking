// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/admin.actions", () => ({
  updateTrainingPlanDurationAction: vi.fn(),
}));

import { TrainingDurationControl } from "@/features/admin/training-duration-control";

afterEach(cleanup);

describe("TrainingDurationControl", () => {
  it("saves one-day changes with the latest revision and updates only after success", async () => {
    let resolveAction: ((value: { success: true; data: { durationDays: number; revision: number } }) => void) | undefined;
    const action = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveAction = resolve; }));
    const user = userEvent.setup();
    render(<TrainingDurationControl action={action} durationDays={90} maximumDays={365} minimumDays={1} revision={4} />);

    expect(screen.getByText("90")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "增加培养计划一天" }));
    expect(action).toHaveBeenCalledWith({ delta: 1, expectedRevision: 4 });
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "增加培养计划一天" })).toBeDisabled();

    resolveAction?.({ success: true, data: { durationDays: 91, revision: 5 } });
    await screen.findByText("91");
    expect(screen.getByText("培养计划总天数已更新为 91 天")).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: "减少培养计划一天" }));
    expect(action).toHaveBeenLastCalledWith({ delta: -1, expectedRevision: 5 });
  });

  it("keeps the current duration and reports action errors", async () => {
    const action = vi.fn().mockResolvedValue({ success: false, formError: "设置已被其他管理员更新，请刷新页面后重试" });
    const user = userEvent.setup();
    render(<TrainingDurationControl action={action} durationDays={90} maximumDays={365} minimumDays={1} revision={2} />);

    await user.click(screen.getByRole("button", { name: "减少培养计划一天" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("设置已被其他管理员更新，请刷新页面后重试");
    expect(screen.getByText("90")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "减少培养计划一天" })).toBeEnabled());
  });

  it("disables decrease and increase at the 1-day and 365-day boundaries", () => {
    const { rerender } = render(<TrainingDurationControl durationDays={1} maximumDays={365} minimumDays={1} revision={1} />);
    expect(screen.getByRole("button", { name: "减少培养计划一天" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "增加培养计划一天" })).toBeEnabled();

    rerender(<TrainingDurationControl durationDays={365} maximumDays={365} minimumDays={1} revision={2} />);
    expect(screen.getByRole("button", { name: "减少培养计划一天" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "增加培养计划一天" })).toBeDisabled();
  });

  it("synchronizes with refreshed server settings", () => {
    const { rerender } = render(<TrainingDurationControl durationDays={90} maximumDays={365} minimumDays={1} revision={7} />);
    rerender(<TrainingDurationControl durationDays={92} maximumDays={365} minimumDays={1} revision={8} />);
    expect(screen.getByText("92")).toBeInTheDocument();
  });
});
