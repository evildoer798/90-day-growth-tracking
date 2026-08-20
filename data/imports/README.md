# 私有培养工作簿

此目录只保留说明，不提交任何 `.xlsx` 文件。

在本地或受控部署环境中，将经过授权的工作簿复制为：

```text
data/imports/新人90天学习计划_网站导入版.xlsx
```

随后可在管理员 Excel 导入页面上传，或执行：

```powershell
pnpm import:training-plan --preview
```

工作簿可能包含内部资料链接、培养内容或其他非公开信息。它已被 `.gitignore` 排除，禁止使用 `git add -f` 强制提交。测试不会读取该私有文件，而是在运行时生成不含内部链接的示例工作簿。
