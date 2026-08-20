"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "left" | "right";
}

export const DrawerContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, side = "right", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="ui-overlay" />
    <DialogPrimitive.Content
      className={clsx("ui-drawer", `ui-drawer--${side}`, className)}
      ref={ref}
      {...props}
    />
  </DialogPrimitive.Portal>
));
DrawerContent.displayName = "DrawerContent";

export const DrawerHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div className={clsx("ui-drawer__header", className)} ref={ref} {...props} />
  ),
);
DrawerHeader.displayName = "DrawerHeader";

export const DrawerTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title className={clsx("ui-drawer__title", className)} ref={ref} {...props} />
));
DrawerTitle.displayName = "DrawerTitle";

export const DrawerDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    className={clsx("ui-drawer__description", className)}
    ref={ref}
    {...props}
  />
));
DrawerDescription.displayName = "DrawerDescription";

export const DrawerBody = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div className={clsx("ui-drawer__content", className)} ref={ref} {...props} />
  ),
);
DrawerBody.displayName = "DrawerBody";

export const DrawerFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div className={clsx("ui-drawer__footer", className)} ref={ref} {...props} />
  ),
);
DrawerFooter.displayName = "DrawerFooter";
