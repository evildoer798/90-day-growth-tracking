import { describe, expect, it, vi } from "vitest";

import { readMentorDashboardData } from "@/server/services/mentor-dashboard.query";

describe("mentor dashboard query", () => {
  it("resolves active mentor trainee IDs before hydrating only that scoped data", async () => {
    const calls: string[] = [];
    const readers = {
      findAssignedTraineeIds: vi.fn(async () => {
        calls.push("assignment-ids");
        return ["assigned"];
      }),
      findEnabledTraineesByIds: vi.fn(async (ids: readonly string[]) => {
        calls.push(`trainees:${ids.join(",")}`);
        return [{ id: "assigned" }];
      }),
      findEnabledTrainingTasks: vi.fn(async () => {
        calls.push("tasks");
        return [];
      }),
      findRelationsForTrainees: vi.fn(async (ids: readonly string[]) => {
        calls.push(`relations:${ids.join(",")}`);
        return [];
      }),
      findProgressForTrainees: vi.fn(async (ids: readonly string[]) => {
        calls.push(`progress:${ids.join(",")}`);
        return [];
      }),
      findActiveReviewerAssignmentsForTrainees: vi.fn(async (ids: readonly string[]) => {
        calls.push(`reviewers:${ids.join(",")}`);
        return [];
      }),
    };

    const result = await readMentorDashboardData(
      "mentor-user",
      new Date("2026-08-15T04:00:00.000Z"),
      readers,
    );

    expect(calls[0]).toBe("assignment-ids");
    expect(readers.findEnabledTraineesByIds).toHaveBeenCalledWith(["assigned"]);
    expect(readers.findProgressForTrainees).toHaveBeenCalledWith(["assigned"]);
    expect(readers.findRelationsForTrainees).toHaveBeenCalledWith(["assigned"]);
    expect(readers.findActiveReviewerAssignmentsForTrainees).toHaveBeenCalledWith(
      ["assigned"],
      new Date("2026-08-15T04:00:00.000Z"),
    );
    expect(calls.some((call) => call.includes("unrelated"))).toBe(false);
    expect(result.trainees).toEqual([{ id: "assigned" }]);
  });

  it("does not query progress, relations, or reviewers when no active assignment exists", async () => {
    const readers = {
      findAssignedTraineeIds: vi.fn(async () => []),
      findEnabledTraineesByIds: vi.fn(async () => []),
      findEnabledTrainingTasks: vi.fn(async () => []),
      findRelationsForTrainees: vi.fn(async () => []),
      findProgressForTrainees: vi.fn(async () => []),
      findActiveReviewerAssignmentsForTrainees: vi.fn(async () => []),
    };

    const result = await readMentorDashboardData("mentor-user", new Date(), readers);

    expect(result.trainees).toEqual([]);
    expect(readers.findProgressForTrainees).not.toHaveBeenCalled();
    expect(readers.findRelationsForTrainees).not.toHaveBeenCalled();
    expect(readers.findActiveReviewerAssignmentsForTrainees).not.toHaveBeenCalled();
  });
});
