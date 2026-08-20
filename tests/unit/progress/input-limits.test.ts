import { describe, expect, it } from "vitest";

import { PROGRESS_TEXT_LIMITS } from "@/config/input-limits.config";
import {
  confirmationMutationSchema,
  taskNotesMutationSchema,
} from "@/domain/progress/progress-input-schema";

const target = { traineeId: "trainee-1", taskId: "task-1" };

describe("progress free-text limits", () => {
  it.each([
    ["feedback", PROGRESS_TEXT_LIMITS.feedback, taskNotesMutationSchema],
    ["traineeNote", PROGRESS_TEXT_LIMITS.traineeNote, taskNotesMutationSchema],
    ["mentorNote", PROGRESS_TEXT_LIMITS.mentorNote, taskNotesMutationSchema],
  ] as const)("rejects %s above its centralized limit", (field, limit, schema) => {
    expect(schema.safeParse({ ...target, [field]: "x".repeat(limit) }).success).toBe(true);
    expect(schema.safeParse({ ...target, [field]: "x".repeat(limit + 1) }).success).toBe(false);
  });

  it("bounds confirmation notes independently", () => {
    const base = { ...target, kind: "ACTION", confirmed: true } as const;
    expect(confirmationMutationSchema.safeParse({ ...base, note: "x".repeat(PROGRESS_TEXT_LIMITS.confirmationNote) }).success).toBe(true);
    expect(confirmationMutationSchema.safeParse({ ...base, note: "x".repeat(PROGRESS_TEXT_LIMITS.confirmationNote + 1) }).success).toBe(false);
  });
});
