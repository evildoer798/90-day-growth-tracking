import { hash } from "bcryptjs";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import type { PermissionActor } from "@/domain/permissions/types";
import { DIMENSIONS } from "@/config/dimensions.config";
import { addBusinessDays, toBusinessDate } from "@/domain/dates/business-date";
import { requireManageUsers } from "@/server/auth/require-permission";
import { type AdminTransaction, withAdminTransaction } from "@/server/services/admin-transaction";
import {
  getTrainingDurationDays,
  getTrainingPlanSettings,
  TRAINING_PLAN_MAX_DAYS,
  TRAINING_PLAN_MIN_DAYS,
  TRAINING_PLAN_SETTINGS_ID,
} from "@/server/services/training-plan-settings.service";
export { buildAuditSummary } from "@/features/admin/audit-summary";
import { buildAuditSummary } from "@/features/admin/audit-summary";

type Transaction = AdminTransaction;

const nonEmpty = z.string().trim().min(1, "此项为必填项").max(5000);
const id = z.string().trim().min(1, "缺少记录 ID").max(128);
const employeeId = z.string().trim().min(1, "工号不能为空").max(64)
  .transform((value) => value.toUpperCase());
const dateText = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));
const nullableText = z.union([z.string().trim().max(5000), z.null()])
  .transform((value) => value === "" ? null : value);
const roleCode = z.enum(["ADMIN", "SUPERVISOR", "MENTOR", "TRAINEE"]);
const focusGroup = z.enum(["D1", "D2", "D3", "D4"]);
const dimension = z.enum(["D1", "D2", "D3", "D4", "Dall"]);
const stage = z.enum(["P1", "P2", "P3", "P4"]);
const confirmation = z.literal(true, { error: "请先明确确认此操作" });
const reference = z.object({
  title: nonEmpty.max(300),
  url: z.url("资料链接格式无效").refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "资料链接仅支持 HTTP 或 HTTPS"),
}).strict();

export const createTraineeSchema = z.object({
  name: nonEmpty.max(100),
  employeeId,
  focusGroup,
  trainingStartDate: dateText,
  trainingDayOverride: z.number().int().min(0).max(TRAINING_PLAN_MAX_DAYS).nullable().optional(),
}).strict();

export const updateTraineeSchema = createTraineeSchema.extend({ id });

const createTraineeSchemaForDuration = (durationDays: number) =>
  createTraineeSchema.superRefine((value, context) => {
    if (value.trainingDayOverride !== null &&
      value.trainingDayOverride !== undefined &&
      value.trainingDayOverride > durationDays) {
      context.addIssue({
        code: "custom",
        path: ["trainingDayOverride"],
        message: `Day 覆盖不能超过当前培养计划总天数（${durationDays} 天）`,
      });
    }
  });

const updateTraineeSchemaForDuration = (durationDays: number) =>
  updateTraineeSchema.superRefine((value, context) => {
    if (value.trainingDayOverride !== null &&
      value.trainingDayOverride !== undefined &&
      value.trainingDayOverride > durationDays) {
      context.addIssue({
        code: "custom",
        path: ["trainingDayOverride"],
        message: `Day 覆盖不能超过当前培养计划总天数（${durationDays} 天）`,
      });
    }
  });
export const toggleTraineeSchema = z.object({ id, enabled: z.boolean(), confirm: confirmation }).strict();

export const createUserSchema = z.object({
  username: employeeId,
  password: z.string().min(8, "密码至少 8 位").max(1024),
  roles: z.array(roleCode).min(1, "至少选择一个角色").max(4),
  traineeId: z.string().trim().min(1).max(128).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.roles.includes("TRAINEE") !== Boolean(value.traineeId)) {
    context.addIssue({ code: "custom", path: ["traineeId"], message: "新人角色必须且只能关联一个新人档案" });
  }
  if (value.roles.includes("TRAINEE") && value.roles.length !== 1) {
    context.addIssue({ code: "custom", path: ["roles"], message: "新人角色不能与管理员、主管或导师角色同时设置" });
  }
});

export const updateUserSchema = z.object({
  id,
  username: employeeId,
  roles: z.array(roleCode).min(1).max(4),
  traineeId: z.string().trim().min(1).max(128).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.roles.includes("TRAINEE") !== Boolean(value.traineeId)) {
    context.addIssue({ code: "custom", path: ["traineeId"], message: "新人角色必须且只能关联一个新人档案" });
  }
  if (value.roles.includes("TRAINEE") && value.roles.length !== 1) {
    context.addIssue({ code: "custom", path: ["roles"], message: "新人角色不能与管理员、主管或导师角色同时设置" });
  }
});

export const resetPasswordSchema = z.object({
  id,
  password: z.string().min(8, "密码至少 8 位").max(1024),
  confirm: confirmation,
}).strict();
export const toggleUserSchema = z.object({ id, enabled: z.boolean(), confirm: confirmation }).strict();

export const relationSchema = z.object({
  traineeId: id,
  userId: id,
  type: z.enum(["MENTOR", "SUPERVISOR"]),
  isPrimary: z.boolean(),
  startDate: dateText,
  endDate: z.union([dateText, z.null()]).optional(),
  confirm: confirmation,
}).strict().superRefine((value, context) => {
  if (value.endDate && value.endDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "结束日期不能早于开始日期" });
  }
});

export const taskSchema = z.object({
  id,
  day: z.number().int().min(1).max(TRAINING_PLAN_MAX_DAYS),
  stage,
  dimension,
  dimensionName: nonEmpty.max(100),
  task: nonEmpty,
  action: nullableText.optional().default(null),
  drill: nullableText.optional().default(null),
  sortOrder: z.number().int().min(0).max(100000),
  references: z.array(reference).max(30),
}).strict().superRefine((value, context) => {
  if (DIMENSIONS[value.dimension].name !== value.dimensionName) {
    context.addIssue({ code: "custom", path: ["dimensionName"], message: "维度名称与维度代码不匹配" });
  }
});

const taskSchemaForDuration = (durationDays: number) =>
  taskSchema.superRefine((value, context) => {
    if (value.day > durationDays) {
      context.addIssue({
        code: "custom",
        path: ["day"],
        message: `任务 Day 不能超过当前培养计划总天数（${durationDays} 天）`,
      });
    }
  });
export const toggleTaskSchema = z.object({ id, enabled: z.boolean(), confirm: confirmation }).strict();
export const updateTrainingPlanDurationSchema = z.object({
  delta: z.union([z.literal(-1), z.literal(1)]),
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

export class TrainingPlanRevisionConflictError extends Error {
  constructor() {
    super("培养计划天数已被其他操作更新，请刷新后重试");
    this.name = "TrainingPlanRevisionConflictError";
  }
}

export class TrainingPlanDurationRangeError extends Error {
  constructor() {
    super(`培养计划总天数范围为 ${TRAINING_PLAN_MIN_DAYS} 至 ${TRAINING_PLAN_MAX_DAYS} 天`);
    this.name = "TrainingPlanDurationRangeError";
  }
}

const toJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const audit = async (
  tx: Transaction,
  actorId: string,
  action: "CREATE" | "UPDATE" | "ENABLE" | "DISABLE",
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
) => tx.auditLog.create({ data: {
  actorId, action, entity, entityId,
  before: before === null ? undefined : toJson(before),
  after: after === null ? undefined : toJson(after),
} });

const traineeSnapshot = (value: {
  id: string; name: string; employeeId: string; focusGroup: string;
  trainingStartDate: Date; trainingDayOverride: number | null; enabled: boolean;
}) => ({
  id: value.id,
  name: value.name,
  employeeId: value.employeeId,
  focusGroup: value.focusGroup,
  trainingStartDate: value.trainingStartDate.toISOString().slice(0, 10),
  trainingDayOverride: value.trainingDayOverride,
  enabled: value.enabled,
});

const assertUniqueEmployeeId = async (tx: Transaction, normalized: string, excludeId?: string) => {
  const duplicate = await tx.trainee.findFirst({
    where: { employeeId: normalized, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new Error("工号已存在，不能合并人员档案");
};

export async function createTrainee(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  return withAdminTransaction(actor.userId, async (tx) => {
    const durationDays = await getTrainingDurationDays(tx);
    const value = createTraineeSchemaForDuration(durationDays).parse(input);
    await assertUniqueEmployeeId(tx, value.employeeId);
    const created = await tx.trainee.create({ data: value });
    await audit(tx, actor.userId, "CREATE", "TRAINEE", created.id, null, traineeSnapshot(created));
    return created;
  });
}

export async function updateTrainee(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  return withAdminTransaction(actor.userId, async (tx) => {
    const durationDays = await getTrainingDurationDays(tx);
    const value = updateTraineeSchemaForDuration(durationDays).parse(input);
    await tx.$queryRaw`SELECT "id" FROM "Trainee" WHERE "id" = ${value.id} FOR UPDATE`;
    const current = await tx.trainee.findUniqueOrThrow({ where: { id: value.id } });
    await assertUniqueEmployeeId(tx, value.employeeId, value.id);
    const { id: traineeId, ...data } = value;
    const updated = await tx.trainee.update({ where: { id: traineeId }, data });
    await audit(tx, actor.userId, "UPDATE", "TRAINEE", traineeId, traineeSnapshot(current), traineeSnapshot(updated));
    return updated;
  });
}

export async function setTraineeEnabled(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = toggleTraineeSchema.parse(input);
  return withAdminTransaction(actor.userId, async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Trainee" WHERE "id" = ${value.id} FOR UPDATE`;
    const current = await tx.trainee.findUniqueOrThrow({ where: { id: value.id } });
    const updated = await tx.trainee.update({ where: { id: value.id }, data: { enabled: value.enabled } });
    await audit(tx, actor.userId, value.enabled ? "ENABLE" : "DISABLE", "TRAINEE", value.id, traineeSnapshot(current), traineeSnapshot(updated));
    return updated;
  });
}

const userSnapshot = (value: { id: string; username: string; enabled: boolean; traineeId: string | null }, roles: readonly string[]) => ({
  id: value.id, username: value.username, enabled: value.enabled, traineeId: value.traineeId, roles: [...roles].sort(),
});

async function assertUserTarget(tx: Transaction, traineeId: string | null | undefined) {
  if (!traineeId) return;
  await tx.$queryRaw`SELECT "id" FROM "Trainee" WHERE "id" = ${traineeId} FOR UPDATE`;
  const target = await tx.trainee.findUnique({ where: { id: traineeId }, select: { enabled: true } });
  if (!target?.enabled) throw new Error("关联的新人档案不存在或已停用");
}

export async function createUser(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = createUserSchema.parse(input);
  const passwordHash = await hash(value.password, 12);
  return withAdminTransaction(actor.userId, async (tx) => {
    await assertUserTarget(tx, value.traineeId);
    if (await tx.user.findUnique({ where: { username: value.username }, select: { id: true } })) throw new Error("登录工号已存在");
    const created = await tx.user.create({ data: {
      username: value.username, passwordHash, traineeId: value.traineeId ?? null,
      roles: { create: [...new Set(value.roles)].map((code) => ({ role: { connect: { code } } })) },
    } });
    await audit(tx, actor.userId, "CREATE", "USER", created.id, null, userSnapshot(created, value.roles));
    return userSnapshot(created, value.roles);
  });
}

export async function updateUser(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = updateUserSchema.parse(input);
  return withAdminTransaction(actor.userId, async (tx) => {
    await assertUserTarget(tx, value.traineeId);
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${value.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: value.id }, include: { roles: { include: { role: true } } } });
    const duplicate = await tx.user.findFirst({ where: { username: value.username, id: { not: value.id } }, select: { id: true } });
    if (duplicate) throw new Error("登录工号已存在");
    const roles = [...new Set(value.roles)];
    const roleRecords = await tx.role.findMany({ where: { code: { in: roles } }, select: { id: true, code: true } });
    if (roleRecords.length !== roles.length) throw new Error("角色配置不完整");
    await tx.userRole.deleteMany({ where: { userId: value.id } });
    await tx.userRole.createMany({ data: roleRecords.map((role) => ({ userId: value.id, roleId: role.id })) });
    const updated = await tx.user.update({ where: { id: value.id }, data: { username: value.username, traineeId: value.traineeId ?? null } });
    await audit(tx, actor.userId, "UPDATE", "USER", value.id,
      userSnapshot(current, current.roles.map(({ role }) => role.code)), userSnapshot(updated, roles));
    return userSnapshot(updated, roles);
  });
}

export async function resetUserPassword(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = resetPasswordSchema.parse(input);
  const passwordHash = await hash(value.password, 12);
  return withAdminTransaction(actor.userId, async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${value.id} FOR UPDATE`;
    await tx.user.update({ where: { id: value.id }, data: { passwordHash } });
    await audit(tx, actor.userId, "UPDATE", "USER_PASSWORD", value.id, null, { passwordReset: true });
    return { success: true as const };
  });
}

export async function setUserEnabled(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = toggleUserSchema.parse(input);
  if (!value.enabled && value.id === actor.userId) throw new Error("不能停用当前登录账户");
  return withAdminTransaction(actor.userId, async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${value.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: value.id }, include: { roles: { include: { role: true } } } });
    const updated = await tx.user.update({ where: { id: value.id }, data: { enabled: value.enabled } });
    const roles = current.roles.map(({ role }) => role.code);
    await audit(tx, actor.userId, value.enabled ? "ENABLE" : "DISABLE", "USER", value.id,
      userSnapshot(current, roles), userSnapshot(updated, roles));
    return userSnapshot(updated, roles);
  });
}

export async function replaceReviewerRelation(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = relationSchema.parse(input);
  return withAdminTransaction(actor.userId, async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Trainee" WHERE "id" = ${value.traineeId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${value.userId} FOR UPDATE`;
    const trainee = await tx.trainee.findUnique({ where: { id: value.traineeId }, select: { id: true, enabled: true } });
    const reviewer = await tx.user.findUnique({ where: { id: value.userId }, include: { roles: { include: { role: true } } } });
    if (!reviewer?.enabled || !trainee?.enabled) throw new Error("人员不存在或已停用");
    if (reviewer.traineeId === trainee.id) throw new Error("不能将新人指定为自己的审核人");
    if (!reviewer.roles.some(({ role }) => role.code === value.type)) throw new Error("审核人角色与关系类型不匹配");
    const enabledRelations = await tx.userTraineeRelation.findMany({
      where: { traineeId: value.traineeId, type: value.type, enabled: true },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    const newStart = toBusinessDate(value.startDate);
    const newEnd = value.endDate ? toBusinessDate(value.endDate) : null;
    const dayBeforeStart = addBusinessDays(newStart, -1);
    for (const relation of enabledRelations) {
      const relationStart = toBusinessDate(relation.startDate);
      const relationEnd = relation.endDate ? toBusinessDate(relation.endDate) : null;
      if (relationStart < newStart) {
        if (relationEnd === null || relationEnd >= newStart) {
          await tx.userTraineeRelation.update({ where: { id: relation.id }, data: { endDate: dayBeforeStart } });
        }
        continue;
      }
      if (relationStart > newStart && newEnd !== null && relationStart > newEnd) {
        continue;
      }
      await tx.userTraineeRelation.update({
        where: { id: relation.id },
        data: { enabled: false, endDate: relation.startDate },
      });
    }
    const created = await tx.userTraineeRelation.create({ data: {
      traineeId: value.traineeId, userId: value.userId, type: value.type,
      isPrimary: value.isPrimary, startDate: newStart, endDate: newEnd,
      enabled: true,
    } });
    await audit(tx, actor.userId, "UPDATE", "REVIEWER_RELATION", created.id,
      enabledRelations.map(({ id, userId, startDate, endDate, enabled }) => ({ id, userId, startDate, endDate, enabled })),
      { id: created.id, userId: created.userId, traineeId: created.traineeId, type: created.type, isPrimary: created.isPrimary, startDate: created.startDate, endDate: created.endDate, enabled: created.enabled });
    return created;
  });
}

const taskSnapshot = (value: {
  stableImportKey: string; day: number; stage: string; dimension: string;
  dimensionName: string; task: string; action: string | null; drill: string | null; sortOrder: number;
  enabled: boolean; references: Array<{ title: string; url: string; sortOrder: number }>;
}) => ({
  stableImportKey: value.stableImportKey, day: value.day, stage: value.stage,
  dimension: value.dimension, dimensionName: value.dimensionName, task: value.task, action: value.action,
  drill: value.drill, sortOrder: value.sortOrder, enabled: value.enabled,
  references: value.references.map(({ title, url, sortOrder }) => ({ title, url, sortOrder })),
});

const trainingPlanSettingsSnapshot = (value: { id: string; durationDays: number; revision: number }) => ({
  id: value.id,
  durationDays: value.durationDays,
  revision: value.revision,
});

export async function updateTrainingPlanDuration(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = updateTrainingPlanDurationSchema.parse(input);
  return withAdminTransaction(actor.userId, async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "TrainingPlanSettings"
      WHERE "id" = ${TRAINING_PLAN_SETTINGS_ID}
      FOR UPDATE
    `;
    const current = await getTrainingPlanSettings(tx);
    if (current.revision !== value.expectedRevision) {
      throw new TrainingPlanRevisionConflictError();
    }

    const durationDays = current.durationDays + value.delta;
    if (durationDays < TRAINING_PLAN_MIN_DAYS || durationDays > TRAINING_PLAN_MAX_DAYS) {
      throw new TrainingPlanDurationRangeError();
    }

    const updated = await tx.trainingPlanSettings.update({
      where: { id: TRAINING_PLAN_SETTINGS_ID, revision: value.expectedRevision },
      data: { durationDays, revision: { increment: 1 } },
      select: { id: true, durationDays: true, revision: true, updatedAt: true },
    });
    await audit(
      tx,
      actor.userId,
      "UPDATE",
      "TRAINING_PLAN_SETTINGS",
      TRAINING_PLAN_SETTINGS_ID,
      trainingPlanSettingsSnapshot(current),
      trainingPlanSettingsSnapshot(updated),
    );
    return updated;
  });
}

export async function updateTrainingTask(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  return withAdminTransaction(actor.userId, async (tx) => {
    const durationDays = await getTrainingDurationDays(tx);
    const value = taskSchemaForDuration(durationDays).parse(input);
    await tx.$queryRaw`SELECT "id" FROM "TrainingTask" WHERE "id" = ${value.id} FOR UPDATE`;
    const current = await tx.trainingTask.findUniqueOrThrow({ where: { id: value.id }, include: { references: { orderBy: { sortOrder: "asc" } } } });
    const before = taskSnapshot(current);
    const next = { ...current, ...value, references: value.references.map((item, index) => ({ ...item, sortOrder: index + 1 })) };
    const after = taskSnapshot(next);
    if (JSON.stringify(before) === JSON.stringify(after)) return current;
    const { id: taskId, references, ...data } = value;
    const updated = await tx.trainingTask.update({ where: { id: taskId }, data });
    await tx.taskReference.deleteMany({ where: { taskId } });
    if (references.length) await tx.taskReference.createMany({ data: references.map((item, index) => ({ taskId, ...item, sortOrder: index + 1 })) });
    await tx.taskVersion.create({ data: { taskId, actorId: actor.userId, before: toJson(before), after: toJson(after) } });
    await audit(tx, actor.userId, "UPDATE", "TRAINING_TASK", taskId, before, after);
    return updated;
  });
}

export async function setTrainingTaskEnabled(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = toggleTaskSchema.parse(input);
  return withAdminTransaction(actor.userId, async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TrainingTask" WHERE "id" = ${value.id} FOR UPDATE`;
    const current = await tx.trainingTask.findUniqueOrThrow({ where: { id: value.id }, include: { references: { orderBy: { sortOrder: "asc" } } } });
    const before = taskSnapshot(current);
    const after = taskSnapshot({ ...current, enabled: value.enabled });
    const updated = await tx.trainingTask.update({ where: { id: value.id }, data: { enabled: value.enabled } });
    await tx.taskVersion.create({ data: { taskId: value.id, actorId: actor.userId, before: toJson(before), after: toJson(after) } });
    await audit(tx, actor.userId, value.enabled ? "ENABLE" : "DISABLE", "TRAINING_TASK", value.id, before, after);
    return updated;
  });
}

export async function listAuditLogs(actor: PermissionActor, input: unknown) {
  requireManageUsers(actor);
  const value = z.object({ page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1), pageSize: z.number().int().min(1).max(100).default(25) }).strict().parse(input);
  return withAdminTransaction(actor.userId, async (tx) => {
    const total = await tx.auditLog.count();
    const maxPage = Math.max(1, Math.ceil(total / value.pageSize));
    const page = Math.min(value.page, maxPage);
    const rows = await tx.auditLog.findMany({
      select: { id: true, action: true, entity: true, entityId: true, before: true, after: true, createdAt: true, actor: { select: { username: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * value.pageSize, take: value.pageSize,
    });
    return { page, pageSize: value.pageSize, total, rows: rows.map(({ before, after, ...row }) => ({ ...row, summary: buildAuditSummary(row.entity, row.action, before, after) })) };
  });
}
