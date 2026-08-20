import { describe, expect, it } from "vitest";

import { createUserSchema, updateUserSchema } from "@/server/services/admin.service";

describe("admin user role separation", () => {
  it("accepts a standalone trainee role linked to one trainee", () => {
    expect(createUserSchema.safeParse({
      username: "e001",
      password: "password-123",
      roles: ["TRAINEE"],
      traineeId: "trainee-1",
    }).success).toBe(true);
  });

  it("rejects combining trainee progress with staff roles", () => {
    const result = updateUserSchema.safeParse({
      id: "user-1",
      username: "m001",
      roles: ["MENTOR", "TRAINEE"],
      traineeId: "trainee-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.roles).toContain(
        "新人角色不能与管理员、主管或导师角色同时设置",
      );
    }
  });
});
