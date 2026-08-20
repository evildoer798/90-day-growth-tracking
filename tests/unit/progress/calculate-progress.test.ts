import { describe, expect, it } from "vitest";
import { calculateProgress } from "@/domain/progress/calculate-progress";
import type { ProgressRow, TrainingTask } from "@/domain/progress/types";

const fiveDimensionTasks: readonly TrainingTask[] = [
  { id: "all", day: 1, stage: "P1", dimension: "Dall", enabled: true, action: null, drill: null },
  { id: "d1", day: 2, stage: "P1", dimension: "D1", enabled: true, action: "Act", drill: null },
  { id: "d2", day: 3, stage: "P1", dimension: "D2", enabled: true, action: "Act", drill: "Drill" },
  { id: "d3", day: 4, stage: "P2", dimension: "D3", enabled: true, action: null, drill: null },
  { id: "d4", day: 5, stage: "P2", dimension: "D4", enabled: true, action: null, drill: null },
];

const progressRows: readonly ProgressRow[] = [
  { taskId: "all", learnDone: true, actionDone: false, drillDone: false },
  { taskId: "d1", learnDone: true, actionDone: true, drillDone: false },
  { taskId: "d2", learnDone: false, actionDone: false, drillDone: true },
  { taskId: "d3", learnDone: false, actionDone: false, drillDone: false },
  { taskId: "d4", learnDone: true, actionDone: false, drillDone: false },
];

describe("calculateProgress", () => {
  it("keeps a D2 trainee's global metrics across all enabled dimensions", () => {
    const summary = calculateProgress(fiveDimensionTasks, progressRows, 3, "D2");

    expect(summary.learn).toEqual({ numerator: 3, denominator: 5, rate: 0.6 });
    expect(summary.action).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(summary.drill).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(summary.focus.dimension).toBe("D2");
    expect(summary.focus.learn).toEqual({ numerator: 0, denominator: 1, rate: 0 });
  });

  it("returns null rates when no enabled task contains action or drill work", () => {
    const summary = calculateProgress(
      [{ id: "learn", day: 1, stage: "P1", dimension: "D1", enabled: true, action: null, drill: null }],
      [{ taskId: "learn", learnDone: true, actionDone: false, drillDone: false }],
      1,
      "D1",
    );

    expect(summary.action).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(summary.drill).toEqual({ numerator: 0, denominator: 0, rate: null });
  });

  it("excludes empty and whitespace-only action and drill text from their denominators", () => {
    const summary = calculateProgress(
      [
        { id: "empty", day: 1, stage: "P1", dimension: "D1", enabled: true, action: "", drill: "" },
        { id: "whitespace", day: 1, stage: "P1", dimension: "D1", enabled: true, action: "  ", drill: "\t" },
        { id: "work", day: 1, stage: "P1", dimension: "D1", enabled: true, action: "Act", drill: "Drill" },
      ],
      [{ taskId: "work", learnDone: false, actionDone: true, drillDone: true }],
      1,
      "D1",
    );

    expect(summary.action).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(summary.drill).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("counts only due tasks in the due metric while allowing future work in total progress", () => {
    const summary = calculateProgress(fiveDimensionTasks, progressRows, 3, "D2");

    expect(summary.due).toEqual({ numerator: 2, denominator: 3, rate: 2 / 3 });
    expect(summary.overdueCount).toBe(0);
  });

  it("has no due work on day zero and includes every enabled task by day ninety", () => {
    const dayZero = calculateProgress(fiveDimensionTasks, progressRows, 0, "D2");
    const dayNinety = calculateProgress(fiveDimensionTasks, progressRows, 90, "D2");

    expect(dayZero.due).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(dayNinety.due).toEqual({ numerator: 3, denominator: 5, rate: 0.6 });
  });

  it("excludes disabled tasks from every metric and counts incomplete past-due learn tasks", () => {
    const summary = calculateProgress(
      [
        ...fiveDimensionTasks,
        { id: "disabled", day: 1, stage: "P1", dimension: "D2", enabled: false, action: "Act", drill: "Drill" },
      ],
      progressRows,
      5,
      "D2",
    );

    expect(summary.learn.denominator).toBe(5);
    expect(summary.action.denominator).toBe(2);
    expect(summary.drill.denominator).toBe(1);
    expect(summary.overdueCount).toBe(2);
  });
});
