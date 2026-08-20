import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/server/auth/get-actor";

const mocks = vi.hoisted(() => {
  const queryRaw = vi.fn();
  const progressUpsert = vi.fn();
  const transaction = {
    $queryRaw: queryRaw,
    trainingPlanSettings: { findUniqueOrThrow: vi.fn() },
    taskProgress: { upsert: progressUpsert },
    auditLog: { create: vi.fn() },
  };
  return {
    progressUpsert,
    queryRaw,
    transaction,
    transactionRunner: vi.fn(async (
      operation: (tx: typeof transaction) => Promise<unknown>,
    ) => operation(transaction)),
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: { $transaction: mocks.transactionRunner },
}));

import { toggleLearn } from "@/server/services/progress.service";

const traineeActor: Actor = {
  userId: "user-1",
  roles: ["TRAINEE"],
  traineeId: "trainee-1",
  enabled: true,
};

describe("progress mutation active-duration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.trainingPlanSettings.findUniqueOrThrow.mockResolvedValue({
      id: "default",
      durationDays: 89,
      revision: 2,
      updatedAt: new Date("2026-08-16T00:00:00.000Z"),
    });
    mocks.queryRaw
      .mockResolvedValueOnce([{ id: "user-1", traineeId: "trainee-1", enabled: true }])
      .mockResolvedValueOnce([{ code: "TRAINEE" }])
      .mockResolvedValueOnce([{ id: "trainee-1" }])
      .mockResolvedValueOnce([]);
  });

  it("rejects a direct request for a task hidden beyond the current duration", async () => {
    await expect(toggleLearn(traineeActor, {
      traineeId: "trainee-1",
      taskId: "day-90-task",
      learnDone: true,
    })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    expect(mocks.progressUpsert).not.toHaveBeenCalled();
    expect(mocks.transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
