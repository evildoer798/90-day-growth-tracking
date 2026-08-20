import { describe, expect, it } from "vitest";

import {
  MAX_CLIENT_CONFIRMATION_HISTORY,
  toProgressTaskCardViewModel,
} from "@/features/progress/client-task-view-model";
import type { DashboardTaskDto } from "@/server/services/dashboard.service";

const historyEvent = (index: number): DashboardTaskDto["confirmationHistory"][number] => ({
  id: `history-database-id-${index}`,
  kind: index % 4 === 0
    ? "ACTION_CONFIRMED"
    : index % 4 === 1
      ? "ACTION_UNCONFIRMED"
      : index % 4 === 2
        ? "DRILL_CONFIRMED"
        : "DRILL_UNCONFIRMED",
  note: `private-history-note-${index}`,
  createdAt: new Date(Date.UTC(2026, 7, 14, 12, 0, 99 - index)),
  actor: {
    id: `private-actor-id-${index}`,
    employeeId: `PRIVATE-EMPLOYEE-${index}`,
  },
});

const dashboardTask = (historyLength: number): DashboardTaskDto => ({
  id: "task-database-id",
  stableImportKey: "PLAN_V1-DAY-001",
  day: 1,
  stage: "P1",
  dimension: "D2",
  dimensionName: "光路光源",
  task: "完成光路安全学习",
  action: "完成一次光路安装",
  drill: "  ",
  sortOrder: 17,
  isFocus: true,
  references: [
    {
      id: "reference-database-id",
      title: "安全手册",
      url: "https://intranet.example/safety",
      sortOrder: 9,
    },
  ],
  progress: {
    id: "progress-database-id",
    traineeId: "nested-trainee-id",
    taskId: "nested-task-id",
    learnDone: true,
    learnAt: new Date("2026-08-14T10:00:00.000Z"),
    actionSubmitted: true,
    actionSubmittedAt: new Date("2026-08-14T10:30:00.000Z"),
    actionConfirmed: true,
    actionConfirmedAt: new Date("2026-08-14T11:00:00.000Z"),
    actionConfirmedById: "private-action-confirmer-id",
    drillSubmitted: false,
    drillSubmittedAt: null,
    drillConfirmed: false,
    drillConfirmedAt: null,
    drillConfirmedById: "private-drill-confirmer-id",
    feedback: "学习反馈",
    traineeNote: "新人笔记",
    mentorNote: "培养备注",
  },
  confirmationHistory: Array.from({ length: historyLength }, (_, index) => historyEvent(index)),
});

describe("progress task client view model", () => {
  it("exposes only rendered fields and the two IDs required by secured action payloads", () => {
    const model = toProgressTaskCardViewModel(
      dashboardTask(MAX_CLIENT_CONFIRMATION_HISTORY),
      "authorized-trainee-id",
    );

    expect(model).toEqual({
      traineeId: "authorized-trainee-id",
      taskId: "task-database-id",
      day: 1,
      stage: "P1",
      dimension: "D2",
      dimensionName: "光路光源",
      title: "完成光路安全学习",
      isFocus: true,
      learnDone: true,
      action: { content: "完成一次光路安装", submitted: true, confirmed: true },
      drill: null,
      references: [{ title: "安全手册", url: "https://intranet.example/safety" }],
      notes: {
        feedback: "学习反馈",
        traineeNote: "新人笔记",
        mentorNote: "培养备注",
      },
      confirmationHistory: Array.from(
        { length: MAX_CLIENT_CONFIRMATION_HISTORY },
        (_, index) => ({
          kind: historyEvent(index).kind,
          occurredAt: historyEvent(index).createdAt.toISOString(),
        }),
      ),
    });

    const serialized = JSON.stringify(model);
    for (const forbidden of [
      "stableImportKey",
      "progress-database-id",
      "nested-trainee-id",
      "nested-task-id",
      "private-action-confirmer-id",
      "private-drill-confirmer-id",
      "reference-database-id",
      "history-database-id-0",
      "private-history-note-0",
      "private-actor-id-0",
      "PRIVATE-EMPLOYEE-0",
      "sortOrder",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("bounds recent display history so serialized client props cannot grow with database history", () => {
    const bounded = toProgressTaskCardViewModel(
      dashboardTask(MAX_CLIENT_CONFIRMATION_HISTORY),
      "authorized-trainee-id",
    );
    const oversized = toProgressTaskCardViewModel(
      dashboardTask(MAX_CLIENT_CONFIRMATION_HISTORY + 90),
      "authorized-trainee-id",
    );

    expect(oversized.confirmationHistory).toHaveLength(MAX_CLIENT_CONFIRMATION_HISTORY);
    expect(JSON.stringify(oversized)).toHaveLength(JSON.stringify(bounded).length);
  });
});
