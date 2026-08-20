import {
  canConfirmProgress,
  canEditTask,
  canManageUsers,
  canSubmitPractice,
  canToggleLearn,
  canViewTrainee,
  canWriteMentorNote,
} from "@/domain/permissions/policy";
import type {
  PermissionActor,
  TraineeRecord,
  UserTraineeRelation,
} from "@/domain/permissions/types";

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor() {
    super("Permission denied");
    this.name = "ForbiddenError";
  }
}

const requireAllowed = (
  actor: PermissionActor,
  allowed: boolean,
): PermissionActor => {
  if (!allowed) {
    throw new ForbiddenError();
  }
  return actor;
};

export function requireViewTrainee(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  evaluatedAt: Date,
): PermissionActor {
  return requireAllowed(
    actor,
    canViewTrainee(actor, trainee, relations, evaluatedAt),
  );
}

export function requireToggleLearn(
  actor: PermissionActor,
  trainee: TraineeRecord,
): PermissionActor {
  return requireAllowed(actor, canToggleLearn(actor, trainee));
}

export function requireSubmitPractice(
  actor: PermissionActor,
  trainee: TraineeRecord,
): PermissionActor {
  return requireAllowed(actor, canSubmitPractice(actor, trainee));
}

export function requireConfirmProgress(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  evaluatedAt: Date,
): PermissionActor {
  return requireAllowed(
    actor,
    canConfirmProgress(actor, trainee, relations, evaluatedAt),
  );
}

export function requireWriteMentorNote(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  evaluatedAt: Date,
): PermissionActor {
  return requireAllowed(
    actor,
    canWriteMentorNote(actor, trainee, relations, evaluatedAt),
  );
}

export function requireEditTask(actor: PermissionActor): PermissionActor {
  return requireAllowed(actor, canEditTask(actor));
}

export function requireManageUsers(actor: PermissionActor): PermissionActor {
  return requireAllowed(actor, canManageUsers(actor));
}
