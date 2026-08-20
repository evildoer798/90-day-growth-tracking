"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AdminActionResult } from "@/server/actions/admin.actions";
import { updateTrainingPlanDurationAction } from "@/server/actions/admin.actions";

interface DurationResult {
  durationDays: number;
  revision: number;
}

export type TrainingDurationAction = (input: {
  delta: -1 | 1;
  expectedRevision: number;
}) => Promise<AdminActionResult<DurationResult>>;

export function TrainingDurationControl({
  durationDays,
  revision,
  minimumDays,
  maximumDays,
  action = updateTrainingPlanDurationAction,
}: {
  durationDays: number;
  revision: number;
  minimumDays: number;
  maximumDays: number;
  action?: TrainingDurationAction;
}) {
  const [days, setDays] = useState(durationDays);
  const [currentRevision, setCurrentRevision] = useState(revision);
  const [sourceRevision, setSourceRevision] = useState(revision);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (sourceRevision !== revision) {
    setSourceRevision(revision);
    setCurrentRevision(revision);
    setDays(durationDays);
  }

  const updateDuration = async (delta: -1 | 1) => {
    setPending(true);
    setFeedback(null);
    try {
      const result = await action({ delta, expectedRevision: currentRevision });
      if (result.success) {
        setDays(result.data.durationDays);
        setCurrentRevision(result.data.revision);
        setFeedback({ kind: "success", message: `培养计划总天数已更新为 ${result.data.durationDays} 天` });
      } else {
        setFeedback({ kind: "error", message: result.formError });
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error && error.message ? error.message : "操作失败，请刷新页面后重试",
      });
    } finally {
      setPending(false);
    }
  };

  return <section aria-busy={pending} aria-labelledby="training-duration-title" className="training-duration-control">
    <h2 id="training-duration-title">培养计划总天数</h2>
    <div aria-label="调整培养计划总天数" className="training-duration-control__stepper" role="group">
      <Button disabled={pending || days <= minimumDays} onClick={() => { void updateDuration(-1); }} size="md" type="button" variant="secondary">
        <span aria-hidden="true">−1</span><span className="sr-only">减少培养计划一天</span>
      </Button>
      <output aria-atomic="true" aria-live="polite" className="training-duration-control__value">
        <strong>{days}</strong><span>天</span>
      </output>
      <Button disabled={pending || days >= maximumDays} onClick={() => { void updateDuration(1); }} size="md" type="button" variant="secondary">
        <span aria-hidden="true">+1</span><span className="sr-only">增加培养计划一天</span>
      </Button>
    </div>
    {feedback ? <p className={`training-duration-control__feedback training-duration-control__feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p> : null}
  </section>;
}
