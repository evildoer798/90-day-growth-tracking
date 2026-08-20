import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PermissionActor } from "@/domain/permissions/types";

const mocks = vi.hoisted(() => {
  const settingsFindUniqueOrThrow = vi.fn();
  const settingsUpdate = vi.fn();
  const auditCreate = vi.fn();
  const queryRaw = vi.fn();
  const transaction = {
    $queryRaw: queryRaw,
    trainingPlanSettings: {
      findUniqueOrThrow: settingsFindUniqueOrThrow,
      update: settingsUpdate,
    },
    auditLog: { create: auditCreate },
  };
  return {
    auditCreate,
    queryRaw,
    settingsFindUniqueOrThrow,
    settingsUpdate,
    transaction,
    withAdminTransaction: vi.fn(async (_actorId: string, operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction)),
  };
});

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-transaction", () => ({
  withAdminTransaction: mocks.withAdminTransaction,
}));

import {
  TrainingPlanDurationRangeError,
  TrainingPlanRevisionConflictError,
  updateTrainingPlanDuration,
  updateTrainingPlanDurationSchema,
} from "@/server/services/admin.service";
import {
  getTrainingDurationDays,
  getTrainingPlanSettings,
  TRAINING_PLAN_MAX_DAYS,
  TRAINING_PLAN_MIN_DAYS,
} from "@/server/services/training-plan-settings.service";

const admin: PermissionActor = {
  userId: "admin-1",
  roles: ["ADMIN"],
  traineeId: null,
  enabled: true,
};

const settings = (durationDays: number, revision: number) => ({
  id: "default",
  durationDays,
  revision,
  updatedAt: new Date("2026-08-16T00:00:00.000Z"),
});

describe("training plan settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ id: "default" }]);
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
  });

  it("reads the singleton through an injected transaction-compatible client", async () => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(90, 3));
    const database = { trainingPlanSettings: {
      findUniqueOrThrow: mocks.settingsFindUniqueOrThrow,
    } } as never;

    await expect(getTrainingPlanSettings(database)).resolves.toMatchObject({
      id: "default", durationDays: 90, revision: 3,
    });
    await expect(getTrainingDurationDays(database)).resolves.toBe(90);
    expect(mocks.settingsFindUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "default" },
      select: { id: true, durationDays: true, revision: true, updatedAt: true },
    });
  });

  it("accepts only one-day deltas and nonnegative integer revisions", () => {
    expect(updateTrainingPlanDurationSchema.parse({ delta: 1, expectedRevision: 0 })).toEqual({
      delta: 1, expectedRevision: 0,
    });
    expect(updateTrainingPlanDurationSchema.parse({ delta: -1, expectedRevision: 12 })).toEqual({
      delta: -1, expectedRevision: 12,
    });
    expect(() => updateTrainingPlanDurationSchema.parse({ delta: 2, expectedRevision: 0 })).toThrow();
    expect(() => updateTrainingPlanDurationSchema.parse({ delta: 1, expectedRevision: -1 })).toThrow();
  });

  it("locks, increments revision, and audits before and after values", async () => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(90, 7));
    mocks.settingsUpdate.mockResolvedValue(settings(91, 8));

    await expect(updateTrainingPlanDuration(admin, { delta: 1, expectedRevision: 7 })).resolves.toMatchObject({
      durationDays: 91, revision: 8,
    });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.settingsUpdate).toHaveBeenCalledWith({
      where: { id: "default", revision: 7 },
      data: { durationDays: 91, revision: { increment: 1 } },
      select: { id: true, durationDays: true, revision: true, updatedAt: true },
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: {
      actorId: "admin-1",
      action: "UPDATE",
      entity: "TRAINING_PLAN_SETTINGS",
      entityId: "default",
      before: { id: "default", durationDays: 90, revision: 7 },
      after: { id: "default", durationDays: 91, revision: 8 },
    } });
  });

  it("rejects a stale revision without updating or auditing", async () => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(91, 8));
    await expect(updateTrainingPlanDuration(admin, { delta: 1, expectedRevision: 7 }))
      .rejects.toBeInstanceOf(TrainingPlanRevisionConflictError);
    expect(mocks.settingsUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    [TRAINING_PLAN_MIN_DAYS, -1],
    [TRAINING_PLAN_MAX_DAYS, 1],
  ] as const)("rejects changes beyond the %i-day boundary", async (durationDays, delta) => {
    mocks.settingsFindUniqueOrThrow.mockResolvedValue(settings(durationDays, 2));
    await expect(updateTrainingPlanDuration(admin, { delta, expectedRevision: 2 }))
      .rejects.toBeInstanceOf(TrainingPlanDurationRangeError);
    expect(mocks.settingsUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-admin before opening a transaction", async () => {
    await expect(updateTrainingPlanDuration({ ...admin, roles: ["MENTOR"] }, {
      delta: 1, expectedRevision: 0,
    })).rejects.toThrow("Permission denied");
    expect(mocks.withAdminTransaction).not.toHaveBeenCalled();
  });
});
