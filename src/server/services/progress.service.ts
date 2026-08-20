import type { Prisma } from "@/generated/prisma/client";
import type { RoleCode } from "@/config/roles.config";
import type { Actor } from "@/server/auth/get-actor";
import {
  confirmationMutationSchema,
  practiceSubmissionMutationSchema,
  taskNotesMutationSchema,
} from "@/domain/progress/progress-input-schema";
import {
  ForbiddenError,
  requireConfirmProgress,
  requireSubmitPractice,
  requireToggleLearn,
  requireWriteMentorNote,
} from "@/server/auth/require-permission";
import { prisma } from "@/server/db/prisma";
import {
  findProgress,
  progressSelect,
  type ProgressRecord,
} from "@/server/repositories/progress.repository";
import { findRelationsForTrainee } from "@/server/repositories/relation.repository";
import { findEnabledTrainee } from "@/server/repositories/trainee.repository";
import { findEnabledTrainingTask } from "@/server/repositories/training-task.repository";
import { getTrainingDurationDays } from "@/server/services/training-plan-settings.service";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const MAX_TRANSACTION_ATTEMPTS = 3;
const RETRYABLE_TRANSACTION_CODES = new Set(["P2034", "40001", "40P01"]);

export class ProgressNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(resource: "trainee" | "task") {
    super(`${resource} not found`);
    this.name = "ProgressNotFoundError";
  }
}

export class ProgressValidationError extends Error {
  readonly code = "INVALID_PROGRESS_MUTATION";
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ProgressValidationError";
  }
}

export interface LearnMutationDto {
  id: string;
  traineeId: string;
  taskId: string;
  learnDone: boolean;
  learnAt: Date | null;
}

export interface ConfirmationMutationDto {
  id: string;
  traineeId: string;
  taskId: string;
  kind: "ACTION" | "DRILL";
  confirmed: boolean;
  confirmedAt: Date | null;
}

export interface PracticeSubmissionMutationDto {
  id: string;
  traineeId: string;
  taskId: string;
  kind: "ACTION" | "DRILL";
  submitted: boolean;
  submittedAt: Date | null;
}

export interface NotesMutationDto {
  id: string;
  traineeId: string;
  taskId: string;
  feedback?: string | null;
  traineeNote?: string | null;
  mentorNote?: string | null;
}

export interface ToggleLearnInput {
  traineeId: string;
  taskId: string;
  learnDone: boolean;
}

export interface SetConfirmationInput {
  traineeId: string;
  taskId: string;
  kind: "ACTION" | "DRILL";
  confirmed: boolean;
  note?: string | null;
}

export interface SetPracticeSubmissionInput {
  traineeId: string;
  taskId: string;
  kind: "ACTION" | "DRILL";
  submitted: boolean;
}

export interface SaveTaskNotesInput {
  traineeId: string;
  taskId: string;
  feedback?: string | null;
  traineeNote?: string | null;
  mentorNote?: string | null;
}

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const normalizeText = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value?.trim() ?? "";
  return normalized.length === 0 ? null : normalized;
};

const errorHasRetryableCode = (error: unknown, depth = 0): boolean => {
  if (depth > 4 || typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    cause?: unknown;
    meta?: {
      code?: unknown;
      database_error?: { code?: unknown };
      driverAdapterError?: { cause?: { originalCode?: unknown } };
    };
  };
  if (
    (typeof candidate.code === "string" && RETRYABLE_TRANSACTION_CODES.has(candidate.code)) ||
    (typeof candidate.meta?.code === "string" && RETRYABLE_TRANSACTION_CODES.has(candidate.meta.code)) ||
    (typeof candidate.meta?.database_error?.code === "string" &&
      RETRYABLE_TRANSACTION_CODES.has(candidate.meta.database_error.code)) ||
    (typeof candidate.meta?.driverAdapterError?.cause?.originalCode === "string" &&
      RETRYABLE_TRANSACTION_CODES.has(candidate.meta.driverAdapterError.cause.originalCode))
  ) {
    return true;
  }
  return errorHasRetryableCode(candidate.cause, depth + 1);
};

const runSerializable = async <Result>(
  operation: (transaction: TransactionClient) => Promise<Result>,
): Promise<Result> => {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error: unknown) {
      if (attempt === MAX_TRANSACTION_ATTEMPTS || !errorHasRetryableCode(error)) {
        throw error;
      }
    }
  }
  throw new Error("Serializable transaction retry loop exhausted");
};

const lockMutationScope = async (
  transaction: TransactionClient,
  actor: Actor,
  traineeId: string,
  taskId: string,
) => {
  const [databaseActor] = await transaction.$queryRaw<
    Array<{ id: string; traineeId: string | null; enabled: boolean }>
  >`
    SELECT "id", "traineeId", "enabled" FROM "User"
    WHERE "id" = ${actor.userId}
    FOR SHARE
  `;
  if (!databaseActor?.enabled) {
    throw new ForbiddenError();
  }
  const roleRows = await transaction.$queryRaw<Array<{ code: RoleCode }>>`
    SELECT role."code"
    FROM "UserRole" user_role
    INNER JOIN "Role" role ON role."id" = user_role."roleId"
    WHERE user_role."userId" = ${databaseActor.id}
    ORDER BY role."code"
    FOR SHARE OF user_role, role
  `;
  const effectiveActor: Actor = {
    userId: databaseActor.id,
    roles: roleRows.map(({ code }) => code),
    traineeId: databaseActor.traineeId,
    enabled: databaseActor.enabled,
  };

  const [lockedTrainee] = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Trainee"
    WHERE "id" = ${traineeId} AND "enabled" = true
    FOR SHARE
  `;
  if (!lockedTrainee) {
    throw new ProgressNotFoundError("trainee");
  }

  const durationDays = await getTrainingDurationDays(transaction);
  const [lockedTask] = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "TrainingTask"
    WHERE "id" = ${taskId}
      AND "enabled" = true
      AND "day" <= ${durationDays}
    FOR SHARE
  `;
  if (!lockedTask) {
    throw new ProgressNotFoundError("task");
  }

  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "UserTraineeRelation"
    WHERE "traineeId" = ${traineeId}
    ORDER BY "id"
    FOR SHARE
  `;
  const [trainee, task, relations] = await Promise.all([
    findEnabledTrainee(traineeId, transaction),
    findEnabledTrainingTask(taskId, durationDays, transaction),
    findRelationsForTrainee(traineeId, transaction),
  ]);
  if (!trainee) {
    throw new ProgressNotFoundError("trainee");
  }
  if (!task) {
    throw new ProgressNotFoundError("task");
  }
  return { actor: effectiveActor, trainee, task, relations };
};

const lockAndReadProgress = async (
  transaction: TransactionClient,
  traineeId: string,
  taskId: string,
): Promise<ProgressRecord | null> => {
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "TaskProgress"
    WHERE "traineeId" = ${traineeId} AND "taskId" = ${taskId}
    FOR UPDATE
  `;
  return findProgress(traineeId, taskId, transaction);
};

const toLearnDto = (progress: ProgressRecord): LearnMutationDto => ({
  id: progress.id,
  traineeId: progress.traineeId,
  taskId: progress.taskId,
  learnDone: progress.learnDone,
  learnAt: progress.learnAt,
});

const toConfirmationDto = (
  progress: ProgressRecord,
  kind: "ACTION" | "DRILL",
): ConfirmationMutationDto => ({
  id: progress.id,
  traineeId: progress.traineeId,
  taskId: progress.taskId,
  kind,
  confirmed: kind === "ACTION" ? progress.actionConfirmed : progress.drillConfirmed,
  confirmedAt: kind === "ACTION" ? progress.actionConfirmedAt : progress.drillConfirmedAt,
});

const toPracticeSubmissionDto = (
  progress: ProgressRecord,
  kind: "ACTION" | "DRILL",
): PracticeSubmissionMutationDto => ({
  id: progress.id,
  traineeId: progress.traineeId,
  taskId: progress.taskId,
  kind,
  submitted: kind === "ACTION" ? progress.actionSubmitted : progress.drillSubmitted,
  submittedAt: kind === "ACTION" ? progress.actionSubmittedAt : progress.drillSubmittedAt,
});

const toNotesDto = (
  progress: ProgressRecord,
  input: SaveTaskNotesInput,
): NotesMutationDto => ({
  id: progress.id,
  traineeId: progress.traineeId,
  taskId: progress.taskId,
  ...(input.feedback !== undefined ? { feedback: progress.feedback } : {}),
  ...(input.traineeNote !== undefined ? { traineeNote: progress.traineeNote } : {}),
  ...(input.mentorNote !== undefined ? { mentorNote: progress.mentorNote } : {}),
});

export const toggleLearn = async (
  actor: Actor,
  input: ToggleLearnInput,
  changedAt = new Date(),
): Promise<LearnMutationDto> =>
  runSerializable(async (transaction) => {
    const { actor: effectiveActor, trainee } = await lockMutationScope(
      transaction,
      actor,
      input.traineeId,
      input.taskId,
    );
    requireToggleLearn(effectiveActor, trainee);
    const before = await lockAndReadProgress(transaction, input.traineeId, input.taskId);
    const after = await transaction.taskProgress.upsert({
      where: {
        traineeId_taskId: { traineeId: input.traineeId, taskId: input.taskId },
      },
      create: {
        traineeId: input.traineeId,
        taskId: input.taskId,
        learnDone: input.learnDone,
        learnAt: input.learnDone ? changedAt : null,
      },
      update: {
        learnDone: input.learnDone,
        learnAt: input.learnDone ? changedAt : null,
      },
      select: progressSelect,
    });
    await transaction.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "TASK_PROGRESS",
        entityId: after.id,
        before: before ? toJson(before) : undefined,
        after: toJson(after),
        actorId: effectiveActor.userId,
      },
    });
    return toLearnDto(after);
  });

export const setPracticeSubmission = async (
  actor: Actor,
  input: SetPracticeSubmissionInput,
  changedAt = new Date(),
): Promise<PracticeSubmissionMutationDto> => {
  const value = practiceSubmissionMutationSchema.parse(input);
  return runSerializable(async (transaction) => {
    const { actor: effectiveActor, trainee, task } = await lockMutationScope(
      transaction,
      actor,
      value.traineeId,
      value.taskId,
    );
    requireSubmitPractice(effectiveActor, trainee);

    const taskContent = value.kind === "ACTION" ? task.action : task.drill;
    if (!taskContent?.trim()) {
      throw new ProgressValidationError(`Task has no ${value.kind.toLowerCase()} content`);
    }

    const before = await lockAndReadProgress(transaction, value.traineeId, value.taskId);
    const alreadyConfirmed = value.kind === "ACTION"
      ? before?.actionConfirmed
      : before?.drillConfirmed;
    if (!value.submitted && alreadyConfirmed) {
      throw new ProgressValidationError("导师已确认的实践不能由新人撤回");
    }

    const submissionData = value.kind === "ACTION"
      ? {
          actionSubmitted: value.submitted,
          actionSubmittedAt: value.submitted ? changedAt : null,
        }
      : {
          drillSubmitted: value.submitted,
          drillSubmittedAt: value.submitted ? changedAt : null,
        };
    const after = await transaction.taskProgress.upsert({
      where: {
        traineeId_taskId: { traineeId: value.traineeId, taskId: value.taskId },
      },
      create: {
        traineeId: value.traineeId,
        taskId: value.taskId,
        ...submissionData,
      },
      update: submissionData,
      select: progressSelect,
    });
    await transaction.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "TASK_PROGRESS",
        entityId: after.id,
        before: before ? toJson(before) : undefined,
        after: toJson(after),
        actorId: effectiveActor.userId,
      },
    });
    return toPracticeSubmissionDto(after, value.kind);
  });
};

export const setConfirmation = async (
  actor: Actor,
  input: SetConfirmationInput,
  changedAt = new Date(),
): Promise<ConfirmationMutationDto> => {
  const value = confirmationMutationSchema.parse(input);
  return runSerializable(async (transaction) => {
    const { actor: effectiveActor, trainee, task, relations } = await lockMutationScope(
      transaction,
      actor,
      value.traineeId,
      value.taskId,
    );
    requireConfirmProgress(effectiveActor, trainee, relations, changedAt);

    const taskContent = value.kind === "ACTION" ? task.action : task.drill;
    if (!taskContent?.trim()) {
      throw new ProgressValidationError(`Task has no ${value.kind.toLowerCase()} content`);
    }
    const before = await lockAndReadProgress(transaction, value.traineeId, value.taskId);
    const submitted = value.kind === "ACTION"
      ? before?.actionSubmitted
      : before?.drillSubmitted;
    if (!before || !submitted) {
      throw new ProgressValidationError("新人尚未提交该实践，暂不能确认");
    }
    const confirmationData = value.kind === "ACTION"
      ? {
          actionConfirmed: value.confirmed,
          actionConfirmedAt: value.confirmed ? changedAt : null,
          actionConfirmedById: value.confirmed ? effectiveActor.userId : null,
        }
      : {
          drillConfirmed: value.confirmed,
          drillConfirmedAt: value.confirmed ? changedAt : null,
          drillConfirmedById: value.confirmed ? effectiveActor.userId : null,
        };
    const eventKind = `${value.kind}_${value.confirmed ? "CONFIRMED" : "UNCONFIRMED"}` as const;
    const after = await transaction.taskProgress.update({
      where: {
        traineeId_taskId: { traineeId: value.traineeId, taskId: value.taskId },
      },
      data: confirmationData,
      select: progressSelect,
    });
    await transaction.confirmationEvent.create({
      data: {
        traineeId: value.traineeId,
        taskId: value.taskId,
        kind: eventKind,
        actorId: effectiveActor.userId,
        note: normalizeText(value.note),
        createdAt: changedAt,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: value.confirmed ? "CONFIRM" : "UNCONFIRM",
        entity: "TASK_PROGRESS",
        entityId: after.id,
        before: before ? toJson(before) : undefined,
        after: toJson(after),
        actorId: effectiveActor.userId,
      },
    });
    return toConfirmationDto(after, value.kind);
  });
};

export const saveTaskNotes = async (
  actor: Actor,
  input: SaveTaskNotesInput,
  changedAt = new Date(),
): Promise<NotesMutationDto> => {
  const value = taskNotesMutationSchema.parse(input);
  const hasSelfNote = value.feedback !== undefined || value.traineeNote !== undefined;
  const hasMentorNote = value.mentorNote !== undefined;
  const noteData = {
    ...(value.feedback !== undefined ? { feedback: normalizeText(value.feedback) } : {}),
    ...(value.traineeNote !== undefined
      ? { traineeNote: normalizeText(value.traineeNote) }
      : {}),
    ...(value.mentorNote !== undefined
      ? { mentorNote: normalizeText(value.mentorNote) }
      : {}),
  };

  return runSerializable(async (transaction) => {
    const { actor: effectiveActor, trainee, relations } = await lockMutationScope(
      transaction,
      actor,
      value.traineeId,
      value.taskId,
    );
    if (hasSelfNote) {
      requireToggleLearn(effectiveActor, trainee);
    }
    if (hasMentorNote) {
      requireWriteMentorNote(effectiveActor, trainee, relations, changedAt);
    }
    const before = await lockAndReadProgress(transaction, value.traineeId, value.taskId);
    const after = await transaction.taskProgress.upsert({
      where: {
        traineeId_taskId: { traineeId: value.traineeId, taskId: value.taskId },
      },
      create: {
        traineeId: value.traineeId,
        taskId: value.taskId,
        ...noteData,
      },
      update: noteData,
      select: progressSelect,
    });
    await transaction.auditLog.create({
      data: {
        action: "UPDATE",
        entity: "TASK_PROGRESS",
        entityId: after.id,
        before: before ? toJson(before) : undefined,
        after: toJson(after),
        actorId: effectiveActor.userId,
      },
    });
    return toNotesDto(after, value);
  });
};
