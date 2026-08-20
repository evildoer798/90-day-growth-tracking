import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { PermissionActor } from "@/domain/permissions/types";
import type { ImportPreview } from "@/domain/import/training-plan-schema";
import { assertSafeXlsxArchive } from "@/domain/import/xlsx-safety";
import { requireManageUsers } from "@/server/auth/require-permission";
import { applyTrainingPlanImport, prepareTrainingPlanImport } from "@/server/services/training-plan-import.service";
import type { TrainingPlanImportSettingsSnapshot } from "@/server/services/training-plan-import.service";
import {
  TRAINING_PLAN_MAX_DAYS,
  TRAINING_PLAN_MIN_DAYS,
} from "@/server/services/training-plan-settings.service";

const classification = z.enum(["create", "update", "disable-candidate", "skip", "warning", "error"]);
const taskDimension = z.enum(["D1", "D2", "D3", "D4", "Dall"]);
const taskReference = z.object({ title: z.string(), url: z.string(), sortOrder: z.number().int() }).strict();
const taskRow = z.object({
  stableImportKey: z.string(), milestone: z.string().nullable(), day: z.number().int().min(TRAINING_PLAN_MIN_DAYS).max(TRAINING_PLAN_MAX_DAYS), stage: z.enum(["P1", "P2", "P3", "P4"]),
  dimension: taskDimension, dimensionName: z.string(), task: z.string(), action: z.string().nullable(),
  drill: z.string().nullable(), sortOrder: z.number().int(), references: z.array(taskReference),
  referencesAmbiguous: z.boolean(),
}).strict();
const existingTask = taskRow.extend({ id: z.string(), enabled: z.boolean() });
const previewSchema = z.object({
  checksum: z.string().min(1), fileName: z.string().min(1), rows: z.array(taskRow),
  items: z.array(z.object({
    classification, stableImportKey: z.string().optional(), existingId: z.string().optional(),
    message: z.string().optional(), row: taskRow.optional(), before: existingTask.optional(),
  }).strict()),
  counts: z.object({
    create: z.number().int().nonnegative(), update: z.number().int().nonnegative(),
    "disable-candidate": z.number().int().nonnegative(), skip: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(), error: z.number().int().nonnegative(),
  }).strict(),
  canApply: z.boolean(),
}).strict().superRefine((value, context) => {
  for (const key of classification.options) {
    const actual = value.items.filter((item) => item.classification === key).length;
    if (value.counts[key] !== actual) context.addIssue({ code: "custom", path: ["counts", key], message: "预览统计与逐行结果不一致" });
  }
  if (value.canApply !== (value.counts.error === 0)) context.addIssue({ code: "custom", path: ["canApply"], message: "预览可执行状态不一致" });
});

const trainingPlanSnapshotSchema = z.object({
  durationDays: z.number().int().min(TRAINING_PLAN_MIN_DAYS).max(TRAINING_PLAN_MAX_DAYS),
  revision: z.number().int().nonnegative(),
}).strict();

const envelopeSchema = z.object({
  version: z.literal(3),
  actorId: z.string().min(1).max(128),
  nonce: z.string().min(16).max(256),
  expiresAt: z.number().int().positive(),
  trainingPlan: trainingPlanSnapshotSchema,
  preview: previewSchema,
}).strict().superRefine((value, context) => {
  const taskRows = [
    ...value.preview.rows,
    ...value.preview.items.flatMap((item) => [item.row, item.before].filter((row) => row !== undefined)),
  ];
  for (const [index, row] of taskRows.entries()) {
    if (row && row.day > value.trainingPlan.durationDays) {
      context.addIssue({
        code: "custom",
        path: ["preview", "rows", index, "day"],
        message: `Day ${row.day} 超出当前 ${value.trainingPlan.durationDays} 天培养计划`,
      });
    }
  }
});

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/octet-stream",
]);

export interface WorkbookUpload {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function readValidatedWorkbookFile(file: WorkbookUpload): Promise<Buffer> {
  if (file.size <= 0) throw new Error("Excel 工作簿为空");
  if (file.size > MAX_WORKBOOK_BYTES) throw new Error("Excel 工作簿超过 10 MB 限制");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("仅支持 .xlsx 工作簿");
  if (!XLSX_MIME_TYPES.has(file.type.toLowerCase())) throw new Error("Excel 文件类型不受支持");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) throw new Error("Excel 文件读取不完整");
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    throw new Error("Excel 文件签名无效，不是有效的 XLSX 工作簿");
  }
  assertSafeXlsxArchive(buffer);
  return buffer;
}

export function createImportPreviewToken(
  preview: ImportPreview,
  actorId: string,
  secret: string,
  trainingPlan: TrainingPlanImportSettingsSnapshot,
  now = Date.now(),
  nonce = randomBytes(32).toString("base64url"),
): string {
  if (secret.length < 16) throw new Error("导入签名配置无效");
  const checked = previewSchema.parse(preview);
  const envelope = envelopeSchema.parse({
    version: 3,
    actorId,
    nonce,
    expiresAt: now + 30 * 60_000,
    trainingPlan,
    preview: checked,
  });
  const payload = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readImportPreviewToken(token: string, actorId: string, secret: string, now = Date.now()) {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra || secret.length < 16) throw new Error("导入预览令牌无效或已被篡改");
  const expected = sign(payload, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error("导入预览令牌无效或已被篡改");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("导入预览令牌无效或已被篡改");
  }
  if (
    decoded !== null &&
    typeof decoded === "object" &&
    "version" in decoded &&
    decoded.version === 2
  ) {
    throw new Error("导入预览版本已过期，请重新上传 Excel");
  }
  const envelope = envelopeSchema.safeParse(decoded);
  if (!envelope.success) throw new Error("导入预览令牌无效或已被篡改");
  if (envelope.data.expiresAt <= now) throw new Error("导入预览已过期，请重新上传");
  if (envelope.data.actorId !== actorId) throw new Error("导入预览不属于当前管理员");
  return envelope.data;
}

export async function previewAdminImport(actor: PermissionActor, workbook: Buffer, secret: string) {
  requireManageUsers(actor);
  if (workbook.length === 0 || workbook.length > 10 * 1024 * 1024) throw new Error("工作簿为空或超过 10 MB");
  const { preview, trainingPlan } = await prepareTrainingPlanImport(workbook);
  return {
    preview,
    previewToken: createImportPreviewToken(
      preview,
      actor.userId,
      secret,
      trainingPlan,
      Date.now(),
      randomBytes(32).toString("base64url"),
    ),
  };
}

export async function applyImportPreviewToken(actor: PermissionActor, token: string, secret: string) {
  requireManageUsers(actor);
  const envelope = readImportPreviewToken(token, actor.userId, secret);
  if (!envelope.preview.canApply || envelope.preview.counts.error > 0) throw new Error("导入预览包含错误，不能执行");
  const nonceHash = createHash("sha256").update(envelope.nonce).digest("hex");
  return applyTrainingPlanImport(envelope.preview, actor.userId, {
    nonceHash,
    trainingPlan: envelope.trainingPlan,
  });
}
