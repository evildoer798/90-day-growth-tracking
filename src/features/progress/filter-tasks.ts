import { DIMENSIONS, type DimensionCode } from "@/config/dimensions.config";
import type { TrainingStage } from "@/domain/progress/types";

const STAGE_VALUES = ["P1", "P2", "P3", "P4"] as const satisfies readonly TrainingStage[];
const STATUS_VALUES = [
  "all",
  "completed",
  "incomplete",
  "overdue",
  "today",
  "upcoming",
] as const;

export type TaskStatusFilter = (typeof STATUS_VALUES)[number];
export type StageFilter = TrainingStage | "all";
export type DimensionFilter = DimensionCode | "all";

export interface ProgressTaskFilters {
  stage: StageFilter;
  dimension: DimensionFilter;
  status: TaskStatusFilter;
  query: string;
}

export interface ProgressSearchParams {
  stage?: string | string[];
  dimension?: string | string[];
  status?: string | string[];
  query?: string | string[];
}

export interface FilterableProgressTask {
  id: string;
  day: number;
  sortOrder: number;
  stage: TrainingStage;
  dimension: DimensionCode;
  dimensionName: string;
  task: string;
  action: string | null;
  drill: string | null;
  references: ReadonlyArray<{ title: string }>;
  progress: { learnDone: boolean } | null;
  isFocus?: boolean;
}

const firstValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export const normalizeProgressSearch = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();

const isStage = (value: string): value is TrainingStage =>
  STAGE_VALUES.includes(value as TrainingStage);

const isDimension = (value: string): value is DimensionCode =>
  Object.hasOwn(DIMENSIONS, value);

const isStatus = (value: string): value is TaskStatusFilter =>
  STATUS_VALUES.includes(value as TaskStatusFilter);

export const parseProgressFilters = (
  searchParams: ProgressSearchParams,
): ProgressTaskFilters => {
  const stage = firstValue(searchParams.stage);
  const dimension = firstValue(searchParams.dimension);
  const status = firstValue(searchParams.status);

  return {
    stage: isStage(stage) ? stage : "all",
    dimension: isDimension(dimension) ? dimension : "all",
    status: isStatus(status) ? status : "all",
    query: normalizeProgressSearch(firstValue(searchParams.query)),
  };
};

const matchesStatus = (
  task: FilterableProgressTask,
  status: TaskStatusFilter,
  currentDay: number,
): boolean => {
  const learnDone = task.progress?.learnDone ?? false;

  switch (status) {
    case "completed":
      return learnDone;
    case "incomplete":
      return !learnDone;
    case "overdue":
      return task.day < currentDay && !learnDone;
    case "today":
      return task.day === currentDay;
    case "upcoming":
      return task.day > currentDay;
    case "all":
      return true;
  }
};

const searchableText = (task: FilterableProgressTask): string =>
  normalizeProgressSearch(
    [
      task.task,
      task.action ?? "",
      task.drill ?? "",
      task.dimension,
      task.dimensionName,
      ...task.references.map(({ title }) => title),
    ].join(" "),
  );

export const filterTasks = <Task extends FilterableProgressTask>(
  tasks: readonly Task[],
  filters: ProgressTaskFilters,
  currentDay: number,
): Task[] =>
  Array.from(tasks)
    .filter((task) => filters.stage === "all" || task.stage === filters.stage)
    .filter(
      (task) => filters.dimension === "all" || task.dimension === filters.dimension,
    )
    .filter((task) => matchesStatus(task, filters.status, currentDay))
    .filter((task) => filters.query.length === 0 || searchableText(task).includes(filters.query))
    .sort(
      (left, right) =>
        left.day - right.day ||
        left.sortOrder - right.sortOrder ||
        left.id.localeCompare(right.id),
    );
