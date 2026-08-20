import { E2E_IDENTITIES, expect, test } from "./fixtures/auth";

test("mentor sees assigned people only and confirmation history follows confirm/unconfirm/reconfirm", async ({
  page,
  loginAs,
  e2eData,
}) => {
  await loginAs("trainee");
  const traineeDayOne = page.getByRole("article", {
    name: "新员工入职指引：见导师、主管，认识新同事",
  });
  await traineeDayOne.getByRole("button", { name: "提交 Action 已完成" }).click();
  await expect(traineeDayOne.getByRole("status")).toHaveText("Action 已提交，等待导师确认");
  await page.getByRole("button", { name: "退出登录" }).click();

  await loginAs("mentor");
  await expect(page.getByRole("heading", { name: "导师工作台" })).toBeVisible();
  await expect(page.getByRole("article", { name: `${E2E_IDENTITIES.trainee.name}的培养概览` })).toBeVisible();
  await expect(page.getByText(E2E_IDENTITIES.unassignedTrainee.name)).toHaveCount(0);

  await expect(page.getByRole("link", { name: "处理待确认（1）" })).toBeVisible();
  await page.getByRole("link", { name: "处理待确认（1）" }).click();
  const queueItem = page.getByRole("article", {
    name: `${E2E_IDENTITIES.trainee.name}第 1 天 Action 确认`,
  });
  await queueItem.getByRole("button", { name: `确认${E2E_IDENTITIES.trainee.name}第 1 天 Action` }).click();
  await expect(queueItem).toBeHidden();

  await page.goto(`/progress/${e2eData.assignedTraineeId}`);
  const dayOne = page.getByRole("article", {
    name: "新员工入职指引：见导师、主管，认识新同事",
  });
  await expect(dayOne.getByLabel("Action 实践任务").getByText("导师已确认")).toBeVisible();
  await dayOne.getByRole("button", { name: "撤销 Action 确认" }).click();
  await expect(dayOne.getByRole("status")).toHaveText("Action 已撤销确认");
  await dayOne.getByRole("button", { name: "确认 Action" }).click();
  await expect(dayOne.getByRole("status")).toHaveText("Action 已确认");

  await dayOne.getByRole("button", { name: "查看第 1 天任务详情" }).click();
  const history = page.getByRole("region", { name: "确认记录" });
  await expect(history.getByText("Action 确认", { exact: true })).toHaveCount(2);
  await expect(history.getByText("Action 撤销确认", { exact: true })).toHaveCount(1);
});
