import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { PermissionActor } from "@/domain/permissions/types";
import type { ImportPreview } from "@/domain/import/training-plan-schema";
import {
  applyImportPreviewToken,
  createImportPreviewToken,
  readImportPreviewToken,
} from "@/server/services/admin-import.service";

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const prefix = `task-11-import-${randomUUID()}`;
const secret = "task-11-import-test-secret-at-least-32";
const emptyPreview = (): ImportPreview => ({
  checksum: "empty-preview",
  fileName: "empty.xlsx",
  rows: [], items: [], canApply: true,
  counts: { create: 0, update: 0, "disable-candidate": 0, skip: 0, warning: 0, error: 0 },
});

runWithDatabase("Task 11 import token security", () => {
  let prisma: PrismaClient;
  let adminId: string;
  let otherAdminId: string;
  let trainingPlan: { durationDays: number; revision: number };
  const actor = (userId = adminId): PermissionActor => ({ userId, roles: ["ADMIN"], traineeId: null, enabled: true });

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    const role = await prisma.role.upsert({ where: { code: "ADMIN" }, update: {}, create: { code: "ADMIN" } });
    const [admin, other] = await prisma.$transaction([
      prisma.user.create({ data: { username: `${prefix}-admin`, passwordHash: "test", roles: { create: { roleId: role.id } } } }),
      prisma.user.create({ data: { username: `${prefix}-other`, passwordHash: "test", roles: { create: { roleId: role.id } } } }),
    ]);
    adminId = admin.id; otherAdminId = other.id;
    const settings = await prisma.trainingPlanSettings.findUniqueOrThrow({ where: { id: "default" } });
    trainingPlan = { durationDays: settings.durationDays, revision: settings.revision };
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { username: { startsWith: prefix } }, select: { id: true } });
    const ids = users.map(({ id }) => id);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.importBatch.deleteMany({ where: { operatorId: { in: ids } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("rejects expired and actor-mismatched signed preview tokens", async () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const token = createImportPreviewToken(emptyPreview(), adminId, secret, trainingPlan, now, "expiry-nonce-1234567890");
    expect(() => readImportPreviewToken(token, adminId, secret, now + 30 * 60_000)).toThrow("已过期");
    expect(() => readImportPreviewToken(token, adminId, secret, now + 31 * 60_000)).toThrow("已过期");
    expect(() => readImportPreviewToken(token, otherAdminId, secret, now)).toThrow("不属于当前管理员");
  });

  it("rejects a correctly signed error preview without writes", async () => {
    const preview = emptyPreview();
    preview.canApply = false; preview.counts.error = 1;
    preview.items.push({ classification: "error", message: "工作簿错误" });
    const token = createImportPreviewToken(preview, adminId, secret, trainingPlan, Date.now(), "error-nonce-1234567890");
    const before = await prisma.importBatch.count({ where: { operatorId: adminId } });
    await expect(applyImportPreviewToken(actor(), token, secret)).rejects.toThrow("包含错误");
    expect(await prisma.importBatch.count({ where: { operatorId: adminId } })).toBe(before);
  });

  it("allows a token exactly once and records one batch and audit", async () => {
    const token = createImportPreviewToken(emptyPreview(), adminId, secret, trainingPlan, Date.now(), "replay-nonce-1234567890");
    const batch = await applyImportPreviewToken(actor(), token, secret);
    await expect(applyImportPreviewToken(actor(), token, secret)).rejects.toThrow("已使用");
    expect(await prisma.importBatch.count({ where: { id: batch.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: batch.id, action: "IMPORT" } })).toBe(1);
  });

  it("allows at most one concurrent apply for the same nonce", async () => {
    const token = createImportPreviewToken(emptyPreview(), adminId, secret, trainingPlan, Date.now(), "concurrent-nonce-1234567890");
    const results = await Promise.allSettled([
      applyImportPreviewToken(actor(), token, secret),
      applyImportPreviewToken(actor(), token, secret),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await prisma.importBatch.count({ where: { operatorId: adminId, nonceHash: { not: null } } })).toBe(2);
  });

  it("rejects a preview after the plan revision changes even if the duration returns to the same value", async () => {
    const token = createImportPreviewToken(
      emptyPreview(),
      adminId,
      secret,
      trainingPlan,
      Date.now(),
      "stale-plan-revision-nonce-1234567890",
    );
    await prisma.trainingPlanSettings.update({
      where: { id: "default" },
      data: { revision: trainingPlan.revision + 1 },
    });
    try {
      await expect(applyImportPreviewToken(actor(), token, secret)).rejects.toThrow("总天数已变更");
    } finally {
      await prisma.trainingPlanSettings.update({
        where: { id: "default" },
        data: { revision: trainingPlan.revision },
      });
    }
  });

  it("rejects apply when the ADMIN role was revoked after preview", async () => {
    const token = createImportPreviewToken(emptyPreview(), adminId, secret, trainingPlan, Date.now(), "revoked-nonce-1234567890");
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: adminId, roleId: role.id } } });
    await expect(applyImportPreviewToken(actor(), token, secret)).rejects.toThrow("Permission denied");
    expect(await prisma.importBatch.count({ where: { operatorId: adminId, nonceHash: { not: null } } })).toBe(2);
    await prisma.userRole.create({ data: { userId: adminId, roleId: role.id } });
  });
});
