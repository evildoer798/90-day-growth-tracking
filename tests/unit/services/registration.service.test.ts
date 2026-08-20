import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    role: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    trainee: { findUnique: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    hash: vi.fn(),
    transaction: vi.fn((callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("bcryptjs", () => ({ hash: mocks.hash }));
vi.mock("@/server/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import {
  registerTraineeAccount,
  RegistrationConflictError,
  RegistrationUnavailableError,
} from "@/server/services/registration.service";

describe("registerTraineeAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("password-hash");
    mocks.tx.role.findUnique.mockResolvedValue({ id: "trainee-role" });
    mocks.tx.user.findUnique.mockResolvedValue(null);
    mocks.tx.trainee.findUnique.mockResolvedValue(null);
    mocks.tx.trainee.create.mockResolvedValue({ id: "trainee-1" });
    mocks.tx.user.create.mockResolvedValue({ id: "user-1" });
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("atomically creates a D1 trainee, linked user, trainee role, and safe audit record", async () => {
    const result = await registerTraineeAccount({
      employeeId: "EMP001",
      name: "张三",
      password: "secret123",
    }, new Date("2026-08-16T01:00:00.000Z"));

    expect(result).toEqual({ employeeId: "EMP001" });
    expect(mocks.hash).toHaveBeenCalledWith("secret123", 12);
    expect(mocks.tx.trainee.create).toHaveBeenCalledWith({
      data: {
        employeeId: "EMP001",
        name: "张三",
        focusGroup: "D1",
        trainingStartDate: new Date("2026-08-16T00:00:00.000Z"),
      },
      select: { id: true },
    });
    expect(mocks.tx.user.create).toHaveBeenCalledWith({
      data: {
        username: "EMP001",
        passwordHash: "password-hash",
        traineeId: "trainee-1",
        roles: { create: { roleId: "trainee-role" } },
      },
      select: { id: true },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "user-1",
        entity: "SELF_REGISTRATION",
        after: expect.not.objectContaining({ password: expect.anything() }),
      }),
    });
  });

  it("rejects an existing employee ID before creating any records", async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ id: "existing" });

    await expect(registerTraineeAccount({
      employeeId: "EMP001",
      name: "张三",
      password: "secret123",
    })).rejects.toBeInstanceOf(RegistrationConflictError);

    expect(mocks.tx.trainee.create).not.toHaveBeenCalled();
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });

  it("maps unique races and a missing trainee role to safe domain errors", async () => {
    mocks.transaction.mockRejectedValueOnce({ code: "P2002" });
    await expect(registerTraineeAccount({ employeeId: "EMP1", name: "甲", password: "secret123" }))
      .rejects.toBeInstanceOf(RegistrationConflictError);

    mocks.tx.role.findUnique.mockResolvedValueOnce(null);
    await expect(registerTraineeAccount({ employeeId: "EMP2", name: "乙", password: "secret123" }))
      .rejects.toBeInstanceOf(RegistrationUnavailableError);
  });
});
