import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/server/auth/get-actor";
import {
  cleanupActualTrainingPlan,
  ensureActualTrainingPlan,
} from "./actual-training-plan.fixture";

const boundary = vi.hoisted(() => ({
  getActor: vi.fn<() => Promise<Actor>>(),
  revalidatePath: vi.fn<(path: string) => void>(),
}));

vi.mock("@/server/auth/get-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/get-actor")>()),
  getActor: boundary.getActor,
}));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidatePath }));

import {
  saveTaskNotesAction,
  setPracticeSubmissionAction,
  toggleLearnAction,
} from "@/server/actions/progress.actions";

const databaseUrl = process.env.DATABASE_URL;
const runWithDatabase = databaseUrl ? describe : describe.skip;
const testRunId = randomUUID();
const usernamePrefix = `task-7-action-user-${testRunId}`;
const employeePrefix = `task-7-action-trainee-${testRunId}`;

runWithDatabase("progress server action boundary", () => {
  let prisma: PrismaClient;
  let actor: Actor;
  let traineeId: string;
  let otherTraineeId: string;
  let taskId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    await ensureActualTrainingPlan(prisma);
    const traineeRole = await prisma.role.upsert({
      where: { code: "TRAINEE" },
      update: {},
      create: { code: "TRAINEE" },
    });
    taskId = (await prisma.trainingTask.findFirstOrThrow({
      where: { stableImportKey: { startsWith: "PLAN_V1-DAY-" }, enabled: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    })).id;
    const [self, other] = await Promise.all([
      prisma.trainee.create({
        data: {
          name: "Action Boundary Self",
          employeeId: `${employeePrefix}-self`,
          focusGroup: "D1",
          trainingStartDate: new Date("2026-08-01T00:00:00.000Z"),
        },
      }),
      prisma.trainee.create({
        data: {
          name: "Action Boundary Other",
          employeeId: `${employeePrefix}-other`,
          focusGroup: "D2",
          trainingStartDate: new Date("2026-08-01T00:00:00.000Z"),
        },
      }),
    ]);
    traineeId = self.id;
    otherTraineeId = other.id;
    const user = await prisma.user.create({
      data: {
        username: `${usernamePrefix}-trainee`,
        passwordHash: "integration-test-only",
        traineeId,
        roles: { create: [{ roleId: traineeRole.id }] },
      },
    });
    actor = {
      userId: user.id,
      roles: ["TRAINEE"],
      traineeId,
      enabled: true,
    };
  });

  beforeEach(() => {
    boundary.getActor.mockReset();
    boundary.revalidatePath.mockReset();
    boundary.getActor.mockResolvedValue(actor);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { username: { startsWith: usernamePrefix } },
      select: { id: true },
    });
    const trainees = await prisma.trainee.findMany({
      where: { employeeId: { startsWith: employeePrefix } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    const traineeIds = trainees.map(({ id }) => id);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.taskProgress.deleteMany({ where: { traineeId: { in: traineeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.trainee.deleteMany({ where: { id: { in: traineeIds } } });
    await cleanupActualTrainingPlan(prisma);
    await prisma.$disconnect();
  });

  it("rejects malformed input before actor resolution, writes, or revalidation", async () => {
    const before = await prisma.taskProgress.count({ where: { traineeId } });

    await expect(toggleLearnAction({ traineeId, taskId, learnDone: "yes" })).rejects.toMatchObject({
      name: "ZodError",
    });

    expect(boundary.getActor).not.toHaveBeenCalled();
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
    expect(await prisma.taskProgress.count({ where: { traineeId } })).toBe(before);
  });

  it("does not write or revalidate when the authenticated actor is forbidden", async () => {
    const before = {
      progress: await prisma.taskProgress.count({ where: { traineeId: otherTraineeId } }),
      audit: await prisma.auditLog.count({ where: { actorId: actor.userId } }),
    };

    await expect(saveTaskNotesAction({
      traineeId: otherTraineeId,
      taskId,
      feedback: "must not be written",
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(boundary.getActor).toHaveBeenCalledTimes(1);
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
    expect(await prisma.taskProgress.count({ where: { traineeId: otherTraineeId } })).toBe(
      before.progress,
    );
    expect(await prisma.auditLog.count({ where: { actorId: actor.userId } })).toBe(before.audit);
  });

  it("returns the minimal Learn result and revalidates only after a committed write", async () => {
    const result = await toggleLearnAction({ traineeId, taskId, learnDone: true });

    expect(result).toEqual({
      id: expect.any(String),
      traineeId,
      taskId,
      learnDone: true,
      learnAt: expect.any(Date),
    });
    expect(boundary.revalidatePath).toHaveBeenCalledTimes(1);
    expect(boundary.revalidatePath).toHaveBeenCalledWith(`/progress/${traineeId}`);
  });

  it("submits one practice and refreshes the trainee and mentor work queues", async () => {
    const result = await setPracticeSubmissionAction({
      traineeId,
      taskId,
      kind: "ACTION",
      submitted: true,
    });

    expect(result).toMatchObject({
      traineeId,
      taskId,
      kind: "ACTION",
      submitted: true,
      submittedAt: expect.any(Date),
    });
    expect(boundary.revalidatePath).toHaveBeenCalledWith(`/progress/${traineeId}`);
    expect(boundary.revalidatePath).toHaveBeenCalledWith("/mentor");
    expect(boundary.revalidatePath).toHaveBeenCalledWith("/mentor/pending");
  });
});
