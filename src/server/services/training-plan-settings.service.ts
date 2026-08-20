import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const TRAINING_PLAN_SETTINGS_ID = "default";
export const TRAINING_PLAN_DEFAULT_DAYS = 90;
export const TRAINING_PLAN_MIN_DAYS = 1;
export const TRAINING_PLAN_MAX_DAYS = 365;

const trainingPlanSettingsSelect = {
  id: true,
  durationDays: true,
  revision: true,
  updatedAt: true,
} as const satisfies Prisma.TrainingPlanSettingsSelect;

export type TrainingPlanSettingsValue = Prisma.TrainingPlanSettingsGetPayload<{
  select: typeof trainingPlanSettingsSelect;
}>;

export interface TrainingPlanSettingsReader {
  trainingPlanSettings: Pick<typeof prisma.trainingPlanSettings, "findUniqueOrThrow">;
}

export async function getTrainingPlanSettings(
  database: TrainingPlanSettingsReader = prisma,
): Promise<TrainingPlanSettingsValue> {
  return database.trainingPlanSettings.findUniqueOrThrow({
    where: { id: TRAINING_PLAN_SETTINGS_ID },
    select: trainingPlanSettingsSelect,
  });
}

export async function getTrainingDurationDays(
  database: TrainingPlanSettingsReader = prisma,
): Promise<number> {
  return (await getTrainingPlanSettings(database)).durationDays;
}
