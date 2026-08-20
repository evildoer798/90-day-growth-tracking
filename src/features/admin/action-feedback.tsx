import type { AdminActionResult } from "@/server/actions/admin.actions";

export type AdminFormAction = (input: unknown) => Promise<AdminActionResult>;

export type FeedbackState = {
  kind: "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
} | null;

export function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <ul className="admin-field-errors">{errors.map((error) => <li key={error}>{error}</li>)}</ul>;
}

export function ActionFeedback({ feedback }: { feedback: FeedbackState }) {
  if (!feedback) return null;
  return <p role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>;
}

export const failureFeedback = (error: unknown): NonNullable<FeedbackState> => ({
  kind: "error",
  message: error instanceof Error && error.message ? error.message : "操作失败，请稍后重试",
});
