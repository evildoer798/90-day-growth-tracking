import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

const trainingTaskSelect = {
  id: true,
  stableImportKey: true,
  day: true,
  stage: true,
  dimension: true,
  dimensionName: true,
  task: true,
  action: true,
  drill: true,
  sortOrder: true,
  enabled: true,
  references: {
    select: { id: true, title: true, url: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  },
} as const satisfies Prisma.TrainingTaskSelect;

export type TrainingTaskRecord = Prisma.TrainingTaskGetPayload<{
  select: typeof trainingTaskSelect;
}>;

export interface TrainingTaskReader {
  trainingTask: Pick<typeof prisma.trainingTask, "findFirst" | "findMany">;
}

export const findEnabledTrainingTasks = async (
  durationDays: number,
  database: TrainingTaskReader = prisma,
): Promise<TrainingTaskRecord[]> =>
  database.trainingTask.findMany({
    where: { enabled: true, day: { lte: durationDays } },
    select: trainingTaskSelect,
    orderBy: [{ sortOrder: "asc" }, { day: "asc" }, { id: "asc" }],
  });

export const findEnabledTrainingTask = async (
  taskId: string,
  durationDays: number,
  database: TrainingTaskReader = prisma,
): Promise<TrainingTaskRecord | null> =>
  database.trainingTask.findFirst({
    where: { id: taskId, enabled: true, day: { lte: durationDays } },
    select: trainingTaskSelect,
  });
