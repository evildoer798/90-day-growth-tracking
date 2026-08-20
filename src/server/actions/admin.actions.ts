"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { getActor } from "@/server/auth/get-actor";
import { ForbiddenError } from "@/server/auth/require-permission";
import {
  createTrainee, createUser, replaceReviewerRelation, resetUserPassword,
  setTraineeEnabled, setTrainingTaskEnabled, setUserEnabled,
  TrainingPlanDurationRangeError, TrainingPlanRevisionConflictError,
  updateTrainee, updateTrainingPlanDuration, updateTrainingTask, updateUser,
} from "@/server/services/admin.service";

export type AdminActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; fieldErrors?: Record<string, string[]>; formError: string };

const execute = async <T>(operation: () => Promise<T>, path: string): Promise<AdminActionResult<T>> => {
  try {
    const data = await operation();
    revalidatePath(path);
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      const flattened = error.flatten();
      return { success: false, fieldErrors: flattened.fieldErrors as Record<string, string[]>, formError: "请检查表单中的错误" };
    }
    if (error instanceof ForbiddenError) {
      return { success: false, formError: "当前账户已无管理员权限，请刷新页面后重试" };
    }
    if (error instanceof TrainingPlanRevisionConflictError || error instanceof TrainingPlanDurationRangeError) {
      return { success: false, formError: error.message };
    }
    if (error instanceof Error && [
      "工号已存在，不能合并人员档案", "登录工号已存在", "不能停用当前登录账户",
      "人员不存在或已停用", "不能将新人指定为自己的审核人", "审核人角色与关系类型不匹配",
      "关联的新人档案不存在或已停用", "角色配置不完整",
    ].includes(error.message)) return { success: false, formError: error.message };
    return { success: false, formError: "操作失败，请刷新页面后重试" };
  }
};

export const createTraineeAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => createTrainee(actor, input), "/admin/trainees");
};
export const updateTraineeAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => updateTrainee(actor, input), "/admin/trainees");
};
export const setTraineeEnabledAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => setTraineeEnabled(actor, input), "/admin/trainees");
};
export const createUserAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => createUser(actor, input), "/admin/users");
};
export const updateUserAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => updateUser(actor, input), "/admin/users");
};
export const resetUserPasswordAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => resetUserPassword(actor, input), "/admin/users");
};
export const setUserEnabledAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => setUserEnabled(actor, input), "/admin/users");
};
export const replaceReviewerRelationAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => replaceReviewerRelation(actor, input), "/admin/relations");
};
export const updateTrainingTaskAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => updateTrainingTask(actor, input), "/admin/tasks");
};
export const setTrainingTaskEnabledAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => setTrainingTaskEnabled(actor, input), "/admin/tasks");
};
export const updateTrainingPlanDurationAction = async (input: unknown) => {
  const actor = await getActor();
  return execute(() => updateTrainingPlanDuration(actor, input), "/admin/tasks");
};
