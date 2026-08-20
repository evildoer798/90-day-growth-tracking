"use client";

import { type FormEvent, useState, useTransition } from "react";

import { UI_TEXT } from "@/config/ui-text.config";
import type { LoginInput } from "@/features/auth/login-schema";
import type { LoginActionResult } from "@/server/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LoginFormAction = (
  credentials: LoginInput,
) => Promise<LoginActionResult | void>;

export interface LoginFormProps {
  action: LoginFormAction;
  initialEmployeeId?: string;
}

export function LoginForm({ action, initialEmployeeId = "" }: LoginFormProps) {
  const [isPending, startTransition] = useTransition();
  const [hasError, setHasError] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasError(false);

    const form = event.currentTarget;
    const data = new FormData(form);
    const credentials = {
      employeeId: String(data.get("employeeId") ?? ""),
      password: String(data.get("password") ?? ""),
    };

    startTransition(async () => {
      try {
        const result = await action(credentials);
        if (result?.success === false) {
          setHasError(true);
        }
      } catch {
        setHasError(true);
      }
    });
  };

  return (
    <form className="login-form" method="post" onSubmit={handleSubmit}>
      <div className="form-field">
        <Label htmlFor="employeeId">{UI_TEXT.employeeId}</Label>
        <Input
          autoCapitalize="characters"
          autoComplete="username"
          defaultValue={initialEmployeeId}
          disabled={isPending}
          id="employeeId"
          maxLength={64}
          name="employeeId"
          required
        />
      </div>
      <div className="form-field">
        <Label htmlFor="password">{UI_TEXT.password}</Label>
        <Input
          autoComplete="current-password"
          disabled={isPending}
          id="password"
          maxLength={1024}
          name="password"
          required
          type="password"
        />
      </div>
      {hasError ? (
        <p className="form-error" role="alert">
          {UI_TEXT.loginError}
        </p>
      ) : null}
      <Button className="login-submit" disabled={isPending} type="submit">
        {isPending ? UI_TEXT.loggingIn : UI_TEXT.login}
      </Button>
      {isPending ? (
        <p className="sr-only" role="status">
          {UI_TEXT.loginPending}
        </p>
      ) : null}
    </form>
  );
}
