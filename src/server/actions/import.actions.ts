"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActor } from "@/server/auth/get-actor";
import { applyImportPreviewToken, previewAdminImport, readValidatedWorkbookFile } from "@/server/services/admin-import.service";
import { requireManageUsers } from "@/server/auth/require-permission";

const tokenSchema = z.string().min(20).max(20_000_000);
const secret = () => {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 16) throw new Error("导入签名密钥未配置");
  return value;
};

export async function previewTrainingPlanAction(formData: FormData) {
  const actor = await getActor();
  requireManageUsers(actor);
  const file = formData.get("workbook");
  if (!(file instanceof File)) throw new Error("请选择 Excel 工作簿");
  return previewAdminImport(actor, await readValidatedWorkbookFile(file), secret());
}

export async function applyTrainingPlanAction(input: unknown) {
  const actor = await getActor();
  requireManageUsers(actor);
  const token = tokenSchema.parse(input);
  const batch = await applyImportPreviewToken(actor, token, secret());
  revalidatePath("/admin/import");
  revalidatePath("/admin/tasks");
  return { success: true as const, batchId: batch.id };
}
