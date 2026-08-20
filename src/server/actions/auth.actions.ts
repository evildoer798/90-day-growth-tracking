"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";
import { APP_ROUTES } from "@/config/navigation.config";
import { loginSchema, type LoginInput } from "@/features/auth/login-schema";
import { registerSchema, type RegisterInput } from "@/features/auth/register-schema";
import {
  registerTraineeAccount,
  RegistrationConflictError,
  RegistrationUnavailableError,
} from "@/server/services/registration.service";

export interface LoginActionResult {
  success: false;
}

export type RegisterField = "employeeId" | "name" | "password";

export type RegisterActionResult =
  | { success: true; employeeId: string }
  | {
      success: false;
      message: string;
      fieldErrors?: Partial<Record<RegisterField, string>>;
    };

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: APP_ROUTES.login });
}

export async function loginAction(
  input: LoginInput,
): Promise<LoginActionResult | void> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false };
  }

  try {
    await signIn("credentials", {
      employeeId: parsed.data.employeeId,
      password: parsed.data.password,
      redirectTo: APP_ROUTES.home,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false };
    }
    throw error;
  }
}

export async function registerAction(
  input: RegisterInput,
): Promise<RegisterActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<RegisterField, string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "employeeId" || field === "name" || field === "password") &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      success: false,
      message: "请检查填写内容后重试",
      fieldErrors,
    };
  }

  try {
    return { success: true, ...(await registerTraineeAccount(parsed.data)) };
  } catch (error) {
    if (error instanceof RegistrationConflictError) {
      return { success: false, message: "该工号已注册，请直接登录或联系管理员" };
    }
    if (error instanceof RegistrationUnavailableError) {
      return { success: false, message: "暂时无法注册，请联系管理员" };
    }
    return { success: false, message: "注册失败，请稍后重试" };
  }
}
