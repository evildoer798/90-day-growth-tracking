import { E2E_IDENTITIES, expect, test } from "./fixtures/auth";

test("trainee sees all five dimensions and can submit Learn, Action, and Drill without mentor confirmation controls", async ({
  page,
  loginAs,
  e2eData,
}) => {
  await loginAs("trainee");
  await expect(page).toHaveURL(new RegExp(`/progress/${e2eData.assignedTraineeId}$`));

  await expect(
    page.getByRole("heading", {
      name: `${E2E_IDENTITIES.trainee.name}的 90 天成长进度`,
    }),
  ).toBeVisible();
  await expect(page.getByText("显示 90 / 90 项")).toBeVisible();
  for (const dimension of ["Dall", "D1", "D2", "D3", "D4"] as const) {
    await expect(page.getByLabel("维度").getByRole("option", { name: new RegExp(`^${dimension} ·`) })).toHaveCount(1);
  }

  const dayOne = page.getByRole("article", {
    name: "新员工入职指引：见导师、主管，认识新同事",
  });
  await dayOne.getByRole("button", { name: "标记学习完成" }).click();
  await expect(dayOne.getByRole("status")).toHaveText("学习进度已保存");
  await page.reload();
  await expect(
    page
      .getByRole("article", { name: "新员工入职指引：见导师、主管，认识新同事" })
      .getByRole("button", { name: "撤销学习完成" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "提交 Action 已完成" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "提交 Drill 已完成" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^确认 Action$|^确认 Drill$/ })).toHaveCount(0);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/progress/${e2eData.assignedTraineeId}`);
  await expect(page).toHaveURL(/\/login$/);
});
