import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const progressSelect = {
  id: true,
  traineeId: true,
  taskId: true,
  learnDone: true,
  learnAt: true,
  actionSubmitted: true,
  actionSubmittedAt: true,
  actionConfirmed: true,
  actionConfirmedAt: true,
  actionConfirmedById: true,
  drillSubmitted: true,
  drillSubmittedAt: true,
  drillConfirmed: true,
  drillConfirmedAt: true,
  drillConfirmedById: true,
  feedback: true,
  traineeNote: true,
  mentorNote: true,
} as const satisfies Prisma.TaskProgressSelect;

const confirmationEventSelect = {
  id: true,
  traineeId: true,
  taskId: true,
  kind: true,
  note: true,
  createdAt: true,
  actor: { select: { id: true, username: true } },
} as const satisfies Prisma.ConfirmationEventSelect;

export type ProgressRecord = Prisma.TaskProgressGetPayload<{
  select: typeof progressSelect;
}>;

export type ConfirmationEventRecord = Prisma.ConfirmationEventGetPayload<{
  select: typeof confirmationEventSelect;
}>;

export interface ProgressReader {
  taskProgress: Pick<typeof prisma.taskProgress, "findMany" | "findUnique">;
  confirmationEvent: Pick<typeof prisma.confirmationEvent, "findMany">;
}

export const findProgressForTrainees = async (
  traineeIds: readonly string[],
  database: ProgressReader = prisma,
): Promise<ProgressRecord[]> => {
  if (traineeIds.length === 0) {
    return [];
  }
  return database.taskProgress.findMany({
    where: { traineeId: { in: [...traineeIds] } },
    select: progressSelect,
    orderBy: [{ traineeId: "asc" }, { taskId: "asc" }],
  });
};

export const findProgressForTrainee = async (
  traineeId: string,
  database: ProgressReader = prisma,
): Promise<ProgressRecord[]> => findProgressForTrainees([traineeId], database);

export const findProgress = async (
  traineeId: string,
  taskId: string,
  database: ProgressReader = prisma,
): Promise<ProgressRecord | null> =>
  database.taskProgress.findUnique({
    where: { traineeId_taskId: { traineeId, taskId } },
    select: progressSelect,
  });

export const findConfirmationEventsForTrainee = async (
  traineeId: string,
  database: ProgressReader = prisma,
): Promise<ConfirmationEventRecord[]> =>
  database.confirmationEvent.findMany({
    where: { traineeId },
    select: confirmationEventSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
