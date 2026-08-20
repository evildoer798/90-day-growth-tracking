export const APP_CONFIG = {
  title: "机台集成团队新员工90天成长追踪",
  subtitle: "三步打卡 · 学 · 练 · 干",
  description: "机台集成团队新员工培养与进度协作平台",
  trainingDays: 90,
  defaultPageSize: 20,
} as const;

export type AppConfig = typeof APP_CONFIG;
export type AppConfigKey = keyof AppConfig;
export type AppConfigValue = AppConfig[AppConfigKey];
