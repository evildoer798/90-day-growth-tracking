import Link from "next/link";

import { DashboardScopeSummary } from "@/features/mentor/mentor-dashboard";
import { AssignedTraineeCard } from "@/features/trainee/assigned-trainee-card";
import type { SupervisorDashboardDto } from "@/server/services/dashboard.service";

export type TraineeScope = "assigned" | "all";

export interface TraineeScopeTabsProps {
  dashboard: SupervisorDashboardDto;
  scope: TraineeScope;
}

const TraineeGrid = ({
  items,
  emptyMessage,
}: {
  items: SupervisorDashboardDto["trainees"];
  emptyMessage: string;
}) =>
  items.length > 0 ? (
    <div className="assigned-trainee-grid">
      {items.map((item) => <AssignedTraineeCard item={item} key={item.trainee.id} />)}
    </div>
  ) : (
    <div className="role-dashboard__empty"><p>{emptyMessage}</p><span>关系或人员启用后会显示在这里。</span></div>
  );

export function TraineeScopeTabs({ dashboard, scope }: TraineeScopeTabsProps) {
  const assigned = dashboard.trainees.filter(({ assigned: isAssigned }) => isAssigned);
  const isAssignedScope = scope === "assigned";
  const items = isAssignedScope ? assigned : dashboard.trainees;
  const summary = isAssignedScope ? dashboard.assignedSummary : dashboard.allSummary;
  const panelLabel = isAssignedScope ? "我负责的新人" : "全部新人";
  return (
    <div className="ui-tabs trainee-scope-tabs">
      <nav aria-label="新人查看范围" className="ui-tabs__list">
        <Link
          aria-current={isAssignedScope ? "page" : undefined}
          className="ui-tabs__trigger"
          href="/supervisor"
        >
          我负责的新人
        </Link>
        <Link
          aria-current={!isAssignedScope ? "page" : undefined}
          className="ui-tabs__trigger"
          href="/supervisor/trainees"
        >
          全部新人
        </Link>
      </nav>
      <div className="ui-tabs__content">
        <DashboardScopeSummary label={`${panelLabel}汇总`} summary={summary} />
        <TraineeGrid
          emptyMessage={isAssignedScope ? "暂未分配负责新人" : "当前没有启用新人"}
          items={items}
        />
      </div>
    </div>
  );
}
