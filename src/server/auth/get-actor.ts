import type { Session } from "next-auth";

import type { PermissionActor } from "@/domain/permissions/types";

export type Actor = PermissionActor;

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  readonly status = 401;

  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}

export function actorFromSession(session: Session | null | undefined): Actor {
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  return {
    userId: session.user.id,
    roles: [...session.user.roles],
    traineeId: session.user.traineeId,
    enabled: session.user.enabled,
  };
}

export async function getActor(): Promise<Actor> {
  const { auth } = await import("@/auth");
  return freshActorFromSession(await auth());
}

export async function freshActorFromSession(
  session: Session | null | undefined,
): Promise<Actor> {
  const identity = actorFromSession(session);
  const { prisma } = await import("@/server/db/prisma");
  const user = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: {
      id: true,
      enabled: true,
      traineeId: true,
      roles: {
        select: { role: { select: { code: true } } },
        orderBy: { role: { code: "asc" } },
      },
    },
  });

  if (!user?.enabled || user.roles.length === 0) {
    throw new UnauthorizedError();
  }

  return {
    userId: user.id,
    roles: user.roles.map(({ role }) => role.code),
    traineeId: user.traineeId,
    enabled: user.enabled,
  };
}
