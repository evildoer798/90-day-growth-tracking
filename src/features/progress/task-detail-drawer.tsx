"use client";

import { ExternalLink, X } from "lucide-react";
import { useId, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/config/ui-text.config";
import { PROGRESS_TEXT_LIMITS } from "@/config/input-limits.config";
import type {
  ClientConfirmationKind,
  ClientMutationFeedback,
  ProgressTaskCardViewModel,
  ProgressTaskPermissions,
} from "@/features/progress/client-task-view-model";

const CONFIRMATION_LABELS: Record<ClientConfirmationKind, string> = {
  ACTION_CONFIRMED: "Action 确认",
  ACTION_UNCONFIRMED: "Action 撤销确认",
  DRILL_CONFIRMED: "Drill 确认",
  DRILL_UNCONFIRMED: "Drill 撤销确认",
};

const confirmationLabel = (kind: ClientConfirmationKind): string =>
  CONFIRMATION_LABELS[kind];

export const safeExternalReferenceUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};

export interface TaskDetailDrawerProps {
  task: ProgressTaskCardViewModel;
  permissions: ProgressTaskPermissions;
  pending: boolean;
  feedback: ClientMutationFeedback | null;
  onSaveLearnerNotes: (input: { feedback: string; traineeNote: string }) => void;
  onSaveMentorNote: (mentorNote: string) => void;
}

export function TaskDetailDrawer({
  task,
  permissions,
  pending,
  feedback,
  onSaveLearnerNotes,
  onSaveMentorNote,
}: TaskDetailDrawerProps) {
  const feedbackId = useId();
  const traineeNoteId = useId();
  const mentorNoteId = useId();

  const submitLearnerNotes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSaveLearnerNotes({
      feedback: String(formData.get("feedback") ?? ""),
      traineeNote: String(formData.get("traineeNote") ?? ""),
    });
  };

  const submitMentorNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSaveMentorNote(String(formData.get("mentorNote") ?? ""));
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          aria-label={`查看第 ${task.day} 天任务详情`}
          size="sm"
          variant="ghost"
        >
          {UI_TEXT.viewDetails}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="task-detail-drawer">
        <DrawerHeader className="task-detail-drawer__header">
          <div>
            <DrawerTitle>第 {task.day} 天任务详情</DrawerTitle>
            <DrawerDescription>
              {task.stage} · {task.dimension} · {task.dimensionName}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button aria-label="关闭任务详情" size="sm" variant="ghost">
              <X aria-hidden="true" size={18} />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody className="task-detail-drawer__body">
          <section aria-labelledby={`task-content-${task.taskId}`} className="drawer-section">
            <h3 id={`task-content-${task.taskId}`}>学习任务</h3>
            <p>{task.title}</p>
          </section>

          {task.references.length > 0 ? (
            <section aria-labelledby={`task-references-${task.taskId}`} className="drawer-section">
              <h3 id={`task-references-${task.taskId}`}>参考资料</h3>
              <ul className="reference-list">
                {task.references.map((reference, index) => {
                  const safeUrl = safeExternalReferenceUrl(reference.url);
                  return (
                    <li key={`${reference.url}-${index}`}>
                      {safeUrl ? (
                        <a href={safeUrl} rel="noopener noreferrer" target="_blank">
                          <span>{reference.title}</span>
                          <ExternalLink aria-hidden="true" size={15} />
                          <span className="sr-only">（新窗口打开）</span>
                        </a>
                      ) : (
                        <span className="reference-list__unavailable">
                          <span>{reference.title}</span>
                          <Badge variant="neutral">链接不可用</Badge>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {permissions.canToggleLearn ? (
            <form className="drawer-section note-form" onSubmit={submitLearnerNotes}>
              <h3>学习记录与导师留言</h3>
              <div className="form-field">
                <Label htmlFor={feedbackId}>学习反馈</Label>
                <Textarea
                  defaultValue={task.notes.feedback ?? ""}
                  disabled={pending}
                  id={feedbackId}
                  maxLength={PROGRESS_TEXT_LIMITS.feedback}
                  name="feedback"
                />
              </div>
              <div className="form-field">
                <Label htmlFor={traineeNoteId}>给导师的留言</Label>
                <Textarea
                  defaultValue={task.notes.traineeNote ?? ""}
                  disabled={pending}
                  id={traineeNoteId}
                  maxLength={PROGRESS_TEXT_LIMITS.traineeNote}
                  name="traineeNote"
                />
              </div>
              <Button disabled={pending} size="sm" type="submit">
                保存学习记录与留言
              </Button>
            </form>
          ) : (
            task.notes.feedback || task.notes.traineeNote ? (
              <section className="drawer-section">
                <h3>新人学习记录</h3>
                {task.notes.feedback ? <div className="note-display"><strong>学习反馈</strong><p>{task.notes.feedback}</p></div> : null}
                {task.notes.traineeNote ? <div className="note-display"><strong>给导师的留言</strong><p>{task.notes.traineeNote}</p></div> : null}
              </section>
            ) : null
          )}

          {permissions.canWriteMentorNote ? (
            <form className="drawer-section note-form" onSubmit={submitMentorNote}>
              <h3>给新人的留言</h3>
              <div className="form-field">
                <Label htmlFor={mentorNoteId}>留言内容</Label>
                <Textarea
                  defaultValue={task.notes.mentorNote ?? ""}
                  disabled={pending}
                  id={mentorNoteId}
                  maxLength={PROGRESS_TEXT_LIMITS.mentorNote}
                  name="mentorNote"
                />
              </div>
              <Button disabled={pending} size="sm" type="submit">
                保存给新人的留言
              </Button>
            </form>
          ) : (
            task.notes.mentorNote ? (
              <section className="drawer-section">
                <h3>导师留言</h3>
                <p>{task.notes.mentorNote}</p>
              </section>
            ) : null
          )}

          {feedback ? (
            <p
              aria-live={feedback.kind === "error" ? "assertive" : "polite"}
              className={
                feedback.kind === "error"
                  ? "task-feedback task-feedback--error"
                  : "task-feedback"
              }
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          ) : null}

          {task.confirmationHistory.length > 0 ? (
            <section aria-labelledby={`confirmation-history-${task.taskId}`} className="drawer-section">
              <h3 id={`confirmation-history-${task.taskId}`}>确认记录</h3>
              <ol className="confirmation-history">
                {task.confirmationHistory.map((event, index) => (
                  <li key={`${event.kind}-${event.occurredAt}-${index}`}>
                    <strong>{confirmationLabel(event.kind)}</strong>
                    <time dateTime={event.occurredAt}>
                      {new Intl.DateTimeFormat("zh-CN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Shanghai",
                      }).format(new Date(event.occurredAt))}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
