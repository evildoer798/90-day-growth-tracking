// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportPreview } from "@/features/import-export/import-preview";
import type { ImportPreview as ImportPreviewData } from "@/domain/import/training-plan-schema";

afterEach(cleanup);

const preview = (error: number): ImportPreviewData => ({
  checksum: "abc",
  fileName: "计划.xlsx",
  rows: [],
  canApply: error === 0,
  counts: { create: 2, update: 1, "disable-candidate": 1, skip: 3, warning: 1, error },
  items: [
    { classification: "create", stableImportKey: "PLAN-DAY-001", message: "将新增" },
    { classification: "warning", stableImportKey: "PLAN-DAY-071", message: "Reference title/link count differs (2/1); no title/URL associations were imported" },
    ...(error ? [{ classification: "error" as const, stableImportKey: "PLAN-DAY-090", message: "第 90 行无效" }] : []),
  ],
});

describe("ImportPreview", () => {
  it("renders every count and row message and disables apply when errors exist", () => {
    render(<ImportPreview onApply={vi.fn()} preview={preview(1)} previewToken="signed-token" />);
    expect(screen.getByText("新增 2")).toBeInTheDocument();
    expect(screen.getByText("更新 1")).toBeInTheDocument();
    expect(screen.getByText("停用候选 1")).toBeInTheDocument();
    expect(screen.getByText("不变 3")).toBeInTheDocument();
    expect(screen.getByText("警告 1")).toBeInTheDocument();
    expect(screen.getByText("错误 1")).toBeInTheDocument();
    expect(screen.getByText(/未猜测配对/)).toBeInTheDocument();
    expect(screen.getByText(/第 90 行无效/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认导入" })).toBeDisabled();
  });

  it("requires explicit confirmation before enabling a valid preview apply", () => {
    render(<ImportPreview onApply={vi.fn()} preview={preview(0)} previewToken="signed-token" />);
    expect(screen.getByRole("button", { name: "确认导入" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /确认按以上预览/ })).toBeInTheDocument();
  });

  it("retains confirmation and shows the Chinese action error on failure", async () => {
    const user = userEvent.setup();
    render(<ImportPreview onApply={vi.fn().mockRejectedValue(new Error("导入预览已过期，请重新上传"))} preview={preview(0)} previewToken="signed-token" />);
    const confirmation = screen.getByRole("checkbox", { name: /确认按以上预览/ });
    await user.click(confirmation);
    await user.click(screen.getByRole("button", { name: "确认导入" }));
    expect(await screen.findByText("导入预览已过期，请重新上传")).toBeInTheDocument();
    expect(confirmation).toBeChecked();
  });

  it("clears confirmation and reports success after apply succeeds", async () => {
    const user = userEvent.setup();
    render(<ImportPreview onApply={vi.fn().mockResolvedValue({ success: true })} preview={preview(0)} previewToken="signed-token" />);
    const confirmation = screen.getByRole("checkbox", { name: /确认按以上预览/ });
    await user.click(confirmation);
    await user.click(screen.getByRole("button", { name: "确认导入" }));
    expect(await screen.findByText("导入已完成")).toBeInTheDocument();
    expect(confirmation).not.toBeChecked();
  });
});
