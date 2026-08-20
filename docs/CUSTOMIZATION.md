# 定制指南：改什么、改哪里、要不要迁移

原则：显示配置、数据库枚举、导入校验和权限不是同一层。只改名称/颜色不应顺手改权限；只改重点方向不应改变“所有新人看到五维全部任务”的规则。每次修改先建分支，运行与变更相关的单测，再运行 lint、typecheck、完整 Vitest 与 build。

## 快速决策表

| 想修改 | 主要位置 | 可独立修改 | 数据迁移 | 最少测试 |
| --- | --- | --- | --- | --- |
| 系统标题、描述、90 天长度 | `src/config/app.config.ts` | 标题/描述可以；天数会影响算法与数据 | 改天数通常需要业务/导入评估 | config、progress、import、build |
| 维度显示名称/简称 | `src/config/dimensions.config.ts` | 可以，不改 code | 否 | config、progress UI、import |
| 新增/删除/重命名维度 code | config + Prisma enums + parser/forms | 不可只改一处 | **需要** | Prisma、import、permissions、UI、E2E |
| 阶段名称 | `src/config/stages.config.ts` | label 可以；code/边界需联动任务数据 | 视改法而定 | config、progress、import |
| 风险阈值 | `src/config/risk-rules.config.ts` | 可以，不改权限 | 否 | risk、dashboard |
| 菜单文字/顺序/角色可见性 | `src/config/navigation.config.ts` | 可以，但 href 必须真实存在 | 否 | navigation、auth/UI、build |
| 高频 UI 文案 | `src/config/ui-text.config.ts` | 可以 | 否 | 相关组件、E2E accessible name |
| 主题色/Badge 色 | `src/config/theme.config.ts` + `src/app/globals.css` 投影 | 可以，不改业务状态 | 否 | config、UI、对比度、视觉 QA |
| 权限 | `src/config/permissions.config.ts` + `src/domain/permissions` | 与菜单分开 | 通常否，但必须安全评审 | permissions、service、四角色 E2E |
| 任务内容 | `/admin/tasks` 或 `/admin/import` | 与产品配置分开 | 由服务保留版本/进度 | import/admin/progress |
| 人员/账号/负责关系 | `/admin/trainees`、`/admin/users`、`/admin/relations` | 与代码配置分开 | 后台事务处理 | admin/permissions/dashboard |

## 1. 维度

仅改中文名称或简称：保持 `Dall`、`D1`、`D2`、`D3`、`D4` key 不变，只编辑 `dimensions.config.ts` 的 `name/shortName`。Excel `DimensionName` 与显示文案可随后通过管理员导入更新，但不要通过改 key“重命名”。

改变 code 集合是 schema 变更：同步检查 `FocusGroup`、`TaskDimension`、Zod 校验、Excel parser、筛选器、主题/测试 fixtures，并用 `pnpm prisma migrate dev --name ...` 生成可审查迁移。生产只运行 `pnpm prisma migrate deploy`。删除枚举值前先迁移现有行，绝不能直接改数据库 enum 后跳过测试。

无论怎样定制，`Dall + D1 + D2 + D3 + D4` 全量可见规则不能被 FocusGroup 筛掉；若业务明确改变该规则，应当作为独立产品变更重写验收和权限测试。

## 2. 阶段

`stages.config.ts` 管理 P1-P4 的显示 code/label；实际任务的 `stage` 字段来自 Excel/后台。只改 label 不迁移。改变 code、数量或 Day 边界需要先定义新映射、更新权威工作簿和导入校验，并决定已有 `TrainingTask.stage` 如何转换；用管理员预览确认更新数，不用 seed 覆盖生产任务。

## 3. 风险阈值

`risk-rules.config.ts` 的三个值分别控制关注逾期数、高风险逾期数和高风险截至今日完成率。一次只改一个业务假设，补充边界测试（阈值前一位、等于阈值、后一位），再检查导师/主管摘要。风险阈值不授予写权限，也不应改变分母。

## 4. 菜单与路由

`navigation.config.ts` 管理 label、href、角色列表和顺序；权限的服务端真相在 `src/domain/permissions` 和 service/action。菜单隐藏不能代替鉴权，菜单显示也不能授予权限。

新增菜单前先创建可构建路由，再把精确 href 加入配置；不要加入 Task 12 已取消的认证矩阵、Milestone 或导出入口。修改角色首页时同时检查 `ROLE_HOME`、`ROLE_CODE_BY_SLUG` 和 role switcher 的 segment 匹配。

## 5. 文案

进度自由文本长度统一在 `src/config/input-limits.config.ts`：学习反馈与确认说明默认 1,000 字符，新人/培养备注默认 2,000 字符。修改时必须同时保留服务端 Zod 边界和表单 `maxLength`，避免只改浏览器提示而留下可绕过的写入入口。

高频通用文案放 `ui-text.config.ts`；角色首页名称/指引在 `roles.config.ts`；页面专属长说明可留在相应 feature/page。可访问名称也是 E2E 定位契约，修改“登录”“全部新人”“应用导入”等文字后要更新并运行对应测试，不用模糊 locator 掩盖回归。

## 6. 主题

`theme.config.ts` 是设计 token 真相，`globals.css` 将 token 投影到 CSS 变量和组件状态。分别修改背景/表面/边框、主色、状态色、Action/Drill 与 badge 前景/背景，不在组件 JSX 散落 hex。

普通文字要求至少 4.5:1 对比度；焦点环必须在浅色/深色背景清晰可见。修改后以 1440×900、390×844 检查登录、新人三/二/一列任务卡、导师、主管全部新人、管理员导入预览，包含键盘焦点、Drawer/Dialog、错误/禁用状态。

## 7. 任务、人员和关系

- 小量任务修订：`/admin/tasks`，保留 stable key、版本与现有 TaskProgress。
- 批量任务：`/admin/import`，先 preview；有 error 禁止 apply，歧义 reference 不猜测。
- 人员与账号：分别用 `/admin/trainees`、`/admin/users`；停用代替物理删除。
- 负责关系：`/admin/relations`；日期是 Asia/Shanghai 业务日的包含边界，避免重叠排期。

不要直接用 SQL 绕过审计、版本、关系时序和密码哈希。紧急修复也应通过 service/action 或一次性经过评审、备份、演练的迁移。

## 8. 变更验证清单

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma validate
pnpm build
```

涉及数据库：在隔离库执行迁移并跑集成测试。涉及角色/可访问名称/响应式界面：再跑 `pnpm test:e2e` 与桌面/手机视觉检查。涉及部署：跑 `pnpm vitest run tests/integration/deployment`，并在有 Docker 的目标主机运行 `docker compose --env-file .env.docker config --quiet` 与真实健康检查。
