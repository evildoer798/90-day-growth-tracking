import { describe, expect, it } from "vitest";

import {
  filterTasks,
  parseProgressFilters,
  type FilterableProgressTask,
} from "@/features/progress/filter-tasks";

const task = (
  overrides: Partial<FilterableProgressTask> & Pick<FilterableProgressTask, "id">,
): FilterableProgressTask => {
  const { id, ...rest } = overrides;
  return {
    id,
    day: 1,
    sortOrder: 1,
    stage: "P1",
    dimension: "Dall",
    dimensionName: "机台管理",
    task: "基础任务",
    action: null,
    drill: null,
    references: [],
    progress: null,
    ...rest,
  };
};

const tasks = [
  task({
    id: "late-p2",
    day: 10,
    sortOrder: 1,
    stage: "P2",
    dimension: "D4",
    dimensionName: "平台功能",
    task: "平台联调",
  }),
  task({
    id: "mechanical",
    day: 2,
    sortOrder: 2,
    dimension: "D1",
    dimensionName: "机械运动",
    task: "Mechanical Motion 基础",
    progress: { learnDone: true },
  }),
  task({
    id: "optics",
    day: 2,
    sortOrder: 1,
    dimension: "D2",
    dimensionName: "光路光源",
    task: "光路安装",
    action: "调整 光路",
    references: [{ title: "激光器安全手册" }],
  }),
  task({
    id: "sensor",
    day: 3,
    sortOrder: 1,
    dimension: "D3",
    dimensionName: "传感器与测校",
    task: "传感器校准",
  }),
];

describe("progress task filters", () => {
  it("combines stage, dimension, status, and normalized search", () => {
    const filters = parseProgressFilters({
      stage: "P1",
      dimension: "D2",
      status: "overdue",
      query: "  调整　光路  ",
    });

    expect(filterTasks(tasks, filters, 3).map(({ id }) => id)).toEqual(["optics"]);
  });

  it("normalizes Unicode width, casing, and repeated whitespace in search", () => {
    const filters = parseProgressFilters({ query: "  ｍＥＣＨＡＮＩＣＡＬ   motion " });

    expect(filterTasks(tasks, filters, 3).map(({ id }) => id)).toEqual(["mechanical"]);
  });

  it("supports completed, incomplete, today, and upcoming status filters", () => {
    expect(
      filterTasks(tasks, parseProgressFilters({ status: "completed" }), 3).map(({ id }) => id),
    ).toEqual(["mechanical"]);
    expect(
      filterTasks(tasks, parseProgressFilters({ status: "incomplete" }), 3).map(({ id }) => id),
    ).toEqual(["optics", "sensor", "late-p2"]);
    expect(
      filterTasks(tasks, parseProgressFilters({ status: "today" }), 3).map(({ id }) => id),
    ).toEqual(["sensor"]);
    expect(
      filterTasks(tasks, parseProgressFilters({ status: "upcoming" }), 3).map(({ id }) => id),
    ).toEqual(["late-p2"]);
  });

  it("returns an empty result when no task matches all filters", () => {
    const filters = parseProgressFilters({
      stage: "P2",
      dimension: "D3",
      status: "completed",
      query: "不存在",
    });

    expect(filterTasks(tasks, filters, 45)).toEqual([]);
  });

  it("does not treat a trainee focus group as a global visibility filter", () => {
    const everyDimension = ["Dall", "D1", "D2", "D3", "D4"] as const;
    const focusMarkedTasks = everyDimension.map((dimension, index) =>
      task({
        id: dimension,
        day: index + 1,
        dimension,
        dimensionName: dimension,
        isFocus: dimension === "D2",
      }),
    );

    expect(
      filterTasks(focusMarkedTasks, parseProgressFilters({}), 45).map(({ dimension }) => dimension),
    ).toEqual(everyDimension);
  });

  it("sorts deterministically by day, sort order, then stable id", () => {
    const unordered = [
      task({ id: "b", day: 4, sortOrder: 2 }),
      task({ id: "c", day: 5, sortOrder: 1 }),
      task({ id: "a", day: 4, sortOrder: 2 }),
      task({ id: "first", day: 4, sortOrder: 1 }),
    ];

    expect(filterTasks(unordered, parseProgressFilters({}), 4).map(({ id }) => id)).toEqual([
      "first",
      "a",
      "b",
      "c",
    ]);
  });

  it("falls back safely when URL values are repeated or unsupported", () => {
    expect(
      parseProgressFilters({
        stage: ["P4", "P1"],
        dimension: "D9",
        status: "blocked",
        query: ["传感器", "ignored"],
      }),
    ).toEqual({ stage: "P4", dimension: "all", status: "all", query: "传感器" });
  });
});
