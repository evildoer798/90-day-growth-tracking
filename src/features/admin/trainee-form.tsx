"use client";

import { type FormEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ActionFeedback, type AdminFormAction, FieldErrors, type FeedbackState, failureFeedback } from "@/features/admin/action-feedback";
import { createTraineeAction, setTraineeEnabledAction, updateTraineeAction } from "@/server/actions/admin.actions";

export interface TraineeFormValue {
  id: string;
  name: string;
  employeeId: string;
  focusGroup: "D1" | "D2" | "D3" | "D4";
  trainingStartDate: string;
  trainingDayOverride: number | null;
}

export function TraineeForm({
  durationDays,
  initial,
  action,
}: {
  durationDays: number;
  initial?: TraineeFormValue;
  action?: AdminFormAction;
}) {
  const baseId = useId();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const submitAction = action ?? (initial ? updateTraineeAction : createTraineeAction);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await submitAction({
          ...(initial ? { id: initial.id } : {}),
          name: data.get("name"), employeeId: data.get("employeeId"), focusGroup: data.get("focusGroup"),
          trainingStartDate: data.get("trainingStartDate"),
          trainingDayOverride: data.get("trainingDayOverride") ? Number(data.get("trainingDayOverride")) : null,
        });
        if (result.success) {
          setFeedback({ kind: "success", message: initial ? "新人档案已更新" : "新人档案已创建" });
          if (!initial) form.reset();
        } else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
      } catch (error) { setFeedback(failureFeedback(error)); }
    });
  };
  const fieldId = (name: string) => `${baseId}-${name}`;
  return <form className="admin-form" onSubmit={submit}>
    <div className="form-field"><Label htmlFor={fieldId("name")}>姓名</Label><Input defaultValue={initial?.name} id={fieldId("name")} name="name" required /><FieldErrors errors={feedback?.fieldErrors?.name} /></div>
    <div className="form-field"><Label htmlFor={fieldId("employee")}>工号</Label><Input autoCapitalize="characters" defaultValue={initial?.employeeId} id={fieldId("employee")} name="employeeId" required /><FieldErrors errors={feedback?.fieldErrors?.employeeId} /></div>
    <div className="form-field"><Label htmlFor={fieldId("focus")}>重点方向</Label><Select defaultValue={initial?.focusGroup ?? "D1"} id={fieldId("focus")} name="focusGroup">{["D1", "D2", "D3", "D4"].map((value) => <option key={value}>{value}</option>)}</Select><FieldErrors errors={feedback?.fieldErrors?.focusGroup} /></div>
    <div className="form-field"><Label htmlFor={fieldId("start")}>培养开始日期</Label><Input defaultValue={initial?.trainingStartDate} id={fieldId("start")} name="trainingStartDate" required type="date" /><FieldErrors errors={feedback?.fieldErrors?.trainingStartDate} /></div>
    <div className="form-field"><Label htmlFor={fieldId("day")}>Day 覆盖（可选）</Label><Input defaultValue={initial?.trainingDayOverride ?? ""} id={fieldId("day")} max={durationDays} min={0} name="trainingDayOverride" type="number" /><FieldErrors errors={feedback?.fieldErrors?.trainingDayOverride} /></div>
    <Button disabled={pending} type="submit">{pending ? "正在保存…" : initial ? "保存新人修改" : "新增新人"}</Button>
    <ActionFeedback feedback={feedback} />
  </form>;
}

export function TraineeStatusForm({ id, enabled, action = setTraineeEnabledAction }: { id: string; enabled: boolean; action?: AdminFormAction }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const submit = () => startTransition(async () => {
    try {
      const result = await action({ id, enabled: !enabled, confirm: true });
      if (result.success) {
        setConfirmed(false);
        setFeedback({ kind: "success", message: enabled ? "新人档案已停用" : "新人档案已启用" });
      } else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
    } catch (error) { setFeedback(failureFeedback(error)); }
  });
  return <div className="admin-inline-confirm">
    <label><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />确认{enabled ? "停用" : "启用"}</label>
    <Button disabled={!confirmed || pending} onClick={submit} size="sm" variant={enabled ? "danger" : "secondary"}>{pending ? "处理中…" : enabled ? "停用" : "启用"}</Button>
    <ActionFeedback feedback={feedback} />
  </div>;
}
