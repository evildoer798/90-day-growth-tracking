export const THEME = {
  primary: "#397E7A",
  primaryForeground: "#FFFFFF",
  background: "#F5F7F6",
  surface: "#FFFFFF",
  border: "#DDE5E3",
  success: "#2E8B72",
  warning: "#C6862D",
  danger: "#C95555",
  action: "#D98D4B",
  actionSoft: "#FFF4E8",
  drill: "#7D6B91",
  drillSoft: "#F3EFF7",
  muted: "#66736F",
  badges: {
    neutral: { foreground: "#40504C", background: "#EDF1F0" },
    primary: { foreground: "#245F5B", background: "#E8F2F1" },
    success: { foreground: "#1E6854", background: "#E7F4EF" },
    warning: { foreground: "#754800", background: "#FFF2DC" },
    danger: { foreground: "#913131", background: "#FFF0F0" },
    action: { foreground: "#82450F", background: "#FFF4E8" },
    drill: { foreground: "#58476C", background: "#F3EFF7" },
  },
} as const;

export type Theme = typeof THEME;
export type ThemeToken = keyof Theme;
export type ThemeColor = Exclude<Theme[ThemeToken], Theme["badges"]>;
