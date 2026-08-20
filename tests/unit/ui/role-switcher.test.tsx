// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROLE_CODES } from "@/config/roles.config";

const navigation = vi.hoisted(() => ({ pathname: "/mentor" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { RoleSwitcher } from "@/components/common/role-switcher";

afterEach(() => {
  cleanup();
  navigation.pathname = "/mentor";
});

describe("RoleSwitcher", () => {
  it("renders distinct existing destinations for every live role", () => {
    render(
      <RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.MENTOR]} />,
    );

    expect(screen.getByRole("link", { name: "管理员" })).toHaveAttribute(
      "href",
      "/role/admin",
    );
    expect(screen.getByRole("link", { name: "导师" })).toHaveAttribute(
      "href",
      "/mentor",
    );
  });

  it("marks the role represented by the current pathname", () => {
    render(
      <RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.MENTOR]} />,
    );

    expect(screen.getByRole("link", { name: "导师" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "管理员" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the role home current on a segment-bounded nested path", () => {
    navigation.pathname = "/mentor/pending";
    render(
      <RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.MENTOR]} />,
    );

    expect(screen.getByRole("link", { name: "导师" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "管理员" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("does not match a similar unbounded path prefix", () => {
    navigation.pathname = "/mentorish";
    const { container } = render(
      <RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.MENTOR]} />,
    );

    expect(container.querySelector('[aria-current="page"]')).toBeNull();
  });

  it("maps a real ADMIN management path to the ADMIN role", () => {
    navigation.pathname = "/admin/import";
    render(<RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.TRAINEE]} />);

    expect(screen.getByRole("link", { name: "管理员" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "新人" })).not.toHaveAttribute("aria-current");
  });

  it("maps a progress detail path to the TRAINEE role", () => {
    navigation.pathname = "/progress/trainee-001";
    render(<RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.TRAINEE]} />);

    expect(screen.getByRole("link", { name: "新人" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "管理员" })).not.toHaveAttribute("aria-current");
  });

  it("maps role landing paths and leaves unknown paths without a current role", () => {
    navigation.pathname = "/role/admin";
    const { rerender, container } = render(
      <RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.TRAINEE]} />,
    );
    expect(screen.getByRole("link", { name: "管理员" })).toHaveAttribute("aria-current", "page");

    navigation.pathname = "/administrator/import";
    rerender(<RoleSwitcher roles={[ROLE_CODES.ADMIN, ROLE_CODES.TRAINEE]} />);
    expect(container.querySelector('[aria-current="page"]')).toBeNull();
  });
});
