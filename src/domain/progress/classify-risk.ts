import { RISK_RULES } from "@/config/risk-rules.config";
import type { ProgressSummary, RiskLevel } from "@/domain/progress/types";

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
}

export const assessRisk = (summary: ProgressSummary): RiskAssessment => {
  if (
    summary.overdueCount >= RISK_RULES.highRiskOverdueCount
  ) {
    return {
      level: "HIGH_RISK",
      reason: `${summary.overdueCount} 项学习任务逾期`,
    };
  }

  if (summary.due.rate !== null && summary.due.rate < RISK_RULES.highRiskDueRate) {
    return {
      level: "HIGH_RISK",
      reason: `截至今日完成率低于 ${Math.round(RISK_RULES.highRiskDueRate * 100)}%`,
    };
  }

  if (summary.overdueCount >= RISK_RULES.attentionOverdueCount) {
    return {
      level: "ATTENTION",
      reason: `${summary.overdueCount} 项学习任务逾期`,
    };
  }

  return {
    level: "ON_TRACK",
    reason: summary.overdueCount === 0 ? "当前没有逾期任务" : "当前进度稳定",
  };
};

export const classifyRisk = (summary: ProgressSummary): RiskLevel =>
  assessRisk(summary).level;
