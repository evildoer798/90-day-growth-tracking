import { beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: authBoundary.findUnique,
    },
  },
}));

vi.mock("@/server/auth/password-hash", () => ({
  verifyPassword: authBoundary.verifyPassword,
}));

import { authorizeCredentials } from "@/server/auth/credentials";

describe("authorizeCredentials input boundary", () => {
  beforeEach(() => {
    authBoundary.findUnique.mockReset();
    authBoundary.verifyPassword.mockReset();
  });

  it("authenticates after selecting credential fields from Auth.js callback metadata", async () => {
    const suppliedPassword = "test-input-only";
    authBoundary.findUnique.mockResolvedValue({
      id: "admin-user-id",
      username: "ADMIN001",
      passwordHash: "stored-hash-placeholder",
      enabled: true,
      traineeId: null,
      roles: [{ role: { code: "ADMIN" } }],
    });
    authBoundary.verifyPassword.mockResolvedValue(true);

    await expect(
      authorizeCredentials({
        employeeId: "  admin001  ",
        password: suppliedPassword,
        callbackUrl: "/",
      }),
    ).resolves.toEqual({
      id: "admin-user-id",
      employeeId: "ADMIN001",
      roles: ["ADMIN"],
      traineeId: null,
      enabled: true,
    });
    expect(authBoundary.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: "ADMIN001" } }),
    );
    expect(authBoundary.verifyPassword).toHaveBeenCalledWith(
      suppliedPassword,
      "stored-hash-placeholder",
    );
  });

  it.each([null, undefined, "ADMIN001", 123, true, []])(
    "rejects a non-credential input without querying the database: %j",
    async (credentials) => {
      await expect(authorizeCredentials(credentials)).resolves.toBeNull();
      expect(authBoundary.findUnique).not.toHaveBeenCalled();
      expect(authBoundary.verifyPassword).not.toHaveBeenCalled();
    },
  );
});
