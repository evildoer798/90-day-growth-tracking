import { clsx } from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => (
    <button
      className={clsx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
      ref={ref}
      type={type}
      {...props}
    />
  ),
);
Button.displayName = "Button";
