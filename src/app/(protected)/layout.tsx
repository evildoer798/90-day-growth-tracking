import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/common/app-header";
import { AppSidebar } from "@/components/common/app-sidebar";
import { APP_ROUTES, navigationForActor } from "@/config/navigation.config";
import { getActor, UnauthorizedError } from "@/server/auth/get-actor";

export default async function ProtectedLayout({ children }: Readonly<{ children: ReactNode }>) {
  let actor;
  try {
    actor = await getActor();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(APP_ROUTES.login);
    }
    throw error;
  }

  const navigation = navigationForActor(actor);

  return (
    <div className="app-frame">
      <AppHeader items={navigation} roles={actor.roles} />
      <aside className="app-sidebar">
        <AppSidebar items={navigation} />
      </aside>
      <main className="app-content">{children}</main>
    </div>
  );
}
