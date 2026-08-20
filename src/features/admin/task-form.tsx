"use client";

import { type FormEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { APP_CONFIG } from "@/config/app.config";
import { ActionFeedback, type AdminFormAction, FieldErrors, type FeedbackState, failureFeedback } from "@/features/admin/action-feedback";
import { setTrainingTaskEnabledAction, updateTrainingTaskAction } from "@/server/actions/admin.actions";

export interface TaskFormValue {
  id: string; day: number; stage: string; dimension: "D1" | "D2" | "D3" | "D4" | "Dall";
  dimensionName: string; task: string; action: string | null; drill: string | null;
  sortOrder: number; enabled: boolean; references: Array<{ title: string; url: string }>;
}

const names = { Dall: "机台管理", D1: "机械运动", D2: "光路光源", D3: "传感器与测校", D4: "平台功能" } as const;
const minimumDay = 1;

export function TaskForm({ value, maximumDay = APP_CONFIG.trainingDays, updateAction = updateTrainingTaskAction, toggleAction = setTrainingTaskEnabledAction }: {
  value: TaskFormValue;
  maximumDay?: number;
  updateAction?: AdminFormAction;
  toggleAction?: AdminFormAction;
}) {
  const baseId = useId();
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dimension = data.get("dimension") as keyof typeof names;
    const references = String(data.get("references") ?? "").split("\n").map((entry) => entry.trim()).filter(Boolean).map((line) => {
      const index = line.indexOf(" | ");
      return { title: index < 0 ? line : line.slice(0, index), url: index < 0 ? "" : line.slice(index + 3) };
    });
    startTransition(async () => {
      try {
        const result = await updateAction({
          id: value.id, day: Number(data.get("day")), stage: data.get("stage"), dimension, dimensionName: names[dimension],
          task: data.get("task"), action: String(data.get("action") ?? "") || null, drill: String(data.get("drill") ?? "") || null,
          sortOrder: Number(data.get("sortOrder")), references,
        });
        if (result.success) setFeedback({ kind: "success", message: "任务已更新并记录版本" });
        else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
      } catch (error) { setFeedback(failureFeedback(error)); }
    });
  };
  const toggle = () => startTransition(async () => {
    try {
      const result = await toggleAction({ id: value.id, enabled: !value.enabled, confirm: true });
      if (result.success) {
        setConfirmed(false);
        setFeedback({ kind: "success", message: value.enabled ? "任务已停用并记录版本" : "任务已启用并记录版本" });
      } else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
    } catch (error) { setFeedback(failureFeedback(error)); }
  });
  const fieldId = (name: string) => `${baseId}-${name}`;
  const dayErrors = feedback?.fieldErrors?.day;
  return <form aria-label={`编辑 Day ${value.day} 任务`} className="admin-form admin-task-form" onSubmit={submit}>
    <div className="form-field">
      <Label htmlFor={fieldId("day")}>任务 Day（1–{maximumDay}）</Label>
      <Input aria-describedby={dayErrors?.length ? fieldId("day-errors") : undefined} aria-invalid={Boolean(dayErrors?.length)} defaultValue={value.day} id={fieldId("day")} max={maximumDay} min={minimumDay} name="day" required step={1} type="number" />
      {dayErrors?.length ? <div id={fieldId("day-errors")}><FieldErrors errors={dayErrors} /></div> : null}
    </div>
    <div className="form-field"><Label htmlFor={fieldId("stage")}>阶段</Label><Select defaultValue={value.stage} id={fieldId("stage")} name="stage">{["P1", "P2", "P3", "P4"].map((stage) => <option key={stage}>{stage}</option>)}</Select><FieldErrors errors={feedback?.fieldErrors?.stage} /></div>
    <div className="form-field"><Label htmlFor={fieldId("dimension")}>维度</Label><Select defaultValue={value.dimension} id={fieldId("dimension")} name="dimension">{Object.keys(names).map((dimension) => <option key={dimension}>{dimension}</option>)}</Select><FieldErrors errors={feedback?.fieldErrors?.dimension} /></div>
    <div className="form-field"><Label htmlFor={fieldId("sort")}>排序</Label><Input defaultValue={value.sortOrder} id={fieldId("sort")} min={0} name="sortOrder" required type="number" /><FieldErrors errors={feedback?.fieldErrors?.sortOrder} /></div>
    <div className="form-field admin-form-wide"><Label htmlFor={fieldId("task")}>任务</Label><Textarea defaultValue={value.task} id={fieldId("task")} name="task" required /><FieldErrors errors={feedback?.fieldErrors?.task} /></div>
    <div className="form-field"><Label htmlFor={fieldId("action")}>Action（可选）</Label><Textarea defaultValue={value.action ?? ""} id={fieldId("action")} name="action" /><FieldErrors errors={feedback?.fieldErrors?.action} /></div>
    <div className="form-field"><Label htmlFor={fieldId("drill")}>Drill（可选）</Label><Textarea defaultValue={value.drill ?? ""} id={fieldId("drill")} name="drill" /><FieldErrors errors={feedback?.fieldErrors?.drill} /></div>
    <div className="form-field admin-form-wide"><Label htmlFor={fieldId("references")}>资料（每行“标题 | https://链接”，不自动猜测）</Label><Textarea defaultValue={value.references.map((reference) => `${reference.title} | ${reference.url}`).join("\n")} id={fieldId("references")} name="references" /><FieldErrors errors={feedback?.fieldErrors?.references} /></div>
    <Button disabled={pending} type="submit">{pending ? "正在保存…" : "保存任务版本"}</Button>
    <label><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />确认{value.enabled ? "停用" : "启用"}任务</label>
    <Button disabled={!confirmed || pending} onClick={toggle} type="button" variant={value.enabled ? "danger" : "secondary"}>{pending ? "处理中…" : value.enabled ? "停用任务" : "启用任务"}</Button>
    <ActionFeedback feedback={feedback} />
  </form>;
}
