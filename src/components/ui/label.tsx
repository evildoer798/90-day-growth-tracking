import { clsx } from "clsx";
import { forwardRef, type LabelHTMLAttributes } from "react";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label className={clsx("ui-label", className)} ref={ref} {...props} />
  ),
);
Label.displayName = "Label";
