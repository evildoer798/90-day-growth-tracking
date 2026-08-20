"use client";

import { type FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UI_TEXT } from "@/config/ui-text.config";
import type { RegisterInput } from "@/features/auth/register-schema";
import type {
  RegisterActionResult,
  RegisterField,
} from "@/server/actions/auth.actions";

export type RegisterFormAction = (
  input: RegisterInput,
) => Promise<RegisterActionResult>;

export interface RegisterFormProps {
  action: RegisterFormAction;
  onSuccess: (employeeId: string) => void;
}

export function RegisterForm({ action, onSuccess }: RegisterFormProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RegisterField, string>>
  >({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const input = {
      employeeId: String(data.get("employeeId") ?? ""),
      name: String(data.get("name") ?? ""),
      password: String(data.get("password") ?? ""),
    };

    startTransition(async () => {
      try {
        const result = await action(input);
        if (result.success) {
          onSuccess(result.employeeId);
          return;
        }
        setMessage(result.message);
        setFieldErrors(result.fieldErrors ?? {});
      } catch {
        setMessage(UI_TEXT.registerError);
      }
    });
  };

  const describedBy = (field: RegisterField, hint?: string) =>
    [hint, fieldErrors[field] ? `register-${field}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form className="login-form" method="post" onSubmit={handleSubmit}>
      <div className="form-field">
        <Label htmlFor="register-employeeId">{UI_TEXT.employeeId}</Label>
        <Input
          aria-describedby={describedBy("employeeId")}
          aria-invalid={Boolean(fieldErrors.employeeId)}
          autoCapitalize="characters"
          autoComplete="username"
          disabled={isPending}
          id="register-employeeId"
          maxLength={64}
          name="employeeId"
          required
        />
        {fieldErrors.employeeId ? (
          <p className="form-field-error" id="register-employeeId-error">
            {fieldErrors.employeeId}
          </p>
        ) : null}
      </div>
      <div className="form-field">
        <Label htmlFor="register-name">{UI_TEXT.name}</Label>
        <Input
          aria-describedby={describedBy("name")}
          aria-invalid={Boolean(fieldErrors.name)}
          autoComplete="name"
          disabled={isPending}
          id="register-name"
          maxLength={100}
          name="name"
          required
        />
        {fieldErrors.name ? (
          <p className="form-field-error" id="register-name-error">
            {fieldErrors.name}
          </p>
        ) : null}
      </div>
      <div className="form-field">
        <Label htmlFor="register-password">{UI_TEXT.password}</Label>
        <Input
          aria-describedby={describedBy("password", "register-password-hint")}
          aria-invalid={Boolean(fieldErrors.password)}
          autoComplete="new-password"
          disabled={isPending}
          id="register-password"
          maxLength={1024}
          minLength={8}
          name="password"
          required
          type="password"
        />
        <p className="form-hint" id="register-password-hint">
          {UI_TEXT.registerPasswordHint}
        </p>
        {fieldErrors.password ? (
          <p className="form-field-error" id="register-password-error">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <Button className="login-submit" disabled={isPending} type="submit">
        {isPending ? UI_TEXT.registering : UI_TEXT.register}
      </Button>
      {isPending ? (
        <p className="sr-only" role="status">
          {UI_TEXT.registerPending}
        </p>
      ) : null}
    </form>
  );
}
