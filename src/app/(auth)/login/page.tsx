import { APP_CONFIG } from "@/config/app.config";
import { UI_TEXT } from "@/config/ui-text.config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthAccessPanel } from "@/features/auth/auth-access-panel";
import { loginAction, registerAction } from "@/server/actions/auth.actions";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section aria-labelledby="login-heading" className="login-panel">
        <div className="login-brand">
          <span aria-hidden="true" className="login-brand__mark">90</span>
          <div>
            <p className="login-brand__title">{APP_CONFIG.title}</p>
            <p className="login-brand__subtitle">{APP_CONFIG.subtitle}</p>
          </div>
        </div>
        <Card className="login-card">
          <CardHeader>
            <CardTitle id="login-heading">{UI_TEXT.accountAccessTitle}</CardTitle>
            <CardDescription>{UI_TEXT.accountAccessHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <AuthAccessPanel loginAction={loginAction} registerAction={registerAction} />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
