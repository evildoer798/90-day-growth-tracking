import type { PrismaClient } from "@/generated/prisma/client";
import {
  applyTrainingPlanImport,
  prepareTrainingPlanImport,
} from "@/server/services/training-plan-import.service";
import { createTrainingPlanWorkbookBuffer } from "../../fixtures/training-plan-workbook";
const fixtureUsername = "task-7-real-plan-fixture-actor";
const importedTaskPrefix = "PLAN_V1-DAY-";

export const cleanupActualTrainingPlan = async (prisma: PrismaClient): Promise<void> => {
  const [actors, tasks] = await Promise.all([
    prisma.user.findMany({
      where: { username: fixtureUsername },
      select: { id: true },
    }),
    prisma.trainingTask.findMany({
      where: { stableImportKey: { startsWith: importedTaskPrefix } },
      select: { id: true },
    }),
  ]);
  const actorIds = actors.map(({ id }) => id);
  const taskIds = tasks.map(({ id }) => id);

  await prisma.$transaction(async (transaction) => {
    if (actorIds.length > 0) {
      await transaction.auditLog.deleteMany({ where: { actorId: { in: actorIds } } });
      await transaction.importBatch.deleteMany({ where: { operatorId: { in: actorIds } } });
    }
    if (actorIds.length > 0 || taskIds.length > 0) {
      await transaction.taskVersion.deleteMany({
        where: {
          OR: [{ actorId: { in: actorIds } }, { taskId: { in: taskIds } }],
        },
      });
    }
    if (taskIds.length > 0) {
      await transaction.confirmationEvent.deleteMany({ where: { taskId: { in: taskIds } } });
      await transaction.taskProgress.deleteMany({ where: { taskId: { in: taskIds } } });
      await transaction.taskReference.deleteMany({ where: { taskId: { in: taskIds } } });
      await transaction.trainingTask.deleteMany({ where: { id: { in: taskIds } } });
    }
    if (actorIds.length > 0) {
      await transaction.user.deleteMany({ where: { id: { in: actorIds } } });
    }
  });
};

export const ensureActualTrainingPlan = async (prisma: PrismaClient): Promise<void> => {
  await cleanupActualTrainingPlan(prisma);
  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    update: {},
    create: { code: "ADMIN" },
  });
  const actor = await prisma.user.create({
    data: {
      username: fixtureUsername,
      passwordHash: "integration-test-only",
      roles: { create: { roleId: adminRole.id } },
    },
  });
  const { preview, trainingPlan } = await prepareTrainingPlanImport(
    createTrainingPlanWorkbookBuffer(),
  );
  if (!preview.canApply) {
    throw new Error("Generated training plan fixture cannot be applied");
  }
  await applyTrainingPlanImport(preview, actor.id, { trainingPlan });
};
