import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));

import {
  findEnabledTrainingTask,
  findEnabledTrainingTasks,
} from "@/server/repositories/training-task.repository";

describe("active training task queries", () => {
  it("limits the task list to the active plan duration", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const database = { trainingTask: { findMany } } as never;

    await findEnabledTrainingTasks(89, database);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true, day: { lte: 89 } },
    }));
  });

  it("does not resolve a direct task mutation outside the active duration", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = { trainingTask: { findFirst } } as never;

    await findEnabledTrainingTask("tail-task", 89, database);

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "tail-task", enabled: true, day: { lte: 89 } },
    }));
  });
});
