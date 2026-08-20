import { beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("@/auth", () => ({ signIn: authBoundary.signIn }));
vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

import { navigationForActor } from "@/config/navigation.config";
import { ROLE_CODES } from "@/config/roles.config";
import { loginAction } from "@/server/actions/auth.actions";

describe("successful login landing", () => {
  beforeEach(() => {
    authBoundary.signIn.mockReset();
    authBoundary.signIn.mockResolvedValue(undefined);
  });

  it("sends a valid login to the implemented protected root landing", async () => {
    await loginAction({ employeeId: "ADMIN001", password: "secret123" });

    expect(authBoundary.signIn).toHaveBeenCalledWith("credentials", {
      employeeId: "ADMIN001",
      password: "secret123",
      redirectTo: "/",
    });
  });

  it("advertises the six implemented admin areas", () => {
    expect(navigationForActor({ roles: [ROLE_CODES.ADMIN], traineeId: null }).map(({ href }) => href)).toEqual([
      "/",
      "/admin/trainees",
      "/admin/users",
      "/admin/relations",
      "/admin/tasks",
      "/admin/import",
      "/admin/audit",
    ]);
  });

  it("adds only the signed-in trainee's own dynamic progress route", () => {
    expect(navigationForActor({ roles: [ROLE_CODES.TRAINEE], traineeId: "trainee/a b" })).toEqual([
      expect.objectContaining({ href: "/" }),
      expect.objectContaining({ label: "我的 90 天进度", href: "/progress/trainee%2Fa%20b" }),
    ]);
    expect(navigationForActor({ roles: [ROLE_CODES.TRAINEE], traineeId: null })).toHaveLength(1);
    expect(navigationForActor({ roles: [ROLE_CODES.MENTOR, ROLE_CODES.TRAINEE], traineeId: "trainee-1" }))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: "trainee-progress" })]));
  });
});
