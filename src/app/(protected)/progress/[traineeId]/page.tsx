import { UI_TEXT } from "@/config/ui-text.config";
import { toProgressTaskCardViewModel } from "@/features/progress/client-task-view-model";
import { filterTasks, parseProgressFilters, type ProgressSearchParams } from "@/features/progress/filter-tasks";
import { ProgressFilters } from "@/features/progress/progress-filters";
import { ProgressHeader } from "@/features/progress/progress-header";
import { StatsGrid } from "@/features/progress/stats-grid";
import { TrainingTaskCard, type ProgressTaskActions } from "@/features/progress/training-task-card";
import {
  saveTaskNotesAction,
  setConfirmationAction,
  setPracticeSubmissionAction,
  toggleLearnAction,
} from "@/server/actions/progress.actions";
import { getActor } from "@/server/auth/get-actor";
import { getTraineeDashboard, type DashboardTaskDto } from "@/server/services/dashboard.service";

export interface ProgressPageProps {
  params: Promise<{ traineeId: string }>;
  searchParams: Promise<ProgressSearchParams>;
}

const stageAtDay = (tasks: readonly DashboardTaskDto[], currentDay: number) => {
  const ordered = Array.from(tasks).sort(
    (left, right) => left.day - right.day || left.sortOrder - right.sortOrder,
  );
  return (
    ordered.find(({ day }) => day >= currentDay)?.stage ??
    ordered.at(-1)?.stage
  );
};

const taskActions: ProgressTaskActions = {
  toggleLearn: toggleLearnAction,
  setPracticeSubmission: setPracticeSubmissionAction,
  setConfirmation: setConfirmationAction,
  saveNotes: saveTaskNotesAction,
};

export default async function ProgressPage({ params, searchParams }: ProgressPageProps) {
  const evaluationTime = new Date();
  const [actor, { traineeId }, rawFilters] = await Promise.all([
    getActor(),
    params,
    searchParams,
  ]);
  const dashboard = await getTraineeDashboard(actor, traineeId, evaluationTime);
  const filters = parseProgressFilters(rawFilters);
  const visibleTasks = filterTasks(
    dashboard.tasks,
    filters,
    dashboard.trainee.currentDay,
  );

  return (
    <section aria-labelledby="progress-page-heading" className="progress-workspace">
      <ProgressHeader
        currentDay={dashboard.trainee.currentDay}
        durationDays={dashboard.durationDays}
        employeeId={dashboard.trainee.employeeId}
        focusGroup={dashboard.trainee.focusGroup}
        name={dashboard.trainee.name}
        stage={stageAtDay(dashboard.tasks, dashboard.trainee.currentDay)}
      />
      <StatsGrid
        currentDay={dashboard.trainee.currentDay}
        durationDays={dashboard.durationDays}
        summary={dashboard.summary}
      />
      <ProgressFilters filters={filters} traineeId={dashboard.trainee.id} />

      <div className="task-results-heading">
        <h2>培养任务</h2>
        <span aria-live="polite">显示 {visibleTasks.length} / {dashboard.tasks.length} 项</span>
      </div>
      {visibleTasks.length > 0 ? (
        <div className="training-task-grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {visibleTasks.map((task) => (
            <TrainingTaskCard
              actions={taskActions}
              currentDay={dashboard.trainee.currentDay}
              key={task.id}
              permissions={dashboard.permissions}
              task={toProgressTaskCardViewModel(task, dashboard.trainee.id)}
            />
          ))}
        </div>
      ) : (
        <div className="progress-empty-state">
          <p>{UI_TEXT.noFilterResults}</p>
          <a href={`/progress/${encodeURIComponent(dashboard.trainee.id)}`}>
            {UI_TEXT.resetFilters}
          </a>
        </div>
      )}
    </section>
  );
}
