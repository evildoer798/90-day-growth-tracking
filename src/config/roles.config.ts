export const ROLE_CODES = {
  ADMIN: "ADMIN",
  SUPERVISOR: "SUPERVISOR",
  MENTOR: "MENTOR",
  TRAINEE: "TRAINEE",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const ROLE_LABELS = {
  [ROLE_CODES.ADMIN]: "管理员",
  [ROLE_CODES.SUPERVISOR]: "主管",
  [ROLE_CODES.MENTOR]: "导师",
  [ROLE_CODES.TRAINEE]: "新人",
} as const satisfies Record<RoleCode, string>;

export type RoleLabel = (typeof ROLE_LABELS)[RoleCode];

export const ROLE_LANDING = {
  [ROLE_CODES.ADMIN]: {
    heading: "管理员工作台",
    nextStep: "管理人员、账户、关系、任务、Excel 导入与审计记录。",
    actionLabel: "进入管理后台",
  },
  [ROLE_CODES.SUPERVISOR]: {
    heading: "主管工作台",
    nextStep: "查看团队进度、风险和全部启用新人。",
    actionLabel: "进入主管工作台",
  },
  [ROLE_CODES.MENTOR]: {
    heading: "导师工作台",
    nextStep: "查看负责新人并处理 Action 与 Drill 确认。",
    actionLabel: "进入导师工作台",
  },
  [ROLE_CODES.TRAINEE]: {
    heading: "新人成长追踪",
    nextStep: "查看并完成自己的 90 天培养任务。",
    actionLabel: "查看我的 90 天进度",
  },
} as const satisfies Record<
  RoleCode,
  { readonly heading: string; readonly nextStep: string; readonly actionLabel?: string }
>;
