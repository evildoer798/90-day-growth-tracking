import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_ROUTES, ROLE_CODE_BY_SLUG, ROLE_HOME } from "@/config/navigation.config";
import { ROLE_LABELS, ROLE_LANDING } from "@/config/roles.config";
import { UI_TEXT } from "@/config/ui-text.config";
import { getActor } from "@/server/auth/get-actor";

export interface RoleLandingPageProps {
  params: Promise<{ role: string }>;
}

export default async function RoleLandingPage({ params }: RoleLandingPageProps) {
  const [actor, { role: roleSlug }] = await Promise.all([getActor(), params]);
  const requestedRole = ROLE_CODE_BY_SLUG[roleSlug];

  if (!requestedRole || !actor.roles.includes(requestedRole)) {
    redirect(APP_ROUTES.home);
  }

  const content = ROLE_LANDING[requestedRole];
  const actionHref = requestedRole === "TRAINEE"
    ? actor.traineeId ? `/progress/${encodeURIComponent(actor.traineeId)}` : null
    : requestedRole === "ADMIN" ? APP_ROUTES.adminTrainees : ROLE_HOME[requestedRole];

  return (
    <section aria-labelledby="role-landing-heading" className="role-landing">
      <Card>
        <CardHeader>
          <Badge variant="primary">{ROLE_LABELS[requestedRole]}</Badge>
          <CardTitle id="role-landing-heading">{content.heading}</CardTitle>
          <CardDescription>{content.nextStep}</CardDescription>
        </CardHeader>
        <CardContent>
          {"actionLabel" in content && actionHref ? (
            <Link className="role-dashboard__primary-link" href={actionHref}>
              {content.actionLabel}
            </Link>
          ) : null}
          {requestedRole === "TRAINEE" && !actor.traineeId ? (
            <p>当前账户尚未关联新人档案，请联系管理员。</p>
          ) : null}
          <Link className="role-landing__back" href={APP_ROUTES.home}>
            {UI_TEXT.backHome}
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
