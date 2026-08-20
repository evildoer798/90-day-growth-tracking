// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthAccessPanel } from "@/features/auth/auth-access-panel";
import { RegisterForm } from "@/features/auth/register-form";

afterEach(cleanup);

describe("RegisterForm", () => {
  it("submits exactly employee ID, name, and password", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ success: true, employeeId: "EMP001" });
    const onSuccess = vi.fn();

    render(<RegisterForm action={action} onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText("工号"), "EMP001");
    await user.type(screen.getByLabelText("姓名"), "张三");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(action).toHaveBeenCalledWith({
      employeeId: "EMP001",
      name: "张三",
      password: "secret123",
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("EMP001"));
  });

  it("renders safe server-side field errors", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      success: false,
      message: "请检查填写内容后重试",
      fieldErrors: { employeeId: "请输入工号" },
    });

    render(<RegisterForm action={action} onSuccess={vi.fn()} />);
    await user.type(screen.getByLabelText("工号"), " ");
    await user.type(screen.getByLabelText("姓名"), "张三");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("请检查填写内容后重试");
    expect(screen.getByText("请输入工号")).toBeInTheDocument();
    expect(screen.getByLabelText("工号")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("AuthAccessPanel", () => {
  it("switches to login and pre-fills the employee ID after registration", async () => {
    const user = userEvent.setup();
    const register = vi.fn().mockResolvedValue({ success: true, employeeId: "EMP001" });

    render(<AuthAccessPanel loginAction={vi.fn()} registerAction={register} />);
    await user.click(screen.getByRole("tab", { name: "注册" }));
    await user.type(screen.getByLabelText("工号"), "emp001");
    await user.type(screen.getByLabelText("姓名"), "张三");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "注册" }));

    expect(await screen.findByRole("status")).toHaveTextContent("注册成功");
    expect(screen.getByRole("tab", { name: "登录" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("工号")).toHaveValue("EMP001");
  });
});
