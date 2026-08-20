// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

afterEach(cleanup);

describe("Tabs", () => {
  it("associates tabs and panels while hiding inactive content", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="任务视图">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="history">历史</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">概览内容</TabsContent>
        <TabsContent value="history">历史内容</TabsContent>
      </Tabs>,
    );

    const overview = screen.getByRole("tab", { name: "概览" });
    const history = screen.getByRole("tab", { name: "历史" });
    const panel = screen.getByRole("tabpanel", { name: "概览" });
    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(history).toHaveAttribute("aria-selected", "false");
    expect(history).toHaveAttribute("tabindex", "-1");
    expect(overview).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", overview.id);
    expect(screen.queryByText("历史内容")).not.toBeInTheDocument();
    await user.tab();
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("tabindex", "0");
  });

  it("supports automatic arrow, Home, and End keyboard activation", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="one">
        <TabsList aria-label="步骤">
          <TabsTrigger value="one">第一步</TabsTrigger>
          <TabsTrigger value="two">第二步</TabsTrigger>
          <TabsTrigger value="three">第三步</TabsTrigger>
        </TabsList>
        <TabsContent value="one">一</TabsContent>
        <TabsContent value="two">二</TabsContent>
        <TabsContent value="three">三</TabsContent>
      </Tabs>,
    );

    const first = screen.getByRole("tab", { name: "第一步" });
    const second = screen.getByRole("tab", { name: "第二步" });
    const third = screen.getByRole("tab", { name: "第三步" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(third).toHaveFocus();
    expect(third).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(third).toHaveFocus();
  });

  it("supports controlled selection", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs onValueChange={onValueChange} value="one">
        <TabsList aria-label="受控视图">
          <TabsTrigger value="one">视图一</TabsTrigger>
          <TabsTrigger value="two">视图二</TabsTrigger>
        </TabsList>
        <TabsContent value="one">内容一</TabsContent>
        <TabsContent value="two">内容二</TabsContent>
      </Tabs>,
    );

    await user.click(screen.getByRole("tab", { name: "视图二" }));
    expect(onValueChange).toHaveBeenCalledWith("two");
    expect(screen.getByRole("tab", { name: "视图一" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
