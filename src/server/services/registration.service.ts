import { hash } from "bcryptjs";

import type { RegisterCredentials } from "@/features/auth/register-schema";
import { toBusinessDate } from "@/domain/dates/business-date";
import { prisma } from "@/server/db/prisma";

export class RegistrationConflictError extends Error {
  constructor() {
    super("Employee ID is already registered");
    this.name = "RegistrationConflictError";
  }
}

export class RegistrationUnavailableError extends Error {
  constructor() {
    super("Registration role is unavailable");
    this.name = "RegistrationUnavailableError";
  }
}

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

export async function registerTraineeAccount(
  credentials: RegisterCredentials,
  now = new Date(),
): Promise<{ employeeId: string }> {
  const passwordHash = await hash(credentials.password, 12);

  try {
    return await prisma.$transaction(async (tx) => {
      const traineeRole = await tx.role.findUnique({
        where: { code: "TRAINEE" },
        select: { id: true },
      });
      if (!traineeRole) throw new RegistrationUnavailableError();

      const existingUser = await tx.user.findUnique({
        where: { username: credentials.employeeId },
        select: { id: true },
      });
      const existingTrainee = await tx.trainee.findUnique({
        where: { employeeId: credentials.employeeId },
        select: { id: true },
      });
      if (existingUser || existingTrainee) throw new RegistrationConflictError();

      const trainee = await tx.trainee.create({
        data: {
          employeeId: credentials.employeeId,
          name: credentials.name,
          focusGroup: "D1",
          trainingStartDate: toBusinessDate(now),
        },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          username: credentials.employeeId,
          passwordHash,
          traineeId: trainee.id,
          roles: { create: { roleId: traineeRole.id } },
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          action: "CREATE",
          entity: "SELF_REGISTRATION",
          entityId: user.id,
          actorId: user.id,
          after: {
            employeeId: credentials.employeeId,
            name: credentials.name,
            traineeId: trainee.id,
            role: "TRAINEE",
          },
        },
      });

      return { employeeId: credentials.employeeId };
    });
  } catch (error) {
    if (error instanceof RegistrationConflictError || error instanceof RegistrationUnavailableError) {
      throw error;
    }
    if (isUniqueConstraintError(error)) throw new RegistrationConflictError();
    throw error;
  }
}
