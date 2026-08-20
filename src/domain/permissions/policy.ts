import { ROLE_CODES, type RoleCode } from "@/config/roles.config";
import { toBusinessDate } from "@/domain/dates/business-date";
import type {
  PermissionActor,
  RelationRole,
  TraineeRecord,
  UserTraineeRelation,
} from "@/domain/permissions/types";

function hasRole(actor: PermissionActor, role: RoleCode): boolean {
  return actor.roles.includes(role);
}

function isAdministrator(actor: PermissionActor): boolean {
  return actor.enabled && hasRole(actor, ROLE_CODES.ADMIN);
}

function isTraineeOnlyActor(actor: PermissionActor): boolean {
  return hasRole(actor, ROLE_CODES.TRAINEE) &&
    !hasRole(actor, ROLE_CODES.ADMIN) &&
    !hasRole(actor, ROLE_CODES.SUPERVISOR) &&
    !hasRole(actor, ROLE_CODES.MENTOR);
}

function hasActiveRelation(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  role: RelationRole,
  evaluatedAt: Date,
): boolean {
  const evaluatedDate = toBusinessDate(evaluatedAt);
  return relations.some(
    (relation) =>
      relation.userId === actor.userId &&
      relation.traineeId === trainee.id &&
      relation.role === role &&
      relation.enabled &&
      (relation.startsAt === null || toBusinessDate(relation.startsAt) <= evaluatedDate) &&
      (relation.expiresAt === null || toBusinessDate(relation.expiresAt) >= evaluatedDate),
  );
}

function hasAssignedRole(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  role: RelationRole,
  evaluatedAt: Date,
): boolean {
  return (
    hasRole(actor, role) &&
    hasActiveRelation(actor, trainee, relations, role, evaluatedAt)
  );
}

export function canViewTrainee(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  evaluatedAt: Date,
): boolean {
  if (!actor.enabled) {
    return false;
  }

  if (isAdministrator(actor) || hasRole(actor, ROLE_CODES.SUPERVISOR)) {
    return true;
  }

  if (isTraineeOnlyActor(actor) && actor.traineeId === trainee.id) {
    return true;
  }

  return hasAssignedRole(actor, trainee, relations, ROLE_CODES.MENTOR, evaluatedAt);
}

export function canToggleLearn(actor: PermissionActor, trainee: TraineeRecord): boolean {
  if (!actor.enabled) {
    return false;
  }

  if (isAdministrator(actor)) {
    return true;
  }

  return isTraineeOnlyActor(actor) && actor.traineeId === trainee.id;
}

export function canSubmitPractice(actor: PermissionActor, trainee: TraineeRecord): boolean {
  return canToggleLearn(actor, trainee);
}

export function canConfirmProgress(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  evaluatedAt: Date,
): boolean {
  if (!actor.enabled) {
    return false;
  }

  if (isAdministrator(actor)) {
    return true;
  }

  return hasAssignedRole(actor, trainee, relations, ROLE_CODES.MENTOR, evaluatedAt);
}

export function canWriteMentorNote(
  actor: PermissionActor,
  trainee: TraineeRecord,
  relations: readonly UserTraineeRelation[],
  evaluatedAt: Date,
): boolean {
  if (!actor.enabled) {
    return false;
  }

  if (isAdministrator(actor)) {
    return true;
  }

  return hasAssignedRole(actor, trainee, relations, ROLE_CODES.MENTOR, evaluatedAt);
}

export function canEditTask(actor: PermissionActor): boolean {
  if (!actor.enabled) {
    return false;
  }

  if (isAdministrator(actor)) {
    return true;
  }

  return false;
}

export function canManageUsers(actor: PermissionActor): boolean {
  return isAdministrator(actor);
}
