// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ROLE_CODES } from "@/config/roles.config";

const boundary = vi.hoisted(() => ({
  getActor: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth/get-actor", () => ({ getActor: boundary.getActor }));
vi.mock("next/navigation", () => ({ redirect: boundary.redirect }));

import ProtectedHomePage from "@/app/(protected)/page";

afterEach(cleanup);

describe("protected root landing", () => {
  it("resolves a fresh actor and redirects to a discoverable real dashboard", async () => {
    boundary.getActor.mockResolvedValue({
      userId: "admin-1",
      roles: [ROLE_CODES.ADMIN],
      traineeId: null,
      enabled: true,
    });

    await expect(ProtectedHomePage()).rejects.toThrow("REDIRECT:/admin/trainees");
    expect(boundary.getActor).toHaveBeenCalledOnce();
    expect(boundary.redirect).toHaveBeenCalledWith("/admin/trainees");
  });
});
