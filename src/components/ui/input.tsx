import { clsx } from "clsx";
import { forwardRef, type InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input className={clsx("ui-input", className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";
