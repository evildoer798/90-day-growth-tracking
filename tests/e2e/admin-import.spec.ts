import * as xlsx from "xlsx";

import { expect, test } from "./fixtures/auth";
import { createTrainingPlanWorkbookBuffer } from "../fixtures/training-plan-workbook";

const invalidWorkbook = () => {
  const headers = [
    "Milestone", "Day", "Stage", "Dimension", "DimensionName",
    "Task", "Reference", "ReferenceLink", "Action", "Drill",
  ];
  const sheet = xlsx.utils.aoa_to_sheet([
    headers,
    ["", 0, "P1", "Dall", "机台管理", "无效 Day", "", "", "", ""],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "90天学习计划");
  return xlsx.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
};

test("admin previews the generated workbook, blocks errors, edits a task, and sees the audit history", async ({
  page,
  loginAs,
}) => {
  await loginAs("admin");
  await page.getByRole("link", { name: "Excel 导入" }).first().click();
  await page.getByLabel("Excel 工作簿（.xlsx，最大 10 MB）").setInputFiles({
    name: "generated-training-plan.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: createTrainingPlanWorkbookBuffer(),
  });
  await page.getByRole("button", { name: "上传并预览" }).click();
  await expect(page.getByRole("heading", { name: "导入差异预览" })).toBeVisible();
  await expect(page.getByLabel("导入统计")).toContainText("不变 90");
  await expect(page.getByLabel("导入统计")).toContainText("警告 1");
  await expect(page.getByLabel("导入统计")).toContainText("错误 0");

  await page.getByLabel("Excel 工作簿（.xlsx，最大 10 MB）").setInputFiles({
    name: "invalid-training-plan.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: invalidWorkbook(),
  });
  await page.getByRole("button", { name: "上传并预览" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "预览包含错误" })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认导入" })).toBeDisabled();

  await page.getByRole("link", { name: "任务库" }).first().click();
  await page
    .getByLabel("编辑 Day 1 任务", { exact: true })
    .filter({ hasText: "Day 1 · Dall" })
    .click();
  const taskForm = page.getByRole("form", { name: "编辑 Day 1 任务" });
  await taskForm.getByRole("textbox", { name: "任务", exact: true }).fill("新员工入职指引：见导师、主管，认识新同事（E2E 已审阅）");
  await taskForm.getByRole("button", { name: "保存任务版本" }).click();
  await expect(taskForm.getByRole("status")).toHaveText("任务已更新并记录版本");

  await page.getByRole("link", { name: "审计日志" }).first().click();
  const audit = page.getByRole("table", { name: "审计日志" });
  const updateRow = audit.getByRole("row").filter({ hasText: "UPDATE · TRAINING_TASK" }).first();
  await expect(updateRow).toBeVisible();
  await updateRow.getByText("查看变更").click();
  await expect(updateRow).toContainText("PLAN_V1-DAY-001");
});
