import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionActor } from "@/domain/permissions/types";

const mocks = vi.hoisted(() => {
  const traineeFindFirst = vi.fn();
  const traineeCreate = vi.fn();
  const settingsFindUniqueOrThrow = vi.fn();
  const auditCreate = vi.fn();
  const transaction = {
    trainingPlanSettings: { findUniqueOrThrow: settingsFindUniqueOrThrow },
    trainee: { findFirst: traineeFindFirst, create: traineeCreate },
    auditLog: { create: auditCreate },
  };
  return {
    auditCreate,
    settingsFindUniqueOrThrow,
    traineeCreate,
    traineeFindFirst,
    transaction,
    withAdminTransaction: vi.fn(async (
      _actorId: string,
      operation: (tx: typeof transaction) => Promise<unknown>,
    ) => operation(transaction)),
  };
});

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-transaction", () => ({
  withAdminTransaction: mocks.withAdminTransaction,
}));

import { createTrainee, updateTrainingTask } from "@/server/services/admin.service";

const admin: PermissionActor = {
  userId: "admin-1",
  roles: ["ADMIN"],
  traineeId: null,
  enabled: true,
};

const input = {
  name: "测试新人",
  employeeId: "e091",
  focusGroup: "D1",
  trainingStartDate: "2026-08-16",
  trainingDayOverride: 91,
};

const settings = (durationDays: number) => ({
  id: "default",
  durationDays,
  revision: 1,
  updatedAt: new Date("2026-08-16T00:00:00.000Z"),
});

describe("trainee override duration validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.traineeFindFirst.mockResolvedValue(null);
    mocks.traineeCreate.mockResolvedValue({
      id: "trainee-91",
      name: input.name,
      employeeId: input.employeeId.toUpperCase(),
      focusGroup: input.focusGroup,
      trainingStartDate: new Date("2026-08-16T00:00:00.000Z"),
      trainingDayOverride: input.trainingDayOverride,
      enabled: true,
    });
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("rejects an override beyond the current plan duration before writing", async () => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(90));

    await expect(createTrainee(admin, input)).rejects.toMatchObject({
      issues: [expect.objectContaining({
        path: ["trainingDayOverride"],
        message: "Day 覆盖不能超过当前培养计划总天数（90 天）",
      })],
    });
    expect(mocks.traineeCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("accepts the same override after the plan is extended", async () => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(91));

    await expect(createTrainee(admin, input)).resolves.toMatchObject({
      trainingDayOverride: 91,
    });
    expect(mocks.traineeCreate).toHaveBeenCalledOnce();
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });

  it("rejects moving a task beyond the current plan duration", async () => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(90));

    await expect(updateTrainingTask(admin, {
      id: "task-91",
      day: 91,
      stage: "P4",
      dimension: "D1",
      dimensionName: "机械运动",
      task: "尾部任务",
      action: null,
      drill: null,
      sortOrder: 91,
      references: [],
    })).rejects.toMatchObject({
      issues: [expect.objectContaining({
        path: ["day"],
        message: "任务 Day 不能超过当前培养计划总天数（90 天）",
      })],
    });
  });
});
