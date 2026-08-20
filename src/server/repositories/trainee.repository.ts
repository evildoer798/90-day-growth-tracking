import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

const traineeSelect = {
  id: true,
  name: true,
  employeeId: true,
  focusGroup: true,
  trainingStartDate: true,
  trainingDayOverride: true,
  enabled: true,
} as const satisfies Prisma.TraineeSelect;

export type TraineeRecord = Prisma.TraineeGetPayload<{
  select: typeof traineeSelect;
}>;

export interface TraineeReader {
  trainee: Pick<typeof prisma.trainee, "findFirst" | "findMany">;
}

export const findEnabledTrainee = async (
  traineeId: string,
  database: TraineeReader = prisma,
): Promise<TraineeRecord | null> =>
  database.trainee.findFirst({
    where: { id: traineeId, enabled: true },
    select: traineeSelect,
  });

export const findEnabledTrainees = async (
  database: TraineeReader = prisma,
): Promise<TraineeRecord[]> =>
  database.trainee.findMany({
    where: { enabled: true },
    select: traineeSelect,
    orderBy: [{ employeeId: "asc" }, { id: "asc" }],
  });

export const findEnabledTraineesByIds = async (
  traineeIds: readonly string[],
  database: TraineeReader = prisma,
): Promise<TraineeRecord[]> => {
  if (traineeIds.length === 0) {
    return [];
  }
  return database.trainee.findMany({
    where: { id: { in: [...traineeIds] }, enabled: true },
    select: traineeSelect,
    orderBy: [{ employeeId: "asc" }, { id: "asc" }],
  });
};
