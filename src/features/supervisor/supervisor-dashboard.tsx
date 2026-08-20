import { DashboardScopeSummary } from "@/features/mentor/mentor-dashboard";
import { AssignedTraineeCard } from "@/features/trainee/assigned-trainee-card";
import { TraineeSearch } from "@/features/trainee/trainee-search";
import type { SupervisorDashboardDto } from "@/server/services/dashboard.service";

export interface SupervisorDashboardProps {
  dashboard: SupervisorDashboardDto;
  query?: string;
}

export function SupervisorDashboard({ dashboard, query = "" }: SupervisorDashboardProps) {
  const normalizedQuery = query.toLocaleLowerCase("zh-CN");
  const trainees = normalizedQuery
    ? dashboard.trainees.filter(({ trainee }) =>
        `${trainee.name} ${trainee.employeeId}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
      )
    : dashboard.trainees;
  return (
    <section aria-labelledby="supervisor-dashboard-heading" className="role-dashboard">
      <header className="role-dashboard__header">
        <div>
          <p className="role-dashboard__eyebrow">SUPERVISOR VIEW</p>
          <h1 id="supervisor-dashboard-heading">主管工作台</h1>
          <p>查看全部新人的培养进度与风险；主管视图保持只读。</p>
        </div>
      </header>
      <TraineeSearch action="/supervisor" query={query} />
      <DashboardScopeSummary label="全部新人汇总" summary={dashboard.allSummary} />
      <div className="role-dashboard__section-heading">
        <h2>{query ? "搜索结果" : "全部新人"}</h2>
        <span>{trainees.length} 人</span>
      </div>
      {trainees.length > 0 ? (
        <div className="assigned-trainee-grid">
          {trainees.map((item) => (
            <AssignedTraineeCard item={item} key={item.trainee.id} readOnly showReviewers={false} />
          ))}
        </div>
      ) : (
        <div className="role-dashboard__empty">
          <p>{query ? "没有找到匹配的新人" : "当前没有启用新人"}</p>
          <span>{query ? "请尝试其他姓名或工号。" : "新人启用后会显示在这里。"}</span>
        </div>
      )}
    </section>
  );
}
