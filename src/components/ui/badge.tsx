import { clsx } from "clsx";
import { forwardRef, type HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "primary" | "success" | "warning" | "danger" | "action" | "drill";
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", ...props }, ref) => (
    <span className={clsx("ui-badge", `ui-badge--${variant}`, className)} ref={ref} {...props} />
  ),
);
Badge.displayName = "Badge";
