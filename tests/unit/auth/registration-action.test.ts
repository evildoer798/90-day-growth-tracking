import { beforeEach, describe, expect, it, vi } from "vitest";

const registration = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));
vi.mock("@/server/services/registration.service", () => {
  class RegistrationConflictError extends Error {}
  class RegistrationUnavailableError extends Error {}
  return {
    registerTraineeAccount: registration.create,
    RegistrationConflictError,
    RegistrationUnavailableError,
  };
});

import { registerAction } from "@/server/actions/auth.actions";
import {
  RegistrationConflictError,
  RegistrationUnavailableError,
} from "@/server/services/registration.service";

describe("registerAction", () => {
  beforeEach(() => {
    registration.create.mockReset();
  });

  it("passes only normalized trainee registration data to the service", async () => {
    registration.create.mockResolvedValue({ employeeId: "EMP123" });

    await expect(registerAction({
      employeeId: " emp１２３ ",
      name: " 张三 ",
      password: "secret123",
    })).resolves.toEqual({ success: true, employeeId: "EMP123" });

    expect(registration.create).toHaveBeenCalledWith({
      employeeId: "EMP123",
      name: "张三",
      password: "secret123",
    });
  });

  it("returns field errors without calling the service", async () => {
    const result = await registerAction({
      employeeId: "",
      name: "",
      password: "short",
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      fieldErrors: {
        employeeId: "请输入工号",
        name: "请输入姓名",
        password: "密码至少需要 8 位",
      },
    }));
    expect(registration.create).not.toHaveBeenCalled();
  });

  it("returns safe messages for duplicate, configuration, and unknown errors", async () => {
    registration.create.mockRejectedValueOnce(new RegistrationConflictError());
    await expect(registerAction({ employeeId: "EMP1", name: "张三", password: "secret123" }))
      .resolves.toEqual({ success: false, message: "该工号已注册，请直接登录或联系管理员" });

    registration.create.mockRejectedValueOnce(new RegistrationUnavailableError());
    await expect(registerAction({ employeeId: "EMP2", name: "李四", password: "secret123" }))
      .resolves.toEqual({ success: false, message: "暂时无法注册，请联系管理员" });

    registration.create.mockRejectedValueOnce(new Error("database exposed secret123"));
    const result = await registerAction({ employeeId: "EMP3", name: "王五", password: "secret123" });
    expect(result).toEqual({ success: false, message: "注册失败，请稍后重试" });
    expect(JSON.stringify(result)).not.toContain("secret123");
    expect(JSON.stringify(result)).not.toContain("database");
  });
});
