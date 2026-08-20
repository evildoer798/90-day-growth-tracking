import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLE_CODES } from "@/config/roles.config";

const database = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: { user: { findUnique: database.findUnique } },
}));

import {
  freshActorFromSession,
  UnauthorizedError,
} from "@/server/auth/get-actor";

const staleSession = {
  expires: "2026-08-15T00:00:00.000Z",
  user: {
    id: "user-1",
    employeeId: "ADMIN001",
    roles: [ROLE_CODES.ADMIN],
    traineeId: "stale-trainee",
    enabled: true,
  },
};

describe("fresh protected-request actor", () => {
  beforeEach(() => {
    database.findUnique.mockReset();
  });

  it("uses current PostgreSQL roles and trainee linkage instead of stale JWT claims", async () => {
    database.findUnique.mockResolvedValue({
      id: "user-1",
      enabled: true,
      traineeId: "current-trainee",
      roles: [{ role: { code: ROLE_CODES.TRAINEE } }],
    });

    await expect(freshActorFromSession(staleSession)).resolves.toEqual({
      userId: "user-1",
      roles: [ROLE_CODES.TRAINEE],
      traineeId: "current-trainee",
      enabled: true,
    });
    expect(database.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        id: true,
        enabled: true,
        traineeId: true,
        roles: {
          select: { role: { select: { code: true } } },
          orderBy: { role: { code: "asc" } },
        },
      },
    });
  });

  it.each([
    ["removed user", null],
    ["disabled user", { id: "user-1", enabled: false, traineeId: null, roles: [] }],
    ["user with no active roles", { id: "user-1", enabled: true, traineeId: null, roles: [] }],
  ])("rejects a stale session for a %s on the next request", async (_case, record) => {
    database.findUnique.mockResolvedValue(record);

    await expect(freshActorFromSession(staleSession)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});
