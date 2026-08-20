import Link from "next/link";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DIMENSIONS } from "@/config/dimensions.config";
import { STAGES } from "@/config/stages.config";
import type { Metric, RiskLevel, TrainingStage } from "@/domain/progress/types";
import type { RoleDashboardTraineeDto } from "@/server/services/dashboard.service";

const STAGE_LABELS = Object.fromEntries(
  Object.values(STAGES).map(({ code, label }) => [code, label]),
) as Record<TrainingStage, string>;

const RISK_LABELS: Record<RiskLevel, string> = {
  ON_TRACK: "进度稳定",
  ATTENTION: "需要关注",
  HIGH_RISK: "高风险",
};

const RISK_VARIANTS: Record<RiskLevel, BadgeProps["variant"]> = {
  ON_TRACK: "success",
  ATTENTION: "warning",
  HIGH_RISK: "danger",
};

export const formatDashboardMetric = (metric: Metric): string =>
  metric.rate === null ? "暂无任务" : `${Math.round(metric.rate * 100)}%`;

const reviewerLabel = (reviewer: RoleDashboardTraineeDto["reviewers"][number]) => {
  const role = reviewer.role === "MENTOR" ? "导师" : "主管";
  return `${reviewer.primary ? "主" : ""}${role} ${reviewer.employeeId}`;
};

const accessLabel = (item: RoleDashboardTraineeDto): string => {
  if (item.accessReason === "MENTOR_ASSIGNMENT" && !item.assigned) {
    return "可协作（导师权限）";
  }
  if (item.accessReason === "ADMIN_OVERRIDE") {
    return "管理员可操作";
  }
  return item.canConfirm ? "可确认" : "只读";
};

export interface AssignedTraineeCardProps {
  item: RoleDashboardTraineeDto;
  showReviewers?: boolean;
  readOnly?: boolean;
}

export function AssignedTraineeCard({ item, showReviewers = true, readOnly = false }: AssignedTraineeCardProps) {
  const { trainee } = item;
  const canAct = item.canConfirm && !readOnly;
  const headingId = `trainee-summary-${trainee.id}`;
  return (
    <Card
      aria-label={`${trainee.name}的培养概览`}
      className={canAct ? "assigned-trainee-card" : "assigned-trainee-card assigned-trainee-card--readonly"}
      role="article"
    >
      <div className="assigned-trainee-card__header">
        <div>
          <p className="assigned-trainee-card__employee">{trainee.employeeId}</p>
          <h2 id={headingId}>{trainee.name}</h2>
        </div>
        <div className="assigned-trainee-card__badges">
          <Badge variant={canAct ? "primary" : "neutral"}>
            {readOnly ? "只读" : accessLabel(item)}
          </Badge>
          <Badge variant={RISK_VARIANTS[item.risk.level]}>{RISK_LABELS[item.risk.level]}</Badge>
        </div>
      </div>

      <div className="assigned-trainee-card__timeline">
        <strong>Day {trainee.currentDay}</strong>
        <span>{item.stage ? `${item.stage} · ${STAGE_LABELS[item.stage]}` : "阶段待定"}</span>
      </div>

      <dl className="assigned-trainee-card__metrics">
        <div>
          <dt>总计划完成率</dt>
          <dd><strong>{formatDashboardMetric(item.learn)}</strong><span>{item.learn.numerator} / {item.learn.denominator}</span></dd>
        </div>
        <div>
          <dt>截至今日完成率</dt>
          <dd><strong>{formatDashboardMetric(item.due)}</strong><span>{item.due.numerator} / {item.due.denominator}</span></dd>
        </div>
        <div>
          <dt>逾期</dt>
          <dd><strong>{item.overdueCount} 项</strong></dd>
        </div>
        <div>
          <dt>待确认</dt>
          <dd><strong>{item.pendingConfirmationCount} 项</strong></dd>
        </div>
      </dl>

      <div className="assigned-trainee-card__context">
        <p>重点 {trainee.focusGroup} · {DIMENSIONS[trainee.focusGroup].name}</p>
        {showReviewers ? <p>{item.reviewers.length > 0 ? item.reviewers.map(reviewerLabel).join(" · ") : "尚未分配导师或主管"}</p> : null}
        <p className="assigned-trainee-card__risk-reason">{item.risk.reason}</p>
      </div>

      <Link
        aria-label={canAct ? `进入${trainee.name}的培养进度` : "查看只读进度"}
        className="assigned-trainee-card__link"
        href={`/progress/${trainee.id}`}
      >
        {canAct ? "进入培养进度" : "查看只读进度"}
      </Link>
    </Card>
  );
}
