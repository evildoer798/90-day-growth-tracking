import { beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: authBoundary.signOut }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));

import { logoutAction } from "@/server/actions/auth.actions";

describe("logout action", () => {
  beforeEach(() => authBoundary.signOut.mockReset());

  it("ends the Auth.js session and returns to login", async () => {
    authBoundary.signOut.mockResolvedValue(undefined);
    await logoutAction();
    expect(authBoundary.signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
