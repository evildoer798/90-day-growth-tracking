import { Menu } from "lucide-react";

import { APP_CONFIG } from "@/config/app.config";
import type { NavigationItem } from "@/config/navigation.config";
import type { RoleCode } from "@/config/roles.config";
import { UI_TEXT } from "@/config/ui-text.config";
import { AppSidebar } from "@/components/common/app-sidebar";
import { RoleSwitcher } from "@/components/common/role-switcher";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth.actions";

export interface AppHeaderProps {
  items: readonly NavigationItem[];
  roles: readonly RoleCode[];
}

export function AppHeader({ items, roles }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__mark" aria-hidden="true">
          90
        </span>
        <div>
          <p className="app-header__title">{APP_CONFIG.title}</p>
          <p className="app-header__subtitle">{APP_CONFIG.subtitle}</p>
        </div>
      </div>
      <div className="app-header__actions">
        <RoleSwitcher roles={roles} />
        <form action={logoutAction}>
          <Button size="sm" type="submit" variant="ghost">退出登录</Button>
        </form>
        <details className="mobile-navigation">
          <summary aria-label={UI_TEXT.openNavigation}>
            <Menu aria-hidden="true" size={21} />
            <span className="sr-only">{UI_TEXT.openNavigation}</span>
          </summary>
          <div className="mobile-navigation__panel">
            <AppSidebar items={items} />
          </div>
        </details>
      </div>
    </header>
  );
}
