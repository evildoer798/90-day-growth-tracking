import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { PermissionActor } from "@/domain/permissions/types";
import {
  createTrainee,
  replaceReviewerRelation,
  updateTrainingTask,
} from "@/server/services/admin.service";
import {
  applyImportPreviewToken,
  createImportPreviewToken,
} from "@/server/services/admin-import.service";

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const runId = randomUUID();
const prefix = `task-11-${runId}`;

runWithDatabase("ADMIN management transactions", () => {
  let prisma: PrismaClient;
  let adminId: string;
  let reviewerOneId: string;
  let reviewerTwoId: string;
  let traineeId: string;

  const admin = (): PermissionActor => ({
    userId: adminId,
    roles: ["ADMIN"],
    traineeId: null,
    enabled: true,
  });

  const cleanup = async () => {
    const users = await prisma.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { id: true },
    });
    const trainees = await prisma.trainee.findMany({
      where: { employeeId: { startsWith: prefix.toUpperCase() } },
      select: { id: true },
    });
    const tasks = await prisma.trainingTask.findMany({
      where: { stableImportKey: { startsWith: prefix } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    const traineeIds = trainees.map(({ id }) => id);
    const taskIds = tasks.map(({ id }) => id);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.taskVersion.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { taskId: { in: taskIds } }] },
    });
    await prisma.userTraineeRelation.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { traineeId: { in: traineeIds } }] },
    });
    await prisma.taskProgress.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.taskReference.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.trainingTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.trainee.deleteMany({ where: { id: { in: traineeIds } } });
  };

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    await cleanup();
    await Promise.all(
      (["ADMIN", "MENTOR", "SUPERVISOR"] as const).map((code) =>
        prisma.role.upsert({ where: { code }, update: {}, create: { code } }),
      ),
    );
    const [adminUser, reviewerOne, reviewerTwo, trainee] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: `${prefix}-admin`,
          passwordHash: "integration-only",
          roles: { create: { role: { connect: { code: "ADMIN" } } } },
        },
      }),
      prisma.user.create({
        data: {
          username: `${prefix}-mentor-1`,
          passwordHash: "integration-only",
          roles: { create: { role: { connect: { code: "MENTOR" } } } },
        },
      }),
      prisma.user.create({
        data: {
          username: `${prefix}-mentor-2`,
          passwordHash: "integration-only",
          roles: { create: { role: { connect: { code: "MENTOR" } } } },
        },
      }),
      prisma.trainee.create({
        data: {
          name: "关系测试新人",
          employeeId: `${prefix}-REL`.toUpperCase(),
          focusGroup: "D1",
          trainingStartDate: new Date("2026-08-01T00:00:00.000Z"),
        },
      }),
    ]);
    adminId = adminUser.id;
    reviewerOneId = reviewerOne.id;
    reviewerTwoId = reviewerTwo.id;
    traineeId = trainee.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("rejects an invalid focus group with zero writes", async () => {
    const before = await prisma.trainee.count();
    await expect(createTrainee(admin(), {
      name: "无效分组",
      employeeId: `${prefix}-invalid-group`,
      focusGroup: "D9",
      trainingStartDate: "2026-08-15",
    })).rejects.toThrow();
    expect(await prisma.trainee.count()).toBe(before);
  });

  it("normalizes employee IDs and rejects a duplicate with zero writes", async () => {
    const employeeId = `${prefix}-employee`.toUpperCase();
    await createTrainee(admin(), {
      name: "第一位新人",
      employeeId: `  ${employeeId.toLowerCase()}  `,
      focusGroup: "D2",
      trainingStartDate: "2026-08-15",
    });
    const before = await prisma.trainee.count();
    await expect(createTrainee(admin(), {
      name: "重复新人",
      employeeId,
      focusGroup: "D3",
      trainingStartDate: "2026-08-15",
    })).rejects.toThrow("工号已存在");
    expect(await prisma.trainee.count()).toBe(before);
  });

  it("rejects an unauthorized management attempt with zero writes", async () => {
    const before = await prisma.trainee.count();
    await expect(createTrainee({
      userId: reviewerOneId,
      roles: ["MENTOR"],
      traineeId: null,
      enabled: true,
    }, {
      name: "越权新人",
      employeeId: `${prefix}-forbidden`,
      focusGroup: "D1",
      trainingStartDate: "2026-08-15",
    })).rejects.toThrow("Permission denied");
    expect(await prisma.trainee.count()).toBe(before);
  });

  it("creates a complete task version and audit while preserving stable identity and progress", async () => {
    const task = await prisma.trainingTask.create({
      data: {
        stableImportKey: `${prefix}-task`,
        day: 8,
        stage: "P1",
        dimension: "D1",
        dimensionName: "机械运动",
        task: "修改前任务",
        action: "修改前 Action",
        sortOrder: 8,
        references: { create: { title: "旧资料", url: "https://example.test/old", sortOrder: 1 } },
      },
    });
    const progress = await prisma.taskProgress.create({
      data: { traineeId, taskId: task.id, learnDone: true },
    });

    await updateTrainingTask(admin(), {
      id: task.id,
      day: 9,
      stage: "P2",
      dimension: "D2",
      dimensionName: "光路光源",
      task: "修改后任务",
      action: null,
      drill: "修改后 Drill",
      sortOrder: 9,
      references: [{ title: "新资料", url: "https://example.test/new" }],
    });

    const updated = await prisma.trainingTask.findUniqueOrThrow({
      where: { id: task.id }, include: { references: true, versions: true },
    });
    expect(updated.stableImportKey).toBe(task.stableImportKey);
    expect(await prisma.taskProgress.findUniqueOrThrow({ where: { id: progress.id } })).toMatchObject({
      taskId: task.id, learnDone: true,
    });
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions[0]).toMatchObject({
      actorId: adminId,
      before: expect.objectContaining({ stableImportKey: task.stableImportKey, task: "修改前任务", enabled: true }),
      after: expect.objectContaining({ stableImportKey: task.stableImportKey, task: "修改后任务", enabled: true }),
    });
    expect(await prisma.auditLog.findFirst({ where: { entity: "TRAINING_TASK", entityId: task.id } })).toMatchObject({
      action: "UPDATE", actorId: adminId,
      after: expect.objectContaining({ task: "修改后任务" }),
    });
  });

  it("replaces a reviewer transactionally and retains the closed relation history", async () => {
    const first = await replaceReviewerRelation(admin(), {
      traineeId,
      userId: reviewerOneId,
      type: "MENTOR",
      isPrimary: true,
      startDate: "2026-08-01",
      confirm: true,
    });
    const second = await replaceReviewerRelation(admin(), {
      traineeId,
      userId: reviewerTwoId,
      type: "MENTOR",
      isPrimary: true,
      startDate: "2026-08-15",
      confirm: true,
    });

    expect(first.id).not.toBe(second.id);
    const relations = await prisma.userTraineeRelation.findMany({
      where: { traineeId, type: "MENTOR" }, orderBy: { startDate: "asc" },
    });
    expect(relations).toHaveLength(2);
    expect(relations[0]).toMatchObject({ enabled: true, endDate: new Date("2026-08-14T00:00:00.000Z") });
    expect(relations[1]).toMatchObject({ userId: reviewerTwoId, enabled: true, endDate: null });
    expect(await prisma.auditLog.findMany({ where: { entity: "REVIEWER_RELATION", entityId: second.id } })).toHaveLength(1);
  });

  it("rejects a tampered import preview token without any writes", async () => {
    const token = createImportPreviewToken({
      checksum: "test-checksum",
      fileName: "test.xlsx",
      rows: [], items: [], canApply: true,
      counts: { create: 0, update: 0, "disable-candidate": 0, skip: 0, warning: 0, error: 0 },
    }, adminId, "test-only-secret-that-is-long-enough", await prisma.trainingPlanSettings.findUniqueOrThrow({
      where: { id: "default" },
      select: { durationDays: true, revision: true },
    }));
    const before = await prisma.importBatch.count();
    await expect(applyImportPreviewToken(admin(), `${token.slice(0, -1)}x`, "test-only-secret-that-is-long-enough")).rejects.toThrow("无效或已被篡改");
    expect(await prisma.importBatch.count()).toBe(before);
  });
});
