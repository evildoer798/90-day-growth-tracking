import { describe, expect, it } from "vitest";

import { loginSchema } from "@/features/auth/login-schema";

describe("loginSchema", () => {
  it("normalizes the employee ID without changing password characters", () => {
    expect(
      loginSchema.parse({
        employeeId: "  emp\uff11\uff12３  ",
        password: "  password with spaces  ",
      }),
    ).toEqual({
      employeeId: "EMP123",
      password: "  password with spaces  ",
    });
  });

  it.each([
    { employeeId: "", password: "valid" },
    { employeeId: "   ", password: "valid" },
    { employeeId: "employee", password: "" },
    { employeeId: 123, password: "valid" },
  ])("rejects malformed credentials without coercion: %j", (credentials) => {
    expect(loginSchema.safeParse(credentials).success).toBe(false);
  });
});
