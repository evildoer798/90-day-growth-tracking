import type { DimensionCode } from "@/config/dimensions.config";
import type { TrainingStage } from "@/domain/progress/types";
import type { DashboardTaskDto } from "@/server/services/dashboard.service";

export const MAX_CLIENT_CONFIRMATION_HISTORY = 10;

export type ClientConfirmationKind = DashboardTaskDto["confirmationHistory"][number]["kind"];

export interface ClientConfirmationDisplayEvent {
  kind: ClientConfirmationKind;
  occurredAt: string;
}

export interface ProgressTaskCardViewModel {
  traineeId: string;
  taskId: string;
  day: number;
  stage: TrainingStage;
  dimension: DimensionCode;
  dimensionName: string;
  title: string;
  isFocus: boolean;
  learnDone: boolean;
  action: { content: string; submitted: boolean; confirmed: boolean } | null;
  drill: { content: string; submitted: boolean; confirmed: boolean } | null;
  references: ReadonlyArray<{ title: string; url: string }>;
  notes: {
    feedback?: string;
    traineeNote?: string;
    mentorNote?: string;
  };
  confirmationHistory: readonly ClientConfirmationDisplayEvent[];
}

export interface ProgressTaskPermissions {
  canToggleLearn: boolean;
  canSubmitPractice: boolean;
  canConfirm: boolean;
  canWriteMentorNote: boolean;
}

export interface ClientMutationFeedback {
  kind: "status" | "error";
  message: string;
}

const optionalText = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const taskBlock = (content: string | null, submitted: boolean, confirmed: boolean) => {
  const normalized = optionalText(content);
  return normalized ? { content: normalized, submitted, confirmed } : null;
};

export const toProgressTaskCardViewModel = (
  task: DashboardTaskDto,
  traineeId: string,
): ProgressTaskCardViewModel => ({
  traineeId,
  taskId: task.id,
  day: task.day,
  stage: task.stage,
  dimension: task.dimension,
  dimensionName: task.dimensionName,
  title: task.task,
  isFocus: task.isFocus,
  learnDone: task.progress?.learnDone ?? false,
  action: taskBlock(
    task.action,
    task.progress?.actionSubmitted ?? false,
    task.progress?.actionConfirmed ?? false,
  ),
  drill: taskBlock(
    task.drill,
    task.progress?.drillSubmitted ?? false,
    task.progress?.drillConfirmed ?? false,
  ),
  references: task.references.map(({ title, url }) => ({ title, url })),
  notes: {
    ...(optionalText(task.progress?.feedback)
      ? { feedback: optionalText(task.progress?.feedback) }
      : {}),
    ...(optionalText(task.progress?.traineeNote)
      ? { traineeNote: optionalText(task.progress?.traineeNote) }
      : {}),
    ...(optionalText(task.progress?.mentorNote)
      ? { mentorNote: optionalText(task.progress?.mentorNote) }
      : {}),
  },
  confirmationHistory: Array.from(task.confirmationHistory)
    .sort((left, right) =>
      right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
    )
    .slice(0, MAX_CLIENT_CONFIRMATION_HISTORY)
    .map(({ kind, createdAt }) => ({ kind, occurredAt: createdAt.toISOString() })),
});
