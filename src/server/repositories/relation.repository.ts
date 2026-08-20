import type { Prisma } from "@/generated/prisma/client";
import { ROLE_CODES } from "@/config/roles.config";
import { toBusinessDate } from "@/domain/dates/business-date";
import type { UserTraineeRelation } from "@/domain/permissions/types";
import type { RelationRole } from "@/domain/permissions/types";
import { prisma } from "@/server/db/prisma";

const relationSelect = {
  userId: true,
  traineeId: true,
  type: true,
  enabled: true,
  startDate: true,
  endDate: true,
} as const satisfies Prisma.UserTraineeRelationSelect;

const reviewerAssignmentSelect = {
  traineeId: true,
  type: true,
  isPrimary: true,
  user: { select: { username: true } },
} as const satisfies Prisma.UserTraineeRelationSelect;

export interface RelationReader {
  userTraineeRelation: Pick<typeof prisma.userTraineeRelation, "findMany">;
}

export type ReviewerAssignmentRecord = Prisma.UserTraineeRelationGetPayload<{
  select: typeof reviewerAssignmentSelect;
}>;

const toPermissionRelation = (
  relation: Prisma.UserTraineeRelationGetPayload<{ select: typeof relationSelect }>,
): UserTraineeRelation => ({
  userId: relation.userId,
  traineeId: relation.traineeId,
  role: relation.type === "SUPERVISOR" ? ROLE_CODES.SUPERVISOR : ROLE_CODES.MENTOR,
  enabled: relation.enabled,
  startsAt: relation.startDate,
  expiresAt: relation.endDate,
});

export const findRelationsForTrainees = async (
  traineeIds: readonly string[],
  database: RelationReader = prisma,
): Promise<UserTraineeRelation[]> => {
  if (traineeIds.length === 0) {
    return [];
  }

  const relations = await database.userTraineeRelation.findMany({
    where: { traineeId: { in: [...traineeIds] } },
    select: relationSelect,
  });
  return relations.map(toPermissionRelation);
};

export const findRelationsForTrainee = async (
  traineeId: string,
  database: RelationReader = prisma,
): Promise<UserTraineeRelation[]> =>
  findRelationsForTrainees([traineeId], database);

export const findActiveReviewerAssignmentsForTrainees = async (
  traineeIds: readonly string[],
  evaluatedAt: Date,
  database: RelationReader = prisma,
): Promise<ReviewerAssignmentRecord[]> => {
  if (traineeIds.length === 0) {
    return [];
  }
  const evaluatedDate = toBusinessDate(evaluatedAt);

  return database.userTraineeRelation.findMany({
    where: {
      traineeId: { in: [...traineeIds] },
      enabled: true,
      startDate: { lte: evaluatedDate },
      OR: [{ endDate: null }, { endDate: { gte: evaluatedDate } }],
      user: { enabled: true },
    },
    select: reviewerAssignmentSelect,
    orderBy: [
      { traineeId: "asc" },
      { type: "asc" },
      { isPrimary: "desc" },
      { user: { username: "asc" } },
    ],
  });
};

export const findActiveTraineeIdsForUserRole = async (
  userId: string,
  role: RelationRole,
  evaluatedAt: Date,
  database: RelationReader = prisma,
): Promise<string[]> => {
  const evaluatedDate = toBusinessDate(evaluatedAt);
  const rows = await database.userTraineeRelation.findMany({
    where: {
      userId,
      type: role,
      enabled: true,
      startDate: { lte: evaluatedDate },
      OR: [{ endDate: null }, { endDate: { gte: evaluatedDate } }],
      user: { enabled: true },
    },
    select: { traineeId: true },
    distinct: ["traineeId"],
    orderBy: { traineeId: "asc" },
  });
  return rows.map(({ traineeId }) => traineeId);
};
