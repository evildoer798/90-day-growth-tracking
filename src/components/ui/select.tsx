import { clsx } from "clsx";
import { forwardRef, type SelectHTMLAttributes } from "react";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => (
    <select className={clsx("ui-select", className)} ref={ref} {...props} />
  ),
);
Select.displayName = "Select";
