import { z } from "zod";

export const normalizeEmployeeId = (employeeId: string): string =>
  employeeId.normalize("NFKC").trim().toUpperCase();

export const loginSchema = z.object({
  employeeId: z
    .string()
    .transform(normalizeEmployeeId)
    .pipe(z.string().min(1).max(64)),
  password: z.string().min(1).max(1024),
}).strict();

export type LoginInput = z.input<typeof loginSchema>;
export type LoginCredentials = z.output<typeof loginSchema>;
