import type { DimensionCode } from "@/config/dimensions.config";
import { ROLE_CODES } from "@/config/roles.config";
import { toBusinessDate } from "@/domain/dates/business-date";
import {
  canConfirmProgress,
  canSubmitPractice,
  canToggleLearn,
  canViewTrainee,
  canWriteMentorNote,
} from "@/domain/permissions/policy";
import { calculateCurrentDay } from "@/domain/progress/calculate-current-day";
import { aggregateMetrics } from "@/domain/progress/aggregate-progress";
import { calculateProgress } from "@/domain/progress/calculate-progress";
import { assessRisk, type RiskAssessment } from "@/domain/progress/classify-risk";
import type {
  FocusGroup,
  Metric,
  ProgressSummary,
  TrainingStage,
} from "@/domain/progress/types";
import type { Actor } from "@/server/auth/get-actor";
import { ForbiddenError, requireViewTrainee } from "@/server/auth/require-permission";
import {
  findConfirmationEventsForTrainee,
  findProgressForTrainee,
  findProgressForTrainees,
  type ConfirmationEventRecord,
  type ProgressRecord,
} from "@/server/repositories/progress.repository";
import {
  findActiveReviewerAssignmentsForTrainees,
  findActiveTraineeIdsForUserRole,
  findRelationsForTrainee,
  findRelationsForTrainees,
  type ReviewerAssignmentRecord,
} from "@/server/repositories/relation.repository";
import {
  findEnabledTrainee,
  findEnabledTrainees,
  findEnabledTraineesByIds,
  type TraineeRecord,
} from "@/server/repositories/trainee.repository";
import {
  findEnabledTrainingTasks,
  type TrainingTaskRecord,
} from "@/server/repositories/training-task.repository";
import { readMentorDashboardData } from "@/server/services/mentor-dashboard.query";
import { getTrainingDurationDays } from "@/server/services/training-plan-settings.service";

export class DashboardNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly status = 404;

  constructor(resource: "trainee") {
    super(`${resource} not found`);
    this.name = "DashboardNotFoundError";
  }
}

export interface DashboardTraineeDto {
  id: string;
  name: string;
  employeeId: string;
  focusGroup: FocusGroup;
  currentDay: number;
}

export interface ProgressDto {
  id: string;
  traineeId: string;
  taskId: string;
  learnDone: boolean;
  learnAt: Date | null;
  actionSubmitted: boolean;
  actionSubmittedAt: Date | null;
  actionConfirmed: boolean;
  actionConfirmedAt: Date | null;
  actionConfirmedById: string | null;
  drillSubmitted: boolean;
  drillSubmittedAt: Date | null;
  drillConfirmed: boolean;
  drillConfirmedAt: Date | null;
  drillConfirmedById: string | null;
  feedback: string | null;
  traineeNote: string | null;
  mentorNote: string | null;
}

export interface ConfirmationEventDto {
  id: string;
  kind: ConfirmationEventRecord["kind"];
  note: string | null;
  createdAt: Date;
  actor: { id: string; employeeId: string };
}

export interface DashboardTaskDto {
  id: string;
  stableImportKey: string;
  day: number;
  stage: TrainingStage;
  dimension: DimensionCode;
  dimensionName: string;
  task: string;
  action: string | null;
  drill: string | null;
  sortOrder: number;
  isFocus: boolean;
  references: ReadonlyArray<{ id: string; title: string; url: string; sortOrder: number }>;
  progress: ProgressDto | null;
  confirmationHistory: ConfirmationEventDto[];
}

export interface TraineeDashboard {
  trainee: DashboardTraineeDto;
  durationDays: number;
  tasks: DashboardTaskDto[];
  summary: ProgressSummary;
  permissions: {
    canToggleLearn: boolean;
    canSubmitPractice: boolean;
    canConfirm: boolean;
    canWriteMentorNote: boolean;
  };
}

export interface TraineeSummary {
  trainee: DashboardTraineeDto;
  summary: ProgressSummary;
}

export interface ReviewerContextDto {
  role: "MENTOR" | "SUPERVISOR";
  employeeId: string;
  primary: boolean;
}

export type DashboardAccessReason =
  | "ADMIN_OVERRIDE"
  | "SUPERVISOR_ASSIGNMENT"
  | "MENTOR_ASSIGNMENT"
  | "READ_ONLY";

export interface RoleDashboardTraineeDto {
  trainee: DashboardTraineeDto;
  stage: TrainingStage | null;
  learn: Metric;
  due: Metric;
  overdueCount: number;
  pendingConfirmationCount: number;
  risk: RiskAssessment;
  assigned: boolean;
  canConfirm: boolean;
  accessReason: DashboardAccessReason;
  reviewers: ReviewerContextDto[];
}

export interface RoleScopeSummaryDto {
  traineeCount: number;
  learn: Metric;
  due: Metric;
  overdueCount: number;
  pendingConfirmationCount: number;
  attentionCount: number;
  highRiskCount: number;
}

export interface ConfirmationQueueItemDto {
  trainee: Pick<DashboardTraineeDto, "id" | "name" | "employeeId">;
  taskId: string;
  day: number;
  task: string;
  kind: "ACTION" | "DRILL";
  content: string;
}

export interface MentorDashboardDto {
  trainees: RoleDashboardTraineeDto[];
  summary: RoleScopeSummaryDto;
  confirmationQueue: ConfirmationQueueItemDto[];
}

export interface SupervisorDashboardDto {
  trainees: RoleDashboardTraineeDto[];
  assignedSummary: RoleScopeSummaryDto;
  allSummary: RoleScopeSummaryDto;
}

const toDashboardTrainee = (
  trainee: TraineeRecord,
  today: Date,
  durationDays: number,
): DashboardTraineeDto => ({
  id: trainee.id,
  name: trainee.name,
  employeeId: trainee.employeeId,
  focusGroup: trainee.focusGroup,
  currentDay: calculateCurrentDay({
    trainingStartDate: trainee.trainingStartDate,
    trainingDayOverride: trainee.trainingDayOverride,
    today,
    durationDays,
  }),
});

const toProgressDto = (progress: ProgressRecord): ProgressDto => ({ ...progress });

const toProgressInput = (progress: readonly ProgressRecord[]) =>
  progress.map((row) => ({
    taskId: row.taskId,
    learnDone: row.learnDone,
    actionDone: row.actionConfirmed,
    drillDone: row.drillConfirmed,
  }));

const toTaskInput = (tasks: readonly TrainingTaskRecord[]) =>
  tasks.map((task) => ({
    id: task.id,
    day: task.day,
    stage: task.stage as TrainingStage,
    dimension: task.dimension,
    enabled: task.enabled,
    action: task.action,
    drill: task.drill,
  }));

const calculateSummary = (
  trainee: DashboardTraineeDto,
  tasks: readonly TrainingTaskRecord[],
  progress: readonly ProgressRecord[],
): ProgressSummary =>
  calculateProgress(
    toTaskInput(tasks),
    toProgressInput(progress),
    trainee.currentDay,
    trainee.focusGroup,
  );

const isAdministrator = (actor: Actor): boolean =>
  actor.enabled && actor.roles.includes(ROLE_CODES.ADMIN);

const requireRoleDashboard = (
  actor: Actor,
  role: typeof ROLE_CODES.MENTOR | typeof ROLE_CODES.SUPERVISOR,
) => {
  if (!actor.enabled || (!actor.roles.includes(role) && !isAdministrator(actor))) {
    throw new ForbiddenError();
  }
};

const isAssigned = (
  actor: Actor,
  traineeId: string,
  relations: Awaited<ReturnType<typeof findRelationsForTrainees>>,
  role: typeof ROLE_CODES.MENTOR | typeof ROLE_CODES.SUPERVISOR,
  evaluatedAt: Date,
): boolean => {
  const evaluatedDate = toBusinessDate(evaluatedAt);
  return isAdministrator(actor) ||
  relations.some(
    (relation) =>
      relation.userId === actor.userId &&
      relation.traineeId === traineeId &&
      relation.role === role &&
      relation.enabled &&
      (relation.startsAt === null || toBusinessDate(relation.startsAt) <= evaluatedDate) &&
      (relation.expiresAt === null || toBusinessDate(relation.expiresAt) >= evaluatedDate),
  );
};

const effectiveAccessReason = (
  actor: Actor,
  traineeId: string,
  relations: Awaited<ReturnType<typeof findRelationsForTrainees>>,
  evaluatedAt: Date,
  canConfirm: boolean,
): DashboardAccessReason => {
  if (!canConfirm) {
    return "READ_ONLY";
  }
  if (isAdministrator(actor)) {
    return "ADMIN_OVERRIDE";
  }
  if (
    actor.roles.includes(ROLE_CODES.SUPERVISOR) &&
    isAssigned(actor, traineeId, relations, ROLE_CODES.SUPERVISOR, evaluatedAt)
  ) {
    return "SUPERVISOR_ASSIGNMENT";
  }
  if (
    actor.roles.includes(ROLE_CODES.MENTOR) &&
    isAssigned(actor, traineeId, relations, ROLE_CODES.MENTOR, evaluatedAt)
  ) {
    return "MENTOR_ASSIGNMENT";
  }
  return "READ_ONLY";
};

const currentStage = (
  tasks: readonly TrainingTaskRecord[],
  currentDay: number,
): TrainingStage | null => {
  const ordered = Array.from(tasks).sort(
    (left, right) => left.day - right.day || left.sortOrder - right.sortOrder,
  );
  return (
    ordered.find(({ day }) => day >= currentDay)?.stage as TrainingStage | undefined
  ) ?? (ordered.at(-1)?.stage as TrainingStage | undefined) ?? null;
};

const pendingConfirmationCount = (
  tasks: readonly TrainingTaskRecord[],
  progress: readonly ProgressRecord[],
): number => {
  const progressByTask = new Map(progress.map((row) => [row.taskId, row]));
  return tasks.reduce((count, task) => {
    const row = progressByTask.get(task.id);
    return (
      count +
      (task.action?.trim() && row?.actionSubmitted && !row.actionConfirmed ? 1 : 0) +
      (task.drill?.trim() && row?.drillSubmitted && !row.drillConfirmed ? 1 : 0)
    );
  }, 0);
};

const groupReviewers = (reviewers: readonly ReviewerAssignmentRecord[]) => {
  const byTrainee = new Map<string, ReviewerContextDto[]>();
  for (const reviewer of reviewers) {
    const values = byTrainee.get(reviewer.traineeId) ?? [];
    values.push({
      role: reviewer.type,
      employeeId: reviewer.user.username,
      primary: reviewer.isPrimary,
    });
    byTrainee.set(reviewer.traineeId, values);
  }
  return byTrainee;
};

const summarizeScope = (
  trainees: readonly RoleDashboardTraineeDto[],
): RoleScopeSummaryDto => ({
  traineeCount: trainees.length,
  learn: aggregateMetrics(trainees.map(({ learn }) => learn)),
  due: aggregateMetrics(trainees.map(({ due }) => due)),
  overdueCount: trainees.reduce((total, trainee) => total + trainee.overdueCount, 0),
  pendingConfirmationCount: trainees.reduce(
    (total, trainee) => total + trainee.pendingConfirmationCount,
    0,
  ),
  attentionCount: trainees.filter(({ risk }) => risk.level === "ATTENTION").length,
  highRiskCount: trainees.filter(({ risk }) => risk.level === "HIGH_RISK").length,
});

interface RoleDashboardReadModel {
  durationDays: number;
  trainees: TraineeRecord[];
  tasks: TrainingTaskRecord[];
  relations: Awaited<ReturnType<typeof findRelationsForTrainees>>;
  progressByTrainee: Map<string, ProgressRecord[]>;
  reviewersByTrainee: Map<string, ReviewerContextDto[]>;
}

const readRoleDashboard = async (evaluatedAt: Date): Promise<RoleDashboardReadModel> => {
  const [trainees, durationDays] = await Promise.all([
    findEnabledTrainees(),
    getTrainingDurationDays(),
  ]);
  const tasks = await findEnabledTrainingTasks(durationDays);
  const traineeIds = trainees.map(({ id }) => id);
  const [relations, progress, reviewers] = await Promise.all([
    findRelationsForTrainees(traineeIds),
    findProgressForTrainees(traineeIds),
    findActiveReviewerAssignmentsForTrainees(traineeIds, evaluatedAt),
  ]);
  const progressByTrainee = new Map<string, ProgressRecord[]>();
  for (const row of progress) {
    const rows = progressByTrainee.get(row.traineeId) ?? [];
    rows.push(row);
    progressByTrainee.set(row.traineeId, rows);
  }
  return {
    durationDays,
    trainees,
    tasks,
    relations,
    progressByTrainee,
    reviewersByTrainee: groupReviewers(reviewers),
  };
};

const readScopedMentorDashboard = async (
  actor: Actor,
  evaluatedAt: Date,
): Promise<RoleDashboardReadModel> => {
  const durationDays = await getTrainingDurationDays();
  const data = await readMentorDashboardData(actor.userId, evaluatedAt, {
    findAssignedTraineeIds: (userId, at) =>
      findActiveTraineeIdsForUserRole(userId, ROLE_CODES.MENTOR, at),
    findEnabledTraineesByIds,
    findEnabledTrainingTasks: () => findEnabledTrainingTasks(durationDays),
    findRelationsForTrainees,
    findProgressForTrainees,
    findActiveReviewerAssignmentsForTrainees,
  });
  const progressByTrainee = new Map<string, ProgressRecord[]>();
  for (const row of data.progress) {
    const rows = progressByTrainee.get(row.traineeId) ?? [];
    rows.push(row);
    progressByTrainee.set(row.traineeId, rows);
  }
  return {
    durationDays,
    trainees: data.trainees,
    tasks: data.tasks,
    relations: data.relations,
    progressByTrainee,
    reviewersByTrainee: groupReviewers(data.reviewers),
  };
};

const buildRoleTrainee = (
  actor: Actor,
  trainee: TraineeRecord,
  model: RoleDashboardReadModel,
  role: typeof ROLE_CODES.MENTOR | typeof ROLE_CODES.SUPERVISOR,
  evaluatedAt: Date,
): RoleDashboardTraineeDto => {
  const dashboardTrainee = toDashboardTrainee(
    trainee,
    evaluatedAt,
    model.durationDays,
  );
  const progress = model.progressByTrainee.get(trainee.id) ?? [];
  const summary = calculateSummary(dashboardTrainee, model.tasks, progress);
  const assigned = isAssigned(
    actor,
    trainee.id,
    model.relations,
    role,
    evaluatedAt,
  );
  const canConfirm = role === ROLE_CODES.MENTOR && canConfirmProgress(
    actor,
    trainee,
    model.relations,
    evaluatedAt,
  );
  return {
    trainee: dashboardTrainee,
    stage: currentStage(model.tasks, dashboardTrainee.currentDay),
    learn: summary.learn,
    due: summary.due,
    overdueCount: summary.overdueCount,
    pendingConfirmationCount: pendingConfirmationCount(model.tasks, progress),
    risk: assessRisk(summary),
    assigned,
    canConfirm,
    accessReason: effectiveAccessReason(
      actor,
      trainee.id,
      model.relations,
      evaluatedAt,
      canConfirm,
    ),
    reviewers: model.reviewersByTrainee.get(trainee.id) ?? [],
  };
};

const buildConfirmationQueue = (
  trainees: readonly TraineeRecord[],
  model: RoleDashboardReadModel,
): ConfirmationQueueItemDto[] => {
  const items: ConfirmationQueueItemDto[] = [];
  for (const trainee of trainees) {
    const progressByTask = new Map(
      (model.progressByTrainee.get(trainee.id) ?? []).map((row) => [row.taskId, row]),
    );
    for (const task of model.tasks) {
      const row = progressByTask.get(task.id);
      if (task.action?.trim() && row?.actionSubmitted && !row.actionConfirmed) {
        items.push({
          trainee: { id: trainee.id, name: trainee.name, employeeId: trainee.employeeId },
          taskId: task.id,
          day: task.day,
          task: task.task,
          kind: "ACTION",
          content: task.action.trim(),
        });
      }
      if (task.drill?.trim() && row?.drillSubmitted && !row.drillConfirmed) {
        items.push({
          trainee: { id: trainee.id, name: trainee.name, employeeId: trainee.employeeId },
          taskId: task.id,
          day: task.day,
          task: task.task,
          kind: "DRILL",
          content: task.drill.trim(),
        });
      }
    }
  }
  return items.sort(
    (left, right) =>
      left.day - right.day ||
      left.trainee.employeeId.localeCompare(right.trainee.employeeId) ||
      left.kind.localeCompare(right.kind),
  );
};

export const getTraineeDashboard = async (
  actor: Actor,
  traineeId: string,
  today = new Date(),
): Promise<TraineeDashboard> => {
  const trainee = await findEnabledTrainee(traineeId);
  if (!trainee) {
    throw new DashboardNotFoundError("trainee");
  }
  const relations = await findRelationsForTrainee(traineeId);
  requireViewTrainee(actor, trainee, relations, today);

  const durationDays = await getTrainingDurationDays();
  const [tasks, progress, confirmationEvents] = await Promise.all([
    findEnabledTrainingTasks(durationDays),
    findProgressForTrainee(traineeId),
    findConfirmationEventsForTrainee(traineeId),
  ]);
  const dashboardTrainee = toDashboardTrainee(trainee, today, durationDays);
  const progressByTask = new Map(progress.map((row) => [row.taskId, row]));
  const eventsByTask = new Map<string, ConfirmationEventDto[]>();
  for (const event of confirmationEvents) {
    const events = eventsByTask.get(event.taskId) ?? [];
    events.push({
      id: event.id,
      kind: event.kind,
      note: event.note,
      createdAt: event.createdAt,
      actor: { id: event.actor.id, employeeId: event.actor.username },
    });
    eventsByTask.set(event.taskId, events);
  }

  return {
    trainee: dashboardTrainee,
    durationDays,
    tasks: tasks.map((task) => ({
      id: task.id,
      stableImportKey: task.stableImportKey,
      day: task.day,
      stage: task.stage as TrainingStage,
      dimension: task.dimension,
      dimensionName: task.dimensionName,
      task: task.task,
      action: task.action,
      drill: task.drill,
      sortOrder: task.sortOrder,
      isFocus: task.dimension === trainee.focusGroup,
      references: task.references,
      progress: progressByTask.has(task.id)
        ? toProgressDto(progressByTask.get(task.id)!)
        : null,
      confirmationHistory: eventsByTask.get(task.id) ?? [],
    })),
    summary: calculateSummary(dashboardTrainee, tasks, progress),
    permissions: {
      canToggleLearn: canToggleLearn(actor, trainee),
      canSubmitPractice: canSubmitPractice(actor, trainee),
      canConfirm: canConfirmProgress(actor, trainee, relations, today),
      canWriteMentorNote: canWriteMentorNote(actor, trainee, relations, today),
    },
  };
};

export const getTraineeSummaries = async (
  actor: Actor,
  today = new Date(),
): Promise<TraineeSummary[]> => {
  if (!actor.enabled) {
    throw new ForbiddenError();
  }
  const [trainees, durationDays] = await Promise.all([
    findEnabledTrainees(),
    getTrainingDurationDays(),
  ]);
  const tasks = await findEnabledTrainingTasks(durationDays);
  const relations = await findRelationsForTrainees(trainees.map(({ id }) => id));
  const visibleTrainees = trainees.filter((trainee) =>
    canViewTrainee(actor, trainee, relations, today),
  );
  const progress = await findProgressForTrainees(visibleTrainees.map(({ id }) => id));
  const progressByTrainee = new Map<string, ProgressRecord[]>();
  for (const row of progress) {
    const rows = progressByTrainee.get(row.traineeId) ?? [];
    rows.push(row);
    progressByTrainee.set(row.traineeId, rows);
  }

  return visibleTrainees.map((trainee) => {
    const dashboardTrainee = toDashboardTrainee(trainee, today, durationDays);
    return {
      trainee: dashboardTrainee,
      summary: calculateSummary(
        dashboardTrainee,
        tasks,
        progressByTrainee.get(trainee.id) ?? [],
      ),
    };
  });
};

export const getMentorDashboard = async (
  actor: Actor,
  evaluatedAt = new Date(),
): Promise<MentorDashboardDto> => {
  requireRoleDashboard(actor, ROLE_CODES.MENTOR);
  const model = isAdministrator(actor)
    ? await readRoleDashboard(evaluatedAt)
    : await readScopedMentorDashboard(actor, evaluatedAt);
  const assignedTrainees = model.trainees.filter((trainee) =>
    isAssigned(
      actor,
      trainee.id,
      model.relations,
      ROLE_CODES.MENTOR,
      evaluatedAt,
    ),
  );
  const trainees = assignedTrainees.map((trainee) =>
    buildRoleTrainee(actor, trainee, model, ROLE_CODES.MENTOR, evaluatedAt),
  );

  return {
    trainees,
    summary: summarizeScope(trainees),
    confirmationQueue: buildConfirmationQueue(assignedTrainees, model),
  };
};

export const getSupervisorDashboard = async (
  actor: Actor,
  evaluatedAt = new Date(),
): Promise<SupervisorDashboardDto> => {
  requireRoleDashboard(actor, ROLE_CODES.SUPERVISOR);
  const model = await readRoleDashboard(evaluatedAt);
  const trainees = model.trainees.map((trainee) =>
    buildRoleTrainee(actor, trainee, model, ROLE_CODES.SUPERVISOR, evaluatedAt),
  );

  return {
    trainees,
    assignedSummary: summarizeScope(trainees.filter(({ assigned }) => assigned)),
    allSummary: summarizeScope(trainees),
  };
};
