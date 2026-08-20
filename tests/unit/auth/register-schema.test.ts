import { describe, expect, it } from "vitest";

import { registerSchema } from "@/features/auth/register-schema";

describe("registerSchema", () => {
  it("normalizes the employee ID and name without changing password characters", () => {
    expect(registerSchema.parse({
      employeeId: "  emp１２３  ",
      name: "  张　三  ",
      password: "  secret123  ",
    })).toEqual({
      employeeId: "EMP123",
      name: "张 三",
      password: "  secret123  ",
    });
  });

  it.each([
    { employeeId: "", name: "张三", password: "secret123" },
    { employeeId: "EMP001", name: "   ", password: "secret123" },
    { employeeId: "EMP001", name: "张三", password: "short" },
    { employeeId: "EMP001", name: "张三", password: "secret123", role: "ADMIN" },
  ])("rejects invalid or privilege-bearing registration input: %j", (input) => {
    expect(registerSchema.safeParse(input).success).toBe(false);
  });
});
