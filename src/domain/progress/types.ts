import type { DimensionCode } from "@/config/dimensions.config";

export type FocusGroup = Exclude<DimensionCode, "Dall">;

export type TrainingStage = "P1" | "P2" | "P3" | "P4";

export type TrainingTask = Readonly<{
  id: string;
  day: number;
  stage: TrainingStage;
  dimension: DimensionCode;
  enabled: boolean;
  action: string | null;
  drill: string | null;
}>;

export type ProgressRow = Readonly<{
  taskId: string;
  learnDone: boolean;
  actionDone: boolean;
  drillDone: boolean;
}>;

export type Metric = Readonly<{
  numerator: number;
  denominator: number;
  rate: number | null;
}>;

export type FocusProgress = Readonly<{
  dimension: FocusGroup;
  learn: Metric;
}>;

export type ProgressSummary = Readonly<{
  learn: Metric;
  due: Metric;
  action: Metric;
  drill: Metric;
  overdueCount: number;
  focus: FocusProgress;
  dimensions: Readonly<Record<DimensionCode, Metric>>;
  stages: Readonly<Record<TrainingStage, Metric>>;
}>;

export type CurrentDayInput = Readonly<{
  trainingStartDate: Date;
  today: Date;
  trainingDayOverride: number | null;
  durationDays: number;
}>;

export type RiskLevel = "ON_TRACK" | "ATTENTION" | "HIGH_RISK";
