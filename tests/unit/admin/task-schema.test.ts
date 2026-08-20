import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/admin-transaction", () => ({
  withAdminTransaction: vi.fn(),
}));

import { taskSchema } from "@/server/services/admin.service";

const editableTask = {
  id: "task-1",
  day: 1,
  stage: "P1",
  dimension: "D1",
  dimensionName: "机械运动",
  task: "任务",
  action: null,
  drill: null,
  sortOrder: 1,
  references: [],
};

describe("admin editable task boundary", () => {
  it("rejects cancelled Milestone input instead of silently accepting it", () => {
    expect(taskSchema.safeParse({ ...editableTask, milestone: "不应编辑" }).success).toBe(false);
    expect(taskSchema.safeParse(editableTask).success).toBe(true);
  });
});
