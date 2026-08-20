import { clsx } from "clsx";
import { forwardRef, type TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea className={clsx("ui-textarea", className)} ref={ref} {...props} />
  ),
);
Textarea.displayName = "Textarea";
