"use client";

import { type FormEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ActionFeedback, type AdminFormAction, FieldErrors, type FeedbackState, failureFeedback } from "@/features/admin/action-feedback";
import { replaceReviewerRelationAction } from "@/server/actions/admin.actions";

export function RelationForm({ trainees, reviewers, action = replaceReviewerRelationAction }: {
  trainees: Array<{ id: string; label: string }>;
  reviewers: Array<{ id: string; label: string }>;
  action?: AdminFormAction;
}) {
  const baseId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await action({
          traineeId: data.get("traineeId"), userId: data.get("userId"), type: data.get("type"),
          isPrimary: data.get("isPrimary") === "on", startDate: data.get("startDate"), confirm: true,
        });
        if (result.success) {
          setConfirmed(false);
          setFeedback({ kind: "success", message: "审核关系已替换，原关系已保留为历史" });
        } else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
      } catch (error) { setFeedback(failureFeedback(error)); }
    });
  };
  const fieldId = (name: string) => `${baseId}-${name}`;
  return <form className="admin-form" onSubmit={submit}>
    <div className="form-field"><Label htmlFor={fieldId("trainee")}>新人</Label><Select id={fieldId("trainee")} name="traineeId" required>{trainees.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</Select><FieldErrors errors={feedback?.fieldErrors?.traineeId} /></div>
    <div className="form-field"><Label htmlFor={fieldId("user")}>审核人</Label><Select id={fieldId("user")} name="userId" required>{reviewers.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}</Select><FieldErrors errors={feedback?.fieldErrors?.userId} /></div>
    <div className="form-field"><Label htmlFor={fieldId("type")}>关系</Label><Select id={fieldId("type")} name="type"><option value="MENTOR">导师</option><option value="SUPERVISOR">主管</option></Select><FieldErrors errors={feedback?.fieldErrors?.type} /></div>
    <div className="form-field"><Label htmlFor={fieldId("start")}>生效日期</Label><Input id={fieldId("start")} name="startDate" required type="date" /><FieldErrors errors={feedback?.fieldErrors?.startDate} /></div>
    <label><input name="isPrimary" type="checkbox" />设为主要审核人</label>
    <label><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />确认替换同类型当前关系，并结束旧关系</label>
    <Button disabled={!confirmed || pending} type="submit">{pending ? "正在替换…" : "确认替换关系"}</Button>
    <ActionFeedback feedback={feedback} />
  </form>;
}
