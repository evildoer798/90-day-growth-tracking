// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

afterEach(cleanup);

describe("modal overlay primitives", () => {
  it("labels the dialog, traps focus, closes on Escape, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">背景操作</button>
        <Dialog>
          <DialogTrigger>打开对话框</DialogTrigger>
          <DialogContent>
            <DialogTitle>确认操作</DialogTitle>
            <DialogDescription>请确认是否继续</DialogDescription>
            <button type="button">取消</button>
            <button type="button">确认</button>
          </DialogContent>
        </Dialog>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "打开对话框" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "确认操作" });
    const title = within(dialog).getByText("确认操作");
    const description = within(dialog).getByText("请确认是否继续");
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
    expect(dialog).toHaveAttribute("aria-describedby", description.id);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(
      screen.queryByRole("button", { name: "背景操作" }),
    ).not.toBeInTheDocument();
    expect(document.body).toHaveAttribute("data-scroll-locked", "1");

    const buttons = within(dialog).getAllByRole("button");
    buttons.at(-1)?.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("gives the drawer modal semantics and restores focus after Escape", async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger>打开抽屉</DrawerTrigger>
        <DrawerContent side="left">
          <DrawerTitle>任务详情</DrawerTitle>
          <DrawerDescription>查看任务信息</DrawerDescription>
          <button type="button">完成</button>
        </DrawerContent>
      </Drawer>,
    );

    const trigger = screen.getByRole("button", { name: "打开抽屉" });
    await user.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "任务详情" });
    expect(drawer).toHaveAttribute(
      "aria-describedby",
      within(drawer).getByText("查看任务信息").id,
    );
    expect(drawer).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
