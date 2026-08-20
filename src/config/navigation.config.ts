import { ROLE_CODES, type RoleCode } from "@/config/roles.config";

const ALL_ROLES = [
  ROLE_CODES.ADMIN,
  ROLE_CODES.SUPERVISOR,
  ROLE_CODES.MENTOR,
  ROLE_CODES.TRAINEE,
] as const;

export const APP_ROUTES = {
  home: "/",
  login: "/login",
  mentor: "/mentor",
  mentorPending: "/mentor/pending",
  supervisor: "/supervisor",
  supervisorTrainees: "/supervisor/trainees",
  adminTrainees: "/admin/trainees",
  adminUsers: "/admin/users",
  adminRelations: "/admin/relations",
  adminTasks: "/admin/tasks",
  adminImport: "/admin/import",
  adminAudit: "/admin/audit",
} as const;

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  roles: readonly RoleCode[];
}

export const NAVIGATION: readonly NavigationItem[] = [
  { id: "home", label: "首页", href: APP_ROUTES.home, roles: ALL_ROLES },
  { id: "mentor-dashboard", label: "导师工作台", href: APP_ROUTES.mentor, roles: [ROLE_CODES.MENTOR] },
  { id: "mentor-pending", label: "待确认实践", href: APP_ROUTES.mentorPending, roles: [ROLE_CODES.MENTOR] },
  { id: "supervisor-dashboard", label: "主管工作台", href: APP_ROUTES.supervisor, roles: [ROLE_CODES.SUPERVISOR] },
  { id: "admin-trainees", label: "人员管理", href: APP_ROUTES.adminTrainees, roles: [ROLE_CODES.ADMIN] },
  { id: "admin-users", label: "账户与角色", href: APP_ROUTES.adminUsers, roles: [ROLE_CODES.ADMIN] },
  { id: "admin-relations", label: "负责关系", href: APP_ROUTES.adminRelations, roles: [ROLE_CODES.ADMIN] },
  { id: "admin-tasks", label: "任务库", href: APP_ROUTES.adminTasks, roles: [ROLE_CODES.ADMIN] },
  { id: "admin-import", label: "Excel 导入", href: APP_ROUTES.adminImport, roles: [ROLE_CODES.ADMIN] },
  { id: "admin-audit", label: "审计日志", href: APP_ROUTES.adminAudit, roles: [ROLE_CODES.ADMIN] },
];

export type NavigationId = string;
export type NavigationHref = string;

export const ROLE_HOME = {
  [ROLE_CODES.ADMIN]: "/role/admin",
  [ROLE_CODES.SUPERVISOR]: APP_ROUTES.supervisor,
  [ROLE_CODES.MENTOR]: APP_ROUTES.mentor,
  [ROLE_CODES.TRAINEE]: "/role/trainee",
} as const satisfies Record<RoleCode, string>;

export type RoleHomeHref = (typeof ROLE_HOME)[RoleCode];

export const ROLE_CODE_BY_SLUG: Readonly<Partial<Record<string, RoleCode>>> = {
  admin: ROLE_CODES.ADMIN,
  supervisor: ROLE_CODES.SUPERVISOR,
  mentor: ROLE_CODES.MENTOR,
  trainee: ROLE_CODES.TRAINEE,
};

export const roleForPathname = (pathname: string): RoleCode | undefined => {
  const segments = pathname.split("/").filter(Boolean);
  const [root, roleSlug] = segments;

  if (root === "role") return roleSlug ? ROLE_CODE_BY_SLUG[roleSlug] : undefined;
  if (root === "admin") return ROLE_CODES.ADMIN;
  if (root === "supervisor") return ROLE_CODES.SUPERVISOR;
  if (root === "mentor") return ROLE_CODES.MENTOR;
  if (root === "progress") return ROLE_CODES.TRAINEE;
  return undefined;
};

export const navigationForRoles = (
  roles: readonly RoleCode[],
): readonly NavigationItem[] =>
  NAVIGATION.filter((item) => item.roles.some((role) => roles.includes(role)));

export const navigationForActor = ({
  roles,
  traineeId,
}: {
  roles: readonly RoleCode[];
  traineeId: string | null;
}): readonly NavigationItem[] => {
  const items = [...navigationForRoles(roles)];
  const traineeOnly = roles.includes(ROLE_CODES.TRAINEE) &&
    !roles.some((role) => role !== ROLE_CODES.TRAINEE);
  if (traineeOnly && traineeId) {
    items.push({
      id: "trainee-progress",
      label: "我的 90 天进度",
      href: `/progress/${encodeURIComponent(traineeId)}`,
      roles: [ROLE_CODES.TRAINEE],
    });
  }
  return items;
};
