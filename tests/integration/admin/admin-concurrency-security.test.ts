import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { PermissionActor } from "@/domain/permissions/types";
import { canConfirmProgress } from "@/domain/permissions/policy";
import { findRelationsForTrainee } from "@/server/repositories/relation.repository";
import {
  createTrainee,
  buildAuditSummary,
  listAuditLogs,
  replaceReviewerRelation,
  resetUserPassword,
  updateTrainingTask,
} from "@/server/services/admin.service";

const runWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;
const runId = randomUUID();
const prefix = `task-11-fix-${runId}`;

runWithDatabase("Task 11 concurrent ADMIN security", () => {
  let prisma: PrismaClient;
  let adminId: string;
  let mentorOneId: string;
  let mentorTwoId: string;
  let traineeId: string;

  const actor = (): PermissionActor => ({
    userId: adminId,
    roles: ["ADMIN"],
    traineeId: null,
    enabled: true,
  });

  beforeAll(async () => {
    ({ prisma } = await import("@/server/db/prisma"));
    await prisma.$connect();
    await Promise.all((["ADMIN", "MENTOR"] as const).map((code) =>
      prisma.role.upsert({ where: { code }, update: {}, create: { code } }),
    ));
    const [admin, mentorOne, mentorTwo, trainee] = await prisma.$transaction([
      prisma.user.create({ data: { username: `${prefix}-admin`, passwordHash: "old-hash", roles: { create: { role: { connect: { code: "ADMIN" } } } } } }),
      prisma.user.create({ data: { username: `${prefix}-mentor-1`, passwordHash: "test", roles: { create: { role: { connect: { code: "MENTOR" } } } } } }),
      prisma.user.create({ data: { username: `${prefix}-mentor-2`, passwordHash: "test", roles: { create: { role: { connect: { code: "MENTOR" } } } } } }),
      prisma.trainee.create({ data: { name: "并发新人", employeeId: `${prefix}-TRAINEE`.toUpperCase(), focusGroup: "D1", trainingStartDate: new Date("2026-08-01T00:00:00.000Z") } }),
    ]);
    adminId = admin.id; mentorOneId = mentorOne.id; mentorTwoId = mentorTwo.id; traineeId = trainee.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { username: { startsWith: prefix } }, select: { id: true } });
    const userIds = users.map(({ id }) => id);
    const trainees = await prisma.trainee.findMany({ where: { employeeId: { startsWith: prefix.toUpperCase() } }, select: { id: true } });
    const traineeIds = trainees.map(({ id }) => id);
    const tasks = await prisma.trainingTask.findMany({ where: { stableImportKey: { startsWith: prefix } }, select: { id: true } });
    const taskIds = tasks.map(({ id }) => id);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.taskVersion.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { taskId: { in: taskIds } }] } });
    await prisma.userTraineeRelation.deleteMany({ where: { traineeId: { in: traineeIds } } });
    await prisma.taskReference.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.trainingTask.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.trainee.deleteMany({ where: { id: { in: traineeIds } } });
    await prisma.$disconnect();
  });

  const clearRelations = () => prisma.userTraineeRelation.deleteMany({ where: { traineeId, type: "MENTOR" } });
  const mentorPermissionActor = (userId: string): PermissionActor => ({ userId, roles: ["MENTOR"], traineeId: null, enabled: true });
  const canConfirmAt = async (userId: string, isoDate: string) => canConfirmProgress(
    mentorPermissionActor(userId), { id: traineeId }, await findRelationsForTrainee(traineeId, prisma), new Date(`${isoDate}T00:00:00.000Z`),
  );

  it("keeps the current reviewer accessible through the day before a future replacement", async () => {
    await clearRelations();
    await replaceReviewerRelation(actor(), { traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true, startDate: "2026-08-01", confirm: true });
    await replaceReviewerRelation(actor(), { traineeId, userId: mentorTwoId, type: "MENTOR", isPrimary: true, startDate: "2026-08-20", confirm: true });
    const rows = await prisma.userTraineeRelation.findMany({ where: { traineeId, type: "MENTOR" }, orderBy: { startDate: "asc" } });
    expect(rows).toMatchObject([
      { userId: mentorOneId, enabled: true, endDate: new Date("2026-08-19T00:00:00.000Z") },
      { userId: mentorTwoId, enabled: true, endDate: null },
    ]);
    expect(await canConfirmAt(mentorOneId, "2026-08-19")).toBe(true);
    expect(await canConfirmAt(mentorOneId, "2026-08-20")).toBe(false);
    expect(await canConfirmAt(mentorTwoId, "2026-08-19")).toBe(false);
    expect(await canConfirmAt(mentorTwoId, "2026-08-20")).toBe(true);
  });

  it("switches a today replacement without an access gap", async () => {
    await clearRelations();
    await replaceReviewerRelation(actor(), { traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true, startDate: "2026-08-01", confirm: true });
    await replaceReviewerRelation(actor(), { traineeId, userId: mentorTwoId, type: "MENTOR", isPrimary: true, startDate: "2026-08-15", confirm: true });
    expect(await canConfirmAt(mentorOneId, "2026-08-14")).toBe(true);
    expect(await canConfirmAt(mentorOneId, "2026-08-15")).toBe(false);
    expect(await canConfirmAt(mentorTwoId, "2026-08-15")).toBe(true);
  });

  it("allows a one-day inclusive reviewer assignment", async () => {
    await clearRelations();
    const relation = await replaceReviewerRelation(actor(), {
      traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true,
      startDate: "2026-08-15", endDate: "2026-08-15", confirm: true,
    });
    expect(relation.endDate).toEqual(new Date("2026-08-15T00:00:00.000Z"));
    expect(await canConfirmAt(mentorOneId, "2026-08-15")).toBe(true);
  });

  it("cancels an equal-start assignment with an explicit valid end date", async () => {
    await clearRelations();
    const old = await replaceReviewerRelation(actor(), { traineeId, userId: mentorTwoId, type: "MENTOR", isPrimary: true, startDate: "2026-08-25", confirm: true });
    const replacement = await replaceReviewerRelation(actor(), { traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: false, startDate: "2026-08-25", confirm: true });
    expect(await prisma.userTraineeRelation.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ enabled: false, endDate: new Date("2026-08-25T00:00:00.000Z") });
    expect(await prisma.userTraineeRelation.findUniqueOrThrow({ where: { id: replacement.id } })).toMatchObject({ enabled: true, endDate: null });
  });

  it("cancels superseded future assignments while preserving valid earlier history", async () => {
    await clearRelations();
    const current = await replaceReviewerRelation(actor(), { traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true, startDate: "2026-08-01", confirm: true });
    const future = await replaceReviewerRelation(actor(), { traineeId, userId: mentorTwoId, type: "MENTOR", isPrimary: true, startDate: "2026-08-20", confirm: true });
    await replaceReviewerRelation(actor(), { traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: false, startDate: "2026-08-15", confirm: true });
    expect(await prisma.userTraineeRelation.findUniqueOrThrow({ where: { id: current.id } })).toMatchObject({ enabled: true, endDate: new Date("2026-08-14T00:00:00.000Z") });
    expect(await prisma.userTraineeRelation.findUniqueOrThrow({ where: { id: future.id } })).toMatchObject({ enabled: false, endDate: new Date("2026-08-20T00:00:00.000Z") });
  });

  it("preserves a later scheduled assignment when a new bounded interval ends before it starts", async () => {
    await clearRelations();
    const later = await replaceReviewerRelation(actor(), {
      traineeId, userId: mentorTwoId, type: "MENTOR", isPrimary: true, startDate: "2026-08-20", confirm: true,
    });
    const bounded = await replaceReviewerRelation(actor(), {
      traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true,
      startDate: "2026-08-10", endDate: "2026-08-15", confirm: true,
    });
    expect(await prisma.userTraineeRelation.findUniqueOrThrow({ where: { id: later.id } })).toMatchObject({ enabled: true, startDate: new Date("2026-08-20T00:00:00.000Z"), endDate: null });
    expect(await prisma.userTraineeRelation.findUniqueOrThrow({ where: { id: bounded.id } })).toMatchObject({ enabled: true, endDate: new Date("2026-08-15T00:00:00.000Z") });
  });

  it("rejects an inclusive enabled interval that overlaps at the boundary", async () => {
    await clearRelations();
    await replaceReviewerRelation(actor(), {
      traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true,
      startDate: "2026-08-10", endDate: "2026-08-15", confirm: true,
    });
    await expect(prisma.userTraineeRelation.create({ data: {
      traineeId, userId: mentorTwoId, type: "MENTOR", isPrimary: false, enabled: true,
      startDate: new Date("2026-08-15T00:00:00.000Z"), endDate: new Date("2026-08-18T00:00:00.000Z"),
    } })).rejects.toThrow();
  });

  it("serializes concurrent future replacements into one scheduled winner without dropping current access", async () => {
    await clearRelations();
    await replaceReviewerRelation(actor(), { traineeId, userId: mentorOneId, type: "MENTOR", isPrimary: true, startDate: "2026-08-01", confirm: true });
    const input = (userId: string) => ({ traineeId, userId, type: "MENTOR", isPrimary: true, startDate: "2026-08-20", confirm: true });
    await Promise.all([replaceReviewerRelation(actor(), input(mentorOneId)), replaceReviewerRelation(actor(), input(mentorTwoId))]);
    const rows = await prisma.userTraineeRelation.findMany({ where: { traineeId, type: "MENTOR" }, orderBy: { createdAt: "asc" } });
    expect(rows.filter(({ enabled }) => enabled)).toHaveLength(2);
    expect(rows.filter(({ enabled, startDate }) => enabled && startDate.getTime() === Date.parse("2026-08-20T00:00:00.000Z"))).toHaveLength(1);
    expect(await canConfirmAt(mentorOneId, "2026-08-19")).toBe(true);
    expect(rows.every((row) => row.endDate === null || row.endDate >= row.startDate)).toBe(true);
  });

  it("serializes concurrent task edits into a complete version chain", async () => {
    const task = await prisma.trainingTask.create({ data: { stableImportKey: `${prefix}-task`, day: 1, stage: "P1", dimension: "D1", dimensionName: "机械运动", task: "初始", sortOrder: 1 } });
    const input = (title: string, day: number) => ({ id: task.id, day, stage: "P1", dimension: "D1", dimensionName: "机械运动", task: title, action: null, drill: null, sortOrder: day, references: [] });
    await Promise.all([updateTrainingTask(actor(), input("并发 A", 2)), updateTrainingTask(actor(), input("并发 B", 3))]);
    const versions = await prisma.taskVersion.findMany({ where: { taskId: task.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(versions).toHaveLength(2);
    const chained = versions.some((first, index) => versions.some((second, secondIndex) => index !== secondIndex && JSON.stringify(first.after) === JSON.stringify(second.before)));
    expect(chained).toBe(true);
    const final = await prisma.trainingTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(versions.some(({ after }) => (after as { task?: string }).task === final.task)).toBe(true);
  });

  it("waits for a concurrent ADMIN revocation and then rejects the write", async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    let reportLocked!: () => void;
    let releaseRevocation!: () => void;
    const locked = new Promise<void>((resolve) => { reportLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseRevocation = resolve; });
    const revocation = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${adminId} FOR UPDATE`;
      await transaction.userRole.delete({ where: { userId_roleId: { userId: adminId, roleId: role.id } } });
      reportLocked();
      await release;
    }, { isolationLevel: "Serializable" });
    await locked;
    const before = await prisma.trainee.count();
    const mutation = createTrainee(actor(), { name: "撤权后写入", employeeId: `${prefix}-REVOKED`, focusGroup: "D1", trainingStartDate: "2026-08-01" });
    const rejected = expect(mutation).rejects.toThrow("Permission denied");
    releaseRevocation();
    await revocation;
    await rejected;
    expect(await prisma.trainee.count()).toBe(before);
    await prisma.userRole.create({ data: { userId: adminId, roleId: role.id } });
  });

  it("resets password and writes only safe metadata in the same authorized transaction", async () => {
    await resetUserPassword(actor(), { id: mentorOneId, password: "New-Password-123", confirm: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: mentorOneId } });
    expect(user.passwordHash).not.toBe("test");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: adminId, entity: "USER_PASSWORD", entityId: mentorOneId }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ action: "UPDATE", before: null, after: { passwordReset: true } });
    expect(JSON.stringify(log)).not.toMatch(/New-Password|passwordHash|\$2[aby]\$/i);
  });

  it("returns allowlisted summaries and clamps huge audit pages", async () => {
    await prisma.auditLog.create({ data: { actorId: adminId, action: "UPDATE", entity: "UNKNOWN_ENTITY", entityId: "private", before: { apiKey: "api-secret", authorization: "bearer-secret", cookie: "cookie-secret", privateKey: "key-secret", feedback: "private feedback" }, after: { safe: "unknown must also stay hidden" } } });
    const visible = await listAuditLogs(actor(), { page: 1, pageSize: 100 });
    const result = await listAuditLogs(actor(), { page: 9_007_199_254_740_991, pageSize: 25 });
    expect(result.page).toBeLessThanOrEqual(Math.max(1, Math.ceil(result.total / result.pageSize)));
    const serialized = JSON.stringify(visible.rows);
    expect(serialized).not.toMatch(/api-secret|bearer-secret|cookie-secret|key-secret|private feedback|unknown must also stay hidden/);
    expect(visible.rows.every((row) => "summary" in row && !("before" in row) && !("after" in row))).toBe(true);
  });

  it("deeply reconstructs composite audit fields and rejects unknown actions and nested secrets", () => {
    const summary = buildAuditSummary("USER", "UPDATE", {
      username: "E001",
      roles: ["ADMIN", "ROOT", { code: "MENTOR", passwordHash: "nested-hash" }, ["SUPERVISOR"]],
      traineeId: "t1",
      enabled: true,
      profile: { apiKey: "nested-api-key" },
    }, {
      username: "E002",
      roles: ["MENTOR", "MENTOR"],
      authorization: { cookie: "nested-cookie", privateKey: "nested-key" },
    });
    expect(summary).toEqual({
      before: { username: "E001", roles: ["ADMIN"], traineeId: "t1", enabled: true },
      after: { username: "E002", roles: ["MENTOR"] },
    });
    expect(JSON.stringify(summary)).not.toMatch(/ROOT|nested-hash|nested-api-key|nested-cookie|nested-key/);

    const task = buildAuditSummary("TRAINING_TASK", "UPDATE", null, {
      stableImportKey: "PLAN-001", day: 1, stage: "P1", dimension: "D1", dimensionName: "机械运动",
      sortOrder: 1, enabled: true,
      references: [
        { title: "安全资料", url: "https://example.test", sortOrder: 1, passwordHash: "reference-hash" },
        { title: { notes: "nested note" }, url: "https://bad.test", sortOrder: 2 },
      ],
      notes: "free-form note", feedback: "private feedback",
    });
    expect(task.after).toMatchObject({ references: [{ title: "安全资料", url: "https://example.test", sortOrder: 1 }] });
    expect(JSON.stringify(task)).not.toMatch(/reference-hash|nested note|free-form note|private feedback/);
    expect(buildAuditSummary("USER", "IMPORT", { username: "must-hide" }, null)).toEqual({ before: null, after: null });
  });
});
