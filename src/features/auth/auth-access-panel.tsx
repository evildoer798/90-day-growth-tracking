"use client";

import { useState } from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { UI_TEXT } from "@/config/ui-text.config";
import { LoginForm, type LoginFormAction } from "@/features/auth/login-form";
import {
  RegisterForm,
  type RegisterFormAction,
} from "@/features/auth/register-form";

type AuthTab = "login" | "register";

export interface AuthAccessPanelProps {
  loginAction: LoginFormAction;
  registerAction: RegisterFormAction;
}

export function AuthAccessPanel({
  loginAction,
  registerAction,
}: AuthAccessPanelProps) {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [registeredEmployeeId, setRegisteredEmployeeId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const handleTabChange = (value: string) => {
    if (value !== "login" && value !== "register") return;
    setActiveTab(value);
    if (value === "register") setNotice(null);
  };

  const handleRegistrationSuccess = (employeeId: string) => {
    setRegisteredEmployeeId(employeeId);
    setNotice(UI_TEXT.registerSuccess);
    setActiveTab("login");
  };

  return (
    <Tabs className="auth-tabs" onValueChange={handleTabChange} value={activeTab}>
      <TabsList aria-label={UI_TEXT.accountAccess} className="auth-tabs__list">
        <TabsTrigger value="login">{UI_TEXT.login}</TabsTrigger>
        <TabsTrigger value="register">{UI_TEXT.register}</TabsTrigger>
      </TabsList>
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}
      <TabsContent value="login">
        <LoginForm
          action={loginAction}
          initialEmployeeId={registeredEmployeeId}
          key={registeredEmployeeId || "login"}
        />
      </TabsContent>
      <TabsContent value="register">
        <RegisterForm action={registerAction} onSuccess={handleRegistrationSuccess} />
      </TabsContent>
    </Tabs>
  );
}
