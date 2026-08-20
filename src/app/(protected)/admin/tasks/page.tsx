import { AdminPageHeader } from "@/features/admin/admin-page-header";
import { TaskForm } from "@/features/admin/task-form";
import { TrainingDurationControl } from "@/features/admin/training-duration-control";
import { getActor } from "@/server/auth/get-actor";
import { requireManageUsers } from "@/server/auth/require-permission";
import { prisma } from "@/server/db/prisma";
import {
  getTrainingPlanSettings,
  TRAINING_PLAN_MAX_DAYS,
  TRAINING_PLAN_MIN_DAYS,
} from "@/server/repositories/training-plan-settings.repository";

export default async function AdminTasksPage() {
  const actor = await getActor();
  requireManageUsers(actor);
  const settings = await getTrainingPlanSettings();
  const tasks = await prisma.trainingTask.findMany({
    where: { day: { lte: settings.durationDays } },
    include: { references: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ day: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  return <section className="role-dashboard">
    <AdminPageHeader title="任务库与版本" />
    <TrainingDurationControl
      durationDays={settings.durationDays}
      maximumDays={TRAINING_PLAN_MAX_DAYS}
      minimumDays={TRAINING_PLAN_MIN_DAYS}
      revision={settings.revision}
    />
    <div className="admin-task-list">
      {tasks.map((task) => <details className="admin-panel" key={task.id}>
        <summary aria-label={`编辑 Day ${task.day} 任务`}>Day {task.day} · {task.dimension} · {task.task} {task.enabled ? "" : "（已停用）"}</summary>
        <p className="admin-stable-key">稳定键：{task.stableImportKey}</p>
        <TaskForm
          maximumDay={settings.durationDays}
          value={{
            id: task.id,
            day: task.day,
            stage: task.stage,
            dimension: task.dimension,
            dimensionName: task.dimensionName,
            task: task.task,
            action: task.action,
            drill: task.drill,
            sortOrder: task.sortOrder,
            enabled: task.enabled,
            references: task.references.map(({ title, url }) => ({ title, url })),
          }}
        />
      </details>)}
    </div>
  </section>;
}
