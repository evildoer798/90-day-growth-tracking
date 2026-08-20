import Link from "next/link";

import { AssignedTraineeCard, formatDashboardMetric } from "@/features/trainee/assigned-trainee-card";
import type { MentorDashboardDto, RoleScopeSummaryDto } from "@/server/services/dashboard.service";

export interface DashboardScopeSummaryProps {
  summary: RoleScopeSummaryDto;
  label: string;
}

export function DashboardScopeSummary({ summary, label }: DashboardScopeSummaryProps) {
  return (
    <section aria-label={label} className="role-summary-strip">
      <dl>
        <div><dt>新人</dt><dd>{summary.traineeCount} 人</dd></div>
        <div><dt>总计划</dt><dd>{formatDashboardMetric(summary.learn)}</dd></div>
        <div><dt>截至今日</dt><dd>{formatDashboardMetric(summary.due)}</dd></div>
        <div><dt>逾期</dt><dd>{summary.overdueCount} 项</dd></div>
        <div><dt>待确认</dt><dd>{summary.pendingConfirmationCount} 项</dd></div>
        <div><dt>高风险</dt><dd>{summary.highRiskCount} 人</dd></div>
      </dl>
    </section>
  );
}

export interface MentorDashboardProps {
  dashboard: MentorDashboardDto;
}

export function MentorDashboard({ dashboard }: MentorDashboardProps) {
  const trainees = dashboard.trainees.filter(({ assigned }) => assigned);
  return (
    <section aria-labelledby="mentor-dashboard-heading" className="role-dashboard">
      <header className="role-dashboard__header">
        <div>
          <p className="role-dashboard__eyebrow">MENTOR VIEW</p>
          <h1 id="mentor-dashboard-heading">导师工作台</h1>
          <p>聚焦负责新人的截至今日进度、风险与待确认实践。</p>
        </div>
        <Link className="role-dashboard__primary-link" href="/mentor/pending">
          处理待确认（{dashboard.confirmationQueue.length}）
        </Link>
      </header>
      <DashboardScopeSummary label="负责新人汇总" summary={dashboard.summary} />
      <div className="role-dashboard__section-heading">
        <h2>我负责的新人</h2>
        <span>{trainees.length} 人</span>
      </div>
      {trainees.length > 0 ? (
        <div className="assigned-trainee-grid">
          {trainees.map((item) => <AssignedTraineeCard item={item} key={item.trainee.id} />)}
        </div>
      ) : (
        <div className="role-dashboard__empty"><p>暂未分配负责新人</p><span>分配关系生效后会显示在这里。</span></div>
      )}
    </section>
  );
}
