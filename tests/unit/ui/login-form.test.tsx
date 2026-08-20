// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/features/auth/login-form";

afterEach(cleanup);

describe("LoginForm", () => {
  it("submits exactly the entered employee ID and password", async () => {
    const user = userEvent.setup();
    const actionSpy = vi.fn().mockResolvedValue(undefined);

    render(<LoginForm action={actionSpy} />);
    await user.type(screen.getByLabelText("工号"), "ADMIN001");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(actionSpy).toHaveBeenCalledOnce();
    expect(actionSpy).toHaveBeenCalledWith({
      employeeId: "ADMIN001",
      password: "secret123",
    });
  });

  it("disables submission and announces progress while authentication is pending", async () => {
    const user = userEvent.setup();
    let finishAuthentication: (() => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishAuthentication = resolve;
        }),
    );

    render(<LoginForm action={action} />);
    await user.type(screen.getByLabelText("工号"), "ADMIN001");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(screen.getByRole("button", { name: "登录中…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在验证登录信息");

    finishAuthentication?.();
  });

  it("renders a generic Chinese error without exposing a thrown credential-bearing message", async () => {
    const user = userEvent.setup();
    const action = vi
      .fn()
      .mockRejectedValue(new Error("database rejected password secret123"));

    render(<LoginForm action={action} />);
    await user.type(screen.getByLabelText("工号"), "ADMIN001");
    await user.type(screen.getByLabelText("密码"), "secret123");
    await user.click(screen.getByRole("button", { name: "登录" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("工号或密码不正确，请重试");
    expect(alert).not.toHaveTextContent("secret123");
    expect(alert).not.toHaveTextContent("database");
  });
});
