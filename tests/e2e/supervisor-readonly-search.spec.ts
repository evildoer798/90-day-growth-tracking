import { E2E_IDENTITIES, expect, test } from "./fixtures/auth";

test("supervisor sees all trainees in one searchable read-only view", async ({
  page,
  loginAs,
  e2eData,
}) => {
  await loginAs("supervisor");

  await expect(page.getByRole("searchbox", { name: "搜索新人" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "新人查看范围" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: `${E2E_IDENTITIES.trainee.name}的培养概览` })).toBeVisible();
  await expect(page.getByRole("article", { name: `${E2E_IDENTITIES.unassignedTrainee.name}的培养概览` })).toBeVisible();
  await expect(page.getByText(E2E_IDENTITIES.mentor.employeeId)).toHaveCount(0);

  await page.getByRole("searchbox", { name: "搜索新人" }).fill(E2E_IDENTITIES.unassignedTrainee.employeeId);
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByRole("article", { name: `${E2E_IDENTITIES.unassignedTrainee.name}的培养概览` })).toBeVisible();
  await expect(page.getByRole("article", { name: `${E2E_IDENTITIES.trainee.name}的培养概览` })).toHaveCount(0);

  const result = page.getByRole("article", {
    name: `${E2E_IDENTITIES.unassignedTrainee.name}的培养概览`,
  });
  await expect(result.getByText("只读", { exact: true })).toBeVisible();
  await result.getByRole("link", { name: "查看只读进度" }).click();
  await expect(page).toHaveURL(new RegExp(`/progress/${e2eData.unassignedTraineeId}$`));
  await expect(
    page.getByRole("button", {
      name: /确认 Action|确认 Drill|撤销 Action 确认|撤销 Drill 确认|标记学习完成|撤销学习完成|完成并提交|保存给新人的留言/,
    }),
  ).toHaveCount(0);
});
