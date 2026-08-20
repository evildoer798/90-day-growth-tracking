import { DIMENSIONS, type DimensionCode } from "@/config/dimensions.config";
import type {
  FocusGroup,
  Metric,
  ProgressRow,
  ProgressSummary,
  TrainingStage,
  TrainingTask,
} from "@/domain/progress/types";

const STAGES = ["P1", "P2", "P3", "P4"] as const satisfies readonly TrainingStage[];

type MetricCounter = {
  numerator: number;
  denominator: number;
};

const emptyCounter = (): MetricCounter => ({ numerator: 0, denominator: 0 });

const toMetric = ({ numerator, denominator }: MetricCounter): Metric => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

const hasTaskContent = (value: string | null): boolean => value !== null && value.trim().length > 0;

const createDimensionCounters = (): Record<DimensionCode, MetricCounter> =>
  Object.fromEntries(Object.keys(DIMENSIONS).map((dimension) => [dimension, emptyCounter()])) as Record<
    DimensionCode,
    MetricCounter
  >;

const createStageCounters = (): Record<TrainingStage, MetricCounter> =>
  Object.fromEntries(STAGES.map((stage) => [stage, emptyCounter()])) as Record<TrainingStage, MetricCounter>;

export const calculateProgress = (
  tasks: readonly TrainingTask[],
  progress: readonly ProgressRow[],
  currentDay: number,
  focusGroup: FocusGroup,
): ProgressSummary => {
  const progressByTaskId = new Map(progress.map((row) => [row.taskId, row]));
  const learn = emptyCounter();
  const due = emptyCounter();
  const action = emptyCounter();
  const drill = emptyCounter();
  const focusLearn = emptyCounter();
  const dimensions = createDimensionCounters();
  const stages = createStageCounters();
  let overdueCount = 0;

  for (const task of tasks) {
    if (!task.enabled) {
      continue;
    }

    const taskProgress = progressByTaskId.get(task.id);
    const learnDone = taskProgress?.learnDone ?? false;
    const actionDone = taskProgress?.actionDone ?? false;
    const drillDone = taskProgress?.drillDone ?? false;

    learn.denominator += 1;
    dimensions[task.dimension].denominator += 1;
    stages[task.stage].denominator += 1;
    if (learnDone) {
      learn.numerator += 1;
      dimensions[task.dimension].numerator += 1;
      stages[task.stage].numerator += 1;
    }

    if (task.dimension === focusGroup) {
      focusLearn.denominator += 1;
      if (learnDone) {
        focusLearn.numerator += 1;
      }
    }

    if (task.day <= currentDay) {
      due.denominator += 1;
      if (learnDone) {
        due.numerator += 1;
      }
    }

    if (task.day < currentDay && !learnDone) {
      overdueCount += 1;
    }

    if (hasTaskContent(task.action)) {
      action.denominator += 1;
      if (actionDone) {
        action.numerator += 1;
      }
    }

    if (hasTaskContent(task.drill)) {
      drill.denominator += 1;
      if (drillDone) {
        drill.numerator += 1;
      }
    }
  }

  return {
    learn: toMetric(learn),
    due: toMetric(due),
    action: toMetric(action),
    drill: toMetric(drill),
    overdueCount,
    focus: { dimension: focusGroup, learn: toMetric(focusLearn) },
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([dimension, counter]) => [dimension, toMetric(counter)]),
    ) as Record<DimensionCode, Metric>,
    stages: Object.fromEntries(
      Object.entries(stages).map(([stage, counter]) => [stage, toMetric(counter)]),
    ) as Record<TrainingStage, Metric>,
  };
};
