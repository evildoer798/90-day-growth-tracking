import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import { ROLE_CODES, type RoleCode } from "@/config/roles.config";
import { loginSchema } from "@/features/auth/login-schema";
import { prisma } from "@/server/db/prisma";
import { verifyPassword } from "@/server/auth/password-hash";

const roleCodes = new Set<RoleCode>(Object.values(ROLE_CODES));

export interface AuthenticatedUser {
  id: string;
  employeeId: string;
  roles: RoleCode[];
  traineeId: string | null;
  enabled: boolean;
}

const isRoleCode = (value: unknown): value is RoleCode =>
  typeof value === "string" && roleCodes.has(value as RoleCode);

export async function authorizeCredentials(
  credentials: unknown,
): Promise<AuthenticatedUser | null> {
  const credentialFields =
    credentials !== null && typeof credentials === "object"
      ? {
          employeeId: (credentials as Record<string, unknown>).employeeId,
          password: (credentials as Record<string, unknown>).password,
        }
      : credentials;
  const parsed = loginSchema.safeParse(credentialFields);
  if (!parsed.success) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.employeeId },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      enabled: true,
      traineeId: true,
      roles: {
        select: { role: { select: { code: true } } },
        orderBy: { role: { code: "asc" } },
      },
    },
  });

  const passwordMatches = await verifyPassword(
    parsed.data.password,
    user?.passwordHash,
  );

  if (!user || !user.enabled || !passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    employeeId: user.username,
    roles: user.roles.map(({ role }) => role.code),
    traineeId: user.traineeId,
    enabled: user.enabled,
  };
}

export function writeClaimsToToken(token: JWT, user: AuthenticatedUser): JWT {
  delete token.name;
  delete token.email;
  delete token.picture;
  token.sub = user.id;
  token.employeeId = user.employeeId;
  token.roles = [...user.roles];
  token.traineeId = user.traineeId;
  token.enabled = user.enabled;
  return token;
}

const hasValidClaims = (
  token: JWT,
): token is JWT & Required<Pick<JWT, "sub" | "employeeId" | "roles" | "enabled">> =>
  typeof token.sub === "string" &&
  typeof token.employeeId === "string" &&
  Array.isArray(token.roles) &&
  token.roles.every(isRoleCode) &&
  (token.traineeId === null || typeof token.traineeId === "string") &&
  typeof token.enabled === "boolean";

export function createSessionFromToken(session: Session, token: JWT): Session {
  if (!hasValidClaims(token)) {
    delete session.user;
    return session;
  }

  session.user = {
    id: token.sub,
    employeeId: token.employeeId,
    roles: [...token.roles],
    traineeId: token.traineeId ?? null,
    enabled: token.enabled,
  };
  return session;
}
