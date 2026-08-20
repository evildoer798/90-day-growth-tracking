import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";

import { APP_CONFIG } from "@/config/app.config";
import { THEME } from "@/config/theme.config";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.title,
  description: APP_CONFIG.description,
};

const themeVariables = {
  "--color-primary": THEME.primary,
  "--color-primary-foreground": THEME.primaryForeground,
  "--color-background": THEME.background,
  "--color-surface": THEME.surface,
  "--color-border": THEME.border,
  "--color-success": THEME.success,
  "--color-warning": THEME.warning,
  "--color-danger": THEME.danger,
  "--color-action": THEME.action,
  "--color-action-soft": THEME.actionSoft,
  "--color-drill": THEME.drill,
  "--color-drill-soft": THEME.drillSoft,
  "--color-muted": THEME.muted,
  "--badge-neutral-foreground": THEME.badges.neutral.foreground,
  "--badge-neutral-background": THEME.badges.neutral.background,
  "--badge-primary-foreground": THEME.badges.primary.foreground,
  "--badge-primary-background": THEME.badges.primary.background,
  "--badge-success-foreground": THEME.badges.success.foreground,
  "--badge-success-background": THEME.badges.success.background,
  "--badge-warning-foreground": THEME.badges.warning.foreground,
  "--badge-warning-background": THEME.badges.warning.background,
  "--badge-danger-foreground": THEME.badges.danger.foreground,
  "--badge-danger-background": THEME.badges.danger.background,
  "--badge-action-foreground": THEME.badges.action.foreground,
  "--badge-action-background": THEME.badges.action.background,
  "--badge-drill-foreground": THEME.badges.drill.foreground,
  "--badge-drill-background": THEME.badges.drill.background,
} as CSSProperties;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" style={themeVariables}>
      <body>{children}</body>
    </html>
  );
}
