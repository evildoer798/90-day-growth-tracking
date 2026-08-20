import { z } from "zod";

import { PROGRESS_TEXT_LIMITS } from "@/config/input-limits.config";

export const progressTargetSchema = z.object({
  traineeId: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128),
}).strict();

export const toggleLearnMutationSchema = progressTargetSchema.extend({
  learnDone: z.boolean(),
}).strict();

export const practiceSubmissionMutationSchema = progressTargetSchema.extend({
  kind: z.enum(["ACTION", "DRILL"]),
  submitted: z.boolean(),
}).strict();

export const confirmationMutationSchema = progressTargetSchema.extend({
  kind: z.enum(["ACTION", "DRILL"]),
  confirmed: z.boolean(),
  note: z.string().max(PROGRESS_TEXT_LIMITS.confirmationNote).nullable().optional(),
}).strict();

export const taskNotesMutationSchema = progressTargetSchema.extend({
  feedback: z.string().max(PROGRESS_TEXT_LIMITS.feedback).nullable().optional(),
  traineeNote: z.string().max(PROGRESS_TEXT_LIMITS.traineeNote).nullable().optional(),
  mentorNote: z.string().max(PROGRESS_TEXT_LIMITS.mentorNote).nullable().optional(),
}).strict().refine(
  ({ feedback, traineeNote, mentorNote }) =>
    feedback !== undefined || traineeNote !== undefined || mentorNote !== undefined,
  { message: "At least one note field is required" },
);
