// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeTraineeSearch, TraineeSearch } from "@/features/trainee/trainee-search";

afterEach(cleanup);

describe("trainee search", () => {
  it("renders a visible name or employee-ID search and preserves its query", () => {
    render(<TraineeSearch action="/admin/trainees" query="E001" />);

    expect(screen.getByRole("searchbox", { name: "搜索新人" })).toHaveValue("E001");
    expect(screen.getByRole("button", { name: "搜索" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "清除搜索" })).toHaveAttribute("href", "/admin/trainees");
  });

  it("normalizes repeated or oversized URL values", () => {
    expect(normalizeTraineeSearch(["  张三  ", "ignored"])).toBe("张三");
    expect(normalizeTraineeSearch("x".repeat(100))).toHaveLength(80);
    expect(normalizeTraineeSearch(undefined)).toBe("");
  });
});
