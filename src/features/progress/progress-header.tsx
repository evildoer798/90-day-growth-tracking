import { Badge } from "@/components/ui/badge";
import { DIMENSIONS, type DimensionCode } from "@/config/dimensions.config";
import { STAGES } from "@/config/stages.config";
import type { FocusGroup, TrainingStage } from "@/domain/progress/types";

const stageDetails = (stage: TrainingStage | undefined) =>
  Object.values(STAGES).find(({ code }) => code === stage);

export interface ProgressHeaderProps {
  name: string;
  employeeId: string;
  focusGroup: FocusGroup;
  currentDay: number;
  durationDays: number;
  stage?: TrainingStage;
}

export function ProgressHeader({
  name,
  employeeId,
  focusGroup,
  currentDay,
  durationDays,
  stage,
}: ProgressHeaderProps) {
  const currentStage = stageDetails(stage);
  const focus = DIMENSIONS[focusGroup as DimensionCode];

  return (
    <header className="progress-header">
      <div className="progress-header__title-row">
        <div>
          <p className="progress-header__eyebrow">新人培养工作台</p>
          <h1 id="progress-page-heading">{name}的 {durationDays} 天成长进度</h1>
        </div>
        <Badge variant="primary">Day {currentDay}</Badge>
      </div>
      <div className="progress-header__meta" aria-label="新人基本信息">
        <span>工号 {employeeId}</span>
        <span>重点方向：{focusGroup} · {focus.name}</span>
        {currentStage ? <span>当前阶段：{currentStage.code} · {currentStage.label}</span> : null}
      </div>
    </header>
  );
}
