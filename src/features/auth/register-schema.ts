import { z } from "zod";

import { normalizeEmployeeId } from "@/features/auth/login-schema";

const normalizeName = (name: string): string => name.normalize("NFKC").trim();

export const registerSchema = z.object({
  employeeId: z
    .string()
    .transform(normalizeEmployeeId)
    .pipe(z.string().min(1, "请输入工号").max(64, "工号不能超过 64 个字符")),
  name: z
    .string()
    .transform(normalizeName)
    .pipe(z.string().min(1, "请输入姓名").max(100, "姓名不能超过 100 个字符")),
  password: z
    .string()
    .min(8, "密码至少需要 8 位")
    .max(1024, "密码过长，请重新设置"),
}).strict();

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterCredentials = z.output<typeof registerSchema>;
