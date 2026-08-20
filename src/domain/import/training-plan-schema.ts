import { z } from "zod";

import { APP_CONFIG } from "@/config/app.config";
import type { TrainingStage } from "@/domain/progress/types";

export const taskDimensionSchema = z.enum(["D1", "D2", "D3", "D4", "Dall"]);

export const requiredTrainingPlanHeaders = [
  "Milestone",
  "Day",
  "Stage",
  "Dimension",
  "DimensionName",
  "Task",
  "Reference",
  "ReferenceLink",
  "Action",
  "Drill",
] as const;

export const trainingPlanHeaderSchema = z
  .array(z.string())
  .superRefine((headers, context) => {
    for (const requiredHeader of requiredTrainingPlanHeaders) {
      if (!headers.includes(requiredHeader)) {
        context.addIssue({
          code: "custom",
          message: `Missing required header: ${requiredHeader}`,
        });
      }
    }
  });

const integerCellSchema = (maximumDay: number) => z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }
  return value;
}, z.number().int().min(1).max(maximumDay));

export const trainingStageSchema = z.preprocess((value) => {
  const text = String(value ?? "").trim().toUpperCase();
  return /^[1-4]$/.test(text) ? `P${text}` : text;
}, z.enum(["P1", "P2", "P3", "P4"]));

const requiredTextCellSchema = z.preprocess(
  (value) => (value === null || value === undefined ? "" : String(value).trim()),
  z.string().min(1),
);

const optionalCellSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])
  .optional();

export const createRawTrainingPlanRowSchema = (
  maximumDay: number = APP_CONFIG.trainingDays,
) => z.object({
  StableImportKey: optionalCellSchema,
  Milestone: optionalCellSchema,
  Day: integerCellSchema(maximumDay),
  Stage: trainingStageSchema,
  Dimension: taskDimensionSchema,
  DimensionName: requiredTextCellSchema,
  Task: requiredTextCellSchema,
  Reference: optionalCellSchema,
  ReferenceLink: optionalCellSchema,
  Action: optionalCellSchema,
  Drill: optionalCellSchema,
});

export const rawTrainingPlanRowSchema = createRawTrainingPlanRowSchema();

export type TaskDimension = z.infer<typeof taskDimensionSchema>;
export type RawTrainingPlanRow = z.infer<typeof rawTrainingPlanRowSchema>;

export interface ParsedTaskReference {
  title: string;
  url: string;
  sortOrder: number;
}

export interface ParsedTrainingPlanRow {
  stableImportKey: string;
  milestone: string | null;
  day: number;
  stage: TrainingStage;
  dimension: TaskDimension;
  dimensionName: string;
  task: string;
  action: string | null;
  drill: string | null;
  sortOrder: number;
  references: ParsedTaskReference[];
  referencesAmbiguous: boolean;
}

export type ImportClassification =
  | "create"
  | "update"
  | "disable-candidate"
  | "skip"
  | "warning"
  | "error";

export interface ImportIssue {
  classification: "warning" | "error";
  message: string;
  rowNumber?: number;
  stableImportKey?: string;
}

export interface ParsedTrainingPlan {
  checksum: string;
  fileName: string;
  rows: ParsedTrainingPlanRow[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

export interface ExistingTrainingTask extends ParsedTrainingPlanRow {
  id: string;
  enabled: boolean;
}

export interface ImportPreviewItem {
  classification: ImportClassification;
  stableImportKey?: string;
  existingId?: string;
  message?: string;
  row?: ParsedTrainingPlanRow;
  before?: ExistingTrainingTask;
}

export type ImportPreviewCounts = Record<ImportClassification, number>;

export interface ImportPreview {
  checksum: string;
  fileName: string;
  rows: ParsedTrainingPlanRow[];
  items: ImportPreviewItem[];
  counts: ImportPreviewCounts;
  canApply: boolean;
}
