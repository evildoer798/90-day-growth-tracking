// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROLE_CODES, type RoleCode } from "@/config/roles.config";
import type { Actor } from "@/server/auth/get-actor";

const boundary = vi.hoisted(() => ({
  getActor: vi.fn<() => Promise<Actor>>(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth/get-actor", () => ({ getActor: boundary.getActor }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import RoleLandingPage from "@/app/(protected)/role/[role]/page";

afterEach(() => {
  cleanup();
  boundary.getActor.mockReset();
  boundary.redirect.mockClear();
});

const actorWithRole = (role: RoleCode): Actor => ({
  userId: `user-${role.toLowerCase()}`,
  roles: [role],
  traineeId: role === ROLE_CODES.TRAINEE ? "trainee-1" : null,
  enabled: true,
});

const renderRole = async (role: string) => {
  const page = await RoleLandingPage({ params: Promise.resolve({ role }) });
  render(page);
};

describe("protected role landing", () => {
  it.each([
    ["admin", ROLE_CODES.ADMIN, "管理员工作台", "管理人员、账户、关系、任务、Excel 导入与审计记录。"],
    ["supervisor", ROLE_CODES.SUPERVISOR, "主管工作台", "查看团队进度、风险和全部启用新人。"],
    ["mentor", ROLE_CODES.MENTOR, "导师工作台", "查看负责新人并处理 Action 与 Drill 确认。"],
    ["trainee", ROLE_CODES.TRAINEE, "新人成长追踪", "查看并完成自己的 90 天培养任务。"],
  ] as const)(
    "renders the existing /role/%s destination from the fresh %s actor",
    async (slug, role, heading, nextStep) => {
      boundary.getActor.mockResolvedValue(actorWithRole(role));

      await renderRole(slug);

      expect(boundary.getActor).toHaveBeenCalledOnce();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.getByText(nextStep)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute(
        "href",
        "/",
      );
    },
  );

  it.each([
    ["admin", ROLE_CODES.ADMIN, "进入管理后台", "/admin/trainees"],
    ["supervisor", ROLE_CODES.SUPERVISOR, "进入主管工作台", "/supervisor"],
    ["mentor", ROLE_CODES.MENTOR, "进入导师工作台", "/mentor"],
    ["trainee", ROLE_CODES.TRAINEE, "查看我的 90 天进度", "/progress/trainee-1"],
  ] as const)("links the %s landing to its implemented dashboard", async (slug, role, label, href) => {
    boundary.getActor.mockResolvedValue(actorWithRole(role));

    await renderRole(slug);

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it("explains a missing trainee link without rendering a broken progress action", async () => {
    boundary.getActor.mockResolvedValue({ ...actorWithRole(ROLE_CODES.TRAINEE), traineeId: null });

    await renderRole("trainee");

    expect(screen.getByText("当前账户尚未关联新人档案，请联系管理员。")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "查看我的 90 天进度" })).not.toBeInTheDocument();
  });

  it("redirects when a stale requested role is absent from the freshly resolved actor", async () => {
    boundary.getActor.mockResolvedValue(actorWithRole(ROLE_CODES.TRAINEE));

    await expect(
      RoleLandingPage({ params: Promise.resolve({ role: "admin" }) }),
    ).rejects.toThrow("REDIRECT:/");

    expect(boundary.getActor).toHaveBeenCalledOnce();
    expect(boundary.redirect).toHaveBeenCalledWith("/");
  });

  it("redirects unknown role paths after resolving the current actor", async () => {
    boundary.getActor.mockResolvedValue(actorWithRole(ROLE_CODES.ADMIN));

    await expect(
      RoleLandingPage({ params: Promise.resolve({ role: "owner" }) }),
    ).rejects.toThrow("REDIRECT:/");

    expect(boundary.getActor).toHaveBeenCalledOnce();
  });
});
