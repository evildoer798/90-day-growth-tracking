"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROLE_HOME, roleForPathname } from "@/config/navigation.config";
import { ROLE_LABELS, type RoleCode } from "@/config/roles.config";
import { UI_TEXT } from "@/config/ui-text.config";

export interface RoleSwitcherProps {
  roles: readonly RoleCode[];
  activeRole?: RoleCode;
}

export function RoleSwitcher({ roles, activeRole }: RoleSwitcherProps) {
  const pathname = usePathname();
  const pathnameRole = roleForPathname(pathname);
  const currentRole =
    activeRole ??
    roles.find((role) => role === pathnameRole);

  if (roles.length < 2) {
    return roles[0] ? <span className="role-label">{ROLE_LABELS[roles[0]]}</span> : null;
  }

  return (
    <nav aria-label={UI_TEXT.roleView} className="role-switcher">
      {roles.map((role) => (
        <Link
          aria-current={role === currentRole ? "page" : undefined}
          className="role-switcher__link"
          href={ROLE_HOME[role]}
          key={role}
        >
          {ROLE_LABELS[role]}
        </Link>
      ))}
    </nav>
  );
}
