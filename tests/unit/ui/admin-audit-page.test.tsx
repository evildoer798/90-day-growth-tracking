// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  listAuditLogs: vi.fn(),
}));

vi.mock("@/server/auth/get-actor", () => ({ getActor: mocks.getActor }));
vi.mock("@/server/services/admin.service", () => ({ listAuditLogs: mocks.listAuditLogs }));

import AdminAuditPage from "@/app/(protected)/admin/audit/page";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ADMIN audit page", () => {
  it("renders a defense-in-depth typed summary without malicious nested keys", async () => {
    mocks.getActor.mockResolvedValue({ userId: "admin", roles: ["ADMIN"], traineeId: null, enabled: true });
    mocks.listAuditLogs.mockResolvedValue({
      page: 1, pageSize: 25, total: 1,
      rows: [{
        id: "log-1", action: "UPDATE", entity: "USER", entityId: "user-1", createdAt: new Date("2026-08-15T00:00:00.000Z"),
        actor: { username: "ADMIN" },
        summary: {
          before: { username: "E001", roles: ["ADMIN", { passwordHash: "nested-hash" }], apiKey: "secret-key" },
          after: { username: "E002", authorization: { cookie: "secret-cookie", privateKey: "secret-key" } },
        },
      }],
    });
    render(await AdminAuditPage({ searchParams: Promise.resolve({ page: "1" }) }));
    expect(screen.getByText(/E001/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/nested-hash|secret-key|secret-cookie|passwordHash|apiKey|authorization|cookie|privateKey/);
  });
});
