import { APP_CONFIG } from "@/config/app.config";

export const PROGRESS_RULES = {
  currentDay: {
    minimum: 0,
    maximum: APP_CONFIG.trainingDays,
  },
  taskVisibility: "ALL_DIMENSIONS",
  emptyDenominatorStatus: "NO_TASKS",
} as const;

export type ProgressRules = typeof PROGRESS_RULES;
export type ProgressRuleKey = keyof ProgressRules;
export type ProgressRuleValue = ProgressRules[ProgressRuleKey];
