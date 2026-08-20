import type { ImportBatch, Prisma } from "@/generated/prisma/client";
import { buildImportPreview } from "@/domain/import/build-import-preview";
import { parseTrainingPlan } from "@/domain/import/parse-training-plan";
import type {
  ExistingTrainingTask,
  ImportPreview,
  ParsedTrainingPlanRow,
} from "@/domain/import/training-plan-schema";
import { trainingStageSchema } from "@/domain/import/training-plan-schema";
import { prisma } from "@/server/db/prisma";
import { withAdminTransaction } from "@/server/services/admin-transaction";
import {
  getTrainingDurationDays,
  getTrainingPlanSettings,
  TRAINING_PLAN_SETTINGS_ID,
} from "@/server/services/training-plan-settings.service";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface TaskSnapshot extends ParsedTrainingPlanRow {
  enabled: boolean;
}

export interface TrainingPlanImportSettingsSnapshot {
  durationDays: number;
  revision: number;
}

export interface PreparedTrainingPlanImport {
  preview: ImportPreview;
  trainingPlan: TrainingPlanImportSettingsSnapshot;
}

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const toExistingTask = (task: {
  id: string;
  stableImportKey: string;
  milestone: string | null;
  day: number;
  stage: string;
  dimension: ExistingTrainingTask["dimension"];
  dimensionName: string;
  task: string;
  action: string | null;
  drill: string | null;
  sortOrder: number;
  enabled: boolean;
  references: Array<{ title: string; url: string; sortOrder: number }>;
}): ExistingTrainingTask => ({
  id: task.id,
  stableImportKey: task.stableImportKey,
  milestone: task.milestone,
  day: task.day,
  stage: trainingStageSchema.parse(task.stage),
  dimension: task.dimension,
  dimensionName: task.dimensionName,
  task: task.task,
  action: task.action,
  drill: task.drill,
  sortOrder: task.sortOrder,
  enabled: task.enabled,
  references: task.references.map(({ title, url, sortOrder }) => ({
    title,
    url,
    sortOrder,
  })),
  referencesAmbiguous: false,
});

const toSnapshot = (
  task: ParsedTrainingPlanRow | ExistingTrainingTask,
  enabled: boolean,
): TaskSnapshot => ({
  stableImportKey: task.stableImportKey,
  milestone: task.milestone,
  day: task.day,
  stage: task.stage,
  dimension: task.dimension,
  dimensionName: task.dimensionName,
  task: task.task,
  action: task.action,
  drill: task.drill,
  sortOrder: task.sortOrder,
  enabled,
  references: task.references.map(({ title, url, sortOrder }) => ({
    title,
    url,
    sortOrder,
  })),
  referencesAmbiguous: task.referencesAmbiguous,
});

const taskData = (row: ParsedTrainingPlanRow) => ({
  stableImportKey: row.stableImportKey,
  milestone: row.milestone,
  day: row.day,
  stage: row.stage,
  dimension: row.dimension,
  dimensionName: row.dimensionName,
  task: row.task,
  action: row.action,
  drill: row.drill,
  sortOrder: row.sortOrder,
  enabled: true,
});

const replaceReferences = async (
  transaction: TransactionClient,
  taskId: string,
  row: ParsedTrainingPlanRow,
) => {
  await transaction.taskReference.deleteMany({ where: { taskId } });
  if (row.references.length > 0) {
    await transaction.taskReference.createMany({
      data: row.references.map((reference) => ({
        taskId,
        title: reference.title,
        url: reference.url,
        sortOrder: reference.sortOrder,
      })),
    });
  }
};

export const loadExistingTrainingTasks = async (): Promise<ExistingTrainingTask[]> => {
  const tasks = await prisma.trainingTask.findMany({
    include: { references: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  return tasks.map(toExistingTask);
};

export const previewTrainingPlanImport = async (
  buffer: Buffer,
  maximumDay?: number,
): Promise<ImportPreview> => {
  const durationDays = maximumDay ?? await getTrainingDurationDays();
  return buildImportPreview(
    parseTrainingPlan(buffer, durationDays),
    await loadExistingTrainingTasks(),
    durationDays,
  );
};

export const prepareTrainingPlanImport = async (
  buffer: Buffer,
): Promise<PreparedTrainingPlanImport> => {
  const settings = await getTrainingPlanSettings();
  const trainingPlan = {
    durationDays: settings.durationDays,
    revision: settings.revision,
  };
  return {
    preview: await previewTrainingPlanImport(buffer, trainingPlan.durationDays),
    trainingPlan,
  };
};

const assertPreviewWithinDuration = (
  preview: ImportPreview,
  durationDays: number,
) => {
  const taskRows = [
    ...preview.rows,
    ...preview.items.flatMap((item) =>
      [item.row, item.before].filter((row) => row !== undefined),
    ),
  ];
  const outsidePlan = taskRows.find((row) => row && row.day > durationDays);
  if (outsidePlan) {
    throw new Error(
      `培养计划总天数已变更，Day ${outsidePlan.day} 超出当前 ${durationDays} 天，请重新上传 Excel`,
    );
  }
};

export const applyTrainingPlanImport = async (
  preview: ImportPreview,
  actorId: string,
  options: {
    nonceHash?: string;
    trainingPlan: TrainingPlanImportSettingsSnapshot;
  },
): Promise<ImportBatch> => {
  if (!preview.canApply || preview.counts.error > 0) {
    throw new Error("Training plan import preview contains errors and cannot be applied");
  }

  try {
    return await withAdminTransaction(actorId, async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "TrainingPlanSettings"
      WHERE "id" = ${TRAINING_PLAN_SETTINGS_ID}
      FOR UPDATE
    `;
    const currentSettings = await getTrainingPlanSettings(transaction);
    if (
      options.trainingPlan.durationDays !== currentSettings.durationDays ||
      options.trainingPlan.revision !== currentSettings.revision
    ) {
      throw new Error("培养计划总天数已变更，请重新上传 Excel 后再导入");
    }
    assertPreviewWithinDuration(preview, currentSettings.durationDays);

    const reservedBatch = await transaction.importBatch.create({
      data: {
        checksum: preview.checksum,
        fileName: preview.fileName,
        status: "PENDING",
        preview: toJson({ counts: preview.counts, items: preview.items }),
        operatorId: actorId,
        nonceHash: options.nonceHash,
      },
    });
    const currentByStableKey = new Map<string, ExistingTrainingTask>();
    const targets = preview.items.filter((item) =>
      item.classification === "update" || item.classification === "disable-candidate",
    );
    for (const item of targets) {
      if (!item.stableImportKey || !item.existingId || !item.before) {
        throw new Error("Training plan import preview is stale: target state is missing");
      }
    }

    const stableKeys = [...new Set(targets.map((item) => item.stableImportKey!))].sort();
    for (const stableImportKey of stableKeys) {
      const lockedTargets = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "TrainingTask"
        WHERE "stableImportKey" = ${stableImportKey}
        FOR UPDATE
      `;
      if (lockedTargets.length !== 1) {
        throw new Error(
          `Training plan import preview is stale for ${stableImportKey}: target no longer exists`,
        );
      }
      const currentRecord = await transaction.trainingTask.findUnique({
        where: { stableImportKey },
        include: { references: { orderBy: { sortOrder: "asc" } } },
      });
      if (!currentRecord || currentRecord.id !== lockedTargets[0]?.id) {
        throw new Error(
          `Training plan import preview is stale for ${stableImportKey}: target no longer exists`,
        );
      }
      currentByStableKey.set(stableImportKey, toExistingTask(currentRecord));
    }

    for (const item of targets) {
      const current = currentByStableKey.get(item.stableImportKey!);
      if (!current) {
        throw new Error(`Training plan import preview is stale for ${item.stableImportKey}`);
      }
      const previewedBefore = toExistingTask(item.before!);
      if (
        current.id !== item.existingId ||
        JSON.stringify(current) !== JSON.stringify(previewedBefore)
      ) {
        throw new Error(
          `Training plan import preview is stale for ${item.stableImportKey}: target identity or content changed`,
        );
      }
    }

    let created = 0;
    let updated = 0;
    let disabled = 0;

    for (const item of preview.items) {
      if (item.classification === "create") {
        if (!item.row) {
          throw new Error("Create preview item is missing its parsed row");
        }
        await transaction.trainingTask.create({
          data: {
            ...taskData(item.row),
            references: {
              create: item.row.references.map(({ title, url, sortOrder }) => ({
                title,
                url,
                sortOrder,
              })),
            },
          },
        });
        created += 1;
        continue;
      }

      if (item.classification === "update") {
        if (!item.row || !item.existingId || !item.stableImportKey) {
          throw new Error("Update preview item is missing task state");
        }
        const current = currentByStableKey.get(item.stableImportKey);
        if (!current) {
          throw new Error(`Training plan import preview is stale for ${item.stableImportKey}`);
        }
        const importedState = item.row.referencesAmbiguous
          ? { ...item.row, references: current.references }
          : item.row;
        const before = toSnapshot(current, current.enabled);
        const after = toSnapshot(importedState, true);

        await transaction.trainingTask.update({
          where: { id: current.id },
          data: taskData(item.row),
        });
        if (!item.row.referencesAmbiguous) {
          await replaceReferences(transaction, current.id, item.row);
        }
        await transaction.taskVersion.create({
          data: {
            taskId: current.id,
            before: toJson(before),
            after: toJson(after),
            actorId,
          },
        });
        updated += 1;
        continue;
      }

      if (item.classification === "disable-candidate") {
        if (!item.existingId || !item.stableImportKey) {
          throw new Error("Disable preview item is missing its existing task ID");
        }
        const current = currentByStableKey.get(item.stableImportKey);
        if (!current) {
          throw new Error(`Training plan import preview is stale for ${item.stableImportKey}`);
        }
        const before = toSnapshot(current, current.enabled);
        const after = toSnapshot(current, false);

        await transaction.trainingTask.update({
          where: { id: current.id },
          data: { enabled: false },
        });
        await transaction.taskVersion.create({
          data: {
            taskId: current.id,
            before: toJson(before),
            after: toJson(after),
            actorId,
          },
        });
        disabled += 1;
      }
    }

    const result = {
      event: "TRAINING_PLAN_IMPORTED",
      created,
      updated,
      disabled,
      skipped: preview.counts.skip,
      warnings: preview.counts.warning,
    };
    const batch = await transaction.importBatch.update({
      where: { id: reservedBatch.id },
      data: { status: "APPLIED", result: toJson(result) },
    });
    await transaction.auditLog.create({
      data: {
        action: "IMPORT",
        entity: "TRAINING_PLAN_IMPORTED",
        entityId: batch.id,
        after: toJson({ ...result, checksum: preview.checksum }),
        actorId,
      },
    });

      return batch;
    });
  } catch (error) {
    if (options.nonceHash) {
      const consumed = await prisma.importBatch.findUnique({ where: { nonceHash: options.nonceHash }, select: { id: true } });
      if (consumed) throw new Error("导入预览已使用，不能重复执行");
    }
    throw error;
  }
};
