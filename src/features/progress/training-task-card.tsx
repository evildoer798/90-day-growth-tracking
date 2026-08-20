"use client";

import { Star } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UI_TEXT } from "@/config/ui-text.config";
import { ActionBlock } from "@/features/progress/action-block";
import type {
  ClientMutationFeedback,
  ProgressTaskCardViewModel,
  ProgressTaskPermissions,
} from "@/features/progress/client-task-view-model";
import { DrillBlock } from "@/features/progress/drill-block";
import { TaskDetailDrawer } from "@/features/progress/task-detail-drawer";

interface MutationTarget {
  traineeId: string;
  taskId: string;
}

export interface ProgressTaskActions {
  toggleLearn: (input: MutationTarget & { learnDone: boolean }) => Promise<unknown>;
  setPracticeSubmission: (
    input: MutationTarget & {
      kind: "ACTION" | "DRILL";
      submitted: boolean;
    },
  ) => Promise<unknown>;
  setConfirmation: (
    input: MutationTarget & {
      kind: "ACTION" | "DRILL";
      confirmed: boolean;
      note?: string | null;
    },
  ) => Promise<unknown>;
  saveNotes: (
    input: MutationTarget & {
      feedback?: string | null;
      traineeNote?: string | null;
      mentorNote?: string | null;
    },
  ) => Promise<unknown>;
}

export interface TrainingTaskCardProps {
  task: ProgressTaskCardViewModel;
  currentDay: number;
  permissions: ProgressTaskPermissions;
  actions: ProgressTaskActions;
}

type FeedbackContext = "card" | "drawer";
type Feedback = (ClientMutationFeedback & { context: FeedbackContext }) | null;

export function TrainingTaskCard({
  task,
  currentDay,
  permissions,
  actions,
}: TrainingTaskCardProps) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const learnDone = task.learnDone;
  const actionSubmitted = task.action?.submitted ?? false;
  const actionConfirmed = task.action?.confirmed ?? false;
  const drillSubmitted = task.drill?.submitted ?? false;
  const drillConfirmed = task.drill?.confirmed ?? false;
  const fullyComplete = learnDone &&
    (!task.action || actionConfirmed) &&
    (!task.drill || drillConfirmed);
  const isToday = task.day === currentDay;
  const isOverdue = task.day < currentDay && !learnDone;
  const isUpcoming = task.day > currentDay;

  const mutate = (
    operation: () => Promise<unknown>,
    successMessage: string,
    options: { context?: FeedbackContext; pendingMessage?: string } = {},
  ) => {
    const context = options.context ?? "card";
    setFeedback({
      context,
      kind: "status",
      message: options.pendingMessage ?? "正在保存…",
    });
    startTransition(async () => {
      try {
        await operation();
        setFeedback({ context, kind: "status", message: successMessage });
      } catch {
        setFeedback({ context, kind: "error", message: UI_TEXT.saveFailed });
      }
    });
  };

  const target = { traineeId: task.traineeId, taskId: task.taskId };
  const cardClassName = [
    "training-task-card",
    task.isFocus ? "training-task-card--focus" : "",
    learnDone ? "training-task-card--learned" : "",
    fullyComplete ? "training-task-card--complete" : "",
  ].filter(Boolean).join(" ");

  return (
    <Card
      aria-labelledby={`task-title-${task.taskId}`}
      className={cardClassName}
      data-dimension={task.dimension}
      data-task-id={task.taskId}
      role="article"
    >
      <div className="training-task-card__header">
        <div className="training-task-card__day">
          <span>DAY</span>
          <strong>{task.day}</strong>
        </div>
        <div className="training-task-card__badges">
          <Badge>{task.stage}</Badge>
          <Badge variant="primary">{task.dimensionName}</Badge>
          {task.isFocus ? (
            <Badge variant="warning">
              <Star aria-hidden="true" fill="currentColor" size={13} />
              重点 {task.dimension}
            </Badge>
          ) : null}
          {isToday ? <Badge variant="warning">{UI_TEXT.today}</Badge> : null}
          {isOverdue ? <Badge variant="danger">{UI_TEXT.overdue}</Badge> : null}
          {isUpcoming ? <Badge>{UI_TEXT.upcoming}</Badge> : null}
        </div>
        {learnDone ? (
          <div className="training-task-card__state">
            <Badge variant="success">{fullyComplete ? "全部完成" : UI_TEXT.completed}</Badge>
          </div>
        ) : null}
      </div>

      <h2 className="training-task-card__title" id={`task-title-${task.taskId}`}>{task.title}</h2>

      <div className="training-task-card__blocks">
        <ActionBlock
          canSubmit={permissions.canSubmitPractice}
          canConfirm={permissions.canConfirm}
          confirmed={actionConfirmed}
          content={task.action?.content ?? null}
          submitted={actionSubmitted}
          onToggleSubmission={() =>
            mutate(
              () => actions.setPracticeSubmission({
                ...target,
                kind: "ACTION",
                submitted: !actionSubmitted,
              }),
              actionSubmitted ? "Action 提交已撤回" : "Action 已提交，等待导师确认",
            )
          }
          onToggleConfirmation={() =>
            mutate(
              () =>
                actions.setConfirmation({
                  ...target,
                  kind: "ACTION",
                  confirmed: !actionConfirmed,
                }),
              actionConfirmed ? "Action 已撤销确认" : "Action 已确认",
            )
          }
          pending={pending}
        />
        <DrillBlock
          canSubmit={permissions.canSubmitPractice}
          canConfirm={permissions.canConfirm}
          confirmed={drillConfirmed}
          content={task.drill?.content ?? null}
          submitted={drillSubmitted}
          onToggleSubmission={() =>
            mutate(
              () => actions.setPracticeSubmission({
                ...target,
                kind: "DRILL",
                submitted: !drillSubmitted,
              }),
              drillSubmitted ? "Drill 提交已撤回" : "Drill 已提交，等待导师确认",
            )
          }
          onToggleConfirmation={() =>
            mutate(
              () =>
                actions.setConfirmation({
                  ...target,
                  kind: "DRILL",
                  confirmed: !drillConfirmed,
                }),
              drillConfirmed ? "Drill 已撤销确认" : "Drill 已确认",
            )
          }
          pending={pending}
        />
      </div>

      <div className="training-task-card__footer">
        <div className="training-task-card__footer-main">
          {permissions.canToggleLearn ? (
            <Button
              aria-label={learnDone ? "撤销学习完成" : "标记学习完成"}
              disabled={pending}
              onClick={() =>
                mutate(
                  () => actions.toggleLearn({ ...target, learnDone: !learnDone }),
                  learnDone ? "学习进度已撤销" : "学习进度已保存",
                )
              }
              size="sm"
              variant={learnDone ? "secondary" : "primary"}
            >
              {learnDone ? "撤销学习完成" : "标记学习完成"}
            </Button>
          ) : null}
          {task.references.length > 0 ? (
            <span className="training-task-card__reference-count">
              {task.references.length} 份资料
            </span>
          ) : null}
        </div>
        <TaskDetailDrawer
          onSaveLearnerNotes={({ feedback: value, traineeNote }) =>
            mutate(
              () => actions.saveNotes({ ...target, feedback: value, traineeNote }),
              "学习记录已保存",
              { context: "drawer", pendingMessage: "正在保存学习记录…" },
            )
          }
          onSaveMentorNote={(mentorNote) =>
            mutate(
              () => actions.saveNotes({ ...target, mentorNote }),
              "给新人的留言已保存",
              { context: "drawer", pendingMessage: "正在保存留言…" },
            )
          }
          feedback={feedback?.context === "drawer" ? feedback : null}
          pending={pending}
          permissions={permissions}
          task={task}
        />
      </div>

      {feedback?.context === "card" ? (
        <p
          className={feedback.kind === "error" ? "task-feedback task-feedback--error" : "task-feedback"}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </Card>
  );
}
