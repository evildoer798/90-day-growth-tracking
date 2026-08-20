import { ForbiddenError } from "@/server/auth/require-permission";
import { prisma } from "@/server/db/prisma";

export type AdminTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const isRetryableConflict = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010" || !("meta" in error) || typeof error.meta !== "object" || error.meta === null) return false;
  const meta = error.meta as { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown; kind?: unknown } } };
  return meta.code === "40001" || meta.code === "40P01" ||
    meta.driverAdapterError?.cause?.originalCode === "40001" ||
    meta.driverAdapterError?.cause?.originalCode === "40P01" ||
    meta.driverAdapterError?.cause?.kind === "TransactionWriteConflict";
};

export async function lockAndRequireLiveAdmin(
  tx: AdminTransaction,
  actorId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE
  `;
  if (locked.length !== 1) throw new ForbiddenError();

  const actor = await tx.user.findFirst({
    where: {
      id: actorId,
      enabled: true,
      roles: { some: { role: { code: "ADMIN" } } },
    },
    select: { id: true },
  });
  if (!actor) throw new ForbiddenError();
}

export async function withAdminTransaction<T>(
  actorId: string,
  operation: (tx: AdminTransaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await lockAndRequireLiveAdmin(tx, actorId);
        return operation(tx);
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable ADMIN transaction retry state");
}
