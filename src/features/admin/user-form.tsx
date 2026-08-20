"use client";

import { type FormEvent, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionFeedback, type AdminFormAction, FieldErrors, type FeedbackState, failureFeedback } from "@/features/admin/action-feedback";
import { createUserAction, resetUserPasswordAction, setUserEnabledAction, updateUserAction } from "@/server/actions/admin.actions";

const roleOptions = ["ADMIN", "SUPERVISOR", "MENTOR", "TRAINEE"] as const;

export interface UserFormValue {
  id: string;
  username: string;
  roles: string[];
  traineeId: string | null;
}

export function UserForm({ trainees, initial, action }: {
  trainees: Array<{ id: string; label: string }>;
  initial?: UserFormValue;
  action?: AdminFormAction;
}) {
  const baseId = useId();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(initial?.roles ?? []);
  const [selectedTraineeId, setSelectedTraineeId] = useState(initial?.traineeId ?? "");
  const submitAction = action ?? (initial ? updateUserAction : createUserAction);
  const toggleRole = (role: typeof roleOptions[number], checked: boolean) => {
    const next = checked
      ? role === "TRAINEE"
        ? ["TRAINEE"]
        : [...selectedRoles.filter((value) => value !== "TRAINEE" && value !== role), role]
      : selectedRoles.filter((value) => value !== role);
    setSelectedRoles(next);
    if (!next.includes("TRAINEE")) {
      setSelectedTraineeId("");
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await submitAction({
          ...(initial ? { id: initial.id } : { password: data.get("password") }),
          username: data.get("username"),
          roles: data.getAll("roles").map(String),
          traineeId: String(data.get("traineeId") ?? "") || null,
        });
        if (result.success) {
          setFeedback({ kind: "success", message: initial ? "账户资料已更新" : "账户已创建" });
          if (!initial) {
            form.reset();
            setSelectedRoles([]);
            setSelectedTraineeId("");
          }
        } else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
      } catch (error) { setFeedback(failureFeedback(error)); }
    });
  };
  const fieldId = (name: string) => `${baseId}-${name}`;
  return <form className="admin-form" onSubmit={submit}>
    <div className="form-field"><Label htmlFor={fieldId("name")}>登录工号</Label><Input autoComplete="username" defaultValue={initial?.username} id={fieldId("name")} name="username" required /><FieldErrors errors={feedback?.fieldErrors?.username} /></div>
    {!initial ? <div className="form-field"><Label htmlFor={fieldId("password")}>初始密码</Label><Input autoComplete="new-password" id={fieldId("password")} minLength={8} name="password" required type="password" /><FieldErrors errors={feedback?.fieldErrors?.password} /></div> : null}
    <fieldset><legend>角色</legend>{roleOptions.map((role) => <label key={role}><input checked={selectedRoles.includes(role)} name="roles" onChange={(event) => toggleRole(role, event.target.checked)} type="checkbox" value={role} />{role}</label>)}<FieldErrors errors={feedback?.fieldErrors?.roles} /></fieldset>
    <div className="form-field"><Label htmlFor={fieldId("trainee")}>新人档案（仅 TRAINEE 角色）</Label><select className="ui-select" disabled={!selectedRoles.includes("TRAINEE")} id={fieldId("trainee")} name="traineeId" onChange={(event) => setSelectedTraineeId(event.target.value)} value={selectedTraineeId}><option value="">不关联</option>{trainees.map((trainee) => <option key={trainee.id} value={trainee.id}>{trainee.label}</option>)}</select><FieldErrors errors={feedback?.fieldErrors?.traineeId} /></div>
    <Button disabled={pending} type="submit">{pending ? "正在保存…" : initial ? "保存账户修改" : "新增账户"}</Button>
    <ActionFeedback feedback={feedback} />
  </form>;
}

export function UserSecurityForm({ id, enabled, resetAction = resetUserPasswordAction, toggleAction = setUserEnabledAction }: {
  id: string;
  enabled: boolean;
  resetAction?: AdminFormAction;
  toggleAction?: AdminFormAction;
}) {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const run = (kind: "reset" | "toggle") => startTransition(async () => {
    try {
      const result = kind === "reset"
        ? await resetAction({ id, password, confirm: true })
        : await toggleAction({ id, enabled: !enabled, confirm: true });
      if (result.success) {
        setConfirmed(false);
        if (kind === "reset") setPassword("");
        setFeedback({ kind: "success", message: kind === "reset" ? "密码已重置" : enabled ? "账户已停用" : "账户已启用" });
      } else setFeedback({ kind: "error", message: result.formError, fieldErrors: result.fieldErrors });
    } catch (error) { setFeedback(failureFeedback(error)); }
  });
  return <div className="admin-security-form">
    <Input aria-label="新密码（不会显示现有密码）" autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder="输入新密码" type="password" value={password} />
    <FieldErrors errors={feedback?.fieldErrors?.password} />
    <label><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />确认敏感操作</label>
    <div><Button disabled={!confirmed || password.length < 8 || pending} onClick={() => run("reset")} size="sm" variant="secondary">{pending ? "处理中…" : "重置密码"}</Button>{" "}<Button disabled={!confirmed || pending} onClick={() => run("toggle")} size="sm" variant={enabled ? "danger" : "secondary"}>{pending ? "处理中…" : enabled ? "停用账户" : "启用账户"}</Button></div>
    <ActionFeedback feedback={feedback} />
  </div>;
}
