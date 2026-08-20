import type { CurrentDayInput } from "@/domain/progress/types";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const clampDay = (day: number, durationDays: number): number =>
  Math.min(durationDays, Math.max(0, Math.trunc(day)));

const utcDateOnly = (date: Date): number =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

export const calculateCurrentDay = ({
  trainingStartDate,
  today,
  trainingDayOverride,
  durationDays,
}: CurrentDayInput): number => {
  if (trainingDayOverride !== null) {
    return clampDay(trainingDayOverride, durationDays);
  }

  const elapsedDays = (utcDateOnly(today) - utcDateOnly(trainingStartDate)) / MILLISECONDS_PER_DAY;
  return clampDay(elapsedDays + 1, durationDays);
};
