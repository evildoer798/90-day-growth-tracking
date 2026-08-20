"use server";

import { revalidatePath } from "next/cache";

import {
  confirmationMutationSchema,
  practiceSubmissionMutationSchema,
  taskNotesMutationSchema,
  toggleLearnMutationSchema,
} from "@/domain/progress/progress-input-schema";
import { getActor } from "@/server/auth/get-actor";
import {
  saveTaskNotes,
  setPracticeSubmission,
  setConfirmation,
  toggleLearn,
} from "@/server/services/progress.service";

const refreshProgress = (traineeId: string) => {
  revalidatePath(`/progress/${traineeId}`);
};

export const toggleLearnAction = async (input: unknown) => {
  const parsed = toggleLearnMutationSchema.parse(input);
  const result = await toggleLearn(await getActor(), parsed);
  refreshProgress(parsed.traineeId);
  return result;
};

export const setConfirmationAction = async (input: unknown) => {
  const parsed = confirmationMutationSchema.parse(input);
  const result = await setConfirmation(await getActor(), parsed);
  refreshProgress(parsed.traineeId);
  revalidatePath("/mentor");
  revalidatePath("/mentor/pending");
  revalidatePath("/supervisor");
  return result;
};

export const setPracticeSubmissionAction = async (input: unknown) => {
  const parsed = practiceSubmissionMutationSchema.parse(input);
  const result = await setPracticeSubmission(await getActor(), parsed);
  refreshProgress(parsed.traineeId);
  revalidatePath("/mentor");
  revalidatePath("/mentor/pending");
  return result;
};

export const saveTaskNotesAction = async (input: unknown) => {
  const parsed = taskNotesMutationSchema.parse(input);
  const result = await saveTaskNotes(await getActor(), parsed);
  refreshProgress(parsed.traineeId);
  return result;
};
