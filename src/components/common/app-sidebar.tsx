import Link from "next/link";

import { UI_TEXT } from "@/config/ui-text.config";
import type { NavigationItem } from "@/config/navigation.config";

export interface AppSidebarProps {
  items: readonly NavigationItem[];
  className?: string;
}

export function AppSidebar({ items, className }: AppSidebarProps) {
  return (
    <nav aria-label={UI_TEXT.navigation} className={className}>
      <ul className="app-nav__list">
        {items.map((item) => (
          <li key={item.id}>
            <Link className="app-nav__link" href={item.href}>
              <span aria-hidden="true" className="app-nav__marker" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
